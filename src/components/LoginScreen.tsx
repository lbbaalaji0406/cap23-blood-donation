import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { login, resetPassword } from '../services/authService';
import { useAuth } from '../contexts/AuthProvider';
import { 
  Droplets, 
  Building2, 
  Snowflake, 
  ShieldCheck, 
  Tent, 
  UserCheck, 
  ArrowRight, 
  Lock, 
  Mail, 
  Sparkles,
  AlertCircle,
  FlaskConical,
  CheckCircle2
} from 'lucide-react';

interface DemoPersona {
  id: string;
  role: 'Storage' | 'Hospital' | 'Manager' | 'Admin' | 'Donor';
  title: string;
  facility: string;
  name: string;
  email: string;
  password: string;
  description: string;
  targetPortal: 'staff' | 'donor';
  color: string;
  badgeBg: string;
  icon: typeof Snowflake;
}

const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'storage-officer',
    role: 'Storage',
    title: 'Cold Storage Officer',
    facility: 'Central Cold Storage Facility',
    name: 'Officer Ramesh (Quality Gatekeeper)',
    email: 'storage1@example.com',
    password: 'password123',
    description: 'Quarantine ledger, Maker-Checker TTI release, and active FEFO shelf.',
    targetPortal: 'staff',
    color: 'border-blue-300 bg-blue-50/50 hover:bg-blue-50',
    badgeBg: 'bg-blue-100 text-blue-800',
    icon: Snowflake
  },
  {
    id: 'hospital-staff',
    role: 'Hospital',
    title: 'Hospital Transfusion Unit',
    facility: 'SRM Medical College Hospital',
    name: 'Dr. Anita (Ward Staff)',
    email: 'hospital1@example.com',
    password: 'password123',
    description: 'Raise emergency PRBC/Platelet requisitions and track deliveries.',
    targetPortal: 'staff',
    color: 'border-rose-300 bg-rose-50/50 hover:bg-rose-50',
    badgeBg: 'bg-rose-100 text-rose-800',
    icon: Building2
  },
  {
    id: 'camp-manager',
    role: 'Manager',
    title: 'Camp Drive Coordinator',
    facility: 'SRM University Blood Drive',
    name: 'Manager Vikram',
    email: 'manager1@example.com',
    password: 'password123',
    description: 'Manage mobile donation drives and camp-scoped donor matching.',
    targetPortal: 'staff',
    color: 'border-amber-300 bg-amber-50/50 hover:bg-amber-50',
    badgeBg: 'bg-amber-100 text-amber-800',
    icon: Tent
  },
  {
    id: 'intake-tech',
    role: 'Storage',
    title: 'Intake Lab Technician',
    facility: 'Central Receiving Dock',
    name: 'Tech Anitha (Quarantine Intake)',
    email: 'intake_tech@example.com',
    password: 'password123',
    description: 'Receive fresh bags into Quarantine dock (Maker-Checker intake step).',
    targetPortal: 'staff',
    color: 'border-cyan-300 bg-cyan-50/50 hover:bg-cyan-50',
    badgeBg: 'bg-cyan-100 text-cyan-800',
    icon: FlaskConical
  },
  {
    id: 'donor-universal',
    role: 'Donor',
    title: 'Voluntary Blood Donor',
    facility: 'Universal O- Donor',
    name: 'Kavitha (O- Registered Donor)',
    email: 'donor1_camp2@example.com',
    password: 'password123',
    description: 'Check statutory cooldown eligibility, donor card & donation history.',
    targetPortal: 'donor',
    color: 'border-red-300 bg-red-50/50 hover:bg-red-50',
    badgeBg: 'bg-red-100 text-red-800',
    icon: UserCheck
  },
  {
    id: 'system-admin',
    role: 'Admin',
    title: 'System Administrator',
    facility: 'National Health Authority',
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'password123',
    description: 'User provisioning, master facility catalogs, and complete audit trail.',
    targetPortal: 'staff',
    color: 'border-slate-300 bg-slate-50/50 hover:bg-slate-100',
    badgeBg: 'bg-slate-200 text-slate-800',
    icon: ShieldCheck
  }
];

export const LoginScreen = () => {
  const [portal, setPortal] = useState<'donor' | 'staff'>('donor');
  const [staffDepartment, setStaffDepartment] = useState<'Storage' | 'Hospital' | 'Manager' | 'Admin'>('Storage');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { user, profile, loading } = useAuth();

  // Determine intelligent home route based on verified server role
  const getRoleHome = (role: string): string => {
    switch (role) {
      case 'Storage':
        return '/storage';
      case 'Hospital':
        return '/hospital/new';
      case 'Manager':
        return '/requests';
      case 'Admin':
        return '/dashboard';
      case 'Donor':
      case 'User':
      default:
        return '/dashboard';
    }
  };

  // If already authenticated and profile loaded, auto-navigate to verified role home
  if (user && profile) {
    return <Navigate to={getRoleHome(profile.role)} replace />;
  }

  // If authenticated but waiting for profile from RTDB, show loading state
  if (user && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600 mx-auto mb-3"></div>
          <p className="text-sm text-slate-600 font-medium">Loading clinical profile...</p>
        </div>
      </div>
    );
  }

  const isDevOrDemo = import.meta.env.DEV || 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1';

  const executeSignIn = async (targetEmail: string, targetPass: string) => {
    if (!targetEmail || !targetPass) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setInfoMsg('');
    setResetSuccess('');

    const { error } = await login(targetEmail, targetPass);
    if (error) {
      setErrorMsg(error);
      setSubmitting(false);
    }
    // On success, AuthProvider onAuthStateChanged will fire, update profile, and trigger <Navigate> above!
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSignIn(email, password);
  };

  const handlePersonaSelect = async (persona: DemoPersona, autoLogin: boolean) => {
    setEmail(persona.email);
    setPassword(persona.password);
    setPortal(persona.targetPortal);
    if (persona.role !== 'Donor') {
      setStaffDepartment(persona.role);
    }
    setErrorMsg('');
    setResetSuccess('');

    if (autoLogin) {
      await executeSignIn(persona.email, persona.password);
    } else {
      setInfoMsg(`Loaded credentials for ${persona.title}`);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setErrorMsg('Please enter your email address to receive a password reset link.');
      return;
    }
    setErrorMsg('');
    const { error } = await resetPassword(email);
    if (error) {
      setErrorMsg(error);
    } else {
      setResetSuccess(`Password reset email sent to ${email}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      {/* Brand & Ecosystem Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl text-center mb-6">
        <div className="inline-flex items-center justify-center p-3 bg-red-600 rounded-2xl shadow-md text-white mb-3">
          <Droplets className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          CAP-23 Transfusion Network
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Integrated Vein-to-Vein Cold Chain Management & Blood Banking Ecosystem
        </p>
      </div>

      {/* Evaluator Quick-Demo Bar (Visible in Dev/Emulator Mode) */}
      {isDevOrDemo && (
        <div className="sm:mx-auto sm:w-full sm:max-w-4xl mb-6">
          <div className="bg-amber-50/80 border border-amber-300 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-amber-200">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-amber-700 animate-pulse" />
                <span className="font-bold text-sm text-amber-900 tracking-wide uppercase">
                  Evaluator Quick Access (Local Firebase Emulator Active)
                </span>
              </div>
              <span className="text-xs bg-amber-200/80 text-amber-900 font-semibold px-2 py-0.5 rounded-full">
                1-Click Persona Sign-In
              </span>
            </div>
            <p className="text-xs text-amber-800 mb-3">
              Click any verified persona below to immediately log into that role's live workspace:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {DEMO_PERSONAS.map((persona) => {
                const IconComponent = persona.icon;
                return (
                  <button
                    key={persona.id}
                    type="button"
                    disabled={submitting}
                    onClick={() => handlePersonaSelect(persona, true)}
                    className={`flex items-start p-2.5 text-left rounded-xl border transition-all shadow-xs group ${persona.color} hover:shadow-sm`}
                  >
                    <div className="p-2 rounded-lg bg-white shadow-xs mr-2.5 text-slate-700 group-hover:scale-105 transition-transform">
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-semibold text-xs text-slate-900 truncate">
                          {persona.title}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${persona.badgeBg}`}>
                          {persona.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 truncate">{persona.facility}</p>
                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{persona.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Authentication Card */}
      <div className="sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 sm:rounded-2xl sm:px-10">
          
          {/* Dual-Door Segmented Portal Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setPortal('donor');
                setErrorMsg('');
                setInfoMsg('');
                setResetSuccess('');
              }}
              className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all ${
                portal === 'donor'
                  ? 'bg-white text-red-700 shadow-xs ring-1 ring-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Droplets className="w-4 h-4 text-red-600" />
              <span>Donor Portal</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPortal('staff');
                setErrorMsg('');
                setInfoMsg('');
                setResetSuccess('');
              }}
              className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all ${
                portal === 'staff'
                  ? 'bg-white text-blue-700 shadow-xs ring-1 ring-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>Staff & Clinical</span>
            </button>
          </div>

          {/* Department Quick Filter for Staff */}
          {portal === 'staff' && (
            <div className="mb-5 p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
              <label className="block text-xs font-semibold text-blue-900 mb-1.5 uppercase tracking-wider">
                Select Department Workstation:
              </label>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {[
                  { key: 'Storage', label: '❄️ Cold Storage', sub: 'TTI & FEFO Shelf' },
                  { key: 'Hospital', label: '🏥 Hospital Ward', sub: 'Emergency Request' },
                  { key: 'Manager', label: '🏕️ Camp Drives', sub: 'Mobile Collections' },
                  { key: 'Admin', label: '🛡️ Administrator', sub: 'System Authority' },
                ].map((dept) => (
                  <button
                    key={dept.key}
                    type="button"
                    onClick={() => {
                      setStaffDepartment(dept.key as typeof staffDepartment);
                      // Auto-fill matching demo credentials only in dev/demo mode
                      if (isDevOrDemo) {
                        const match = DEMO_PERSONAS.find(p => p.role === dept.key);
                        if (match) {
                          setEmail(match.email);
                          setPassword(match.password);
                          setInfoMsg(`Loaded demo credentials for ${match.title}`);
                        }
                      }
                    }}
                    className={`p-2 text-left rounded-lg border transition-all ${
                      staffDepartment === dept.key
                        ? 'border-blue-500 bg-white shadow-xs font-semibold text-blue-900'
                        : 'border-transparent hover:bg-blue-100/50 text-slate-700'
                    }`}
                  >
                    <div>{dept.label}</div>
                    <div className="text-[10px] text-slate-500">{dept.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Contextual Instructions */}
          <div className="mb-5 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
            {portal === 'donor' ? (
              <p>
                🩸 <strong>Voluntary Donors:</strong> Sign in with your registered email to check donation eligibility, view your blood group verification status, and respond to emergency blood appeals.
              </p>
            ) : (
              <p>
                🔒 <strong>Institutional Staff:</strong> Authorized access for cold storage laboratories, clinical hospital transfusion wards, and blood camp coordinators.
              </p>
            )}
          </div>

          {/* Feedback & Error Alerts */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600" />
              <span>{infoMsg}</span>
            </div>
          )}

          {resetSuccess && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{resetSuccess}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="email">
                {portal === 'donor' ? 'Donor Email Address' : 'Staff / Institutional Email'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={portal === 'donor' ? 'donor@example.com' : 'officer@hospital.org'}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700" htmlFor="password">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-2.5 px-4 rounded-xl text-white font-semibold text-sm transition-all flex items-center justify-center space-x-2 shadow-sm disabled:opacity-50 ${
                portal === 'donor'
                  ? 'bg-red-600 hover:bg-red-700 focus:ring-4 focus:ring-red-100'
                  : 'bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:ring-blue-100'
              }`}
            >
              <span>{submitting ? 'Authenticating...' : portal === 'donor' ? 'Sign In as Donor' : 'Sign In to Clinical Workspace'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Footer Actions */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-center text-xs text-slate-500">
            {portal === 'donor' ? (
              <div>
                First time voluntary donor?{' '}
                <Link to="/signup" className="text-red-600 font-semibold hover:text-red-700">
                  Create Donor Account
                </Link>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 leading-relaxed">
                Staff accounts are provisioned exclusively by facility administrators. For credential recovery or facility onboarding, contact the State Blood Transfusion Council (SBTC).
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
