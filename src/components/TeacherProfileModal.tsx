import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Database,
  GraduationCap,
  ImagePlus,
  Link2,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { AppUser, SystemSettings, UserRole } from '../types';
import { getUserPhotoUrl } from '../utils/defaultAvatars';
import { USER_ROLE_LABELS } from '../utils/helpers';

interface TeacherProfileModalProps {
  isOpen: boolean;
  settings: SystemSettings;
  activeUser?: AppUser;
  currentUserRole?: UserRole;
  onSaveProfile: (updated: Pick<SystemSettings, 'teacherProfile' | 'sheetsWebAppUrl'>) => void;
  onSyncGoogleSheets: (sheetsUrl: string) => void;
  onResetDemoData: () => void;
  onClose: () => void;
}

export const TeacherProfileModal: React.FC<TeacherProfileModalProps> = ({
  isOpen,
  settings,
  activeUser,
  currentUserRole = 'guru',
  onSaveProfile,
  onSyncGoogleSheets,
  onResetDemoData,
  onClose,
}) => {
  const sourceName = activeUser?.name || settings.teacherProfile.name;
  const sourceNip = activeUser?.nip || settings.teacherProfile.nip;
  const sourceSchool = activeUser?.school || settings.teacherProfile.school;
  const sourceEmail = activeUser?.email || settings.teacherProfile.email;
  const sourcePassword = activeUser?.password || settings.teacherProfile.password;
  const sourceGender: 'L' | 'P' = activeUser?.gender || settings.teacherProfile.gender || 'P';
  const sourcePhoto =
    activeUser?.photoDataUrl ??
    (currentUserRole === 'guru' ? settings.teacherProfile.photoDataUrl || '' : '');
  const sourceClasses = activeUser
    ? activeUser.assignedClasses || []
    : settings.teacherProfile.assignedClasses || [];
  const sourceSubjects = activeUser
    ? activeUser.assignedSubjects || []
    : settings.teacherProfile.assignedSubjects || [];

  const [name, setName] = useState(sourceName);
  const [nip, setNip] = useState(sourceNip);
  const [school, setSchool] = useState(sourceSchool);
  const [email, setEmail] = useState(sourceEmail);
  const [password, setPassword] = useState(sourcePassword);
  const [gender, setGender] = useState<'L' | 'P'>(sourceGender);
  const [photoDataUrl, setPhotoDataUrl] = useState(sourcePhoto);
  const [assignedClasses, setAssignedClasses] = useState<string[]>(sourceClasses);
  const [assignedSubjects, setAssignedSubjects] = useState<string[]>(sourceSubjects);
  const [sheetsWebAppUrl, setSheetsWebAppUrl] = useState(settings.sheetsWebAppUrl || '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(activeUser?.name || settings.teacherProfile.name);
    setNip(activeUser?.nip || settings.teacherProfile.nip);
    setSchool(activeUser?.school || settings.teacherProfile.school);
    setEmail(activeUser?.email || settings.teacherProfile.email);
    setPassword(activeUser?.password || settings.teacherProfile.password);
    setGender(activeUser?.gender || settings.teacherProfile.gender || 'P');
    setPhotoDataUrl(
      activeUser?.photoDataUrl ??
        (currentUserRole === 'guru' ? settings.teacherProfile.photoDataUrl || '' : '')
    );
    setAssignedClasses(
      activeUser
        ? [...(activeUser.assignedClasses || [])]
        : [...(settings.teacherProfile.assignedClasses || [])]
    );
    setAssignedSubjects(
      activeUser
        ? [...(activeUser.assignedSubjects || [])]
        : [...(settings.teacherProfile.assignedSubjects || [])]
    );
    setSheetsWebAppUrl(settings.sheetsWebAppUrl || '');
    setError(null);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, settings, activeUser, currentUserRole, onClose]);

  if (!isOpen) return null;

  const handlePhotoUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleClass = (cls: string) => {
    setAssignedClasses((prev) =>
      prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]
    );
  };

  const toggleSubject = (subj: string) => {
    setAssignedSubjects((prev) =>
      prev.includes(subj) ? prev.filter((s) => s !== subj) : [...prev, subj]
    );
  };

  const buildUpdatedPayload = (): Pick<SystemSettings, 'teacherProfile' | 'sheetsWebAppUrl'> => ({
    teacherProfile: {
      name: name.trim(),
      nip: nip.trim() || '-',
      school: school.trim(),
      email: email.trim(),
      password: password || sourcePassword,
      gender,
      photoDataUrl: photoDataUrl.trim(),
      assignedClasses: settings.classes.filter((c) => assignedClasses.includes(c)),
      assignedSubjects: settings.subjects.filter((s) => assignedSubjects.includes(s)),
    },
    sheetsWebAppUrl: sheetsWebAppUrl.trim(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Nama lengkap guru dan email akun login wajib diisi.');
      return;
    }
    onSaveProfile(buildUpdatedPayload());
    onClose();
  };

  const previewPhoto = getUserPhotoUrl({ photoDataUrl, role: currentUserRole, gender });
  const fallbackPhoto = getUserPhotoUrl({ photoDataUrl: '', role: currentUserRole, gender });

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="teacher-profile-modal-title"
    >
      <div
        className="w-full max-w-3xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5 text-indigo-300" />
            </div>
            <div className="min-w-0">
              <h2 id="teacher-profile-modal-title" className="text-base font-bold text-white truncate">
                Profil {USER_ROLE_LABELS[currentUserRole]}, Tugas Mengajar & Sinkronisasi
              </h2>
              <p className="text-xs text-slate-300 truncate">
                Atur identitas, kelas & mata pelajaran yang diampu, kredensial masuk, serta Google Sheets
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label="Tutup pop-up profil guru"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto eguru-scroll">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* Foto & Jenis Kelamin */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <img
                  src={previewPhoto}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = fallbackPhoto;
                  }}
                  alt={name || 'Foto Guru'}
                  className="w-16 h-16 rounded-xl object-cover object-top border border-slate-300 bg-white shrink-0"
                />
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-slate-900">
                    Foto Profil {photoDataUrl ? '(Foto Khusus)' : '(Foto Dummy Default)'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer">
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>{photoDataUrl ? 'Ganti File Foto' : 'Unggah Foto'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
                        className="hidden"
                      />
                    </label>
                    {photoDataUrl && (
                      <button
                        type="button"
                        onClick={() => setPhotoDataUrl('')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white text-xs font-medium text-rose-700 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Gunakan Dummy</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="w-full sm:w-44">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jenis Kelamin
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'L' | 'P')}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="L">L (Laki-laki)</option>
                  <option value="P">P (Perempuan)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Atau Tempel Link / URL Foto Profil (Opsional)
              </label>
              <div className="relative">
                <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={photoDataUrl.startsWith('data:') ? '' : photoDataUrl}
                  onChange={(e) => setPhotoDataUrl(e.target.value)}
                  placeholder="https://contoh.com/foto-guru.jpg"
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            </div>
          </div>

          {/* Tanggung Jawab Mengajar: Kelas & Mata Pelajaran */}
          <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-4">
            <div className="space-y-0.5">
              <h3 className="text-xs font-bold text-slate-900">
                Pengaturan Tanggung Jawab Mengajar (Kelas & Mata Pelajaran)
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {currentUserRole === 'guru' || currentUserRole === 'wali_kelas'
                  ? 'Informasi pada Dashboard, Jurnal, Nilai, Data Siswa, dan Laporan akan difilter hanya untuk kelas dan mata pelajaran yang dicentang. Kosongkan semua centang jika memiliki akses ke seluruh data sekolah.'
                  : 'Anda login dengan akses penuh sekolah. Pengaturan ini menentukan cakupan data saat digunakan oleh role Guru Mapel atau Wali Kelas.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Kelas yang Diampu */}
              <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 inline-flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Kelas Diampu ({assignedClasses.length}/{settings.classes.length})</span>
                  </span>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setAssignedClasses([...settings.classes])}
                      className="font-semibold text-indigo-600 hover:underline cursor-pointer"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setAssignedClasses([])}
                      className="font-semibold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                    >
                      Semua (Bebas)
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto eguru-scroll pr-1">
                  {settings.classes.map((cls) => {
                    const checked = assignedClasses.includes(cls);
                    return (
                      <label
                        key={cls}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleClass(cls)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <span className="truncate">{cls}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Mata Pelajaran yang Diampu */}
              <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 inline-flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Mapel Diampu ({assignedSubjects.length}/{settings.subjects.length})</span>
                  </span>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setAssignedSubjects([...settings.subjects])}
                      className="font-semibold text-indigo-600 hover:underline cursor-pointer"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setAssignedSubjects([])}
                      className="font-semibold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                    >
                      Semua (Bebas)
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto eguru-scroll pr-1">
                  {settings.subjects.map((subj) => {
                    const checked = assignedSubjects.includes(subj);
                    return (
                      <label
                        key={subj}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSubject(subj)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <span className="truncate">{subj}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Biodata & Kredensial */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Lengkap & Gelar
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">NIP Guru</label>
              <input
                type="text"
                value={nip}
                onChange={(e) => setNip(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Unit Sekolah
              </label>
              <input
                type="text"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email Akun Login
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password Login
              </label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Google Sheets Web App URL (Opsional)
              </label>
              <div className="relative">
                <Database className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={sheetsWebAppUrl}
                  onChange={(e) => setSheetsWebAppUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            </div>
          </div>

          {/* Actions Footer */}
          <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                onResetDemoData();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Data Demo</span>
            </button>

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {sheetsWebAppUrl.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    onSaveProfile(buildUpdatedPayload());
                    onSyncGoogleSheets(sheetsWebAppUrl.trim());
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sinkron Google Sheets</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>

              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Profil</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

