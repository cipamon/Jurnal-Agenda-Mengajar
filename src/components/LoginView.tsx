import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
} from 'lucide-react';
import { WebBrandConfig } from '../types';
import { apiGetAuthStatus, ApiHttpError, ServerAuthStatus } from '../utils/apiClient';

const LS_REMEMBERED_USERNAME = 'portal_eguru_remembered_user';
const LS_LOGIN_THEME_DARK = 'portal_eguru_login_dark';

interface LoginViewProps {
  defaultEmail: string;
  defaultAcademicYear: string;
  defaultSemester: 'Ganjil' | 'Genap';
  academicYears: string[];
  webBrand: WebBrandConfig;
  externalError?: string | null;
  onGoogleLogin?: (payload: {
    academicYear: string;
    semester: 'Ganjil' | 'Genap';
  }) => Promise<string | null>;
  onServerLogin: (payload: {
    identifier: string;
    password: string;
    academicYear: string;
    semester: 'Ganjil' | 'Genap';
  }) => Promise<string | null>;
  onClaimAdmin: (payload: {
    username: string;
    password: string;
    email?: string;
    staffPassword?: string;
    academicYear: string;
    semester: 'Ganjil' | 'Genap';
  }) => Promise<string | null>;
}

const EXISTING_SCHOOL_ACCOUNTS: Array<{
  username: string;
  email: string;
  roleLabel: string;
}> = [
  { username: 'admin', email: 'admin@sman1nusantara.sch.id', roleLabel: 'Admin Sistem' },
  { username: 'guru', email: 'guru@sman1nusantara.sch.id', roleLabel: 'Guru Mapel 1' },
  { username: 'guru2', email: 'guru2@sman1nusantara.sch.id', roleLabel: 'Guru Mapel 2' },
  { username: 'walikelas', email: 'walikelas@sman1nusantara.sch.id', roleLabel: 'Wali Kelas' },
  { username: 'kepsek', email: 'kepsek@sman1nusantara.sch.id', roleLabel: 'Kepala Sekolah' },
  { username: 'staff', email: 'staff@sman1nusantara.sch.id', roleLabel: 'Karyawan / Staff TU' },
];

function generateStrongPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  const pick = (pool: string) => {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return pool[arr[0] % pool.length];
  };
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export const LoginView: React.FC<LoginViewProps> = ({
  defaultEmail,
  defaultAcademicYear,
  defaultSemester,
  academicYears,
  webBrand,
  externalError,
  onGoogleLogin,
  onServerLogin,
  onClaimAdmin,
}) => {
  const [authStatus, setAuthStatus] = useState<ServerAuthStatus | null>(null);
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);
  const [isCheckingServer, setIsCheckingServer] = useState<boolean>(true);
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_LOGIN_THEME_DARK) === '1';
    } catch {
      return false;
    }
  });

  const [rememberUsername, setRememberUsername] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem(LS_REMEMBERED_USERNAME));
    } catch {
      return true;
    }
  });

  const [identifier, setIdentifier] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_REMEMBERED_USERNAME) || defaultEmail || 'admin';
    } catch {
      return defaultEmail || 'admin';
    }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);

  // First-run Admin & multi-role activation state
  const [claimUsername, setClaimUsername] = useState('admin');
  const [claimEmail, setClaimEmail] = useState('admin@sman1nusantara.sch.id');
  const [claimPassword, setClaimPassword] = useState('');
  const [showClaimPassword, setShowClaimPassword] = useState(true);
  const [activateAllStaff, setActivateAllStaff] = useState(true);
  const [staffPassword, setStaffPassword] = useState('');
  const [showStaffPassword, setShowStaffPassword] = useState(true);
  const [copiedCreds, setCopiedCreds] = useState(false);

  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);
  const [semester, setSemester] = useState<'Ganjil' | 'Genap'>(defaultSemester);
  const [error, setError] = useState<string | null>(null);
  const [isServerLoading, setIsServerLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const checkServerAvailability = useCallback(async (isMountedCheck?: () => boolean) => {
    setIsCheckingServer(true);
    try {
      const status = await apiGetAuthStatus();
      if (isMountedCheck && !isMountedCheck()) return false;
      setAuthStatus(status);
      setServerAvailable(true);
      if (status.academicYear) setAcademicYear(status.academicYear);
      if (status.semester) setSemester(status.semester);
      try {
        const saved = localStorage.getItem(LS_REMEMBERED_USERNAME);
        if (!saved && status.adminUsernameHint) {
          setIdentifier(status.adminUsernameHint);
        }
      } catch {
        if (status.adminUsernameHint) {
          setIdentifier(status.adminUsernameHint);
        }
      }
      return true;
    } catch (err) {
      if (isMountedCheck && !isMountedCheck()) return false;
      setAuthStatus(null);
      if (err instanceof ApiHttpError && !err.isBackendUnavailable && err.status >= 500) {
        setServerAvailable(false);
      } else {
        setServerAvailable(false);
      }
      return false;
    } finally {
      if (!isMountedCheck || isMountedCheck()) {
        setIsCheckingServer(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    void checkServerAvailability(() => active);
    return () => {
      active = false;
    };
  }, [checkServerAvailability]);

  const toggleDarkMode = () => {
    setIsDark((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LS_LOGIN_THEME_DARK, next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleToggleRemember = () => {
    setRememberUsername((prev) => {
      const next = !prev;
      try {
        if (!next) {
          localStorage.removeItem(LS_REMEMBERED_USERNAME);
        } else if (identifier.trim()) {
          localStorage.setItem(LS_REMEMBERED_USERNAME, identifier.trim());
        }
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleServerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanId = identifier.trim();
    if (!cleanId || !password) {
      setError('Username atau Email dan Password wajib diisi.');
      return;
    }
    try {
      if (rememberUsername) {
        localStorage.setItem(LS_REMEMBERED_USERNAME, cleanId);
      } else {
        localStorage.removeItem(LS_REMEMBERED_USERNAME);
      }
    } catch {
      // ignore storage errors
    }

    setIsServerLoading(true);
    try {
      const err = await onServerLogin({
        identifier: cleanId,
        password,
        academicYear,
        semester,
      });
      if (err) {
        if (
          err.includes('HTTP 404') ||
          err.includes('tidak tersedia pada host ini') ||
          err.includes('Tidak dapat terhubung ke server backend')
        ) {
          const stillAvailable = await checkServerAvailability();
          if (!stillAvailable) {
            setError(
              'Layanan server (/api) tidak aktif pada tautan pratinjau statis ini. Gunakan Masuk dengan Google (Cloud Firebase) di bawah.'
            );
            return;
          }
        }
        setError(err);
      }
    } finally {
      setIsServerLoading(false);
    }
  };

  const handleGoogleSubmit = async () => {
    if (!onGoogleLogin) return;
    setError(null);
    setIsGoogleLoading(true);
    try {
      const err = await onGoogleLogin({ academicYear, semester });
      if (err) setError(err);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleClaimAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!claimUsername.trim()) {
      setError('Username Admin wajib diisi.');
      return;
    }
    if (claimPassword.length < 8) {
      setError('Password Admin wajib minimal 8 karakter.');
      return;
    }
    if (activateAllStaff && staffPassword.trim().length > 0 && staffPassword.trim().length < 6) {
      setError('Password awal akun guru/staff wajib minimal 6 karakter.');
      return;
    }
    if (activateAllStaff && staffPassword.trim().length === 0) {
      setError('Isi atau buat otomatis Password Awal untuk 5 akun lainnya (atau matikan centang aktivasi massal).');
      return;
    }
    setIsServerLoading(true);
    try {
      const err = await onClaimAdmin({
        username: claimUsername.trim(),
        password: claimPassword,
        email: claimEmail.trim(),
        staffPassword: activateAllStaff ? staffPassword.trim() : undefined,
        academicYear,
        semester,
      });
      if (err) {
        if (
          err.includes('HTTP 404') ||
          err.includes('tidak tersedia pada host ini') ||
          err.includes('Tidak dapat terhubung ke server backend')
        ) {
          await checkServerAvailability();
        }
        setError(err);
      }
    } finally {
      setIsServerLoading(false);
    }
  };

  const handleGenerateAdminPass = () => {
    const generated = generateStrongPassword(12);
    setClaimPassword(generated);
    setShowClaimPassword(true);
    setCopiedCreds(false);
  };

  const handleGenerateStaffPass = () => {
    const generated = generateStrongPassword(10);
    setStaffPassword(generated);
    setShowStaffPassword(true);
    setCopiedCreds(false);
  };

  const handleCopyClaimCredentials = async () => {
    if (!claimUsername.trim() || !claimPassword) return;
    const lines = [
      `=== KREDENSIAL PORTAL E-GURU ===`,
      `1. Admin Sistem | Username: ${claimUsername.trim()} | Email: ${claimEmail.trim() || '-'} | Password: ${claimPassword}`,
    ];
    if (activateAllStaff && staffPassword.trim()) {
      EXISTING_SCHOOL_ACCOUNTS.filter((acc) => acc.username !== 'admin').forEach((acc, idx) => {
        lines.push(
          `${idx + 2}. ${acc.roleLabel} | Username: ${acc.username} | Email: ${acc.email} | Password: ${staffPassword.trim()}`
        );
      });
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedCreds(true);
      window.setTimeout(() => setCopiedCreds(false), 3000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const activeBrand = authStatus?.webBrand?.appName ? authStatus.webBrand : webBrand;
  const activeYears =
    authStatus?.academicYears && authStatus.academicYears.length > 0
      ? authStatus.academicYears
      : academicYears;
  const displayError = error || externalError;
  const needsAdminClaim =
    serverAvailable === true && authStatus !== null && !authStatus.adminConfigured;

  // Soft frosted neumorphic surface tokens matched to light/dark modes
  const pageBgStyle: React.CSSProperties = isDark
    ? { background: 'linear-gradient(155deg, #0b1324 0%, #101c36 52%, #0a1020 100%)' }
    : { background: 'linear-gradient(155deg, #f3f7fd 0%, #eaf0fa 52%, #e1eaf7 100%)' };

  const raisedSquircleClass = isDark
    ? 'bg-[#13203b]/90 border border-white/10 shadow-[12px_16px_32px_rgba(2,6,23,0.75),-8px_-8px_20px_rgba(30,48,88,0.35),inset_0_1px_1px_rgba(255,255,255,0.08)]'
    : 'bg-white/75 backdrop-blur-md border border-white/80 shadow-[14px_18px_36px_rgba(162,182,216,0.55),-10px_-10px_24px_rgba(255,255,255,0.95),inset_0_1px_2px_rgba(255,255,255,0.95)]';

  const frostedFieldClass = isDark
    ? 'bg-[#121e38]/90 border border-white/10 shadow-[8px_10px_24px_rgba(2,6,23,0.65),-5px_-5px_14px_rgba(34,54,96,0.28),inset_0_1px_1px_rgba(255,255,255,0.06)] focus-within:ring-2 focus-within:ring-blue-400/70'
    : 'bg-white/75 backdrop-blur-md border border-white/85 shadow-[8px_12px_26px_rgba(167,185,216,0.42),-7px_-7px_18px_rgba(255,255,255,0.92),inset_0_1px_1px_rgba(255,255,255,0.95)] focus-within:ring-2 focus-within:ring-blue-500/60';

  const frostedInputTextClass = isDark
    ? 'text-slate-100 placeholder:text-slate-400'
    : 'text-slate-800 placeholder:text-slate-400';

  const iconTintClass = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div
      style={pageBgStyle}
      className="relative min-h-screen w-full overflow-x-clip flex flex-col items-center justify-center px-4 sm:px-5 py-6 sm:py-10 transition-colors duration-200"
    >
      {/* Decorative soft sculpted background geometry matching the visual template */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        {/* Top-left large sculpted ring with royal blue rim reflection */}
        <div
          className="absolute -top-28 -left-24 w-72 h-72 sm:w-96 sm:h-96 rounded-full transition-opacity duration-200"
          style={{
            background: isDark
              ? 'radial-gradient(circle at 65% 65%, rgba(37,99,235,0.18) 0%, rgba(19,32,59,0.75) 58%, rgba(37,99,235,0.45) 100%)'
              : 'radial-gradient(circle at 65% 65%, rgba(255,255,255,0.92) 0%, rgba(232,240,254,0.8) 58%, rgba(96,150,255,0.42) 100%)',
            boxShadow: isDark
              ? '18px 22px 48px rgba(2,6,23,0.75), inset -4px -6px 18px rgba(59,130,246,0.45)'
              : '18px 24px 48px rgba(154,178,218,0.45), inset -6px -8px 22px rgba(59,130,246,0.5)',
          }}
        />

        {/* Right edge soft blue sculpted orb */}
        <div
          className="absolute top-[22%] -right-14 sm:-right-12 w-36 h-36 sm:w-48 sm:h-48 rounded-full"
          style={{
            background: isDark
              ? 'radial-gradient(circle at 30% 30%, rgba(96,165,250,0.42) 0%, rgba(37,99,235,0.22) 65%, rgba(15,23,42,0.5) 100%)'
              : 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.95) 0%, rgba(186,210,255,0.72) 55%, rgba(121,164,252,0.68) 100%)',
            boxShadow: isDark
              ? '-10px 16px 36px rgba(2,6,23,0.7)'
              : '-12px 18px 38px rgba(139,169,224,0.48), inset 4px 4px 12px rgba(255,255,255,0.8)',
          }}
        />

        {/* Bottom-left soft translucent ring */}
        <div
          className="absolute -bottom-24 -left-20 w-64 h-64 sm:w-80 sm:h-80 rounded-full"
          style={{
            background: isDark
              ? 'radial-gradient(circle at 70% 30%, rgba(59,130,246,0.22) 0%, rgba(15,25,48,0.8) 70%)'
              : 'radial-gradient(circle at 70% 30%, rgba(235,243,255,0.92) 0%, rgba(184,209,255,0.65) 75%, rgba(120,165,255,0.5) 100%)',
            boxShadow: isDark
              ? '12px -12px 36px rgba(2,6,23,0.65), inset -3px 4px 14px rgba(96,165,250,0.3)'
              : '14px -10px 38px rgba(154,178,218,0.42), inset -4px 4px 16px rgba(255,255,255,0.88)',
          }}
        />

        {/* Bottom-right smooth raised curve */}
        <div
          className="absolute -bottom-28 -right-20 w-72 h-72 sm:w-96 sm:h-96 rounded-full"
          style={{
            background: isDark
              ? 'radial-gradient(circle at 25% 25%, rgba(30,48,88,0.65) 0%, rgba(12,20,38,0.92) 72%)'
              : 'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.96) 0%, rgba(223,234,250,0.85) 68%, rgba(168,191,230,0.55) 100%)',
            boxShadow: isDark
              ? '-14px -14px 36px rgba(2,6,23,0.75), inset 3px 3px 12px rgba(96,165,250,0.2)'
              : '-14px -14px 40px rgba(154,178,218,0.42), inset 4px 4px 14px rgba(255,255,255,0.95)',
          }}
        />
      </div>

      {/* Top-right Light / Dark toggle button matching reference */}
      <button
        type="button"
        onClick={toggleDarkMode}
        aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
        title={isDark ? 'Mode Terang' : 'Mode Gelap'}
        className={`fixed top-4 right-4 sm:top-7 sm:right-8 z-20 w-11 h-11 rounded-2xl flex items-center justify-center transition-transform duration-150 hover:scale-105 active:scale-95 cursor-pointer ${raisedSquircleClass}`}
      >
        {isDark ? (
          <Sun className="w-5 h-5 text-amber-300" />
        ) : (
          <Moon className="w-5 h-5 text-slate-800" />
        )}
      </button>

      {/* Main Centered Login Container */}
      <main
        className={`relative z-10 w-full ${
          needsAdminClaim ? 'max-w-[440px]' : 'max-w-[390px]'
        } flex flex-col items-center`}
      >
        {/* Top App Emblem Squircle */}
        <div
          className={`w-20 h-20 sm:w-24 sm:h-24 rounded-[24px] sm:rounded-[28px] p-3.5 sm:p-4 flex items-center justify-center mb-4 sm:mb-6 ${raisedSquircleClass}`}
        >
          {!logoFailed && activeBrand.webLogoDataUrl ? (
            <img
              src={activeBrand.webLogoDataUrl}
              alt={activeBrand.appName}
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              style={{
                width: Math.max(40, Math.min(72, Math.round((activeBrand.webLogoSize ?? 36) * 1.45))),
                height: Math.max(40, Math.min(72, Math.round((activeBrand.webLogoSize ?? 36) * 1.45))),
              }}
              className="object-contain drop-shadow-sm"
            />
          ) : (
            <ShieldCheck className="w-10 h-10 sm:w-11 sm:h-11 text-blue-600" />
          )}
        </div>

        {/* Heading & Subtitle */}
        <div className="text-center mb-5 sm:mb-7 space-y-1.5">
          <h1
            className={`font-display text-2xl sm:text-[34px] font-extrabold tracking-tight ${
              isDark ? 'text-white' : 'text-[#0c1428]'
            }`}
          >
            {needsAdminClaim ? 'Aktivasi Admin & Akun' : activeBrand.loginTitle || 'Selamat Datang'}
          </h1>
          <p
            className={`text-xs font-medium tracking-[0.22em] uppercase ${
              isDark ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            {needsAdminClaim
              ? 'Penyiapan Server Pertama Kali'
              : activeBrand.loginSubtitle || 'Masuk untuk melanjutkan'}
          </p>
          <p
            className={`text-xs font-medium pt-0.5 ${
              isDark ? 'text-blue-300/90' : 'text-slate-500'
            }`}
          >
            {activeBrand.appName}
          </p>
        </div>

        {/* Error Alert */}
        {displayError && (
          <div
            role="alert"
            className={`w-full mb-5 px-4 py-3 rounded-2xl text-xs sm:text-sm font-medium border ${
              isDark
                ? 'bg-rose-950/75 border-rose-500/40 text-rose-200'
                : 'bg-rose-50/90 border-rose-200 text-rose-700 shadow-sm'
            }`}
          >
            {displayError}
          </div>
        )}

        {serverAvailable === null ? (
          <div
            className={`w-full px-5 py-6 rounded-2xl border flex items-center justify-center gap-3 text-sm font-medium ${
              isDark
                ? 'bg-slate-900/70 border-slate-700 text-slate-300'
                : 'bg-white/75 border-white/90 text-slate-600 shadow-sm'
            }`}
          >
            <div className="w-4 h-4 rounded-full border-2 border-blue-500/30 border-t-blue-600 animate-spin" />
            <span>Memeriksa koneksi server autentikasi...</span>
          </div>
        ) : serverAvailable === false ? (
          <div className="w-full space-y-4">
            <div
              className={`px-4 py-3.5 rounded-2xl border text-xs leading-relaxed space-y-1.5 ${
                isDark
                  ? 'bg-blue-950/55 border-blue-500/35 text-blue-100'
                  : 'bg-blue-50/90 border-blue-200 text-slate-700 shadow-sm'
              }`}
            >
              <div
                className={`flex items-center gap-2 font-bold ${
                  isDark ? 'text-blue-300' : 'text-blue-700'
                }`}
              >
                <Cloud className="w-4 h-4 shrink-0" />
                <span>Mode Cloud Preview (Firebase)</span>
              </div>
              <p>
                Tautan pratinjau statis ini tidak menjalankan backend server (<code className="font-mono">/api</code>).
                Masuk menggunakan akun Google terverifikasi untuk akses sinkronisasi Cloud Firestore, atau
                gunakan tautan <strong>Development App URL</strong> untuk login username &amp; password server.
              </p>
            </div>

            {/* Compact Period Selectors */}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <div className={`px-3 sm:px-3.5 py-2.5 rounded-2xl ${frostedFieldClass}`}>
                <select
                  aria-label="Tahun Ajaran"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className={`w-full bg-transparent text-xs font-semibold focus:outline-none cursor-pointer ${frostedInputTextClass}`}
                >
                  {activeYears.map((yr) => (
                    <option
                      key={yr}
                      value={yr}
                      className={isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}
                    >
                      TA {yr}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`px-3.5 py-2.5 rounded-2xl ${frostedFieldClass}`}>
                <select
                  aria-label="Semester"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value as 'Ganjil' | 'Genap')}
                  className={`w-full bg-transparent text-xs font-semibold focus:outline-none cursor-pointer ${frostedInputTextClass}`}
                >
                  <option
                    value="Ganjil"
                    className={isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}
                  >
                    Semester Ganjil
                  </option>
                  <option
                    value="Genap"
                    className={isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}
                  >
                    Semester Genap
                  </option>
                </select>
              </div>
            </div>

            {onGoogleLogin && (
              <button
                type="button"
                disabled={isGoogleLoading}
                onClick={handleGoogleSubmit}
                style={{
                  background: 'linear-gradient(95deg, #217bfe 0%, #1d5ef2 55%, #3f3be6 100%)',
                }}
                className="relative w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-full text-white text-sm sm:text-base font-bold shadow-[0_14px_28px_-6px_rgba(37,99,235,0.55),inset_0_1px_1px_rgba(255,255,255,0.35)] hover:brightness-105 active:scale-[0.99] disabled:opacity-60 transition-all duration-150 cursor-pointer whitespace-nowrap"
              >
                <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                </span>
                <span>{isGoogleLoading ? 'Menghubungkan Google...' : 'Masuk dengan Google'}</span>
                <span className="absolute right-2.5 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-white" />
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={isCheckingServer}
              onClick={() => {
                setError(null);
                void checkServerAvailability();
              }}
              className={`w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-60 ${
                isDark
                  ? 'bg-slate-900/60 border-slate-700 text-slate-300 hover:text-white'
                  : 'bg-white/75 border-white/90 text-slate-600 hover:text-slate-900 shadow-sm'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingServer ? 'animate-spin' : ''}`} />
              <span>{isCheckingServer ? 'Memeriksa server...' : 'Coba Hubungkan Ulang Server (/api)'}</span>
            </button>
          </div>
        ) : needsAdminClaim ? (
          <form onSubmit={handleClaimAdminSubmit} className="w-full space-y-4">
            <p
              className={`text-xs leading-relaxed text-center px-2 ${
                isDark ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              Tetapkan username dan password Admin utama Anda (atau klik{' '}
              <strong className={isDark ? 'text-white' : 'text-slate-900'}>Buat Otomatis</strong>)
              untuk mengunci akses server pertama kali.
            </p>

            {/* Username Admin */}
            <div
              className={`flex items-center gap-3 px-4 py-3 rounded-[18px] transition-shadow ${frostedFieldClass}`}
            >
              <User className={`w-4 h-4 shrink-0 ${iconTintClass}`} />
              <input
                type="text"
                value={claimUsername}
                onChange={(e) => setClaimUsername(e.target.value)}
                placeholder="Username Admin (contoh: admin)"
                aria-label="Username Admin"
                className={`w-full bg-transparent text-sm font-medium focus:outline-none ${frostedInputTextClass}`}
              />
            </div>

            {/* Email Admin */}
            <div
              className={`flex items-center gap-3 px-4 py-3 rounded-[18px] transition-shadow ${frostedFieldClass}`}
            >
              <Mail className={`w-4 h-4 shrink-0 ${iconTintClass}`} />
              <input
                type="email"
                value={claimEmail}
                onChange={(e) => setClaimEmail(e.target.value)}
                placeholder="Email Admin"
                aria-label="Email Admin"
                className={`w-full bg-transparent text-sm font-medium focus:outline-none ${frostedInputTextClass}`}
              />
            </div>

            {/* Password Admin + Auto Generate */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <label
                  htmlFor="claim-admin-password"
                  className={`text-xs font-semibold ${
                    isDark ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  Password Admin (min. 8 karakter)
                </label>
                <button
                  type="button"
                  onClick={handleGenerateAdminPass}
                  className={`inline-flex items-center gap-1 text-xs font-semibold cursor-pointer ${
                    isDark
                      ? 'text-blue-300 hover:text-blue-200'
                      : 'text-[#1d6ef5] hover:text-blue-800'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Buat Otomatis</span>
                </button>
              </div>
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-[18px] transition-shadow ${frostedFieldClass}`}
              >
                <KeyRound className={`w-4 h-4 shrink-0 ${iconTintClass}`} />
                <input
                  id="claim-admin-password"
                  type={showClaimPassword ? 'text' : 'password'}
                  value={claimPassword}
                  onChange={(e) => {
                    setClaimPassword(e.target.value);
                    setCopiedCreds(false);
                  }}
                  placeholder="Masukkan atau buat password admin"
                  className={`w-full bg-transparent text-sm font-mono focus:outline-none ${frostedInputTextClass}`}
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  {claimPassword && (
                    <button
                      type="button"
                      onClick={handleCopyClaimCredentials}
                      className={`p-1 rounded-lg cursor-pointer ${iconTintClass} hover:text-blue-600`}
                      title="Salin Username & Password"
                      aria-label="Salin Username dan Password"
                    >
                      {copiedCreds ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowClaimPassword((v) => !v)}
                    className={`p-1 rounded-lg cursor-pointer ${iconTintClass}`}
                    aria-label="Tampilkan atau sembunyikan password"
                  >
                    {showClaimPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              {claimPassword && (
                <p
                  className={`text-[11px] px-1 ${
                    isDark ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  Admin:{' '}
                  <span className="font-mono font-semibold">
                    {claimUsername.trim()} / {claimPassword}
                  </span>
                </p>
              )}
            </div>

            {/* Batch Activation for 5 Remaining Role Accounts */}
            <div
              className={`p-3.5 rounded-2xl border space-y-2.5 ${
                isDark
                  ? 'bg-slate-900/65 border-slate-700/80 text-slate-200'
                  : 'bg-white/70 border-white/90 text-slate-700 shadow-sm'
              }`}
            >
              <label className="flex items-start gap-2.5 cursor-pointer text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={activateAllStaff}
                  onChange={(e) => setActivateAllStaff(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-blue-600 cursor-pointer"
                />
                <span>
                  Aktifkan sekaligus 5 akun role lainnya (
                  <span className="font-mono">guru, guru2, walikelas, kepsek, staff</span>)
                </span>
              </label>

              {activateAllStaff && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between px-0.5">
                    <label
                      htmlFor="claim-staff-password"
                      className={`text-[11px] font-semibold ${
                        isDark ? 'text-slate-300' : 'text-slate-600'
                      }`}
                    >
                      Password Awal 5 Akun Lainnya (min. 6 karakter)
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateStaffPass}
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer ${
                        isDark
                          ? 'text-blue-300 hover:text-blue-200'
                          : 'text-[#1d6ef5] hover:text-blue-800'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Buat Otomatis</span>
                    </button>
                  </div>
                  <div
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] ${frostedFieldClass}`}
                  >
                    <Lock className={`w-3.5 h-3.5 shrink-0 ${iconTintClass}`} />
                    <input
                      id="claim-staff-password"
                      type={showStaffPassword ? 'text' : 'password'}
                      value={staffPassword}
                      onChange={(e) => {
                        setStaffPassword(e.target.value);
                        setCopiedCreds(false);
                      }}
                      placeholder="Masukkan atau buat password awal staff"
                      className={`w-full bg-transparent text-xs font-mono focus:outline-none ${frostedInputTextClass}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowStaffPassword((v) => !v)}
                      className={`p-1 rounded-lg cursor-pointer ${iconTintClass}`}
                      aria-label="Tampilkan atau sembunyikan password staff"
                    >
                      {showStaffPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {EXISTING_SCHOOL_ACCOUNTS.filter((a) => a.username !== 'admin').map((acc) => (
                      <span
                        key={acc.username}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                          isDark
                            ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                            : 'bg-slate-100/90 border-slate-200 text-slate-700'
                        }`}
                        title={acc.email}
                      >
                        {acc.username} ({acc.roleLabel})
                      </span>
                    ))}
                  </div>
                  {claimPassword && staffPassword.trim().length >= 6 && (
                    <button
                      type="button"
                      onClick={handleCopyClaimCredentials}
                      className={`w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                        isDark
                          ? 'bg-blue-950/60 border-blue-500/40 text-blue-200 hover:bg-blue-900/60'
                          : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      {copiedCreds ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Semua Kredensial (6 Akun) Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Semua Kredensial (6 Akun)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Academic Period Selectors */}
            <div className="grid grid-cols-2 gap-3 pt-0.5">
              <div className={`px-3.5 py-2.5 rounded-2xl ${frostedFieldClass}`}>
                <select
                  aria-label="Tahun Ajaran"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className={`w-full bg-transparent text-xs font-semibold focus:outline-none cursor-pointer ${frostedInputTextClass}`}
                >
                  {activeYears.map((yr) => (
                    <option
                      key={yr}
                      value={yr}
                      className={isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}
                    >
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`px-3.5 py-2.5 rounded-2xl ${frostedFieldClass}`}>
                <select
                  aria-label="Semester"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value as 'Ganjil' | 'Genap')}
                  className={`w-full bg-transparent text-xs font-semibold focus:outline-none cursor-pointer ${frostedInputTextClass}`}
                >
                  <option
                    value="Ganjil"
                    className={isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}
                  >
                    Semester Ganjil
                  </option>
                  <option
                    value="Genap"
                    className={isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}
                  >
                    Semester Genap
                  </option>
                </select>
              </div>
            </div>

            {/* Primary Blue CTA */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isServerLoading}
                style={{
                  background: 'linear-gradient(95deg, #217bfe 0%, #1d5ef2 55%, #3f3be6 100%)',
                }}
                className="relative w-full flex items-center justify-center py-3.5 px-6 rounded-full text-white text-sm sm:text-base font-bold shadow-[0_14px_28px_-6px_rgba(37,99,235,0.55),inset_0_1px_1px_rgba(255,255,255,0.35)] hover:brightness-105 active:scale-[0.99] disabled:opacity-60 transition-all duration-150 cursor-pointer whitespace-nowrap"
              >
                <span>{isServerLoading ? 'Mengaktifkan...' : 'Aktifkan & Masuk'}</span>
                <span className="absolute right-2.5 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-white" />
                </span>
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleServerSubmit} className="w-full space-y-4">
            {/* Username or Email Field */}
            <div
              className={`flex items-center gap-3.5 px-4 py-3.5 rounded-[18px] transition-shadow ${frostedFieldClass}`}
            >
              <User className={`w-4 h-4 shrink-0 ${iconTintClass}`} />
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={
                  authStatus?.adminUsernameHint
                    ? `Username atau Email (${authStatus.adminUsernameHint})`
                    : 'Username atau Email'
                }
                aria-label="Username atau Email"
                autoComplete="username"
                className={`w-full bg-transparent text-sm font-medium focus:outline-none ${frostedInputTextClass}`}
              />
            </div>

            {/* Password Field */}
            <div
              className={`flex items-center gap-3.5 px-4 py-3.5 rounded-[18px] transition-shadow ${frostedFieldClass}`}
            >
              <Lock className={`w-4 h-4 shrink-0 ${iconTintClass}`} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                aria-label="Password"
                autoComplete="current-password"
                className={`w-full bg-transparent text-sm font-medium focus:outline-none ${frostedInputTextClass}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className={`p-1 rounded-lg shrink-0 cursor-pointer ${iconTintClass} hover:text-blue-600`}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Compact Period Selectors */}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <div className={`px-3 sm:px-3.5 py-2.5 rounded-2xl ${frostedFieldClass}`}>
                <select
                  aria-label="Tahun Ajaran"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className={`w-full bg-transparent text-xs font-semibold focus:outline-none cursor-pointer ${frostedInputTextClass}`}
                >
                  {activeYears.map((yr) => (
                    <option
                      key={yr}
                      value={yr}
                      className={isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}
                    >
                      TA {yr}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`px-3.5 py-2.5 rounded-2xl ${frostedFieldClass}`}>
                <select
                  aria-label="Semester"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value as 'Ganjil' | 'Genap')}
                  className={`w-full bg-transparent text-xs font-semibold focus:outline-none cursor-pointer ${frostedInputTextClass}`}
                >
                  <option
                    value="Ganjil"
                    className={isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}
                  >
                    Semester Ganjil
                  </option>
                  <option
                    value="Genap"
                    className={isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}
                  >
                    Semester Genap
                  </option>
                </select>
              </div>
            </div>

            {/* Remember Me & Forgot Password Row */}
            <div className="flex items-center justify-between px-1 pt-0.5 text-xs">
              <button
                type="button"
                onClick={handleToggleRemember}
                className="inline-flex items-center gap-2.5 min-h-[38px] cursor-pointer group"
              >
                <span
                  className={`w-4 h-4 rounded-md flex items-center justify-center transition-colors ${
                    rememberUsername
                      ? 'bg-[#1d6ef5] text-white shadow-sm'
                      : isDark
                        ? 'bg-slate-800 border border-slate-600 text-transparent'
                        : 'bg-white/80 border border-slate-300 text-transparent'
                  }`}
                >
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
                <span
                  className={`font-medium ${
                    isDark
                      ? 'text-slate-300 group-hover:text-white'
                      : 'text-slate-700 group-hover:text-slate-900'
                  }`}
                >
                  Ingat saya
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowForgotHelp((v) => !v)}
                className={`min-h-[38px] inline-flex items-center font-semibold cursor-pointer hover:underline ${
                  isDark ? 'text-blue-400' : 'text-[#1d6ef5]'
                }`}
              >
                Info Akun &amp; Sandi
              </button>
            </div>

            {showForgotHelp && (
              <div
                className={`px-4 py-3 rounded-2xl text-xs leading-relaxed space-y-2.5 ${
                  isDark
                    ? 'bg-slate-900/80 border border-slate-700 text-slate-300'
                    : 'bg-white/85 border border-slate-200/90 text-slate-600'
                }`}
              >
                {authStatus?.envAdminManaged && (
                  <p className={isDark ? 'text-amber-300' : 'text-amber-800'}>
                    <strong>Catatan Admin:</strong> Akun{' '}
                    <code className="font-mono font-semibold">{authStatus.adminUsernameHint}</code>{' '}
                    menggunakan sandi dari Secret <code className="font-mono">ADMIN_PASSWORD</code>.
                    Akun lain (<code className="font-mono">guru</code>–<code className="font-mono">staff</code>)
                    aktif setelah Admin menetapkan passwordnya di menu <strong>Admin &amp; Pengguna</strong>.
                  </p>
                )}
                <p>
                  Pilih username di bawah untuk mengisi kolom masuk (password dikelola oleh{' '}
                  <strong className={isDark ? 'text-white' : 'text-slate-900'}>Admin Sistem</strong>{' '}
                  di menu Manajemen Pengguna):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {EXISTING_SCHOOL_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => setIdentifier(acc.username)}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-mono cursor-pointer transition-colors ${
                        identifier.trim().toLowerCase() === acc.username
                          ? 'bg-blue-600 text-white border-blue-600'
                          : isDark
                            ? 'bg-slate-800 border-slate-700 text-slate-200 hover:border-blue-400'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-400'
                      }`}
                      title={`${acc.roleLabel} (${acc.email})`}
                    >
                      {acc.username} · {acc.roleLabel}
                    </button>
                  ))}
                </div>
                {onGoogleLogin && (
                  <div
                    className={`pt-2 border-t ${
                      isDark ? 'border-slate-700/70' : 'border-slate-200/80'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={isGoogleLoading}
                      onClick={handleGoogleSubmit}
                      className={`w-full py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-60 ${
                        isDark
                          ? 'bg-slate-800 border-slate-700 text-blue-300 hover:bg-slate-700'
                          : 'bg-blue-50/80 border-blue-200 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      <Cloud className="w-3.5 h-3.5" />
                      <span>
                        {isGoogleLoading
                          ? 'Menghubungkan Google...'
                          : 'Atau Masuk dengan Google (Firebase Cloud)'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Signature Blue Gradient Pill Login Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isServerLoading}
                style={{
                  background: 'linear-gradient(95deg, #217bfe 0%, #1d5ef2 55%, #3f3be6 100%)',
                }}
                className="relative w-full flex items-center justify-center py-3.5 px-6 rounded-full text-white text-sm sm:text-base font-bold shadow-[0_14px_28px_-6px_rgba(37,99,235,0.55),inset_0_1px_1px_rgba(255,255,255,0.35)] hover:brightness-105 active:scale-[0.99] disabled:opacity-60 transition-all duration-150 cursor-pointer whitespace-nowrap"
              >
                <span>{isServerLoading ? 'Memverifikasi...' : 'Masuk'}</span>
                <span className="absolute right-2.5 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-white" />
                </span>
              </button>
            </div>
          </form>
        )}

        {/* Quiet Unboxed Footer Tagline (No Social Login Buttons) */}
        <footer className="mt-7 sm:mt-10 text-center">
          <p
            className={`text-[11px] font-medium tracking-[0.26em] uppercase ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            {activeBrand.loginFooterText || 'Jurnal · Presensi · Leger Nilai'}
          </p>
        </footer>
      </main>
    </div>
  );
};
