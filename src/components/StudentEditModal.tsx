import React, { useEffect, useState } from 'react';
import { ImagePlus, Link2, Plus, Save, Trash2, X } from 'lucide-react';
import { Student, StudentStatus } from '../types';
import { getStudentPhotoUrl } from '../utils/defaultAvatars';
import { generateId, STUDENT_STATUS_LABELS } from '../utils/helpers';

interface StudentEditModalProps {
  isOpen?: boolean;
  mode?: 'create' | 'edit';
  student: Student | null;
  classes: string[];
  existingStudents?: Student[];
  defaultClassName?: string;
  defaultEnrollmentYear?: string;
  onSave: (studentData: Student, isEdit: boolean) => void;
  onClose: () => void;
}

export const StudentEditModal: React.FC<StudentEditModalProps> = ({
  isOpen,
  mode,
  student,
  classes,
  existingStudents = [],
  defaultClassName,
  defaultEnrollmentYear = '',
  onSave,
  onClose,
}) => {
  const effectiveOpen = isOpen ?? Boolean(student);
  const effectiveMode: 'create' | 'edit' = mode ?? (student ? 'edit' : 'create');

  const [absenNo, setAbsenNo] = useState('');
  const [nis, setNis] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'L' | 'P'>('L');
  const [className, setClassName] = useState(defaultClassName || classes[0] || '');
  const [status, setStatus] = useState<StudentStatus>('aktif');
  const [enrollmentYear, setEnrollmentYear] = useState(defaultEnrollmentYear);
  const [ttl, setTtl] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveOpen) return;
    if (effectiveMode === 'edit' && student) {
      setAbsenNo(student.absenNo || '');
      setNis(student.nis);
      setName(student.name);
      setGender(student.gender);
      setClassName(student.className);
      setStatus(student.status || 'aktif');
      setEnrollmentYear(student.enrollmentYear || defaultEnrollmentYear);
      setTtl(student.ttl || '');
      setEmail(student.email || '');
      setAddress(student.address || '');
      setPhotoDataUrl(student.photoDataUrl || '');
    } else {
      setAbsenNo('');
      setNis('');
      setName('');
      setGender('L');
      setClassName(defaultClassName || classes[0] || '');
      setStatus('aktif');
      setEnrollmentYear(defaultEnrollmentYear);
      setTtl('');
      setEmail('');
      setAddress('');
      setPhotoDataUrl('');
    }
    setError(null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [effectiveOpen, effectiveMode, student, classes, defaultClassName, defaultEnrollmentYear, onClose]);

  if (!effectiveOpen) return null;

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNis = nis.trim();
    const cleanName = name.trim();
    if (!cleanNis || !cleanName || !className) {
      setError('NIS, Nama Lengkap, dan Kelas wajib diisi.');
      return;
    }

    const isEdit = effectiveMode === 'edit' && Boolean(student);
    const duplicate = existingStudents.find(
      (s) => s.nis.trim().toLowerCase() === cleanNis.toLowerCase() && s.id !== student?.id
    );
    if (duplicate) {
      setError(
        `NIS "${cleanNis}" sudah terdaftar atas nama ${duplicate.name} (${duplicate.className}). Gunakan NIS lain.`
      );
      return;
    }

    onSave(
      {
        id: isEdit && student ? student.id : generateId('std'),
        absenNo: absenNo.trim(),
        nis: cleanNis,
        name: cleanName,
        gender,
        className,
        status,
        enrollmentYear: enrollmentYear.trim() || undefined,
        ttl: ttl.trim(),
        email: email.trim(),
        address: address.trim(),
        photoDataUrl: photoDataUrl.trim(),
      },
      isEdit
    );
  };

  const previewPhoto = getStudentPhotoUrl({ photoDataUrl, gender });
  const fallbackPhoto = getStudentPhotoUrl({ photoDataUrl: '', gender });

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-student-modal-title"
    >
      <div
        className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-4">
          <div>
            <h2 id="edit-student-modal-title" className="text-base font-bold">
              {effectiveMode === 'create' ? 'Tambah Siswa Baru' : 'Edit Biodata Siswa'}
            </h2>
            <p className="text-xs text-slate-300">
              {effectiveMode === 'create'
                ? 'Lengkapi identitas, foto (unggah/link URL), kelas, dan kontak peserta didik baru'
                : 'Perbarui identitas, foto (unggah/link URL), kelas, dan kontak peserta didik'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            aria-label="Tutup jendela siswa"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto eguru-scroll">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* Foto & Preview (Unggah atau Link URL) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <img
                src={previewPhoto}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = fallbackPhoto;
                }}
                alt="Foto Siswa"
                className="w-16 h-16 rounded-xl object-cover object-top border border-slate-300 bg-white shrink-0"
              />
              <div className="space-y-1.5 flex-1 min-w-[200px]">
                <p className="text-xs font-bold text-slate-900">
                  Foto Siswa{' '}
                  {photoDataUrl ? '(Foto Khusus)' : `(Avatar Default ${gender === 'P' ? 'Perempuan' : 'Laki-laki'})`}
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
                      <span>Gunakan Default</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Atau Tempel Link / URL Foto (Opsional)
              </label>
              <div className="relative">
                <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={photoDataUrl.startsWith('data:') ? '' : photoDataUrl}
                  onChange={(e) => setPhotoDataUrl(e.target.value)}
                  placeholder="https://contoh.com/foto-siswa.jpg"
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              {photoDataUrl.startsWith('data:') && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Saat ini menggunakan file foto unggahan lokal. Klik Gunakan Default atau tempel URL baru untuk mengganti.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">No. Absen</label>
              <input
                type="text"
                value={absenNo}
                onChange={(e) => setAbsenNo(e.target.value)}
                placeholder="01"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">NIS</label>
              <input
                type="text"
                value={nis}
                onChange={(e) => setNis(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Kelamin</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'L' | 'P')}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="L">L (Laki-laki)</option>
                <option value="P">P (Perempuan)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas</label>
              <select
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                {classes.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status Siswa</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StudentStatus)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                {(['aktif', 'lulus', 'pindah', 'keluar'] as StudentStatus[]).map((stKey) => (
                  <option key={stKey} value={stKey}>
                    {STUDENT_STATUS_LABELS[stKey]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tahun Masuk / Angkatan
              </label>
              <input
                type="text"
                value={enrollmentYear}
                onChange={(e) => setEnrollmentYear(e.target.value)}
                placeholder="2025/2026"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tempat, Tanggal Lahir (TTL)
              </label>
              <input
                type="text"
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                placeholder="Bandung, 14 Mei 2010"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Siswa</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@siswa.sekolah.sch.id"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat Lengkap</label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Alamat tempat tinggal siswa"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
            >
              {effectiveMode === 'create' ? (
                <Plus className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{effectiveMode === 'create' ? 'Tambah Siswa' : 'Simpan Perubahan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
