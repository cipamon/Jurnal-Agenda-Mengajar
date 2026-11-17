import React, { useState } from 'react';
import { BookOpenCheck, ChevronRight, Database, Eye, EyeOff, Lock, Mail, Sparkles } from 'lucide-react';

interface LoginViewProps {
  defaultEmail: string;
  defaultAcademicYear: string;
  defaultSemester: 'Ganjil' | 'Genap';
  defaultSheetsUrl: string;
  academicYears: string[];
  onLogin: (payload: {
    email: string;
    password: string;
    sheetsWebAppUrl: string;
    academicYear: string;
    semester: 'Ganjil' | 'Genap';
    useDemoSeed: boolean;
  }) => string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({
  defaultEmail,
  defaultAcademicYear,
  defaultSemester,
  defaultSheetsUrl,
  academicYears,
  onLogin,
}) => {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('guru123');
  const [showPassword, setShowPassword] = useState(false);
  const [sheetsUrl, setSheetsUrl] = useState(defaultSheetsUrl);
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);
  const [semester, setSemester] = useState<'Ganjil' | 'Genap'>(defaultSemester);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email guru dan password wajib diisi.');
      return;
    }
    const err = onLogin({
      email: email.trim(),
      password,
      sheetsWebAppUrl: sheetsUrl.trim(),
      academicYear,
      semester,
      useDemoSeed: false,
    });
    if (err) setError(err);
  };

  const handleDemoLogin = () => {
    setError(null);
    onLogin({
      email: defaultEmail,
      password: 'guru123',
      sheetsWebAppUrl: sheetsUrl.trim(),
      academicYear,
      semester,
      useDemoSeed: true,
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col lg:flex-row">
      {/* Left Institutional Panel */}
      <div className="lg:w-5/12 bg-slate-900 text-white p-8 lg:p-14 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <BookOpenCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Portal E-Guru v10.2</h1>
              <p className="text-xs text-slate-400">Sistem Administrasi Mengajar Terpadu</p>
            </div>
          </div>

          <div className="mt-12 max-w-md">
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight [text-wrap:balance]">
              Jurnal Mengajar, Presensi, dan Leger Nilai dalam Satu Workspace
            </h2>
            <p className="mt-4 text-sm text-slate-300 leading-relaxed">
              Dirancang khusus untuk ketertiban administrasi guru mata pelajaran: pencatatan pertemuan harian,
              rekap kehadiran mendatar otomatis, matriks penilaian KKM, hingga cetak laporan resmi ber-Kop Dinas.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
            <div className="p-4 rounded-lg bg-slate-800/70 border border-slate-700/70">
              <p className="text-xs font-medium text-indigo-300">Penyimpanan Mandiri</p>
              <p className="mt-1 text-sm font-semibold text-white">IndexedDB & LocalStorage</p>
              <p className="mt-1 text-xs text-slate-400">Tetap aktif dan cepat tanpa bergantung koneksi internet.</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/70 border border-slate-700/70">
              <p className="text-xs font-medium text-indigo-300">Output Resmi Sekolah</p>
              <p className="mt-1 text-sm font-semibold text-white">PDF Vektor, XLSX & XLS</p>
              <p className="mt-1 text-xs text-slate-400">6 pilihan font cetak resmi dan Kop Surat dua logo.</p>
            </div>
          </div>
        </div>

        <p className="mt-10 text-xs text-slate-500">
          Akun bawaan demo: <span className="font-mono text-slate-300">{defaultEmail}</span> /{' '}
          <span className="font-mono text-slate-300">guru123</span>
        </p>
      </div>

      {/* Right Login Form Surface */}
      <div className="flex-1 bg-slate-50 flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="w-full max-w-lg bg-white rounded-xl border border-slate-200 p-6 sm:p-9 shadow-sm">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900">Masuk ke Ruang Kerja Guru</h2>
            <p className="mt-1 text-sm text-slate-500">
              Atur periode akademik aktif atau gunakan data demo otomatis untuk langsung menguji seluruh modul.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Guru</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@sekolah.sch.id"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi"
                  className="w-full pl-10 pr-10 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="Tampilkan atau sembunyikan password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tahun Ajaran</label>
                <select
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  {academicYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Semester</label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value as 'Ganjil' | 'Genap')}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="Ganjil">Ganjil</option>
                  <option value="Genap">Genap</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Google Sheets Web App URL <span className="font-normal text-slate-400">(Opsional)</span>
              </label>
              <div className="relative">
                <Database className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={sheetsUrl}
                  onChange={(e) => setSheetsUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            </div>

            <div className="pt-2 space-y-3">
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Masuk ke Portal</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleDemoLogin}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4 text-indigo-300" />
                <span>Masuk dengan Data Demo Otomatis</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
