import os, json, hashlib, datetime, base64, mimetypes
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from .env file
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

DATA_FILE = "nutrigenius_data.json"
API_BASE = "https://integrate.api.nvidia.com/v1"
TEXT_MODEL = "meta/llama-3.1-8b-instruct"
#meta/llama-3.3-70b-instruct
VISION_MODEL = "meta/llama-3.2-11b-vision-instruct"

# ==========================================
# 2. Storage Layer (Shared with Gradio logic)
# ==========================================
def load_data():
    if not os.path.exists(DATA_FILE):
        return {"users": {}}
    try:
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    except:
        return {"users": {}}

def save_data(data):
    try:
        with open(DATA_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"File lock error: {str(e)}")

def hash_password(pw):
    return hashlib.sha256((pw + "somesalt123").encode()).hexdigest()

# ==========================================
# 3. Pydantic Models for API Requests/Responses
# ==========================================
class UserCredentials(BaseModel):
    username: str
    password: str

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

# Dependency to get current user based on a simple Authorization header 
# (For a real MVP, use JWT. Keeping simple as per previous architecture)
def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    username = authorization.split(" ")[1] # Very simple token = username
    data = load_data()
    if username not in data["users"]:
         raise HTTPException(status_code=401, detail="User not found")
    return username

# ==========================================
# 4. Auth & Profile Endpoints
# ==========================================
@app.post("/api/auth/register")
def register(creds: UserCredentials):
    username = creds.username.strip()
    if not username or not creds.password:
        raise HTTPException(status_code=400, detail="Username and password required.")
    
    data = load_data()
    if username in data["users"]:
        raise HTTPException(status_code=400, detail="Username already exists.")
    
    data["users"][username] = {
        "password_hash": hash_password(creds.password),
        "created_at": datetime.datetime.now().isoformat(),
        "profile": {},
        "history": [],
        "saved_plans": {}
    }
    save_data(data)
    return {"message": "Registered successfully!", "username": username}

@app.post("/api/auth/login")
def login(creds: UserCredentials):
    username = creds.username.strip()
    data = load_data()
    user = data["users"].get(username)
    if not user:
        print(f"Login failed: User {username} not found")
        raise HTTPException(status_code=401, detail="Invalid credentials.")
    if user["password_hash"] != hash_password(creds.password):
        print(f"Login failed: Incorrect password for user {username}")
        raise HTTPException(status_code=401, detail="Invalid credentials.")
    print(f"Login successful for user: {username}")
    return {"token": username, "username": username}

@app.get("/api/user/profile")
def get_profile(username: str = Depends(get_current_user)):
    data = load_data()
    user_data = data["users"][username]
    profile = user_data.get("profile", {})
    return profile

@app.post("/api/user/profile")
def update_profile(profile_data: ProfileData, username: str = Depends(get_current_user)):
    data = load_data()
    profile_dict = profile_data.model_dump()
    data["users"][username]["profile"] = profile_dict
    save_data(data)
    return {"message": "Profile updated successfully"}

@app.get("/api/user/history")
def get_history(username: str = Depends(get_current_user)):
    data = load_data()
    return {"history": data["users"][username].get("history", [])}

# ==========================================
# 5. NVIDIA NIM API Integration & Helpers
# ==========================================
# API Key from environment variable
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY") 

def get_client():
    return OpenAI(base_url=API_BASE, api_key=NVIDIA_API_KEY)

def llm_call(prompt, system=None, max_tokens=1400, temp=0.4):
    if not NVIDIA_API_KEY or NVIDIA_API_KEY.startswith("nvapi-..."): 
        raise HTTPException(status_code=400, detail="NVIDIA NIM API Key not set correctly in backend/main.py.")
    
    if not system:
        system = "You are a senior Indian clinical nutritionist with 15 years of experience. Always use authentic Indian foods. End with specific instructions. Use katori/cup measurements familiar to Indian households."
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

def build_context(username):
    data = load_data()
    user_info = data["users"].get(username, {})
    p = user_info.get("profile", {})
    name = p.get('name', 'User')
    age = p.get('age', 'Not specified')
    diet = p.get('diet_type', 'Vegetarian')
    g = p.get('goal', 'General Health')
    w = p.get('weight', 70)
    h = p.get('height', 170)
    act = p.get('activity', 'Moderate')
    return f"User Profile - Name: {name}, Age: {age}, Weight: {w}kg, Height: {h}cm, Activity: {act}, Goal: {g}, Diet: {diet}. "

def generate_and_save(username, feature, prompt, extra_inputs=None):
    data = load_data()
    ctx = build_context(username)
    full_prompt = f"{ctx} {prompt}\n\nFormat output strictly as markdown:\n## {feature}\n### [add relevant emoji here]\n[Include tables where applicable]\n[Use bullet points]\n[Use bold for key terms]\nBe specific with quantities (katori/cup)."
    
    out = llm_call(full_prompt)
    
    # Save plan and history
    if username in data["users"]:
        data["users"][username].setdefault("saved_plans", {})[feature] = out
        data["users"][username].setdefault("history", []).append({
            "feature": feature,
            "timestamp": datetime.datetime.now().isoformat(),
            "inputs": extra_inputs or {},
            "output_preview": out[:200] + "..."
        })
        save_data(data)
        
    return {"markdown": out}

# ==========================================
# 6. AI Feature Endpoints
# ==========================================

# NOTE: vision route MUST come before the /{feature_id} wildcard!
@app.post("/api/features/vision/food_photo")
def run_vision_feature(req: VisionRequest, username: str = Depends(get_current_user)):
    data = load_data()

    if not NVIDIA_API_KEY or NVIDIA_API_KEY.startswith("nvapi-..."):
        raise HTTPException(status_code=400, detail="NVIDIA NIM API Key not set correctly in backend/main.py.")

    ctx = build_context(username)
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
        if username in data["users"]:
            data["users"][username].setdefault("saved_plans", {})["Food Photo"] = out
            data["users"][username].setdefault("history", []).append({
                "feature": "Food Photo",
                "timestamp": datetime.datetime.now().isoformat(),
                "inputs": {},
                "output_preview": out[:200] + "..."
            })
            save_data(data)
        return {"markdown": out}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision API Error: {str(e)}")


@app.post("/api/features/{feature_id}")
def run_feature(feature_id: str, req: FeatureRequest, username: str = Depends(get_current_user)):
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
    return generate_and_save(username, feature_name, prompt_template, req.extra_inputs)


# ==========================================
# 7. Math Endpoints
# ==========================================
@app.get("/api/utils/metrics")
def get_metrics(weight: float, height: float, age: int, gender: str, activity: str):
    # BMI
    try: 
        bmi_val = weight / ((height/100)**2)
        bmi = round(float(bmi_val), 1)
    except: 
        bmi = 0.0

    # TDEE
    try:
        if gender.lower() == 'male': 
            bmr = 10 * weight + 6.25 * height - 5 * age + 5
        else: 
            bmr = 10 * weight + 6.25 * height - 5 * age - 161
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
    # Fix Windows registry MIME type bug for JS/CSS files
    mimetypes.init()
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")

    # Serve static assets (JS, CSS, images) AND handle SPA routing via html=True
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")
else:
    @app.get("/", include_in_schema=False)
    def frontend_not_built():
        return {"detail": "Frontend not built. Run: cd frontend && npm run build"}
