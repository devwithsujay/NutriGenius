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
    // 1. Unwrap bold/italic wrapped headings: **### Title** → ### Title
    .replace(/\*{1,2}(#{1,6}\s*)/g, '$1')
    // 2. Ensure space after # at start of line: ###Title → ### Title
    .replace(/^(#{1,6})([^#\s\n])/gm, '$1 $2')
    // 3. Normalize multiple spaces after # to single: ###   Title → ### Title
    .replace(/^(#{1,6})\s+/gm, (_, h) => h + ' ')
    // 4. Strip any remaining stray ### mid-line (not parsed as headings)
    .replace(/(?<=[^\n])[ \t]*#{1,6}[ \t]+/g, ' ')
    // 5. Clean up any leftover # at start that slipped through
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
const AuthScreen = ({ onLogin, theme, onToggleTheme }: {
  onLogin: (token: string, username: string, isNew: boolean) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  // Step 1: credentials
  const [username, setUsername] = useState('');
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
  const [loading, setLoading] = useState(false);

  const setPD = (key: string, val: string | number) => setProfileData(p => ({ ...p, [key]: val }));
  const switchTab = (t: 'login' | 'register') => { setTab(t); setStep(1); setError(''); };

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    setStep(2);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const r = await fetchAPI('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      sessionStorage.setItem('token', r.token); sessionStorage.setItem('username', r.username);
      onLogin(r.token, r.username, false);
    } catch (err: any) { setError(err.message || 'An error occurred'); }
    finally { setLoading(false); }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await fetchAPI('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
      const loginRes = await fetchAPI('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      sessionStorage.setItem('token', loginRes.token); sessionStorage.setItem('username', loginRes.username);
      try {
        await fetchAPI('/user/profile', {
          method: 'POST',
          body: JSON.stringify({
            name: profileData.name, age: Number(profileData.age), gender: profileData.gender,
            weight: Number(profileData.weight), height: Number(profileData.height),
            activity: profileData.activity, goal: profileData.goal, diet_type: profileData.diet_type,
          }),
        });
      } catch { /* profile save failure is non-fatal */ }
      onLogin(loginRes.token, loginRes.username, true);
    } catch (err: any) { setError(err.message || 'An error occurred'); setStep(1); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      {/* Theme toggle – top right corner */}
      <button className="theme-toggle" onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
      </button>

      {/* ── LEFT PANEL: Branding ── */}
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

      {/* ── RIGHT PANEL: Form ── */}
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

          {/* Tabs — only show on step 1 */}
          {step === 1 && (
            <div className="auth-tabs">
              <div className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => switchTab('login')}>Login</div>
              <div className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => switchTab('register')}>Register</div>
            </div>
          )}

          {/* ── LOGIN ── */}
          {tab === 'login' && (
            <form onSubmit={handleLoginSubmit} autoComplete="off">
              <div className="form-group"><label>Username</label><input value={username} onChange={e => setUsername(e.target.value)} required /></div>
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
            </form>
          )}

          {/* ── REGISTER STEP 1: Credentials ── */}
          {tab === 'register' && step === 1 && (
            <form onSubmit={handleStep1} autoComplete="off">
              <div className="form-group"><label>Username</label><input value={username} onChange={e => setUsername(e.target.value)} required /></div>
              <div className="form-group">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} style={{ paddingRight: '42px' }} required />
                  <button type="button" onClick={() => setShowPassword(p => !p)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex' }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={{ paddingRight: '42px' }} required />
                  <button type="button" onClick={() => setShowConfirm(p => !p)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex' }}>
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {error && <div className="form-error">{error}</div>}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
                CONTINUE →
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
  // Clear old localStorage tokens (migrated to sessionStorage)
  if (localStorage.getItem('token')) localStorage.clear();

  const [token, setToken] = useState<string | null>(sessionStorage.getItem('token'));
  const [username, setUsername] = useState<string | null>(sessionStorage.getItem('username'));
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

  useEffect(() => { if (token) loadProfile(); }, [token]);

  const loadProfile = async () => {
    try { setProfile(await fetchAPI('/user/profile')); }
    catch { handleLogout(); }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); if (!profile) return;
    try {
      await fetchAPI('/user/profile', { method: 'POST', body: JSON.stringify(profile) });
      alert('✅ Profile saved!');
      setShowOnboarding(false);
    } catch (e: any) { alert('Error: ' + (e as Error).message); }
  };

  const handleLogout = () => {
    sessionStorage.clear(); setToken(null); setUsername(null);
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
        if (!profile) return null;
        return (
          <form className="card" onSubmit={saveProfile}>
            <div className="profile-grid">
              <div>
                <label>Full Name</label><input value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
                <label>Age</label><input type="number" value={profile.age} onChange={e => setProfile({ ...profile, age: +e.target.value })} />
                <label>Gender</label>
                <select value={profile.gender} onChange={e => setProfile({ ...profile, gender: e.target.value })}>
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
                <label>Weight (kg)</label><input type="number" value={profile.weight} onChange={e => setProfile({ ...profile, weight: +e.target.value })} />
                <label>Height (cm)</label><input type="number" value={profile.height} onChange={e => setProfile({ ...profile, height: +e.target.value })} />
              </div>
              <div>
                <label>Activity Level</label>
                <select value={profile.activity} onChange={e => setProfile({ ...profile, activity: e.target.value })}>
                  {['Sedentary', 'Light', 'Moderate', 'Active', 'Very Active'].map(o => <option key={o}>{o}</option>)}
                </select>
                <label>Goal</label>
                <select value={profile.goal} onChange={e => setProfile({ ...profile, goal: e.target.value })}>
                  {['Fat Loss', 'Muscle Gain', 'Maintenance', 'General Health'].map(o => <option key={o}>{o}</option>)}
                </select>
                <label>Diet Type</label>
                <select value={profile.diet_type} onChange={e => setProfile({ ...profile, diet_type: e.target.value })}>
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

  if (!token) return <AuthScreen onLogin={(t, u, isNew) => { setToken(t); setUsername(u); if (isNew) { setActiveFeature('profile'); setShowOnboarding(true); } }} theme={theme} onToggleTheme={handleToggleTheme} />;

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
              👋 {profile?.name?.split(' ')[0]}
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
              <button className="btn btn-light-green" onClick={handleRunFeature} disabled={currentLoading}>
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
