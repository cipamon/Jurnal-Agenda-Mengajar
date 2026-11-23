import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ClipboardCheck, FileSpreadsheet, X } from 'lucide-react';
import { GradeRecord, JournalEntry, MenuId, Student, SystemSettings, UserRole } from '../types';
import { formatTanggalID, ROLE_PERMISSIONS } from '../utils/helpers';

interface SubjectDetailModalProps {
  subject: string | null;
  students: Student[];
  journals: JournalEntry[];
  grades: GradeRecord[];
  settings: SystemSettings;
  currentUserRole?: UserRole;
  onSelectClass: (className: string) => void;
  onSelectStudent: (student: Student) => void;
  onNavigate?: (menu: MenuId) => void;
  onClose: () => void;
}

export const SubjectDetailModal: React.FC<SubjectDetailModalProps> = ({
  subject,
  students,
  journals,
  grades,
  settings,
  currentUserRole = 'guru',
  onSelectClass,
  onSelectStudent,
  onNavigate,
  onClose,
}) => {
  const rolePerms = ROLE_PERMISSIONS[currentUserRole];
  const [activeTab, setActiveTab] = useState<'jurnal' | 'nilai'>('jurnal');

  useEffect(() => {
    if (!subject) return;
    setActiveTab('jurnal');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [subject, onClose]);

  const subjectJournals = useMemo(() => {
    if (!subject) return [];
    return journals
      .filter((j) => j.subject === subject)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [journals, subject]);

  const subjectGrades = useMemo(() => {
    if (!subject) return [];
    return grades
      .filter((g) => g.subject === subject && g.score !== null)
      .sort((a, b) => a.className.localeCompare(b.className) || a.examType.localeCompare(b.examType));
  }, [grades, subject]);

  const stats = useMemo(() => {
    const classesTaught = Array.from(
      new Set([...subjectJournals.map((j) => j.className), ...subjectGrades.map((g) => g.className)])
    ).sort();
    const avgScore =
      subjectGrades.length > 0
        ? Math.round(
            (subjectGrades.reduce((acc, g) => acc + (g.score ?? 0), 0) / subjectGrades.length) * 10
          ) / 10
        : null;
    const passed = subjectGrades.filter((g) => (g.score ?? 0) >= settings.kkm).length;
    const passPct =
      subjectGrades.length > 0 ? Math.round((passed / subjectGrades.length) * 100) : 0;

    return { classesTaught, avgScore, passed, passPct };
  }, [subjectJournals, subjectGrades, settings.kkm]);

  const classRecap = useMemo(() => {
    if (!subject) return [];
    return stats.classesTaught.map((cls) => {
      const clsJ = subjectJournals.filter((j) => j.className === cls);
      const clsG = subjectGrades.filter((g) => g.className === cls);
      const avg =
        clsG.length > 0
          ? Math.round((clsG.reduce((acc, g) => acc + (g.score ?? 0), 0) / clsG.length) * 10) / 10
          : null;
      return {
        className: cls,
        journalCount: clsJ.length,
        gradeCount: clsG.length,
        avg,
      };
    });
  }, [subject, stats.classesTaught, subjectJournals, subjectGrades]);

  if (!subject) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/60 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="subject-modal-title"
    >
      <div
        className="w-full max-w-4xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-4 sm:px-6 sm:py-5 bg-slate-900 text-white flex items-start justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-300" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                Detail Mata Pelajaran
              </p>
              <h2 id="subject-modal-title" className="text-base sm:text-lg font-bold text-white truncate">
                {subject}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Diajarkan di {stats.classesTaught.length} kelas · KKM Standar {settings.kkm}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label="Tutup informasi mata pelajaran"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-200 bg-slate-50 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-3 sm:p-3.5 sm:px-5">
            <p className="text-xs text-slate-500">Total Pertemuan KBM</p>
            <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
              {subjectJournals.length} Sesi
            </p>
          </div>
          <div className="p-3 sm:p-3.5 sm:px-5">
            <p className="text-xs text-slate-500">Kelas Terkait</p>
            <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
              {stats.classesTaught.length} Kelas
            </p>
          </div>
          <div className="p-3 sm:p-3.5 sm:px-5">
            <p className="text-xs text-slate-500">Rata-Rata Nilai</p>
            <p className="mt-0.5 text-base font-bold text-indigo-700 tabular-nums">
              {stats.avgScore !== null ? stats.avgScore : '-'}
            </p>
          </div>
          <div className="p-3 sm:p-3.5 sm:px-5">
            <p className="text-xs text-slate-500">Ketuntasan KKM ({settings.kkm})</p>
            <p className="mt-0.5 text-base font-bold text-emerald-700 tabular-nums">
              {subjectGrades.length > 0 ? `${stats.passPct}%` : '-'}
            </p>
          </div>
        </div>

        {/* Rekap per Kelas bar */}
        {classRecap.length > 0 && (
          <div className="px-4 sm:px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-slate-700">Ringkasan per Kelas:</span>
            {classRecap.map((c) => (
              <button
                key={c.className}
                type="button"
                onClick={() => {
                  onClose();
                  onSelectClass(c.className);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 text-slate-800 font-medium cursor-pointer"
                title={`Klik untuk lihat detail kelas ${c.className}`}
              >
                <span className="font-bold">{c.className}</span>
                <span className="text-slate-400">·</span>
                <span className="tabular-nums">{c.journalCount} Jurnal</span>
                {c.avg !== null && (
                  <>
                    <span className="text-slate-400">·</span>
                    <span className="font-semibold text-indigo-700 tabular-nums">Rata2 {c.avg}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="px-4 sm:px-6 pt-3 border-b border-slate-200 flex items-center gap-2 bg-white overflow-x-auto eguru-scroll">
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
            <span>Riwayat Pertemuan & Materi ({subjectJournals.length})</span>
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
            <span>Daftar Nilai Siswa ({subjectGrades.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto eguru-scroll p-4 sm:p-6">
          {activeTab === 'jurnal' ? (
            subjectJournals.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Belum ada jurnal pembelajaran untuk mata pelajaran {subject}.
              </div>
            ) : (
              <div className="space-y-3">
                {subjectJournals.map((j) => {
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
                                onSelectClass(j.className);
                              }}
                              className="font-bold text-indigo-700 hover:underline cursor-pointer"
                            >
                              Kelas {j.className}
                            </button>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 mt-1">{j.topic}</h4>
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
          ) : subjectGrades.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Belum ada nilai tercatat untuk mata pelajaran {subject}.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-x-auto eguru-scroll">
              <table className="w-full min-w-[540px] text-left border-collapse text-xs">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="py-2.5 px-3">Kelas</th>
                    <th className="py-2.5 px-3">Nama Siswa</th>
                    <th className="py-2.5 px-3">Jenis Ujian</th>
                    <th className="py-2.5 px-3 text-right">Nilai</th>
                    <th className="py-2.5 px-4">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {subjectGrades.map((g) => {
                    const st = students.find((s) => s.id === g.studentId);
                    const tuntas = (g.score ?? 0) >= settings.kkm;
                    return (
                      <tr key={g.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onSelectClass(g.className);
                            }}
                            className="font-semibold text-indigo-700 hover:underline cursor-pointer"
                          >
                            {g.className}
                          </button>
                        </td>
                        <td className="py-2.5 px-3">
                          {st ? (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onSelectStudent(st);
                              }}
                              className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline cursor-pointer text-left"
                            >
                              {st.name}
                            </button>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{g.examType}</td>
                        <td
                          className={`py-2.5 px-3 text-right font-bold tabular-nums ${
                            tuntas ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {g.score}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{g.note || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-500 hidden sm:block">
            Klik kelas atau nama siswa untuk membuka detail pop-up lainnya
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto sm:ml-auto">
            {onNavigate && rolePerms.allowedMenus.includes('jurnal') && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigate('jurnal');
                }}
                className="px-3.5 py-2 min-h-[40px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
              >
                {rolePerms.canManageJournals ? 'Catat Jurnal' : 'Lihat Jurnal'}
              </button>
            )}
            {onNavigate && rolePerms.allowedMenus.includes('nilai') && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigate('nilai');
                }}
                className="px-3.5 py-2 min-h-[40px] rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                {rolePerms.canManageGrades ? 'Input Nilai' : 'Lihat Nilai'}
              </button>
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
