import React, { useEffect, useState } from 'react';
import { ImagePlus, Link2, Plus, Save, Trash2, X } from 'lucide-react';
import { Student, StudentStatus } from '../types';
import { getStudentPhotoUrl, hasRealPhoto } from '../utils/defaultAvatars';
import {
  formatStudentTtl,
  generateId,
  parseTtlFields,
  STUDENT_STATUS_LABELS,
} from '../utils/helpers';

interface StudentEditModalProps {
  isOpen?: boolean;
  mode?: 'create' | 'edit';
  student: Student | null;
  classes: string[];
  existingStudents?: Student[];
  teacherSuggestions?: string[];
  defaultClassName?: string;
  defaultEnrollmentYear?: string;
  canPromoteStudents?: boolean;
  onSave: (studentData: Student, isEdit: boolean) => void;
  onClose: () => void;
}

export const StudentEditModal: React.FC<StudentEditModalProps> = ({
  isOpen,
  mode,
  student,
  classes,
  existingStudents = [],
  teacherSuggestions = [],
  defaultClassName,
  defaultEnrollmentYear = '',
  canPromoteStudents = true,
  onSave,
  onClose,
}) => {
  const effectiveOpen = isOpen ?? Boolean(student);
  const effectiveMode: 'create' | 'edit' = mode ?? (student ? 'edit' : 'create');

  const [nis, setNis] = useState('');
  const [nisn, setNisn] = useState('');
  const [name, setName] = useState('');
  const [className, setClassName] = useState(defaultClassName || classes[0] || '');
  const [absenNo, setAbsenNo] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [email, setEmail] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<'L' | 'P'>('L');
  const [status, setStatus] = useState<StudentStatus>('aktif');
  const [homeroomTeacher, setHomeroomTeacher] = useState('');
  const [counselor, setCounselor] = useState('');
  const [enrollmentYear, setEnrollmentYear] = useState(defaultEnrollmentYear);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveOpen) return;
    if (effectiveMode === 'edit' && student) {
      const parsedTtl = parseTtlFields(student.ttl);
      setNis(student.nis);
      setNisn(student.nisn || '');
      setName(student.name);
      setClassName(student.className);
      setAbsenNo(student.absenNo || '');
      setBirthPlace(student.birthPlace ?? parsedTtl.birthPlace);
      setBirthDate(student.birthDate ?? parsedTtl.birthDate);
      setEmail(student.email || '');
      setPhotoDataUrl(student.photoDataUrl || '');
      setAddress(student.address || '');
      setPhone(student.phone || '');
      setGender(student.gender);
      setStatus(student.status || 'aktif');
      setHomeroomTeacher(student.homeroomTeacher || '');
      setCounselor(student.counselor || '');
      setEnrollmentYear(student.enrollmentYear || defaultEnrollmentYear);
    } else {
      setNis('');
      setNisn('');
      setName('');
      setClassName(defaultClassName || classes[0] || '');
      setAbsenNo('');
      setBirthPlace('');
      setBirthDate('');
      setEmail('');
      setPhotoDataUrl('');
      setAddress('');
      setPhone('');
      setGender('L');
      setStatus('aktif');
      setHomeroomTeacher('');
      setCounselor('');
      setEnrollmentYear(defaultEnrollmentYear);
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
    const cleanNisn = nisn.trim();
    const cleanName = name.trim();
    if (!cleanNis || !cleanName || !className) {
      setError('NIS, Nama Lengkap, dan Kelas wajib diisi.');
      return;
    }

    const isEdit = effectiveMode === 'edit' && Boolean(student);
    const duplicateNis = existingStudents.find(
      (s) => s.nis.trim().toLowerCase() === cleanNis.toLowerCase() && s.id !== student?.id
    );
    if (duplicateNis) {
      setError(
        `NIS "${cleanNis}" sudah terdaftar atas nama ${duplicateNis.name} (${duplicateNis.className}). Gunakan NIS lain.`
      );
      return;
    }

    if (cleanNisn) {
      const duplicateNisn = existingStudents.find(
        (s) => (s.nisn || '').trim().toLowerCase() === cleanNisn.toLowerCase() && s.id !== student?.id
      );
      if (duplicateNisn) {
        setError(
          `NISN "${cleanNisn}" sudah terdaftar atas nama ${duplicateNisn.name} (${duplicateNisn.className}).`
        );
        return;
      }
    }

    const cleanPlace = birthPlace.trim();
    const cleanDate = birthDate.trim();
    const combinedTtl = formatStudentTtl({ birthPlace: cleanPlace, birthDate: cleanDate });

    onSave(
      {
        id: isEdit && student ? student.id : generateId('std'),
        nis: cleanNis,
        nisn: cleanNisn,
        absenNo: absenNo.trim(),
        name: cleanName,
        gender,
        className,
        status: canPromoteStudents ? status : isEdit && student ? student.status || 'aktif' : 'aktif',
        enrollmentYear: enrollmentYear.trim() || undefined,
        birthPlace: cleanPlace,
        birthDate: cleanDate,
        ttl: combinedTtl,
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        homeroomTeacher: homeroomTeacher.trim(),
        counselor: counselor.trim(),
        photoDataUrl: photoDataUrl.trim(),
      },
      isEdit
    );
  };

  const previewPhoto = getStudentPhotoUrl({ photoDataUrl, gender });
  const fallbackPhoto = getStudentPhotoUrl({ photoDataUrl: '', gender });

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/60 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-student-modal-title"
    >
      <div
        className="w-full max-w-3xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3.5 sm:px-6 sm:py-4 bg-slate-900 text-white flex items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h2 id="edit-student-modal-title" className="text-sm sm:text-base font-bold truncate">
              {effectiveMode === 'create' ? 'Tambah Siswa Baru' : 'Edit Biodata Siswa'}
            </h2>
            <p className="text-xs text-slate-300 truncate">
              {effectiveMode === 'create'
                ? 'Lengkapi identitas NIS/NISN, foto, kelahiran, kontak, wali kelas, dan guru BK peserta didik'
                : 'Perbarui identitas NIS/NISN, foto, kelahiran, kontak, wali kelas, dan guru BK peserta didik'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label="Tutup jendela siswa"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto eguru-scroll">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* Foto & Preview (Unggah atau Link URL) */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center gap-3.5 sm:gap-4">
              <img
                src={previewPhoto}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  if (!hasRealPhoto(photoDataUrl)) {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = fallbackPhoto;
                  }
                }}
                alt="Foto Siswa"
                className="w-16 h-16 rounded-xl object-cover object-top border border-slate-300 bg-white shrink-0"
              />
              <div className="space-y-1.5 flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900">
                  Foto Siswa{' '}
                  {hasRealPhoto(photoDataUrl) ? (
                    <span className="text-emerald-700">(Foto Asli Aktif — Tidak Pakai Dummy)</span>
                  ) : (
                    <span className="text-slate-500">
                      (Avatar Dummy {gender === 'P' ? 'Perempuan' : 'Laki-laki'})
                    </span>
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

          {/* Baris 1: NIS, NISN, Kelas, No Absen */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">NIS *</label>
              <input
                type="text"
                value={nis}
                onChange={(e) => setNis(e.target.value)}
                placeholder="25261001"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">NISN</label>
              <input
                type="text"
                value={nisn}
                onChange={(e) => setNisn(e.target.value)}
                placeholder="0104100201"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas *</label>
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
          </div>

          {/* Baris 2: Nama, Jenis Kelamin, Status */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Lengkap *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama lengkap sesuai ijazah"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Jenis Kelamin
              </label>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={status}
                disabled={!canPromoteStudents}
                onChange={(e) => setStatus(e.target.value as StudentStatus)}
                className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
                  canPromoteStudents
                    ? 'border-slate-300 bg-white'
                    : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                }`}
              >
                {(['aktif', 'lulus', 'pindah', 'keluar'] as StudentStatus[]).map((stKey) => (
                  <option key={stKey} value={stKey}>
                    {STUDENT_STATUS_LABELS[stKey]}
                  </option>
                ))}
              </select>
              {!canPromoteStudents && (
                <p className="mt-1 text-[10px] text-slate-500 leading-tight">
                  Perubahan status mutasi/kelulusan dikelola Wali Kelas, Staff TU, atau Admin.
                </p>
              )}
            </div>
          </div>

          {/* Baris 3: Tempat, Tanggal Lahir, Tahun Masuk */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tempat Lahir</label>
              <input
                type="text"
                value={birthPlace}
                onChange={(e) => setBirthPlace(e.target.value)}
                placeholder="Bandung"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tanggal Lahir
              </label>
              <input
                type="text"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                placeholder="14 Mei 2010"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

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
          </div>

          {/* Baris 4: No HP & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                No. HP / WhatsApp
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812-xxxx-xxxx"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
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

          {/* Baris 5: Wali Kelas & Guru BK */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Wali Kelas</label>
              <input
                type="text"
                list="eguru-teacher-suggestions"
                value={homeroomTeacher}
                onChange={(e) => setHomeroomTeacher(e.target.value)}
                placeholder="Nama Wali Kelas"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Guru BK</label>
              <input
                type="text"
                list="eguru-teacher-suggestions"
                value={counselor}
                onChange={(e) => setCounselor(e.target.value)}
                placeholder="Nama Guru Bimbingan Konseling"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            {teacherSuggestions.length > 0 && (
              <datalist id="eguru-teacher-suggestions">
                {teacherSuggestions.map((tName) => (
                  <option key={tName} value={tName} />
                ))}
              </datalist>
            )}
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

          <div className="pt-3 border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 min-h-[42px] rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer text-center"
            >
              Batal
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2 min-h-[42px] rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
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
