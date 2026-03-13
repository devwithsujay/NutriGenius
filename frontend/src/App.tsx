import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Dumbbell, Utensils, Activity, Target, Pill, Clock,
  ChefHat, TrendingUp, FlaskConical, Camera, Settings2,
  HeartPulse, Map, User, LogOut, Loader2, ChevronDown,
  CheckCircle2, Download, LayoutDashboard, Flame, Eye, EyeOff,
  Moon, Sun, Menu, X
} from 'lucide-react';
import { fetchAPI, runFeature, runVisionFeature } from './api';
import { supabase } from './supabase';
import './index.css';

// --- Types ---
interface Profile {
  name: string; age: number; gender: string; weight: number; height: number;
  activity: string; goal: string; diet_type: string;
}

// --- BMI / TDEE helpers ---
function calcBMI(weight: number, height: number): number {
  if (!weight || !height) return 0;
  return Math.round((weight / Math.pow(height / 100, 2)) * 10) / 10;
}
function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}
function calcTDEE(p: Profile): number {
  if (!p.weight || !p.height || !p.age) return 0;
  const bmr = p.gender === 'Female'
    ? 10 * p.weight + 6.25 * p.height - 5 * p.age - 161
    : 10 * p.weight + 6.25 * p.height - 5 * p.age + 5;
  const m: Record<string, number> = { Sedentary: 1.2, Light: 1.375, Moderate: 1.55, Active: 1.725, 'Very Active': 1.9 };
  return Math.round(bmr * (m[p.activity] ?? 1.2));
}

// --- Loading animation ---
const LOADING_STEPS = [
  '🧠 Analyzing your profile...', '📊 Calculating your macros...',
  '🌿 Personalizing Indian diet plan...', '⚡ Querying NVIDIA NIM API...',
  '🍛 Curating authentic recipes...', '📝 Formatting your personalized plan...',
];
const LoadingState = () => {
  const [step, setStep] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    ref.current = setInterval(() => setStep(s => (s + 1) % LOADING_STEPS.length), 1800);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, []);
  return (
    <div className="loading-container">
      <Loader2 size={52} className="animate-spin" style={{ color: 'var(--accent)' }} />
      <p className="loading-pulse">{LOADING_STEPS[step]}</p>
    </div>
  );
};

// --- Markdown cleaner ---
const cleanMarkdown = (text: string) =>
  text
    .replace(/\*{1,2}(#{1,6}\s*)/g, '$1')
    .replace(/^(#{1,6})([^#\s\n])/gm, '$1 $2')
    .replace(/^(#{1,6})\s+/gm, (_, h) => h + ' ')
    .replace(/(?<=[^\n])[ \t]*#{1,6}[ \t]+/g, ' ')
    .replace(/^#{7,}/gm, '');

// --- Sidebar Groups ---
const SIDEBAR_GROUPS = [
  { label: 'Overview', icon: <LayoutDashboard size={14} />, items: ['dashboard'] },
  { label: 'Nutrition', icon: <Utensils size={14} />, items: ['macros', 'mealprep', 'regional', 'recomp'] },
  { label: 'Fitness', icon: <Dumbbell size={14} />, items: ['workout', 'fasting'] },
  { label: 'Track & Analyze', icon: <TrendingUp size={14} />, items: ['progress', 'lab', 'vision'] },
  { label: 'Health & Adapt', icon: <HeartPulse size={14} />, items: ['supplements', 'health', 'adapt'] },
];

const FEATURE_META: Record<string, { name: string; icon: React.ReactNode }> = {
  dashboard: { name: 'Dashboard', icon: <Activity /> },
  workout: { name: 'Workout', icon: <Dumbbell /> },
  macros: { name: 'Macros', icon: <Target /> },
  recomp: { name: 'Recomp', icon: <Utensils /> },
  supplements: { name: 'Supplements', icon: <Pill /> },
  fasting: { name: 'Fasting', icon: <Clock /> },
  mealprep: { name: 'Meal Prep', icon: <ChefHat /> },
  progress: { name: 'Progress', icon: <TrendingUp /> },
  lab: { name: 'Lab Report', icon: <FlaskConical /> },
  vision: { name: 'Food Photo', icon: <Camera /> },
  adapt: { name: 'Adapt Plan', icon: <Settings2 /> },
  health: { name: 'Health Plan', icon: <HeartPulse /> },
  regional: { name: 'Regional Diet', icon: <Map /> },
  profile: { name: 'My Profile', icon: <User /> },
};

// --- Stat Card Component ---
const StatCard = ({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) => (
  <div className="stat-card">
    <p className="stat-label">{label}</p>
    <p className="stat-value" style={color ? { color } : {}}>{value}</p>
    <p className="stat-sub">{sub}</p>
  </div>
);

// --- AUTH ---
const AuthScreen = ({ theme, onToggleTheme, onSignupSuccess }: {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onSignupSuccess: () => void;
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  // Step 1: credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  // Step 2: profile (register only)
  const [step, setStep] = useState<1 | 2>(1);
  const [profileData, setProfileData] = useState({
    name: '', age: '' as string | number, gender: 'Male',
    weight: '' as string | number, height: '' as string | number,
    activity: 'Moderate', goal: 'Fat Loss', diet_type: 'Vegetarian'
  });
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const setPD = (key: string, val: string | number) => setProfileData(p => ({ ...p, [key]: val }));
  const switchTab = (t: 'login' | 'register') => { setTab(t); setStep(1); setError(''); setSuccessMsg(''); };

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSuccessMsg('');
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setStep(2);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true); setSuccessMsg('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // App.tsx uses onAuthStateChange, so it will auto-redirect
    } catch (err: any) { setError(err.message || 'An error occurred'); }
    finally { setLoading(false); }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Failed to login with Google.');
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true); setSuccessMsg('');
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email, password,
        options: {
           data: { full_name: profileData.name }
        }
      });
      if (signUpError) throw signUpError;
      
      // If the user requires email confirmation
      if (data.user && data.user.identities && data.user.identities.length === 0) {
          setSuccessMsg("Account exists. Please log in.");
          setTab('login');
      } else if (data.session) {
          // They are logged in immediately. Let's save profile to DB via our API.
          // Wait for custom API headers to catch the new token
          await new Promise(r => setTimeout(r, 1000));
          try {
            await fetchAPI('/user/profile', {
              method: 'POST',
              body: JSON.stringify({
                name: profileData.name, age: Number(profileData.age), gender: profileData.gender,
                weight: Number(profileData.weight), height: Number(profileData.height),
                activity: profileData.activity, goal: profileData.goal, diet_type: profileData.diet_type,
              }),
            });
          } catch { /* if it fails, user can update later */ }
          onSignupSuccess();
      } else {
          setSuccessMsg("Registration successful! Please check your email and verify your account to log in.");
          setTab('login');
      }
    } catch (err: any) { setError(err.message || 'An error occurred'); setStep(1); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <button className="theme-toggle" onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
      </button>

      <div className="auth-left">
        <div className="auth-brand">
          <div className="auth-brand-logo">NG</div>
          <h1 className="auth-brand-name">NUTRIGENIUS</h1>
          <p className="auth-brand-tagline">
            Your AI-powered nutrition companion — personalized meal plans,
            workout insights, and real-time health analytics, all in one place.
          </p>
          <div className="auth-brand-pills">
            <span className="auth-pill">🧠 AI-Driven Plans</span>
            <span className="auth-pill">🍛 Indian Diet Focus</span>
            <span className="auth-pill">📊 Health Analytics</span>
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-box">
          <div className="auth-header">
            <h2>{tab === 'login' ? 'Welcome back' : step === 1 ? 'Create account' : 'Your profile'}</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.3rem', fontSize: '0.88rem' }}>
              {tab === 'login' ? 'Sign in to your NutriGenius account'
                : step === 1 ? 'Step 1 of 2 — Account credentials'
                  : 'Step 2 of 2 — Tell us about yourself'}
            </p>
          </div>

          {step === 1 && (
            <div className="auth-tabs">
              <div className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => switchTab('login')}>Login</div>
              <div className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => switchTab('register')}>Register</div>
            </div>
          )}

          {successMsg && <div style={{ background: '#10b98120', color: '#10b981', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>{successMsg}</div>}

          {/* ── LOGIN ── */}
          {tab === 'login' && (
            <form onSubmit={handleLoginSubmit} autoComplete="off">
              <div className="form-group"><label>Email Address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
              <div className="form-group">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} style={{ paddingRight: '42px' }} required />
                  <button type="button" onClick={() => setShowPassword(p => !p)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex' }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {error && <div className="form-error">{error}</div>}
              
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : 'LOGIN'}
              </button>

              <div style={{ margin: '1.5rem 0', display: 'flex', alignItems: 'center', color: 'var(--border)' }}>
                 <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                 <span style={{ margin: '0 10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>OR</span>
                 <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
              </div>

              <button type="button" className="btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }} onClick={handleGoogleLogin} disabled={loading}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                   <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                   <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                   <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                   <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
            </form>
          )}

          {/* ── REGISTER STEP 1: Credentials ── */}
          {tab === 'register' && step === 1 && (
            <form onSubmit={handleStep1} autoComplete="off">
              <div className="form-group"><label>Email Address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
              <div className="form-group">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} style={{ paddingRight: '42px' }} required minLength={6} />
                  <button type="button" onClick={() => setShowPassword(p => !p)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex' }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={{ paddingRight: '42px' }} required minLength={6} />
                  <button type="button" onClick={() => setShowConfirm(p => !p)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex' }}>
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {error && <div className="form-error">{error}</div>}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
                CONTINUE →
              </button>

              <div style={{ margin: '1.5rem 0', display: 'flex', alignItems: 'center', color: 'var(--border)' }}>
                 <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                 <span style={{ margin: '0 10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>OR</span>
                 <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
              </div>

              <button type="button" className="btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }} onClick={handleGoogleLogin} disabled={loading}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                   <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                   <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                   <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                   <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign up with Google
              </button>
            </form>
          )}

          {/* ── REGISTER STEP 2: Profile Data ── */}
          {tab === 'register' && step === 2 && (
            <form onSubmit={handleRegisterSubmit} autoComplete="off">
              <div className="form-group">
                <label>Full Name</label>
                <input value={profileData.name} onChange={e => setPD('name', e.target.value)} placeholder="e.g. Priya Sharma" required />
              </div>
              <div className="reg-profile-grid">
                <div className="form-group">
                  <label>Age</label>
                  <input type="number" min={10} max={100} value={profileData.age} onChange={e => setPD('age', e.target.value)} placeholder="25" required />
                </div>
                <div className="form-group">
                  <label>Gender</label>
                  <select value={profileData.gender} onChange={e => setPD('gender', e.target.value)}>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Weight (kg)</label>
                  <input type="number" min={20} max={300} value={profileData.weight} onChange={e => setPD('weight', e.target.value)} placeholder="65" required />
                </div>
                <div className="form-group">
                  <label>Height (cm)</label>
                  <input type="number" min={100} max={250} value={profileData.height} onChange={e => setPD('height', e.target.value)} placeholder="170" required />
                </div>
              </div>
              <div className="form-group">
                <label>Activity Level</label>
                <select value={profileData.activity} onChange={e => setPD('activity', e.target.value)}>
                  {['Sedentary', 'Light', 'Moderate', 'Active', 'Very Active'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Goal</label>
                <select value={profileData.goal} onChange={e => setPD('goal', e.target.value)}>
                  {['Fat Loss', 'Muscle Gain', 'Maintenance', 'General Health'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Diet Type</label>
                <select value={profileData.diet_type} onChange={e => setPD('diet_type', e.target.value)}>
                  {['Vegetarian', 'Non-Vegetarian', 'Flexitarian', 'Eggetarian', 'Vegan'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              {error && <div className="form-error">{error}</div>}
              <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setStep(1)}>← Back</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" /> : 'CREATE ACCOUNT'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Onboarding Banner ---
const OnboardingBanner = ({ onDismiss, onGoProfile }: { onDismiss: () => void, onGoProfile: () => void }) => (
  <div className="onboarding-banner">
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <CheckCircle2 size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <div>
        <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>Welcome to NUTRIGENIUS! 👋</p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
          Complete your profile first to get personalized AI plans based on your body metrics.
        </p>
      </div>
    </div>
    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
      <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.75rem' }} onClick={onGoProfile}>
        Set Up Profile
      </button>
      <button className="btn" style={{ padding: '8px 16px', fontSize: '0.75rem' }} onClick={onDismiss}>
        Later
      </button>
    </div>
  </div>
);

// --- MAIN APP ---
function App() {
  const [session, setSession] = useState<any>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  
  const [activeFeature, setActiveFeature] = useState('dashboard');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Overview: true, Nutrition: true, Fitness: true, 'Track & Analyze': false, 'Health & Adapt': false, Settings: false
  });

  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme') as 'dark' | 'light') || 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);
  const handleToggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = () => setSidebarOpen(false);

  // Per-feature state maps
  const [featureOutputs, setFeatureOutputs] = useState<Record<string, string>>({});
  const [featureLoading, setFeatureLoading] = useState<Record<string, boolean>>({});
  const [featureInputs, setFeatureInputs] = useState<Record<string, string>>({
    workout: 'Hypertrophy', fasting: '16:8', health: 'PCOS', regional: 'North Indian'
  });
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    // Initial fetch of session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUsername(session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'User');
      setAuthInitialized(true);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
         setUsername(session.user?.user_metadata?.full_name || session.user?.email?.split('@')[0] || 'User');
      } else {
         setUsername(null);
         setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) loadProfile(); }, [session]);

  const loadProfile = async () => {
    try { 
        const p = await fetchAPI('/user/profile');
        if (p && Object.keys(p).length > 0) {
            setProfile(p);
        } else {
            // No profile found in DB
            setShowOnboarding(true);
            setActiveFeature('profile');
        }
    }
    catch (e) { console.error("Could not load profile", e); }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); if (!profile) return;
    try {
      await fetchAPI('/user/profile', { method: 'POST', body: JSON.stringify(profile) });
      alert('✅ Profile saved!');
      setShowOnboarding(false);
      setActiveFeature('dashboard');
    } catch (e: any) { alert('Error: ' + (e as Error).message); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const inputText = featureInputs[activeFeature] ?? '';
  const setInputText = (v: string) => setFeatureInputs(p => ({ ...p, [activeFeature]: v }));
  const currentOutput = featureOutputs[activeFeature] ?? '';
  const currentLoading = featureLoading[activeFeature] ?? false;
  const setFOutput = (fid: string, v: string) => setFeatureOutputs(p => ({ ...p, [fid]: v }));
  const setFLoading = (fid: string, v: boolean) => setFeatureLoading(p => ({ ...p, [fid]: v }));

  const handleRunFeature = async () => {
    const fid = activeFeature;
    setFLoading(fid, true); setFOutput(fid, '');
    try {
      if (fid === 'vision') {
        if (!imageFile) throw new Error('No image selected');
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        reader.onload = async () => {
          try { setFOutput(fid, cleanMarkdown(await runVisionFeature(reader.result as string))); }
          catch (e: any) { setFOutput(fid, `🚨 Error: ${e.message}`); }
          setFLoading(fid, false);
        }; return;
      }
      setFOutput(fid, cleanMarkdown(await runFeature(fid, inputText)));
    } catch (e: any) { setFOutput(fid, `🚨 Error: ${e.message}`); }
    finally { if (fid !== 'vision') setFLoading(fid, false); }
  };

  const handleExport = () => {
    if (!currentOutput) return;
    const fname = FEATURE_META[activeFeature]?.name ?? activeFeature;
    const blob = new Blob([currentOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `NutriGenius_${fname}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleGroup = (label: string) =>
    setOpenGroups(p => ({ ...p, [label]: !p[label] }));

  // BMI / TDEE
  const bmi = profile ? calcBMI(profile.weight, profile.height) : 0;
  const tdee = profile ? calcTDEE(profile) : 0;
  const profileComplete = !!(profile?.weight && profile?.height && profile?.age && profile?.name);

  const renderInput = () => {
    switch (activeFeature) {
      case 'dashboard': case 'macros': case 'recomp': case 'supplements': case 'mealprep':
        return <p style={{ color: 'var(--text-secondary)' }}>Uses your saved profile. Click Generate to get your plan.</p>;
      case 'workout': return (
        <div><label>Training Type</label>
          <select value={inputText} onChange={e => setInputText(e.target.value)}>
            {['Hypertrophy', 'Cardio', 'Strength', 'HIIT', 'Yoga'].map(o => <option key={o}>{o}</option>)}
          </select></div>
      );
      case 'fasting': return (
        <div><label>Fasting Window</label>
          <select value={inputText} onChange={e => setInputText(e.target.value)}>
            {['16:8', '18:6', '20:4', 'OMAD'].map(o => <option key={o}>{o}</option>)}
          </select></div>
      );
      case 'health': return (
        <div><label>Medical Condition</label>
          <select value={inputText} onChange={e => setInputText(e.target.value)}>
            {['PCOS', 'Type 2 Diabetes', 'Hypertension', 'Thyroid'].map(o => <option key={o}>{o}</option>)}
          </select></div>
      );
      case 'regional': return (
        <div><label>Cuisine Type</label>
          <select value={inputText} onChange={e => setInputText(e.target.value)}>
            {['North Indian', 'South Indian', 'Gujarati', 'Maharashtrian', 'Bengali'].map(o => <option key={o}>{o}</option>)}
          </select></div>
      );
      case 'progress': case 'lab': case 'adapt': return (
        <div><label>Input Details</label>
          <textarea rows={4} value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Type data here..." /></div>
      );
      case 'vision': return (
        <div><label>Upload Food Photo</label>
          <input type="file" accept="image/*" onChange={e => { if (e.target.files?.[0]) setImageFile(e.target.files[0]); }} /></div>
      );
      case 'profile':
        return (
          <form className="card" onSubmit={saveProfile}>
            <div className="profile-grid">
              <div>
                <label>Full Name</label><input value={profile?.name || ''} onChange={e => setProfile(p => ({ ...(p as Profile), name: e.target.value }))} required />
                <label>Age</label><input type="number" value={profile?.age || ''} onChange={e => setProfile(p => ({ ...(p as Profile), age: +e.target.value }))} required />
                <label>Gender</label>
                <select value={profile?.gender || 'Male'} onChange={e => setProfile(p => ({ ...(p as Profile), gender: e.target.value }))}>
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
                <label>Weight (kg)</label><input type="number" value={profile?.weight || ''} onChange={e => setProfile(p => ({ ...(p as Profile), weight: +e.target.value }))} required />
                <label>Height (cm)</label><input type="number" value={profile?.height || ''} onChange={e => setProfile(p => ({ ...(p as Profile), height: +e.target.value }))} required />
              </div>
              <div>
                <label>Activity Level</label>
                <select value={profile?.activity || 'Moderate'} onChange={e => setProfile(p => ({ ...(p as Profile), activity: e.target.value }))}>
                  {['Sedentary', 'Light', 'Moderate', 'Active', 'Very Active'].map(o => <option key={o}>{o}</option>)}
                </select>
                <label>Goal</label>
                <select value={profile?.goal || 'Fat Loss'} onChange={e => setProfile(p => ({ ...(p as Profile), goal: e.target.value }))}>
                  {['Fat Loss', 'Muscle Gain', 'Maintenance', 'General Health'].map(o => <option key={o}>{o}</option>)}
                </select>
                <label>Diet Type</label>
                <select value={profile?.diet_type || 'Vegetarian'} onChange={e => setProfile(p => ({ ...(p as Profile), diet_type: e.target.value }))}>
                  {['Vegetarian', 'Non-Vegetarian', 'Flexitarian', 'Eggetarian', 'Vegan'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: '2rem' }}>Save Profile</button>
          </form>
        );
      default: return null;
    }
  };

  if (!authInitialized) {
      return (
          <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
              <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent)' }}/>
          </div>
      );
  }

  if (!session) {
      return <AuthScreen theme={theme} onToggleTheme={handleToggleTheme} onSignupSuccess={() => {
        setShowOnboarding(true);
        setActiveFeature('profile');
      }} />;
  }

  const bmiColor = bmi < 18.5 ? '#60a5fa' : bmi < 25 ? 'var(--accent)' : bmi < 30 ? '#f59e0b' : '#f87171';

  return (
    <div className="app-container">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}

      {/* ---------- SIDEBAR ---------- */}
      <div className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h1>NUTRIGENIUS</h1>
          {profileComplete && (
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px', letterSpacing: '1px', textTransform: 'uppercase' }}>
              👋 {username}
            </p>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {SIDEBAR_GROUPS.map(group => (
            <div key={group.label} className="sidebar-group">
              <div className="sidebar-group-header" onClick={() => toggleGroup(group.label)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {group.icon} {group.label}
                </span>
                <ChevronDown size={12} style={{ transform: openGroups[group.label] ? 'rotate(0deg)' : 'rotate(-90deg)', transition: '0.2s' }} />
              </div>
              {openGroups[group.label] && group.items.map(id => {
                const meta = FEATURE_META[id];
                return (
                  <div
                    key={id}
                    className={`nav-item ${activeFeature === id ? 'active' : ''}`}
                    onClick={() => { setActiveFeature(id); closeSidebar(); }}
                  >
                    <span className="nav-icon">{meta.icon}</span>
                    <span>{meta.name}</span>
                    {featureLoading[id] && <Loader2 size={11} className="animate-spin" style={{ marginLeft: 'auto', color: 'var(--accent)' }} />}
                    {featureOutputs[id] && !featureLoading[id] && (
                      <span style={{ marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} title="Plan ready" />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ---------- MAIN ---------- */}
      <div className="main-content">
        {/* Onboarding */}
        {showOnboarding && activeFeature !== 'profile' && (
          <OnboardingBanner onDismiss={() => setShowOnboarding(false)} onGoProfile={() => { setActiveFeature('profile'); setShowOnboarding(false); }} />
        )}

        {/* Topbar */}
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} title="Menu">
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <h2 className="topbar-title">{FEATURE_META[activeFeature]?.name}</h2>
          </div>
          <div className="user-profile">
            <button className="username-chip" onClick={() => setActiveFeature('profile')} title="Go to My Profile">
              <User size={15} /> {username}
            </button>
            <button className="theme-toggle-inline" onClick={handleToggleTheme} title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="btn btn-danger" onClick={handleLogout} style={{ padding: '8px 16px' }}>
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>

        {/* ── Metrics Strip ── */}
        {profileComplete && (
          <div className="metrics-strip">
            <div className="metric-chip"><Flame size={13} style={{ color: 'var(--accent)' }} /><span>TDEE <strong>{tdee} kcal</strong></span></div>
            <div className="metric-chip" style={{ color: bmiColor }}><Activity size={13} /><span>BMI <strong>{bmi}</strong> <em style={{ color: 'var(--text-secondary)', fontStyle: 'normal', fontSize: '0.7rem' }}>({bmiCategory(bmi)})</em></span></div>
            <div className="metric-chip"><Target size={13} style={{ color: 'var(--accent)' }} /><span>Goal <strong>{profile?.goal}</strong></span></div>
            <div className="metric-chip"><Utensils size={13} style={{ color: 'var(--accent)' }} /><span>Diet <strong>{profile?.diet_type}</strong></span></div>
            <div className="metric-chip"><Activity size={13} style={{ color: 'var(--accent)' }} /><span>Activity <strong>{profile?.activity}</strong></span></div>
          </div>
        )}

        {/* ── Dashboard Stat Cards ── */}
        {activeFeature === 'dashboard' && profileComplete && (
          <div className="stats-grid">
            <StatCard label="BMI" value={`${bmi}`} sub={bmiCategory(bmi)} color={bmiColor} />
            <StatCard label="Daily Calories" value={`${tdee} kcal`} sub="Total Daily Energy Expenditure" color="var(--accent)" />
            <StatCard label="Fat Loss Target" value={`${Math.round(tdee * 0.8)} kcal`} sub="20% deficit recommended" />
            <StatCard label="Muscle Gain Target" value={`${Math.round(tdee * 1.1)} kcal`} sub="10% surplus recommended" />
            <StatCard label="Weight" value={`${profile?.weight} kg`} sub="Current body weight" />
            <StatCard label="Height" value={`${profile?.height} cm`} sub="Current height" />
          </div>
        )}

        {/* ── AI Feature Panel ── */}
        {activeFeature !== 'profile' && (
          <div className="feature-input-section card">
            {renderInput()}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-light-green" onClick={handleRunFeature} disabled={currentLoading || !profileComplete}>
                {currentLoading
                  ? <><Loader2 className="animate-spin" /> {['progress', 'lab', 'vision'].includes(activeFeature) ? 'ANALYZING...' : 'GENERATING...'}</>
                  : ['progress', 'lab', 'vision'].includes(activeFeature) ? 'ANALYZE' : 'GENERATE AI PLAN'}
              </button>
              {currentOutput && !currentLoading && (
                <button className="btn" onClick={handleExport} title="Download as .txt">
                  <Download size={15} /> Export Plan
                </button>
              )}
            </div>
            {!profileComplete && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '10px' }}>⚠️ Complete your profile first to generate plans.</p>}
          </div>
        )}

        {activeFeature === 'profile' && renderInput()}

        {/* ── Output Panel ── */}
        {(currentOutput || currentLoading) && activeFeature !== 'profile' && (
          <div className="feature-output-section markdown-body">
            {currentLoading && !currentOutput
              ? <LoadingState />
              : <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanMarkdown(currentOutput)}</ReactMarkdown>
            }
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
