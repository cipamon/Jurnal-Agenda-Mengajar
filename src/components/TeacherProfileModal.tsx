import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  GraduationCap,
  ImagePlus,
  Link2,
  Move,
  PenTool,
  RotateCcw,
  Save,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { AppUser, SystemSettings, TeacherProfile, UserRole } from '../types';
import { getUserPhotoUrl, hasRealPhoto, normalizePhotoUrl } from '../utils/defaultAvatars';
import { PX_TO_MM, USER_ROLE_LABELS } from '../utils/helpers';

interface TeacherProfileModalProps {
  isOpen: boolean;
  variant?: 'modal' | 'page';
  isCloudMode?: boolean;
  isServerMode?: boolean;
  settings: SystemSettings;
  activeUser?: AppUser;
  currentUserRole?: UserRole;
  onSaveProfile: (updated: { teacherProfile: TeacherProfile }) => void;
  onResetDemoData: () => void;
  onClose?: () => void;
}

export const TeacherProfileModal: React.FC<TeacherProfileModalProps> = ({
  isOpen,
  variant = 'modal',
  isCloudMode = false,
  isServerMode = false,
  settings,
  activeUser,
  currentUserRole = 'guru',
  onSaveProfile,
  onResetDemoData,
  onClose,
}) => {
  const sourceName = activeUser?.name || settings.teacherProfile.name;
  const sourceNip = activeUser?.nip || settings.teacherProfile.nip;
  const sourceSchool = activeUser?.school || settings.teacherProfile.school;
  const sourceEmail = activeUser?.email || settings.teacherProfile.email;
  const sourceGender: 'L' | 'P' = activeUser?.gender || settings.teacherProfile.gender || 'P';
  const sourcePhoto =
    activeUser?.photoDataUrl ||
    (currentUserRole === 'guru' ? settings.teacherProfile.photoDataUrl || '' : '');
  const sourceClasses = activeUser
    ? activeUser.assignedClasses || []
    : settings.teacherProfile.assignedClasses || [];
  const sourceSubjects = activeUser
    ? activeUser.assignedSubjects || []
    : settings.teacherProfile.assignedSubjects || [];
  const sourceSigDataUrl =
    activeUser?.signatureDataUrl ??
    (currentUserRole === 'guru' ? settings.teacherProfile.signatureDataUrl || '' : '');
  const sourceSigSize =
    activeUser?.signatureSize ??
    (currentUserRole === 'guru' ? settings.teacherProfile.signatureSize : undefined) ??
    settings.signatureStamp?.signatureSize ??
    58;
  const sourceSigOffX =
    activeUser?.signatureOffsetX ??
    (currentUserRole === 'guru' ? settings.teacherProfile.signatureOffsetX : undefined) ??
    0;
  const sourceSigOffY =
    activeUser?.signatureOffsetY ??
    (currentUserRole === 'guru' ? settings.teacherProfile.signatureOffsetY : undefined) ??
    0;

  const [name, setName] = useState(sourceName);
  const [nip, setNip] = useState(sourceNip);
  const [school, setSchool] = useState(sourceSchool);
  const [email, setEmail] = useState(sourceEmail);
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState<'L' | 'P'>(sourceGender);
  const [photoDataUrl, setPhotoDataUrl] = useState(sourcePhoto);
  const [assignedClasses, setAssignedClasses] = useState<string[]>(sourceClasses);
  const [assignedSubjects, setAssignedSubjects] = useState<string[]>(sourceSubjects);
  const [signatureDataUrl, setSignatureDataUrl] = useState(sourceSigDataUrl);
  const [signatureSize, setSignatureSize] = useState<number>(sourceSigSize);
  const [signatureOffsetX, setSignatureOffsetX] = useState<number>(sourceSigOffX);
  const [signatureOffsetY, setSignatureOffsetY] = useState<number>(sourceSigOffY);
  const [sigDragMode, setSigDragMode] = useState<'move' | 'resize' | null>(null);
  const sigDragOriginRef = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    initX: number;
    initY: number;
    initSize: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(activeUser?.name || settings.teacherProfile.name);
    setNip(activeUser?.nip || settings.teacherProfile.nip);
    setSchool(activeUser?.school || settings.teacherProfile.school);
    setEmail(activeUser?.email || settings.teacherProfile.email);
    setPassword('');
    setGender(activeUser?.gender || settings.teacherProfile.gender || 'P');
    setPhotoDataUrl(
      activeUser?.photoDataUrl ||
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
    setSignatureDataUrl(
      activeUser?.signatureDataUrl ??
        (currentUserRole === 'guru' ? settings.teacherProfile.signatureDataUrl || '' : '')
    );
    setSignatureSize(
      activeUser?.signatureSize ??
        (currentUserRole === 'guru' ? settings.teacherProfile.signatureSize : undefined) ??
        settings.signatureStamp?.signatureSize ??
        58
    );
    setSignatureOffsetX(
      activeUser?.signatureOffsetX ??
        (currentUserRole === 'guru' ? settings.teacherProfile.signatureOffsetX : undefined) ??
        0
    );
    setSignatureOffsetY(
      activeUser?.signatureOffsetY ??
        (currentUserRole === 'guru' ? settings.teacherProfile.signatureOffsetY : undefined) ??
        0
    );
    setError(null);
    setConfirmReset(false);

    if (variant !== 'modal' || !onClose) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, variant, settings, activeUser, currentUserRole, onClose]);

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

  const handleSignatureUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSignatureDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const startPersonalSigDrag = (
    mode: 'move' | 'resize',
    e: React.PointerEvent<HTMLElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    sigDragOriginRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initX: signatureOffsetX,
      initY: signatureOffsetY,
      initSize: signatureSize,
    };
    setSigDragMode(mode);
  };

  const movePersonalSigDrag = (e: React.PointerEvent<HTMLElement>) => {
    const origin = sigDragOriginRef.current;
    if (!origin) return;
    const dx = Math.round(e.clientX - origin.startX);
    const dy = Math.round(e.clientY - origin.startY);
    if (origin.mode === 'resize') {
      const delta = Math.round((dx + dy) / 2);
      setSignatureSize(Math.max(40, Math.min(280, origin.initSize + delta)));
    } else {
      setSignatureOffsetX(Math.max(-120, Math.min(120, origin.initX + dx)));
      setSignatureOffsetY(Math.max(-60, Math.min(60, origin.initY + dy)));
    }
  };

  const stopPersonalSigDrag = () => {
    sigDragOriginRef.current = null;
    setSigDragMode(null);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Nama lengkap guru dan email akun login wajib diisi.');
      return;
    }
    const trimmedNewPass = password.trim();
    if (trimmedNewPass.length > 0 && trimmedNewPass.length < 6) {
      setError('Password baru minimal 6 karakter.');
      return;
    }
    setError(null);
    const isTeachingRole = currentUserRole === 'guru' || currentUserRole === 'wali_kelas';
    const allowPersonalTeacherSig = isTeachingRole || currentUserRole === 'admin';
    onSaveProfile({
      teacherProfile: {
        name: name.trim(),
        nip: nip.trim() || '-',
        school: school.trim(),
        email: email.trim(),
        password: trimmedNewPass,
        gender,
        photoDataUrl: photoDataUrl.trim(),
        assignedClasses: isTeachingRole
          ? settings.classes.filter((c) => assignedClasses.includes(c))
          : [],
        assignedSubjects: isTeachingRole
          ? settings.subjects.filter((s) => assignedSubjects.includes(s))
          : [],
        signatureDataUrl: allowPersonalTeacherSig ? signatureDataUrl.trim() : '',
        signatureSize: allowPersonalTeacherSig
          ? Math.max(40, Math.min(280, Math.round(signatureSize || 58)))
          : undefined,
        signatureOffsetX: allowPersonalTeacherSig
          ? Math.max(-120, Math.min(120, Math.round(signatureOffsetX || 0)))
          : undefined,
        signatureOffsetY: allowPersonalTeacherSig
          ? Math.max(-60, Math.min(60, Math.round(signatureOffsetY || 0)))
          : undefined,
      },
    });
    setPassword('');
    if (variant === 'modal') {
      onClose?.();
    }
  };

  const isTeachingRole = currentUserRole === 'guru' || currentUserRole === 'wali_kelas';
  const showPersonalTeacherSigSection = isTeachingRole || currentUserRole === 'admin';
  const previewPhoto = getUserPhotoUrl({ photoDataUrl, role: currentUserRole, gender });
  const fallbackPhoto = getUserPhotoUrl({ photoDataUrl: '', role: currentUserRole, gender });
  const previewSignatureUrl = signatureDataUrl.trim() ? normalizePhotoUrl(signatureDataUrl) : '';
  const isPage = variant === 'page';

  const contentCard = (
    <div
      className={
        isPage
          ? 'w-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col'
          : 'w-full max-w-3xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]'
      }
      onClick={isPage ? undefined : (e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-4 py-3.5 sm:px-6 sm:py-4 bg-slate-900 text-white flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5 text-indigo-300" />
          </div>
          <div className="min-w-0">
            <h2 id="teacher-profile-modal-title" className="text-sm sm:text-base font-bold text-white truncate">
              {isTeachingRole
                ? `Profil ${USER_ROLE_LABELS[currentUserRole]} & Tanggung Jawab Mengajar`
                : `Profil Akun ${USER_ROLE_LABELS[currentUserRole]}`}
            </h2>
            <p className="text-xs text-slate-300 truncate">
              {isTeachingRole
                ? 'Atur identitas, foto profil, TTD digital pribadi, kelas & mapel yang diampu, serta kredensial masuk'
                : currentUserRole === 'admin'
                  ? 'Atur identitas administrator, foto profil, TTD digital opsional, serta kredensial masuk'
                  : 'Atur identitas pegawai, foto profil, unit sekolah, serta kredensial masuk'}
            </p>
          </div>
        </div>
        {!isPage && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label="Tutup pop-up profil guru"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Form Body */}
      <form
        onSubmit={handleSubmit}
        className={isPage ? 'p-4 sm:p-6 space-y-5' : 'p-4 sm:p-6 space-y-5 overflow-y-auto eguru-scroll'}
      >
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
                referrerPolicy="no-referrer"
                onError={(e) => {
                  if (!hasRealPhoto(photoDataUrl)) {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = fallbackPhoto;
                  }
                }}
                alt={name || 'Foto Guru'}
                className="w-16 h-16 rounded-xl object-cover object-top border border-slate-300 bg-white shrink-0"
              />
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-slate-900">
                  Foto Profil{' '}
                  {hasRealPhoto(photoDataUrl) ? (
                    <span className="text-emerald-700">(Foto Asli Aktif)</span>
                  ) : (
                    <span className="text-slate-500">(Foto Dummy Default)</span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer">
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>{hasRealPhoto(photoDataUrl) ? 'Ganti File Foto' : 'Unggah Foto'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
                      className="hidden"
                    />
                  </label>
                  {hasRealPhoto(photoDataUrl) && (
                    <button
                      type="button"
                      onClick={() => setPhotoDataUrl('')}
                      className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[38px] rounded-lg border border-rose-200 bg-white text-xs font-medium text-rose-700 hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Foto Asli</span>
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
                placeholder="https://contoh.com/foto-guru.jpg atau link Google Drive"
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>
        </div>

        {/* Tanda Tangan Digital Guru Mapel (Upload + Drag/Zoom 1:1) */}
        {showPersonalTeacherSigSection && (
        <div className="p-4 rounded-xl border border-blue-200/80 bg-blue-50/35 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-900 inline-flex items-center gap-1.5">
                <PenTool className="w-3.5 h-3.5 text-indigo-600" />
                <span>Tanda Tangan Digital Pribadi (Guru Mapel / Wali Kelas)</span>
              </h3>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Unggah gambar TTD (PNG transparan disarankan) atau link Google Drive. Otomatis dipakai saat mencetak laporan resmi &amp; profil siswa.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSignatureSize(settings.signatureStamp?.signatureSize || 58);
                setSignatureOffsetX(0);
                setSignatureOffsetY(0);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Posisi &amp; Ukuran</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            <div className="md:col-span-6 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer">
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>{signatureDataUrl ? 'Ganti Gambar TTD' : 'Unggah Gambar TTD'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleSignatureUpload(e.target.files?.[0])}
                    className="hidden"
                  />
                </label>
                {signatureDataUrl && (
                  <button
                    type="button"
                    onClick={() => setSignatureDataUrl('')}
                    className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[38px] rounded-lg border border-rose-200 bg-white text-xs font-medium text-rose-700 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus TTD</span>
                  </button>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Atau Tempel URL Gambar / Link Google Drive TTD
                </label>
                <input
                  type="url"
                  value={signatureDataUrl.startsWith('data:') ? '' : signatureDataUrl}
                  onChange={(e) => setSignatureDataUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/.../view"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                    <span>Ukuran</span>
                    <span className="font-mono tabular-nums">{signatureSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={280}
                    step={2}
                    value={signatureSize}
                    onChange={(e) => setSignatureSize(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                    <span>Geser X</span>
                    <span className="font-mono tabular-nums">{signatureOffsetX}px</span>
                  </div>
                  <input
                    type="range"
                    min={-120}
                    max={120}
                    value={signatureOffsetX}
                    onChange={(e) => setSignatureOffsetX(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                    <span>Geser Y</span>
                    <span className="font-mono tabular-nums">{signatureOffsetY}px</span>
                  </div>
                  <input
                    type="range"
                    min={-60}
                    max={60}
                    value={signatureOffsetY}
                    onChange={(e) => setSignatureOffsetY(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Kanvas Drag & Zoom 1:1 TTD Pribadi */}
            <div className="md:col-span-6">
              <div className="eguru-paper-preview p-3 rounded-xl border border-slate-300 bg-white select-none overflow-hidden">
                <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                    <Move className="w-3 h-3 text-indigo-600" />
                    <span>Pratinjau 1:1 ({(signatureSize * PX_TO_MM).toFixed(1)} mm)</span>
                  </span>
                  <span>Seret / Scroll / Tarik Titik Biru</span>
                </div>
                <div className="border-t border-slate-100 pt-2 px-2 text-xs text-slate-950 font-serif">
                  <p>{settings.signatureCity}, Tanggal Cetak</p>
                  <p>Guru Mata Pelajaran,</p>
                  <div className="relative h-[86px] w-full overflow-visible">
                    {previewSignatureUrl ? (
                      <div
                        onPointerDown={(e) => startPersonalSigDrag('move', e)}
                        onPointerMove={movePersonalSigDrag}
                        onPointerUp={stopPersonalSigDrag}
                        onPointerCancel={stopPersonalSigDrag}
                        onWheel={(e) => {
                          e.preventDefault();
                          const step = e.deltaY < 0 ? 4 : -4;
                          setSignatureSize((prev) => Math.max(40, Math.min(280, prev + step)));
                        }}
                        style={{
                          left: '78px',
                          top: '50%',
                          height: signatureSize,
                          transform: `translate(calc(-50% + ${signatureOffsetX}px), calc(-50% + ${signatureOffsetY}px))`,
                        }}
                        className={`group absolute z-20 inline-flex items-center justify-center cursor-grab active:cursor-grabbing touch-none ${
                          sigDragMode
                            ? 'ring-2 ring-blue-500 rounded-md'
                            : 'hover:ring-1 hover:ring-blue-400 rounded-md'
                        }`}
                      >
                        <img
                          src={previewSignatureUrl}
                          alt="Preview TTD Pribadi"
                          referrerPolicy="no-referrer"
                          draggable={false}
                          style={{ height: '100%', width: 'auto', maxWidth: 'none' }}
                          className="object-contain pointer-events-none"
                        />
                        <span
                          onPointerDown={(e) => startPersonalSigDrag('resize', e)}
                          onPointerMove={movePersonalSigDrag}
                          onPointerUp={stopPersonalSigDrag}
                          onPointerCancel={stopPersonalSigDrag}
                          title="Tarik untuk memperbesar/memperkecil TTD"
                          className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white shadow cursor-nwse-resize"
                        />
                      </div>
                    ) : (
                      <div className="h-full flex items-center text-[11px] text-slate-400 italic">
                        Belum ada TTD pribadi (memakai TTD default sekolah jika tersedia)
                      </div>
                    )}
                  </div>
                  <p className="font-bold underline">{name || 'Nama Guru'}</p>
                  <p>NIP. {nip || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Tanggung Jawab Mengajar: Kelas & Mata Pelajaran */}
        {isTeachingRole && (
        <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-4">
          <div className="space-y-0.5">
            <h3 className="text-xs font-bold text-slate-900">
              Pengaturan Tanggung Jawab Mengajar (Kelas &amp; Mata Pelajaran)
            </h3>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {currentUserRole === 'guru' || currentUserRole === 'wali_kelas'
                ? 'Informasi pada Dashboard, Jurnal, Nilai, Data Siswa, dan Laporan akan difilter hanya untuk kelas dan mata pelajaran yang dicentang. Kosongkan semua centang jika memiliki akses ke seluruh data sekolah.'
                : 'Anda login dengan akses penuh sekolah. Pengaturan ini menentukan cakupan data saat digunakan oleh role Guru Mapel atau Wali Kelas.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        )}

        {/* Biodata & Kredensial */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nama Lengkap &amp; Gelar
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">NIP Guru / Pegawai</label>
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
              readOnly={isCloudMode && currentUserRole !== 'admin'}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
                isCloudMode && currentUserRole !== 'admin'
                  ? 'bg-slate-100 text-slate-500 cursor-not-allowed'
                  : ''
              }`}
            />
            {isCloudMode && currentUserRole !== 'admin' && (
              <p className="text-[11px] text-slate-500 mt-1">
                Email Google login dikelola oleh Admin Sekolah agar sinkronisasi akun tetap aman.
              </p>
            )}
          </div>

          {!isCloudMode && (
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Password Baru (Opsional — kosongkan jika tidak diubah)
                </label>
                {activeUser?.username && (
                  <span className="text-[11px] font-mono text-slate-500">
                    Username: @{activeUser.username}
                  </span>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  isServerMode
                    ? 'Minimal 6 karakter jika ingin mengubah password'
                    : 'Minimal 6 karakter'
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          )}
        </div>

        {/* Actions Footer */}
        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {currentUserRole === 'admin' && (
            <div className="flex flex-wrap items-center gap-2">
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Data Demo</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmReset(false);
                      onResetDemoData();
                      if (variant === 'modal') onClose?.();
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Konfirmasi Reset Semua Data</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-3 py-2 min-h-[40px] rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Batal
                  </button>
                </>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
            {!isPage && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2 min-h-[40px] rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer text-center"
              >
                Batal
              </button>
            )}

            <button
              type="submit"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-5 py-2 min-h-[40px] rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Profil</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );

  if (isPage) {
    return contentCard;
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/60 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="teacher-profile-modal-title"
    >
      {contentCard}
    </div>
  );
};
