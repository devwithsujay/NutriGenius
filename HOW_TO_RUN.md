# How to Run NutriGenius Locally

Because we refactored the project to be compatible with **Vercel** serverless functions and added **Supabase** database integration, the commands to run the project have changed slightly.

## Prerequisites
1. Ensure you have copied the contents of `supabase_schema.sql` into your Supabase project's SQL Editor and hit "Run" to create your tables.
2. Ensure you have Node.js and Python installed.

---

## 1. Running the API (Backend)
Vercel expects backend code to be in an `api/` folder instead of `backend/`.
Therefore, the command to run the python server has changed.

Open a terminal at the **root** of your project (the folder containing `package.json` and the `api/` folder) and run:

```bash
# First, install the new requirements (which includes supabase)
pip install -r api/requirements.txt

# Start the python API server
uvicorn api.index:app --reload
```
*Note: The API will run on `http://127.0.0.1:8000`*

---

## 2. Running the Frontend (React/Vite)
Open a **second terminal window**, go into the frontend folder, and start the development server:

```bash
cd frontend
npm install
npm run dev
```

*Note: You can view your app in your browser at `http://localhost:5173` (or whichever port Vite gives you).*

---

## 3. Deploying to Vercel
When you are ready to put this on the internet:
1. Push this entire codebase to **GitHub**.
2. Go to **Vercel.com** and import your GitHub repository.
3. In the Vercel deployment settings, under **Environment Variables**, you must add:
   - `NVIDIA_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
4. Click **Deploy**. Vercel will automatically read the `vercel.json` file I made and deploy both the React frontend and the FastAPI backend.

---

## Troubleshooting

### Error: `400: Unsupported provider: provider is not enabled` or `At least one Client ID is required`
This happens when you click "Sign up with Google" but haven't fully configured Google inside your Supabase dashboard.
**To fix this:**
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open your project.
3. On the left menu, click **Authentication** (the people icon) -> **Providers**.
4. Find **Google** in the list and click it to open the settings.
5. Toggle **Enable Sign in with Google** to ON.
6. Supabase now requires a Client ID to save the setting. For quick local testing, you can paste `dummy-client-id.apps.googleusercontent.com` in the **Client ID (for Web)** box and `dummy-client-secret` in the **Client Secret** box.
7. Click **Save**.

*Note:* To make Google Login actually work for real users in production, you cannot use the dummy IDs. You will need to create a real OAuth application in the [Google Cloud Console](https://console.cloud.google.com/), generate a real Client ID and Secret, and paste those into Supabase. You will also need to paste your Supabase Callback URL into Google Cloud.

### Error: Blank Blue Screen after deploying to Vercel
If you deploy to Vercel and only see a blank background, **your frontend crashed because it is missing the Supabase Environment Variables.**
Vite requires variables that start with `VITE_` to be present at *build time*.

**To fix this:**
1. Go to your project on the [Vercel Dashboard](https://vercel.com/dashboard).
2. Go to **Settings** -> **Environment Variables**.
3. You must add these exact two variables (copy the values from your local `frontend/.env.local` file):
   *   `VITE_SUPABASE_URL`
   *   `VITE_SUPABASE_ANON_KEY`
4. After saving them, go to the **Deployments** tab.
5. Click the three dots next to your latest deployment and select **Redeploy**. (It must rebuild from scratch to inject those variables into the React code).
