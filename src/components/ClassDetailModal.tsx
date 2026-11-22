import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ClipboardCheck,
  FileSpreadsheet,
  GraduationCap,
  Users,
  X,
} from 'lucide-react';
import { GradeRecord, JournalEntry, MenuId, Student, SystemSettings } from '../types';
import { getStudentPhotoUrl } from '../utils/defaultAvatars';
import { formatTanggalID } from '../utils/helpers';

interface ClassDetailModalProps {
  className: string | null;
  students: Student[];
  journals: JournalEntry[];
  grades: GradeRecord[];
  settings: SystemSettings;
  onSelectStudent: (student: Student) => void;
  onSelectSubject: (subject: string) => void;
  onNavigate?: (menu: MenuId) => void;
  onClose: () => void;
}

export const ClassDetailModal: React.FC<ClassDetailModalProps> = ({
  className,
  students,
  journals,
  grades,
  settings,
  onSelectStudent,
  onSelectSubject,
  onNavigate,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'siswa' | 'jurnal' | 'nilai'>('siswa');

  useEffect(() => {
    if (!className) return;
    setActiveTab('siswa');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [className, onClose]);

  const classStudents = useMemo(() => {
    if (!className) return [];
    return students
      .filter((s) => s.className === className)
      .sort(
        (a, b) =>
          (a.absenNo || '').localeCompare(b.absenNo || '', undefined, { numeric: true }) ||
          a.name.localeCompare(b.name)
      );
  }, [students, className]);

  const classJournals = useMemo(() => {
    if (!className) return [];
    return journals
      .filter((j) => j.className === className)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [journals, className]);

  const stats = useMemo(() => {
    const l = classStudents.filter((s) => s.gender === 'L').length;
    const p = classStudents.filter((s) => s.gender === 'P').length;

    let totalMarks = 0;
    let totalPresent = 0;
    classJournals.forEach((j) => {
      Object.values(j.attendance).forEach((a) => {
        totalMarks++;
        if (a.status === 'H' || a.status === 'D') totalPresent++;
      });
    });
    const attPct = totalMarks > 0 ? Math.round((totalPresent / totalMarks) * 1000) / 10 : 0;

    const validGrades = grades.filter((g) => g.className === className && g.score !== null);
    const avgGrade =
      validGrades.length > 0
        ? Math.round(
            (validGrades.reduce((acc, g) => acc + (g.score ?? 0), 0) / validGrades.length) * 10
          ) / 10
        : null;

    return { l, p, attPct, avgGrade };
  }, [className, classStudents, classJournals, grades]);

  const subjectRecap = useMemo(() => {
    if (!className) return [];
    const subjectNames = Array.from(
      new Set([
        ...classJournals.map((j) => j.subject),
        ...grades.filter((g) => g.className === className).map((g) => g.subject),
      ])
    ).sort();

    return subjectNames.map((subj) => {
      const subjJournals = classJournals.filter((j) => j.subject === subj);
      const subjGrades = grades.filter(
        (g) => g.className === className && g.subject === subj && g.score !== null
      );
      const avg =
        subjGrades.length > 0
          ? Math.round(
              (subjGrades.reduce((acc, g) => acc + (g.score ?? 0), 0) / subjGrades.length) * 10
            ) / 10
          : null;
      return {
        subject: subj,
        journalCount: subjJournals.length,
        gradeCount: subjGrades.length,
        avg,
      };
    });
  }, [className, classJournals, grades]);

  if (!className) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/60 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="class-modal-title"
    >
      <div
        className="w-full max-w-4xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-4 sm:px-6 sm:py-5 bg-slate-900 text-white flex items-start justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-300" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                Detail Rombongan Belajar
              </p>
              <h2 id="class-modal-title" className="text-base sm:text-lg font-bold text-white truncate">
                Kelas {className}
              </h2>
              <p className="text-xs text-slate-300 tabular-nums mt-0.5">
                {classStudents.length} Siswa (L: {stats.l} · P: {stats.p}) · {classJournals.length}{' '}
                Pertemuan Jurnal
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label="Tutup informasi kelas"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-200 bg-slate-50 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-3 sm:p-3.5 sm:px-5">
            <p className="text-xs text-slate-500">Jumlah Siswa</p>
            <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
              {classStudents.length} Siswa
            </p>
          </div>
          <div className="p-3 sm:p-3.5 sm:px-5">
            <p className="text-xs text-slate-500">Total Pertemuan</p>
            <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
              {classJournals.length} Sesi
            </p>
          </div>
          <div className="p-3 sm:p-3.5 sm:px-5">
            <p className="text-xs text-slate-500">Persentase Kehadiran</p>
            <p className="mt-0.5 text-base font-bold text-emerald-700 tabular-nums">
              {stats.attPct}%
            </p>
          </div>
          <div className="p-3 sm:p-3.5 sm:px-5">
            <p className="text-xs text-slate-500">Rata-Rata Nilai (KKM {settings.kkm})</p>
            <p className="mt-0.5 text-base font-bold text-indigo-700 tabular-nums">
              {stats.avgGrade !== null ? stats.avgGrade : '-'}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-6 pt-3 border-b border-slate-200 flex items-center gap-2 bg-white overflow-x-auto eguru-scroll">
          <button
            type="button"
            onClick={() => setActiveTab('siswa')}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[40px] text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'siswa'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Daftar Siswa ({classStudents.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('jurnal')}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[40px] text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'jurnal'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Riwayat Jurnal Kelas ({classJournals.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('nilai')}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[40px] text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'nilai'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Rekap per Mata Pelajaran ({subjectRecap.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto eguru-scroll p-4 sm:p-6">
          {activeTab === 'siswa' ? (
            classStudents.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Belum ada siswa terdaftar di kelas {className}.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-x-auto eguru-scroll">
                <table className="w-full min-w-[540px] text-left border-collapse text-xs">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">Absen</th>
                      <th className="py-2.5 px-3 w-28">NIS</th>
                      <th className="py-2.5 px-3">Nama Siswa (Klik untuk detail)</th>
                      <th className="py-2.5 px-3 text-center w-14">L/P</th>
                      <th className="py-2.5 px-3">Email</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {classStudents.map((st, idx) => (
                      <tr key={st.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-center font-mono text-slate-500 tabular-nums">
                          {st.absenNo || String(idx + 1).padStart(2, '0')}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 tabular-nums">
                          {st.nis}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={getStudentPhotoUrl(st)}
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = getStudentPhotoUrl({
                                  photoDataUrl: '',
                                  gender: st.gender,
                                });
                              }}
                              alt={st.name}
                              className="w-7 h-7 rounded-full object-cover object-top border border-slate-200 bg-white shrink-0"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onSelectStudent(st);
                              }}
                              className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline text-left cursor-pointer"
                            >
                              {st.name}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold text-slate-700">
                          {st.gender}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 truncate max-w-[180px]">
                          {st.email || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : activeTab === 'jurnal' ? (
            classJournals.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Belum ada jurnal pembelajaran untuk kelas {className}.
              </div>
            ) : (
              <div className="space-y-3">
                {classJournals.map((j) => {
                  const cnt = { H: 0, S: 0, I: 0, A: 0, D: 0 };
                  Object.values(j.attendance).forEach((item) => {
                    cnt[item.status] = (cnt[item.status] || 0) + 1;
                  });
                  return (
                    <div
                      key={j.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/70"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                            <span className="font-semibold text-slate-900">
                              {formatTanggalID(j.date)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>Jam ke-{j.period}</span>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onSelectSubject(j.subject);
                              }}
                              className="font-semibold text-indigo-700 hover:underline cursor-pointer"
                            >
                              {j.subject}
                            </button>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mt-1">
                            <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{j.topic}</span>
                          </h4>
                        </div>
                        <span className="text-xs font-mono tabular-nums px-2.5 py-1 rounded bg-slate-100 text-slate-700">
                          H:{cnt.H} S:{cnt.S} I:{cnt.I} A:{cnt.A} D:{cnt.D}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-600">{j.activities}</p>
                    </div>
                  );
                })}
              </div>
            )
          ) : subjectRecap.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Belum ada data mata pelajaran tercatat untuk kelas {className}.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-x-auto eguru-scroll">
              <table className="w-full min-w-[480px] text-left border-collapse text-xs">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="py-2.5 px-4">Mata Pelajaran (Klik untuk detail)</th>
                    <th className="py-2.5 px-3 text-right">Pertemuan Jurnal</th>
                    <th className="py-2.5 px-3 text-right">Data Nilai</th>
                    <th className="py-2.5 px-4 text-right">Rata-Rata Kelas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {subjectRecap.map((row) => (
                    <tr key={row.subject} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onSelectSubject(row.subject);
                          }}
                          className="font-semibold text-indigo-700 hover:underline cursor-pointer text-left"
                        >
                          {row.subject}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">
                        {row.journalCount}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">
                        {row.gradeCount}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold tabular-nums text-slate-900">
                        {row.avg !== null ? row.avg : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-500 hidden sm:block">
            Klik nama siswa atau mata pelajaran untuk berpindah detail pop-up
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto sm:ml-auto">
            {onNavigate && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigate('jurnal');
                  }}
                  className="px-3.5 py-2 min-h-[40px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                >
                  Buka Jurnal & Absensi
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigate('nilai');
                  }}
                  className="px-3.5 py-2 min-h-[40px] rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Buka Input Nilai
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 min-h-[40px] rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
