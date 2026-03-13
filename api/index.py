import os, json, datetime, mimetypes
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from openai import OpenAI
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# ==========================================
# 1. Initialization and Core Constants
# ==========================================
app = FastAPI(title="NutriGenius Pro API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_BASE = "https://integrate.api.nvidia.com/v1"
TEXT_MODEL = "meta/llama-3.1-8b-instruct"
VISION_MODEL = "meta/llama-3.2-11b-vision-instruct"

# ==========================================
# 2. Supabase Client & DB Initialization
# ==========================================
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY environment variables are missed.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# 3. Pydantic Models for API Requests
# ==========================================
class ProfileData(BaseModel):
    name: str = ""
    age: int = 30
    gender: str = "Male"
    weight: float = 70.0
    height: float = 170.0
    activity: str = "Moderate"
    goal: str = "Fat Loss"
    diet_type: str = "Vegetarian"

class FeatureRequest(BaseModel):
    prompt: Optional[str] = None
    extra_inputs: Optional[Dict[str, Any]] = None

class VisionRequest(BaseModel):
    image_base64: str

# Dependency to get current user based on Supabase JWT token
def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization.split(" ")[1]
    
    try:
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
             raise HTTPException(status_code=401, detail="User not found or token expired")
        return user_response.user
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication error: {str(e)}")

# ==========================================
# 4. Profile Endpoints
# ==========================================
# Note: Registration and Login are handled entirely by Supabase JS on the frontend!

@app.get("/api/user/profile")
def get_profile(user: Any = Depends(get_current_user)):
    try:
        res = supabase.table("profiles").select("*").eq("id", user.id).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
        return {}
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/user/profile")
def update_profile(profile_data: ProfileData, user: Any = Depends(get_current_user)):
    try:
        profile_dict = profile_data.model_dump()
        profile_dict["updated_at"] = datetime.datetime.now().isoformat()
        res = supabase.table("profiles").update(profile_dict).eq("id", user.id).execute()
        return {"message": "Profile updated successfully"}
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/user/history")
def get_history(user: Any = Depends(get_current_user)):
    try:
        res = supabase.table("history").select("*").eq("user_id", user.id).order("created_at", desc=True).limit(50).execute()
        return {"history": res.data if res.data else []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 5. NVIDIA NIM API Integration & Helpers
# ==========================================
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY") 

def get_client():
    return OpenAI(base_url=API_BASE, api_key=NVIDIA_API_KEY)

def llm_call(prompt, system=None, max_tokens=1400, temp=0.4):
    if not NVIDIA_API_KEY or NVIDIA_API_KEY.startswith("nvapi-..."): 
        raise HTTPException(status_code=400, detail="NVIDIA NIM API Key not set correctly.")
    
    if not system:
        system = "You are a senior Indian clinical nutritionist. Always use authentic Indian foods. Use katori/cup measurements."
    try:
        client = get_client()
        res = client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            temperature=temp,
            max_tokens=max_tokens
        )
        return res.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API Error: {str(e)}")

def build_context(user):
    try:
        res = supabase.table("profiles").select("*").eq("id", user.id).execute()
        p = res.data[0] if res.data else {}
        name = p.get('name', 'User')
        age = p.get('age', 30)
        diet = p.get('diet_type', 'Vegetarian')
        g = p.get('goal', 'General Health')
        w = p.get('weight', 70)
        h = p.get('height', 170)
        act = p.get('activity', 'Moderate')
        return f"User Profile - Name: {name}, Age: {age}, Weight: {w}kg, Height: {h}cm, Activity: {act}, Goal: {g}, Diet: {diet}. "
    except:
        return ""

def generate_and_save(user, feature, prompt, extra_inputs=None):
    ctx = build_context(user)
    full_prompt = f"{ctx} {prompt}\n\nFormat output strictly as markdown:\n## {feature}\n### [add relevant emoji here]\n[Include tables where applicable]\n[Use bullet points]\n[Use bold for key terms]\nBe specific with quantities (katori/cup)."
    
    out = llm_call(full_prompt)
    
    try:
        # Save plan using an upsert (or delete old and insert new). 
        # For simplicity, delete if exists then insert.
        supabase.table("saved_plans").delete().eq("user_id", user.id).eq("feature", feature).execute()
        
        supabase.table("saved_plans").insert({
            "user_id": user.id,
            "feature": feature,
            "content": out
        }).execute()
        
        # Save history
        supabase.table("history").insert({
            "user_id": user.id,
            "feature": feature,
            "inputs": extra_inputs or {},
            "output_preview": out[:200] + "..."
        }).execute()
    except Exception as e:
        print(f"Failed to save data to supabase: {str(e)}")
        
    return {"markdown": out}

# ==========================================
# 6. AI Feature Endpoints
# ==========================================

@app.post("/api/features/vision/food_photo")
def run_vision_feature(req: VisionRequest, user: Any = Depends(get_current_user)):
    if not NVIDIA_API_KEY or NVIDIA_API_KEY.startswith("nvapi-..."):
        raise HTTPException(status_code=400, detail="NVIDIA NIM API Key not set correctly.")

    ctx = build_context(user)
    prompt = f"{ctx} Identify this food, guess its calories/macros. Suggest healthier authentic Indian alternatives if needed. Use Markdown formatting with '## Food Photo Analysis'."
    system = "You are an expert Indian nutritionist and food analyst."

    try:
        client = get_client()
        clean_b64 = req.image_base64.replace("data:image/jpeg;base64,", "").replace("data:image/png;base64,", "")
        res = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{clean_b64}"}}
                ]}
            ],
            max_tokens=900
        )
        out = res.choices[0].message.content
        
        try:
            supabase.table("saved_plans").delete().eq("user_id", user.id).eq("feature", "Food Photo").execute()
            supabase.table("saved_plans").insert({"user_id": user.id, "feature": "Food Photo", "content": out}).execute()
            supabase.table("history").insert({"user_id": user.id, "feature": "Food Photo", "inputs": {}, "output_preview": out[:200] + "..."}).execute()
        except Exception as e:
            print(f"Failed to save to supabase: {e}")
            
        return {"markdown": out}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision API Error: {str(e)}")

@app.post("/api/features/{feature_id}")
def run_feature(feature_id: str, req: FeatureRequest, user: Any = Depends(get_current_user)):
    feature_map = {
        "dashboard": ("Dashboard", "Create a 12-week high-level nutrition roadmap."),
        "workout": ("Workout", f"Provide pre/post workout Indian meal options for {req.prompt} training"),
        "macros": ("Macros", "Calculate detailed daily macros for their goal using Indian foods."),
        "recomp": ("Recomp", "Plan a body recomposition strategy (lose fat, gain muscle) with an Indian diet plan."),
        "supplements": ("Supplements", "Recommend evidence-based supplements tailored to Indian dietary gaps."),
        "fasting": ("Fasting", f"Design an IF schedule ({req.prompt}) with suitable Indian breaking-fast meals."),
        "mealprep": ("Meal Prep", "Create a batch-cooking meal prep guide for a week using standard Indian ingredients."),
        "progress": ("Progress", f"Analyze weight/measurement changes: {req.prompt} and adjust their Indian diet."),
        "health": ("Health Plan", f"Create a customized diet for condition: {req.prompt}. Focus on therapeutic Indian foods."),
        "regional": ("Regional", f"Create a strict {req.prompt} regional diet plan."),
        "adapt": ("Adapt Plan", f"User feedback on current plan: {req.prompt}. Re-plan dynamically."),
        "lab": ("Lab Report", f"Analyze blood test results: {req.prompt}. Recommend dietary fixes.")
    }

    if feature_id not in feature_map:
        raise HTTPException(status_code=404, detail="Feature not found")

    feature_name, prompt_template = feature_map[feature_id]
    return generate_and_save(user, feature_name, prompt_template, req.extra_inputs)

# ==========================================
# 7. Math Endpoints
# ==========================================
@app.get("/api/utils/metrics")
def get_metrics(weight: float, height: float, age: int, gender: str, activity: str):
    try: 
        bmi = round(float(weight / ((height/100)**2)), 1)
    except: 
        bmi = 0.0

    try:
        bmr = 10 * weight + 6.25 * height - 5 * age + (5 if gender.lower() == 'male' else -161)
        mult = {'sedentary': 1.2, 'light': 1.375, 'moderate': 1.55, 'active': 1.725, 'very active': 1.9}
        tdee = int(float(bmr) * mult.get(activity.lower(), 1.2))
    except: 
        tdee = 0

    return {"bmi": bmi, "tdee": tdee}

# ==========================================
# 8. Serve React Frontend (production build)
# ==========================================
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")

if os.path.exists(FRONTEND_DIST):
    mimetypes.init()
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")
else:
    @app.get("/", include_in_schema=False)
    def frontend_not_built():
        return {"detail": "API running. Frontend not built. Run npm run build in frontend."}
