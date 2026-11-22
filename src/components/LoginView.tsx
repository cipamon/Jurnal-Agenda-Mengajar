import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
} from 'lucide-react';
import { WebBrandConfig } from '../types';
import { apiGetAuthStatus, ServerAuthStatus } from '../utils/apiClient';

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
    academicYear: string;
    semester: 'Ganjil' | 'Genap';
  }) => Promise<string | null>;
}

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
  onServerLogin,
  onClaimAdmin,
}) => {
  const [authStatus, setAuthStatus] = useState<ServerAuthStatus | null>(null);
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

  // First-run Admin activation state (when server ADMIN_PASSWORD & claimed hash are unset)
  const [claimUsername, setClaimUsername] = useState('admin');
  const [claimEmail, setClaimEmail] = useState('admin@sman1nusantara.sch.id');
  const [claimPassword, setClaimPassword] = useState('');
  const [showClaimPassword, setShowClaimPassword] = useState(true);
  const [copiedCreds, setCopiedCreds] = useState(false);

  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);
  const [semester, setSemester] = useState<'Ganjil' | 'Genap'>(defaultSemester);
  const [error, setError] = useState<string | null>(null);
  const [isServerLoading, setIsServerLoading] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    let active = true;
    apiGetAuthStatus()
      .then((status) => {
        if (!active) return;
        setAuthStatus(status);
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
      })
      .catch(() => {
        if (!active) return;
        setAuthStatus({
          ok: true,
          adminConfigured: true,
          envAdminManaged: false,
          adminUsernameHint: 'admin',
        });
      });
    return () => {
      active = false;
    };
  }, []);

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
      if (err) setError(err);
    } finally {
      setIsServerLoading(false);
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
    setIsServerLoading(true);
    try {
      const err = await onClaimAdmin({
        username: claimUsername.trim(),
        password: claimPassword,
        email: claimEmail.trim(),
        academicYear,
        semester,
      });
      if (err) setError(err);
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

  const handleCopyClaimCredentials = async () => {
    if (!claimUsername.trim() || !claimPassword) return;
    const text = `Username Admin: ${claimUsername.trim()}\nPassword Admin: ${claimPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCreds(true);
      window.setTimeout(() => setCopiedCreds(false), 3000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const displayError = error || externalError;
  const needsAdminClaim = authStatus !== null && !authStatus.adminConfigured;

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
          {!logoFailed && webBrand.webLogoDataUrl ? (
            <img
              src={webBrand.webLogoDataUrl}
              alt={webBrand.appName}
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="w-full h-full object-contain drop-shadow-sm"
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
            {needsAdminClaim ? 'Aktivasi Admin' : 'Selamat Datang'}
          </h1>
          <p
            className={`text-xs font-medium tracking-[0.22em] uppercase ${
              isDark ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            {needsAdminClaim ? 'Penyiapan Server Pertama Kali' : 'Masuk untuk melanjutkan'}
          </p>
          <p
            className={`text-xs font-medium pt-0.5 ${
              isDark ? 'text-blue-300/90' : 'text-slate-500'
            }`}
          >
            {webBrand.appName}
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

        {needsAdminClaim ? (
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
                  Catat sebelum melanjutkan:{' '}
                  <span className="font-mono font-semibold">
                    {claimUsername.trim()} / {claimPassword}
                  </span>
                </p>
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
                  {academicYears.map((yr) => (
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
                  {academicYears.map((yr) => (
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
                Lupa Password?
              </button>
            </div>

            {showForgotHelp && (
              <div
                className={`px-4 py-3 rounded-2xl text-xs leading-relaxed ${
                  isDark
                    ? 'bg-slate-900/80 border border-slate-700 text-slate-300'
                    : 'bg-white/80 border border-slate-200/80 text-slate-600'
                }`}
              >
                Untuk mengatur ulang kata sandi Guru/Pegawai, hubungi{' '}
                <strong className={isDark ? 'text-white' : 'text-slate-900'}>Admin Sistem</strong>{' '}
                di menu Manajemen Pengguna. Admin dapat memperbarui kredensial utama melalui panel
                pengaturan Secrets server.
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
            Jurnal <span aria-hidden="true">·</span> Presensi <span aria-hidden="true">·</span>{' '}
            Leger Nilai
          </p>
        </footer>
      </main>
    </div>
  );
};
