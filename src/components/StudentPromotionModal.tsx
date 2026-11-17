import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Check, GraduationCap, Users, X } from 'lucide-react';
import { Student, StudentStatus } from '../types';
import { STUDENT_STATUS_LABELS } from '../utils/helpers';

type PromotionAction = 'naik_kelas' | 'lulus' | 'pindah' | 'keluar';

interface StudentPromotionModalProps {
  isOpen: boolean;
  students: Student[];
  classes: string[];
  academicYears: string[];
  currentAcademicYear: string;
  preselectedStudentIds?: string[];
  onApplyPromotion: (updatedStudents: Student[], summaryMsg: string) => void;
  onClose: () => void;
}

export const StudentPromotionModal: React.FC<StudentPromotionModalProps> = ({
  isOpen,
  students,
  classes,
  academicYears,
  currentAcademicYear,
  preselectedStudentIds = [],
  onApplyPromotion,
  onClose,
}) => {
  const [sourceMode, setSourceMode] = useState<'class' | 'selected'>('class');
  const [sourceClass, setSourceClass] = useState<string>(classes[0] || '');
  const [actionMode, setActionMode] = useState<PromotionAction>('naik_kelas');
  const [targetClass, setTargetClass] = useState<string>(classes[1] || classes[0] || '');
  const [targetAcademicYear, setTargetAcademicYear] = useState<string>(currentAcademicYear);
  const [reorderAbsen, setReorderAbsen] = useState<boolean>(true);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const hasPreselected = preselectedStudentIds.length > 0;
    const initMode = hasPreselected ? 'selected' : 'class';
    const initSourceClass = classes[0] || '';
    const initTargetClass = classes.find((c) => c !== initSourceClass) || initSourceClass;

    setSourceMode(initMode);
    setSourceClass(initSourceClass);
    setActionMode('naik_kelas');
    setTargetClass(initTargetClass);
    setTargetAcademicYear(currentAcademicYear);
    setReorderAbsen(true);
    setError(null);

    if (hasPreselected) {
      setCheckedIds(preselectedStudentIds);
    } else {
      const activeInClass = students
        .filter((s) => s.className === initSourceClass && (!s.status || s.status === 'aktif'))
        .map((s) => s.id);
      setCheckedIds(activeInClass);
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, preselectedStudentIds, classes, currentAcademicYear, students, onClose]);

  const candidateStudents = useMemo(() => {
    if (sourceMode === 'selected' && preselectedStudentIds.length > 0) {
      const selSet = new Set(preselectedStudentIds);
      return students
        .filter((s) => selSet.has(s.id))
        .sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
    }
    return students
      .filter((s) => s.className === sourceClass && (!s.status || s.status === 'aktif'))
      .sort(
        (a, b) =>
          (a.absenNo || '').localeCompare(b.absenNo || '', undefined, { numeric: true }) ||
          a.name.localeCompare(b.name)
      );
  }, [students, sourceMode, sourceClass, preselectedStudentIds]);

  const handleChangeSourceClass = (cls: string) => {
    setSourceClass(cls);
    const activeIds = students
      .filter((s) => s.className === cls && (!s.status || s.status === 'aktif'))
      .map((s) => s.id);
    setCheckedIds(activeIds);
    const altTarget = classes.find((c) => c !== cls) || cls;
    setTargetClass(altTarget);
    setError(null);
  };

  const handleChangeSourceMode = (mode: 'class' | 'selected') => {
    setSourceMode(mode);
    setError(null);
    if (mode === 'selected') {
      setCheckedIds(preselectedStudentIds);
    } else {
      const activeIds = students
        .filter((s) => s.className === sourceClass && (!s.status || s.status === 'aktif'))
        .map((s) => s.id);
      setCheckedIds(activeIds);
    }
  };

  if (!isOpen) return null;

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    const visibleIds = candidateStudents.map((s) => s.id);
    const allChecked = visibleIds.length > 0 && visibleIds.every((id) => checkedIds.includes(id));
    if (allChecked) {
      setCheckedIds([]);
    } else {
      setCheckedIds(visibleIds);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (checkedIds.length === 0) {
      setError('Pilih minimal satu siswa untuk diproses.');
      return;
    }
    if (actionMode === 'naik_kelas' && !targetClass) {
      setError('Pilih kelas tujuan terlebih dahulu.');
      return;
    }

    const selectedSet = new Set(checkedIds);
    const targetStudents = students.filter((s) => selectedSet.has(s.id));

    let updatedList: Student[] = [];
    let summaryMsg = '';

    if (actionMode === 'naik_kelas') {
      const sortedTargets = [...targetStudents].sort((a, b) => a.name.localeCompare(b.name));
      const existingTargetCount = students.filter(
        (s) =>
          s.className === targetClass &&
          !selectedSet.has(s.id) &&
          (!s.status || s.status === 'aktif')
      ).length;

      updatedList = sortedTargets.map((st, idx) => ({
        ...st,
        className: targetClass,
        status: 'aktif',
        enrollmentYear: targetAcademicYear.trim() || st.enrollmentYear || currentAcademicYear,
        absenNo: reorderAbsen
          ? String(existingTargetCount + idx + 1).padStart(2, '0')
          : st.absenNo,
      }));
      summaryMsg = `${updatedList.length} siswa berhasil dinaikkan/dipindahkan ke kelas ${targetClass}. Riwayat jurnal & nilai periode sebelumnya tetap tersimpan.`;
    } else {
      const nextStatus: StudentStatus = actionMode;
      updatedList = targetStudents.map((st) => ({
        ...st,
        status: nextStatus,
      }));
      summaryMsg = `Status ${updatedList.length} siswa diperbarui menjadi "${STUDENT_STATUS_LABELS[nextStatus]}". Riwayat jurnal & nilai historis tetap aman tersimpan.`;
    }

    onApplyPromotion(updatedList, summaryMsg);
    onClose();
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="promotion-modal-title"
    >
      <div
        className="w-full max-w-3xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-indigo-200" />
            </div>
            <div>
              <h2 id="promotion-modal-title" className="text-base font-bold">
                Kenaikan Kelas & Mutasi Status Siswa
              </h2>
              <p className="text-xs text-slate-300">
                Pindahkan rombongan belajar secara massal atau tandai kelulusan/mutasi tanpa menghapus riwayat nilai & presensi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            aria-label="Tutup jendela kenaikan kelas"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto eguru-scroll">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          {/* Source & Action Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Sumber Siswa</span>
                </label>
                {preselectedStudentIds.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleChangeSourceMode('selected')}
                      className={`px-2 py-1 rounded font-semibold cursor-pointer ${
                        sourceMode === 'selected'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white border border-slate-300 text-slate-700'
                      }`}
                    >
                      Terpilih ({preselectedStudentIds.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeSourceMode('class')}
                      className={`px-2 py-1 rounded font-semibold cursor-pointer ${
                        sourceMode === 'class'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white border border-slate-300 text-slate-700'
                      }`}
                    >
                      Per Kelas
                    </button>
                  </div>
                )}
              </div>

              {sourceMode === 'class' ? (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Kelas Asal (Siswa Aktif)
                  </label>
                  <select
                    value={sourceClass}
                    onChange={(e) => handleChangeSourceClass(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  >
                    {classes.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  Memproses <strong>{preselectedStudentIds.length}</strong> siswa yang sebelumnya dicentang pada tabel Data Siswa.
                </p>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
                <span>Tindakan / Status Tujuan</span>
              </label>

              <select
                value={actionMode}
                onChange={(e) => setActionMode(e.target.value as PromotionAction)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="naik_kelas">Naik Kelas / Pindah Rombel (Tetap Aktif)</option>
                <option value="lulus">Tandai Lulus / Alumni</option>
                <option value="pindah">Tandai Pindah Sekolah (Mutasi Keluar)</option>
                <option value="keluar">Tandai Keluar / Nonaktif</option>
              </select>

              {actionMode === 'naik_kelas' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Kelas Tujuan
                    </label>
                    <select
                      value={targetClass}
                      onChange={(e) => setTargetClass(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-indigo-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    >
                      {classes.map((cls) => (
                        <option key={cls} value={cls}>
                          {cls}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Tahun Ajaran Rombel
                    </label>
                    <input
                      type="text"
                      list="promo-academic-years"
                      value={targetAcademicYear}
                      onChange={(e) => setTargetAcademicYear(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                    <datalist id="promo-academic-years">
                      {academicYears.map((yr) => (
                        <option key={yr} value={yr} />
                      ))}
                    </datalist>
                  </div>
                </div>
              )}
            </div>
          </div>

          {actionMode === 'naik_kelas' && (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={reorderAbsen}
                onChange={(e) => setReorderAbsen(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span>
                Urutkan ulang No. Absen (01, 02, ...) sesuai abjad nama di kelas tujuan
              </span>
            </label>
          )}

          {/* Student Checklist */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900">
                Daftar Siswa ({checkedIds.length} dari {candidateStudents.length} dipilih)
              </span>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="font-semibold text-indigo-700 hover:underline cursor-pointer"
              >
                {candidateStudents.length > 0 &&
                candidateStudents.every((s) => checkedIds.includes(s.id))
                  ? 'Kosongkan Pilihan'
                  : 'Pilih Semua'}
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto eguru-scroll">
              {candidateStudents.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Tidak ada siswa aktif pada sumber yang dipilih.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-900 text-white">
                    <tr>
                      <th className="py-2 px-3 w-10 text-center">Pilih</th>
                      <th className="py-2 px-3 w-16 text-center">Absen</th>
                      <th className="py-2 px-3 w-28">NIS</th>
                      <th className="py-2 px-3">Nama Lengkap</th>
                      <th className="py-2 px-3 w-24">Kelas Asal</th>
                      <th className="py-2 px-3 w-28">Status Saat Ini</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {candidateStudents.map((st) => {
                      const isChecked = checkedIds.includes(st.id);
                      const statusKey: StudentStatus = st.status || 'aktif';
                      return (
                        <tr
                          key={st.id}
                          onClick={() => toggleCheck(st.id)}
                          className={`cursor-pointer ${
                            isChecked ? 'bg-indigo-50/50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleCheck(st.id)}
                              className="rounded border-slate-300 cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-slate-600 tabular-nums">
                            {st.absenNo || '-'}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-700 tabular-nums">
                            {st.nis}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-900">{st.name}</td>
                          <td className="py-2 px-3 text-indigo-700 font-semibold">{st.className}</td>
                          <td className="py-2 px-3 text-slate-600">
                            {STUDENT_STATUS_LABELS[statusKey]}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              Catatan: Riwayat jurnal & nilai terdahulu tidak terhapus saat siswa naik kelas atau lulus.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                Batal
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Check className="w-4 h-4" />
                <span>Proses ({checkedIds.length} Siswa)</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
