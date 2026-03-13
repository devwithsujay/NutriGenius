# NutriGenius — Technical Documentation

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Directory Structure](#3-directory-structure)
4. [Architecture & Data Flow](#4-architecture--data-flow)
5. [Backend — FastAPI](#5-backend--fastapi)
6. [Frontend — React / Vite](#6-frontend--react--vite)
7. [AI Integration — NVIDIA NIM](#7-ai-integration--nvidia-nim)
8. [Authentication Flow](#8-authentication-flow)
9. [Feature Reference](#9-feature-reference)
10. [CSS Design System](#10-css-design-system)
11. [Known Behaviours & Edge Cases](#11-known-behaviours--edge-cases)
12. [Project Summary](#12-project-summary)

---

## 1. Project Overview

**NutriGenius** is a full-stack AI-powered nutrition platform that generates personalised Indian diet and wellness plans using the NVIDIA NIM API (Meta Llama 3.3 70B). Users register, fill in their body metrics profile, and can then generate plans across 13 specialised AI features — from macro calculations and meal prep guides to food photo analysis via computer vision.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + TypeScript, Vite 7 |
| **Styling** | Pure Vanilla CSS (no Tailwind) |
| **Markdown Rendering** | `react-markdown` + `remark-gfm` |
| **Icons** | `lucide-react` |
| **Backend** | Python 3.12, FastAPI, Uvicorn |
| **AI Text Model** | `meta/llama-3.3-70b-instruct` via NVIDIA NIM |
| **AI Vision Model** | `meta/llama-3.2-11b-vision-instruct` via NVIDIA NIM |
| **Data Storage** | JSON flat-file (`nutrigenius_data.json`) |
| **Auth** | SHA-256 password hash + bearer token (username as token) |

---

## 3. Directory Structure

```
GEN AI Project/
├── backend/
│   ├── main.py              ← FastAPI application (ALL backend logic)
│   ├── requirements.txt     ← Python dependencies
│   └── nutrigenius_data.json← Persistent user data store
├── frontend/
│   ├── src/
│   │   ├── App.tsx          ← Entire React SPA
│   │   ├── api.ts           ← API wrapper (fetch helpers)
│   │   ├── index.css        ← Complete CSS design system
│   │   └── main.tsx         ← Vite entry point
│   ├── package.json
│   └── vite.config.ts
└── nutrigenius_pro.py       ← Original Gradio prototype (legacy)
```

---

## 4. Architecture & Data Flow

```
Browser (localhost:5173)
        │
        │  HTTP / JSON
        ▼
Frontend — React SPA (Vite)
   App.tsx
   ├── AuthScreen (login/register)
   ├── Sidebar (grouped navigation)
   ├── Metrics Strip (BMI, TDEE)
   ├── Dashboard Stat Cards
   ├── Feature Input Panel
   └── Output Panel (react-markdown)
        │
        │  REST API calls to localhost:8000
        │  Authorization: Bearer <username-token>
        ▼
Backend — FastAPI (Uvicorn)
   main.py
   ├── /api/auth/register   POST
   ├── /api/auth/login      POST
   ├── /api/user/profile    GET / POST
   ├── /api/user/history    GET
   ├── /api/features/vision/food_photo  POST  ← MUST be before wildcard
   ├── /api/features/{feature_id}       POST
   └── /api/utils/metrics   GET
        │
        │  HTTPS via openai Python SDK
        ▼
NVIDIA NIM API (integrate.api.nvidia.com/v1)
   ├── meta/llama-3.3-70b-instruct       (all text features)
   └── meta/llama-3.2-11b-vision-instruct (food photo)
```

### Request Lifecycle (Text Feature)

1. User clicks **GENERATE AI PLAN** in the browser
2. [handleRunFeature()](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/App.tsx#221-239) in [App.tsx](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/App.tsx) sets `featureLoading[fid] = true`
3. [runFeature(fid, inputText)](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/api.ts#25-32) in [api.ts](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/api.ts) sends `POST /api/features/{fid}` with bearer token
4. FastAPI verifies token → loads user profile → builds context string
5. [generate_and_save()](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/backend/main.py#170-189) constructs a prompt and calls [llm_call()](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/backend/main.py#144-161)
6. [llm_call()](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/backend/main.py#144-161) calls NVIDIA NIM API using the `openai` Python SDK
7. Response is saved to `nutrigenius_data.json` under the user's `saved_plans`
8. `{ "markdown": "..." }` is returned to the frontend
9. [cleanMarkdown()](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/App.tsx#60-63) strips raw `###` symbols, then `ReactMarkdown` renders the result

---

## 5. Backend — FastAPI

### File: [backend/main.py](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/backend/main.py)

#### Key Constants
```python
TEXT_MODEL   = "meta/llama-3.3-70b-instruct"
VISION_MODEL = "meta/llama-3.2-11b-vision-instruct"
NVIDIA_API_KEY = "nvapi-..."   # Hardcoded as requested
```

#### Data Schema (nutrigenius_data.json)
```json
{
  "users": {
    "username": {
      "password_hash": "sha256...",
      "created_at": "ISO timestamp",
      "profile": {
        "name": "", "age": 30, "gender": "Male",
        "weight": 70.0, "height": 170.0,
        "activity": "Moderate", "goal": "Fat Loss",
        "diet_type": "Vegetarian"
      },
      "saved_plans": {
        "Dashboard": "markdown string...",
        "Macros": "markdown string..."
      },
      "history": [
        { "feature": "Macros", "timestamp": "...", "inputs": {}, "output_preview": "..." }
      ]
    }
  }
}
```

#### Auth Model
- **Password storage:** SHA-256 hash with hardcoded salt `"somesalt123"`
- **Session token:** The username itself (returned on login, stored in `localStorage`)
- **Request auth:** `Authorization: Bearer <username>` header checked by [get_current_user()](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/backend/main.py#74-82) dependency

#### Route Ordering — Critical Note
FastAPI matches routes in declaration order. The vision route `/api/features/vision/food_photo` **must be declared before** the wildcard `/api/features/{feature_id}`, otherwise [vision](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/nutrigenius_pro.py#153-173) gets captured as `feature_id` and returns 404.

#### System Prompt
All text AI calls use this default system:
> *"You are a senior Indian clinical nutritionist with 15 years of experience. Always use authentic Indian foods. End with specific instructions. Use katori/cup measurements familiar to Indian households."*

---

## 6. Frontend — React / Vite

### File: [frontend/src/App.tsx](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/App.tsx)

#### State Model
```tsx
// Per-feature persistent maps — survive tab switches, cleared on app close
const [featureOutputs, setFeatureOutputs] = useState<Record<string, string>>({});
const [featureLoading, setFeatureLoading] = useState<Record<string, boolean>>({});
const [featureInputs, setFeatureInputs]   = useState<Record<string, string>>({ ... });
```

This architecture allows:
- Background processing (switch sections mid-generation)
- Persistent outputs per section (no re-fetching)
- Independent loading indicators per sidebar item

#### Key Components (all in App.tsx)

| Component | Purpose |
|---|---|
| [AuthScreen](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/App.tsx#100-151) | Login / Register form with tabs |
| [OnboardingBanner](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/App.tsx#152-174) | First-time user prompt to fill profile |
| [LoadingState](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/App.tsx#45-59) | Animated spinner + cycling step messages |
| [StatCard](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/App.tsx#91-99) | BMI/TDEE card on Dashboard |
| [App](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/App.tsx#175-454) (main) | Full SPA — sidebar, topbar, metrics, feature panels |

#### Sidebar Group Structure
```tsx
const SIDEBAR_GROUPS = [
  { label: 'Overview',        items: ['dashboard'] },
  { label: 'Nutrition',       items: ['macros', 'mealprep', 'regional', 'recomp'] },
  { label: 'Fitness',         items: ['workout', 'fasting'] },
  { label: 'Track & Analyze', items: ['progress', 'lab', 'vision'] },
  { label: 'Health & Adapt',  items: ['supplements', 'health', 'adapt'] },
  { label: 'Settings',        items: ['profile'] },
];
```

#### BMI / TDEE Calculations (Client-Side)
```tsx
BMR (male)   = 10w + 6.25h - 5a + 5
BMR (female) = 10w + 6.25h - 5a - 161
TDEE = BMR × activity_multiplier
BMI  = weight / (height_m)²
```
These are computed locally on every render — no API call needed.

### File: [frontend/src/api.ts](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/api.ts)
Three exported functions:
- [fetchAPI(endpoint, options)](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/api.ts#3-24) — base fetch with auth header injection
- [runFeature(featureId, prompt)](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/api.ts#25-32) — calls `POST /api/features/{id}`
- [runVisionFeature(imageBase64)](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/api.ts#33-40) — calls `POST /api/features/vision/food_photo`

---

## 7. AI Integration — NVIDIA NIM

### Text Generation
```python
client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=NVIDIA_API_KEY)
client.chat.completions.create(
    model="meta/llama-3.3-70b-instruct",
    messages=[{ "role": "system", ... }, { "role": "user", ... }],
    temperature=0.4,
    max_tokens=1400
)
```

### Vision Analysis (Food Photo)
- Image is converted to base64 in the browser via `FileReader`
- Sent as JSON string to the backend
- Backend strips `data:image/*;base64,` prefix and forwards to NVIDIA NIM as an `image_url` content part

### Prompt Engineering
Every prompt is prefixed with a **user context string**:
```
"User Profile: 72kg weight, Goal: Fat Loss, Diet: Vegetarian. [feature-specific instruction]"
```
The output request appends:
```
"Format output strictly as markdown: ## [Feature] ### [emoji] [tables where applicable] [bullet points] [bold for key terms]. Be specific with quantities (katori/cup)."
```

---

## 8. Authentication Flow

```
REGISTER:
  POST /api/auth/register { username, password }
  → hash password → store in JSON → return success
  → Frontend auto-logs in → redirects to My Profile

LOGIN:
  POST /api/auth/login { username, password }
  → compare hash → return { token: username, username }
  → Frontend stores token in localStorage
  → All subsequent requests include Authorization: Bearer <token>

LOGOUT:
  localStorage.clear() → React state reset → AuthScreen shown
```

---

## 9. Feature Reference

| ID | Name | Group | Input | Button Label |
|---|---|---|---|---|
| [dashboard](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/nutrigenius_pro.py#209-210) | Dashboard | Overview | None | Generate AI Plan |
| [macros](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/nutrigenius_pro.py#211-212) | Macros | Nutrition | None | Generate AI Plan |
| [mealprep](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/nutrigenius_pro.py#215-216) | Meal Prep | Nutrition | None | Generate AI Plan |
| [regional](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/nutrigenius_pro.py#218-219) | Regional Diet | Nutrition | Cuisine dropdown | Generate AI Plan |
| [recomp](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/nutrigenius_pro.py#212-213) | Recomp | Nutrition | None | Generate AI Plan |
| [workout](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/nutrigenius_pro.py#210-211) | Workout | Fitness | Training type dropdown | Generate AI Plan |
| [fasting](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/nutrigenius_pro.py#214-215) | Fasting | Fitness | Window dropdown (16:8 etc.) | Generate AI Plan |
| [progress](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/nutrigenius_pro.py#216-217) | Progress | Track & Analyze | Text area | **Analyze** |
| [lab](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/nutrigenius_pro.py#220-221) | Lab Report | Track & Analyze | Text area | **Analyze** |
| [vision](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/nutrigenius_pro.py#153-173) | Food Photo | Track & Analyze | Image upload | **Analyze** |
| [supplements](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/nutrigenius_pro.py#213-214) | Supplements | Health & Adapt | None | Generate AI Plan |
| [health](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/nutrigenius_pro.py#217-218) | Health Plan | Health & Adapt | Condition dropdown | Generate AI Plan |
| [adapt](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/nutrigenius_pro.py#219-220) | Adapt Plan | Health & Adapt | Text area | Generate AI Plan |
| [profile](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/backend/main.py#115-121) | My Profile | Settings | Full profile form | Save Profile |

---

## 10. CSS Design System

### Colour Tokens
```css
--bg-base:      #07090d   /* deepest background */
--bg-surface:   #0c0f16   /* cards, sidebar */
--bg-elevated:  #111520   /* inputs, inner panels */
--accent:       #76b900   /* NVIDIA green — primary CTA */
--text-primary: #dce8f0
--text-secondary: #4a6070
```

### Typography
- **Headings / Labels / Buttons:** `Syne` (800 weight), uppercase, tight letter-spacing
- **Body / Inputs:** `DM Sans` (400/500)
- **Section labels:** 0.65rem, letter-spacing 3px, uppercase

### Notable CSS Classes
| Class | Purpose |
|---|---|
| `.animate-spin` | Spinner — 0.9s linear rotation |
| `.loading-container` | Centred loading state wrapper |
| `.loading-pulse` | Pulsing glow text animation |
| `.metrics-strip` | Topbar pill row (TDEE, BMI, Goal...) |
| `.stats-grid` | Dashboard stat card grid |
| `.stat-card` | Individual metric card with gradient top border |
| `.sidebar-group` | Collapsible nav group container |
| `.onboarding-banner` | Green-tinted welcome prompt for new users |

---

## 11. Known Behaviours & Edge Cases

| Behaviour | Explanation |
|---|---|
| Outputs persist across tab switches | Intentional — per-feature state maps survive navigation |
| Outputs clear on page refresh | Browser `useState` is in-memory; not persisted to localStorage |
| Vision model gives 404 for old model ID | NVIDIA retired `nvidia/llama-3.2-90b-vision-instruct`; now using `meta/llama-3.2-11b-vision-instruct` |
| FastAPI vision route must be declared first | Wildcard `/{feature_id}` shadows specific routes if declared earlier |
| `openai` >= 1.50 required | Older versions use `proxies` kwarg incompatible with httpx 0.28+ |
| Token = username | Simple MVP auth; not suitable for production |
| Markdown `###` stripping | [cleanMarkdown()](file:///c:/Users/sujay/.gemini/antigravity/playground/GEN%20AI%20Project/frontend/src/App.tsx#60-63) normalises AI output so headers render as HTML, not raw symbols |

---

## 12. Project Summary

**NutriGenius** started as a Gradio prototype and was rebuilt into a professional full-stack SaaS application using **FastAPI** (backend) and **React + Vite** (frontend).

### What Was Built
- A **multi-page React SPA** with a grouped collapsible sidebar, dark-mode premium UI, Google Fonts typography, and micro-animations
- A **FastAPI REST backend** with user auth, profile management, history tracking, and 14 AI feature endpoints
- **NVIDIA NIM integration** using two models: Llama 3.3 70B for text and Llama 3.2 11B Vision for image analysis
- **Live client-side metrics** (BMI, TDEE, calorie targets) calculated from profile data — no API call needed
- **Background processing** allowing multiple features to generate simultaneously while the user navigates
- **New user onboarding** banner that guides first-time users to set up their profile

### Design Philosophy
The UI was built to look and feel like a **$50,000 SaaS product** — deep dark background with a NVIDIA-green accent system, Syne + DM Sans typography, radial atmospheric glows, glassmorphism-style sidebar, animated stat cards, and context-aware button labels (Generate vs. Analyze).

### What Powers It
Every AI plan is customised using the user's saved profile (weight, height, age, gender, activity level, goal, diet type) as a context prefix to every NVIDIA NIM API call. The Indian nutritionist system prompt ensures all outputs use culturally relevant foods and measurements (katori, cup).
