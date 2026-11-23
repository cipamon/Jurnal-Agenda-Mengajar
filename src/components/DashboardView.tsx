import React, { useMemo } from 'react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  AlertTriangle,
  Copy,
  FileEdit,
  FileSpreadsheet,
  PlusCircle,
  Printer,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { GradeRecord, JournalEntry, MenuId, Student, SystemSettings, UserRole } from '../types';
import { getUserPhotoUrl } from '../utils/defaultAvatars';
import { formatTanggalID, ROLE_PERMISSIONS } from '../utils/helpers';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

interface DashboardViewProps {
  students: Student[];
  journals: JournalEntry[];
  grades: GradeRecord[];
  settings: SystemSettings;
  currentUserName?: string;
  currentUserRole?: UserRole;
  currentUserGender?: 'L' | 'P';
  currentUserPhoto?: string;
  scopeSummary?: string | null;
  onNavigate: (menu: MenuId) => void;
  onOpenProfileModal?: () => void;
  onEditJournal: (journal: JournalEntry) => void;
  onDuplicateJournal: (journal: JournalEntry) => void;
  onViewStudent?: (student: Student) => void;
  onViewClass?: (className: string) => void;
  onViewSubject?: (subject: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  students,
  journals,
  grades,
  settings,
  currentUserName,
  currentUserRole = 'guru',
  currentUserGender,
  currentUserPhoto,
  scopeSummary,
  onNavigate,
  onOpenProfileModal,
  onEditJournal,
  onDuplicateJournal,
  onViewStudent,
  onViewClass,
  onViewSubject,
}) => {
  const rolePerms = ROLE_PERMISSIONS[currentUserRole];
  const stats = useMemo(() => {
    let totalH = 0;
    let totalS = 0;
    let totalI = 0;
    let totalA = 0;
    let totalD = 0;

    journals.forEach((j) => {
      Object.values(j.attendance).forEach((item) => {
        if (item.status === 'H') totalH++;
        else if (item.status === 'S') totalS++;
        else if (item.status === 'I') totalI++;
        else if (item.status === 'A') totalA++;
        else if (item.status === 'D') totalD++;
      });
    });

    const totalAttendanceMarks = totalH + totalS + totalI + totalA + totalD;
    const attendancePct =
      totalAttendanceMarks > 0 ? Math.round((totalH / totalAttendanceMarks) * 1000) / 10 : 0;

    const validGrades = grades.filter((g) => g.score !== null && !Number.isNaN(g.score));
    const avgScore =
      validGrades.length > 0
        ? Math.round(
            (validGrades.reduce((acc, g) => acc + (g.score ?? 0), 0) / validGrades.length) * 10
          ) / 10
        : 0;

    // Count unique (className + subject + examType) assessments evaluated
    const evaluatedExams = new Set(
      validGrades.map((g) => `${g.className}__${g.subject}__${g.examType}`)
    ).size;

    return {
      totalJournals: journals.length,
      attendancePct,
      avgScore,
      totalStudents: students.length,
      evaluatedExams,
      counts: { H: totalH, S: totalS, I: totalI, A: totalA, D: totalD },
    };
  }, [students, journals, grades]);

  const classRecap = useMemo(() => {
    return settings.classes.map((cls) => {
      const clsStudents = students.filter((s) => s.className === cls);
      const clsJournals = journals.filter((j) => j.className === cls);
      let h = 0;
      let total = 0;
      clsJournals.forEach((j) => {
        Object.values(j.attendance).forEach((item) => {
          total++;
          if (item.status === 'H') h++;
        });
      });
      const attPct = total > 0 ? Math.round((h / total) * 1000) / 10 : 0;

      const clsGrades = grades.filter((g) => g.className === cls && g.score !== null);
      const avgGrade =
        clsGrades.length > 0
          ? Math.round(
              (clsGrades.reduce((acc, g) => acc + (g.score ?? 0), 0) / clsGrades.length) * 10
            ) / 10
          : 0;

      return {
        className: cls,
        studentCount: clsStudents.length,
        journalCount: clsJournals.length,
        attPct,
        avgGrade,
      };
    });
  }, [settings.classes, students, journals, grades]);

  const latestJournals = useMemo(() => {
    return [...journals].sort((a, b) => b.date.localeCompare(a.date));
  }, [journals]);

  const atRiskStudents = useMemo(() => {
    const kkm = settings.kkm || 75;
    const journalsByClass = new Map<string, JournalEntry[]>();
    journals.forEach((j) => {
      const list = journalsByClass.get(j.className) || [];
      list.push(j);
      journalsByClass.set(j.className, list);
    });

    const gradesByStudent = new Map<string, number[]>();
    grades.forEach((g) => {
      if (g.score !== null && !Number.isNaN(g.score)) {
        const list = gradesByStudent.get(g.studentId) || [];
        list.push(g.score);
        gradesByStudent.set(g.studentId, list);
      }
    });

    const flagged: Array<{
      student: Student;
      attPct: number | null;
      alphaCount: number;
      avgGrade: number | null;
      reasons: string[];
      severity: number;
    }> = [];

    students.forEach((st) => {
      const clsJournals = journalsByClass.get(st.className) || [];
      let hdCount = 0;
      let alphaCount = 0;
      clsJournals.forEach((j) => {
        const status = j.attendance[st.id]?.status ?? 'H';
        if (status === 'H' || status === 'D') hdCount++;
        if (status === 'A') alphaCount++;
      });

      const attPct =
        clsJournals.length > 0 ? Math.round((hdCount / clsJournals.length) * 100) : null;
      const stuScores = gradesByStudent.get(st.id) || [];
      const avgGrade =
        stuScores.length > 0
          ? Math.round((stuScores.reduce((a, b) => a + b, 0) / stuScores.length) * 10) / 10
          : null;

      const reasons: string[] = [];
      let severity = 0;
      if (attPct !== null && attPct < 85) {
        reasons.push(`Kehadiran ${attPct}% (<85%)`);
        severity += 2;
      }
      if (alphaCount >= 3) {
        reasons.push(`Alpha ${alphaCount}×`);
        severity += 3;
      }
      if (avgGrade !== null && avgGrade < kkm) {
        reasons.push(`Rata-rata ${avgGrade} (< KKM ${kkm})`);
        severity += 2;
      }

      if (reasons.length > 0) {
        flagged.push({
          student: st,
          attPct,
          alphaCount,
          avgGrade,
          reasons,
          severity,
        });
      }
    });

    return flagged.sort((a, b) => b.severity - a.severity || a.student.name.localeCompare(b.student.name));
  }, [students, journals, grades, settings.kkm]);

  const doughnutData = {
    labels: ['Hadir (H)', 'Sakit (S)', 'Izin (I)', 'Alpha (A)', 'Dispen (D)'],
    datasets: [
      {
        data: [stats.counts.H, stats.counts.S, stats.counts.I, stats.counts.A, stats.counts.D],
        backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'],
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  };

  const barAttendanceData = {
    labels: classRecap.map((c) => c.className),
    datasets: [
      {
        label: 'Kehadiran (%)',
        data: classRecap.map((c) => c.attPct),
        backgroundColor: '#2563eb',
        borderRadius: 10,
        maxBarThickness: 42,
      },
    ],
  };

  const barGradeData = {
    labels: classRecap.map((c) => c.className),
    datasets: [
      {
        label: 'Rata-Rata Nilai',
        data: classRecap.map((c) => c.avgGrade),
        backgroundColor: '#0f1d3d',
        borderRadius: 10,
        maxBarThickness: 42,
      },
    ],
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Banner Gradient Dinamis sesuai Tema */}
      <section className="eguru-hero-gradient relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white p-5 sm:p-6 lg:p-8 shadow-sm">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full bg-white/15 blur-2xl"
        />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 sm:gap-6">
          <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0">
            <img
              src={getUserPhotoUrl({
                photoDataUrl:
                  currentUserPhoto ||
                  (currentUserRole === 'guru' ? settings.teacherProfile.photoDataUrl : ''),
                role: currentUserRole,
                gender: currentUserGender || settings.teacherProfile.gender || 'P',
              })}
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = getUserPhotoUrl({
                  photoDataUrl: '',
                  role: currentUserRole,
                  gender: currentUserGender || settings.teacherProfile.gender || 'P',
                });
              }}
              alt={currentUserName || settings.teacherProfile.name}
              className="w-13 h-13 sm:w-16 sm:h-16 rounded-2xl object-cover object-top border-2 border-white/60 bg-white shrink-0 shadow-[0_10px_24px_rgba(15,23,42,0.28)]"
            />
            <div className="space-y-1 min-w-0">
              <p className="text-[11px] sm:text-xs font-medium text-blue-100 leading-snug">
                {settings.teacherProfile.school} · TA {settings.academicYear} · Semester{' '}
                {settings.semester}
              </p>
              <h2 className="text-xl sm:text-3xl font-bold tracking-tight text-white [text-wrap:balance] leading-snug">
                Selamat Datang, {currentUserName || settings.teacherProfile.name}
              </h2>
              <p className="text-xs sm:text-sm text-blue-100/95 max-w-2xl leading-relaxed">
                Pantau ringkasan keaktifan pembelajaran, persentase kehadiran peserta didik, dan capaian nilai kelas
                secara langsung.
              </p>
              {scopeSummary && (
                <p className="text-xs text-blue-100/95 pt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-white">Tanggung Jawab Aktif</span>
                  <span aria-hidden="true">·</span>
                  <span>{scopeSummary}</span>
                  {onOpenProfileModal && (
                    <>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={onOpenProfileModal}
                        className="underline font-semibold text-white hover:text-blue-100 cursor-pointer"
                      >
                        Atur Kelas &amp; Mapel
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
            {rolePerms.canManageJournals && rolePerms.allowedMenus.includes('jurnal') && (
              <button
                type="button"
                onClick={() => onNavigate('jurnal')}
                className="flex items-center justify-center gap-2 min-h-[42px] px-4 py-2.5 rounded-full sm:rounded-2xl bg-white text-blue-700 hover:bg-blue-50 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-[0_8px_20px_rgba(15,23,42,0.22),inset_0_1px_1px_rgba(255,255,255,0.95)]"
              >
                <PlusCircle className="w-4 h-4 shrink-0" />
                <span>Catat Jurnal</span>
              </button>
            )}
            {rolePerms.canManageGrades && rolePerms.allowedMenus.includes('nilai') && (
              <button
                type="button"
                onClick={() => onNavigate('nilai')}
                className="flex items-center justify-center gap-2 min-h-[42px] px-4 py-2.5 rounded-full sm:rounded-2xl bg-slate-950/35 hover:bg-slate-950/55 backdrop-blur-md text-white border border-white/25 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-[0_6px_16px_rgba(15,23,42,0.2)]"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>Input Nilai</span>
              </button>
            )}
            {rolePerms.allowedMenus.includes('siswa') && !rolePerms.canManageJournals && (
              <button
                type="button"
                onClick={() => onNavigate('siswa')}
                className="flex items-center justify-center gap-2 min-h-[42px] px-4 py-2.5 rounded-full sm:rounded-2xl bg-white text-blue-700 hover:bg-blue-50 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-[0_8px_20px_rgba(15,23,42,0.22)]"
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>{rolePerms.canManageStudents ? 'Kelola Siswa' : 'Lihat Data Siswa'}</span>
              </button>
            )}
            {rolePerms.allowedMenus.includes('laporan') && (
              <button
                type="button"
                onClick={() => onNavigate('laporan')}
                className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 min-h-[42px] px-4 py-2.5 rounded-full sm:rounded-2xl bg-slate-950/35 hover:bg-slate-950/55 backdrop-blur-md text-white border border-white/25 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-[0_6px_16px_rgba(15,23,42,0.2)]"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>Cetak Laporan</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 5 Primary Stat Cards */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">Total Jurnal</p>
          <p className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
            {stats.totalJournals}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500">Pertemuan tercatat</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">Kehadiran (H)</p>
          <p className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums">
            {stats.attendancePct}%
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 tabular-nums">
            {stats.counts.H} hadir tercatat
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">Rata-Rata Nilai</p>
          <p className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-bold text-indigo-700 tabular-nums">
            {stats.avgScore}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 tabular-nums">
            Standar KKM {settings.kkm}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">Total Siswa</p>
          <p className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
            {stats.totalStudents}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 tabular-nums">
            {settings.classes.length} rombongan belajar
          </p>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">Total Ujian Dinilai</p>
          <p className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
            {stats.evaluatedExams}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500">Sesi evaluasi terinput</p>
        </div>
      </section>

      {/* 3 Interactive Chart.js Charts */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="min-w-0 bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col">
          <div className="mb-3 sm:mb-4">
            <h3 className="text-sm font-bold text-slate-900">Komposisi Kehadiran</h3>
            <p className="text-xs text-slate-500">Distribusi H, S, I, A, dan D keseluruhan</p>
          </div>
          <div className="h-56 sm:h-60 flex items-center justify-center">
            <Doughnut
              data={doughnutData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                },
                cutout: '62%',
              }}
            />
          </div>
        </div>

        <div className="min-w-0 bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col">
          <div className="mb-3 sm:mb-4">
            <h3 className="text-sm font-bold text-slate-900">Persentase Kehadiran per Kelas</h3>
            <p className="text-xs text-slate-500">Rasio hadir (%) setiap rombongan belajar</p>
          </div>
          <div className="h-56 sm:h-60">
            <Bar
              data={barAttendanceData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } },
                },
              }}
            />
          </div>
        </div>

        <div className="min-w-0 md:col-span-2 lg:col-span-1 bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col">
          <div className="mb-3 sm:mb-4">
            <h3 className="text-sm font-bold text-slate-900">Rata-Rata Nilai per Kelas</h3>
            <p className="text-xs text-slate-500">Perbandingan capaian skor seluruh kelas</p>
          </div>
          <div className="h-56 sm:h-60">
            <Bar
              data={barGradeData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, max: 100 },
                },
              }}
            />
          </div>
        </div>
      </section>

      {/* Early Warning System: Deteksi Dini Siswa Rawan */}
      <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                atRiskStudents.length > 0
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {atRiskStudents.length > 0 ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">
                Deteksi Dini Siswa Rawan (Early Warning System)
              </h3>
              <p className="text-xs text-slate-500">
                Memantau siswa dengan kehadiran &lt; 85%, Alpha &ge; 3, atau rata-rata nilai &lt; KKM {settings.kkm || 75}
              </p>
            </div>
          </div>
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums shrink-0 ${
              atRiskStudents.length > 0
                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
            }`}
          >
            {atRiskStudents.length > 0
              ? `${atRiskStudents.length} Siswa Perlu Perhatian`
              : 'Semua Siswa Aman'}
          </span>
        </div>

        {atRiskStudents.length === 0 ? (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
            Belum ada siswa yang terindikasi rawan kehadiran maupun capaian di bawah KKM saat ini.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[280px] overflow-y-auto eguru-scroll pr-0.5">
            {atRiskStudents.map((item) => (
              <button
                key={item.student.id}
                type="button"
                onClick={() => onViewStudent?.(item.student)}
                className="text-left p-3 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-100/70 transition-colors cursor-pointer space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{item.student.name}</p>
                    <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {item.student.className} · NIS {item.student.nis}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 shrink-0">
                    Perhatian
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {item.reasons.map((r) => (
                    <span
                      key={r}
                      className="px-2 py-0.5 rounded bg-white border border-amber-200 text-[11px] font-semibold text-amber-900 tabular-nums"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Bottom Tables: Rekap Kelas + Kegiatan Mengajar Terbaru */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5">
        {/* Table 1: Rekap Kehadiran & Nilai per Kelas */}
        <div className="min-w-0 xl:col-span-5 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">Rekap Kehadiran &amp; Nilai Kelas</h3>
            <p className="text-xs text-slate-500">Ringkasan per rombongan belajar aktif</p>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden divide-y divide-slate-200 max-h-[380px] overflow-y-auto eguru-scroll">
            {classRecap.map((row) => (
              <div key={row.className} className="p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {onViewClass ? (
                    <button
                      type="button"
                      onClick={() => onViewClass(row.className)}
                      className="font-bold text-sm text-indigo-700 hover:underline cursor-pointer text-left"
                    >
                      {row.className}
                    </button>
                  ) : (
                    <div className="font-bold text-sm text-slate-900">{row.className}</div>
                  )}
                  <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                    {row.studentCount} siswa · {row.journalCount} jurnal
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0 tabular-nums">
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                      Hadir
                    </div>
                    <div className="text-xs font-bold text-emerald-700">{row.attPct}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                      Rata-rata
                    </div>
                    <div className="text-xs font-bold text-indigo-700">{row.avgGrade}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop/Tablet Table */}
          <div className="hidden md:block max-h-[420px] overflow-auto eguru-scroll">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-900 text-white text-xs">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Kelas</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Siswa</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Jurnal</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Hadir</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Rata-rata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {classRecap.map((row) => (
                  <tr key={row.className} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-semibold text-slate-900">
                      {onViewClass ? (
                        <button
                          type="button"
                          onClick={() => onViewClass(row.className)}
                          className="font-semibold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer text-left"
                          title={`Klik untuk lihat detail kelas ${row.className}`}
                        >
                          {row.className}
                        </button>
                      ) : (
                        row.className
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">{row.studentCount}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">{row.journalCount}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-medium text-emerald-700">
                      {row.attPct}%
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-indigo-700">
                      {row.avgGrade}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Kegiatan Mengajar Terbaru */}
        <div className="min-w-0 xl:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">Kegiatan Mengajar Terbaru</h3>
              <p className="text-xs text-slate-500">
                {rolePerms.canManageJournals
                  ? 'Klik Edit atau Duplikat untuk membuka di modul Jurnal'
                  : 'Pemantauan aktivitas KBM terbaru'}
              </p>
            </div>
            {rolePerms.allowedMenus.includes('jurnal') && (
              <button
                type="button"
                onClick={() => onNavigate('jurnal')}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap shrink-0 cursor-pointer py-1"
              >
                Lihat Semua
              </button>
            )}
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden divide-y divide-slate-200 max-h-[440px] overflow-y-auto eguru-scroll">
            {latestJournals.length === 0 ? (
              <div className="py-10 px-4 text-center text-slate-500 text-sm">
                Belum ada jurnal mengajar tersimpan.
              </div>
            ) : (
              latestJournals.map((j) => (
                <div key={j.id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                        <span className="font-semibold text-slate-700">{formatTanggalID(j.date)}</span>
                        <span>·</span>
                        <span>Jam {j.period}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        {onViewClass ? (
                          <button
                            type="button"
                            onClick={() => onViewClass(j.className)}
                            className="font-bold text-slate-900 hover:text-indigo-600 hover:underline cursor-pointer"
                          >
                            {j.className}
                          </button>
                        ) : (
                          <span className="font-bold text-slate-900">{j.className}</span>
                        )}
                        <span className="text-slate-300">•</span>
                        {onViewSubject ? (
                          <button
                            type="button"
                            onClick={() => onViewSubject(j.subject)}
                            className="font-semibold text-indigo-700 hover:underline text-left cursor-pointer"
                          >
                            {j.subject}
                          </button>
                        ) : (
                          <span className="font-semibold text-slate-900">{j.subject}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">{j.topic}</p>
                  {rolePerms.canManageJournals && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onEditJournal(j)}
                        className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicateJournal(j)}
                        className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Duplikat</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Desktop/Tablet Table */}
          <div className="hidden md:block max-h-[420px] overflow-auto eguru-scroll">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-900 text-white text-xs">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Tanggal</th>
                  <th className="py-2.5 px-3 font-semibold">Kelas</th>
                  <th className="py-2.5 px-3 font-semibold">Mata Pelajaran &amp; Materi</th>
                  {rolePerms.canManageJournals && (
                    <th className="py-2.5 px-4 font-semibold text-right">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {latestJournals.length === 0 ? (
                  <tr>
                    <td
                      colSpan={rolePerms.canManageJournals ? 4 : 3}
                      className="py-10 text-center text-slate-500 text-sm"
                    >
                      Belum ada jurnal mengajar tersimpan.
                    </td>
                  </tr>
                ) : (
                  latestJournals.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 whitespace-nowrap text-xs text-slate-600 tabular-nums">
                        <div>{formatTanggalID(j.date)}</div>
                        <div className="text-slate-400">Jam {j.period}</div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-semibold text-slate-900 text-xs">
                        {onViewClass ? (
                          <button
                            type="button"
                            onClick={() => onViewClass(j.className)}
                            className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline cursor-pointer"
                            title={`Klik untuk lihat detail kelas ${j.className}`}
                          >
                            {j.className}
                          </button>
                        ) : (
                          j.className
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {onViewSubject ? (
                          <button
                            type="button"
                            onClick={() => onViewSubject(j.subject)}
                            className="font-semibold text-indigo-700 hover:text-indigo-900 hover:underline text-xs text-left cursor-pointer"
                            title={`Klik untuk lihat detail mata pelajaran ${j.subject}`}
                          >
                            {j.subject}
                          </button>
                        ) : (
                          <div className="font-semibold text-slate-900 text-xs">{j.subject}</div>
                        )}
                        <div className="text-xs text-slate-600 line-clamp-1">{j.topic}</div>
                      </td>
                      {rolePerms.canManageJournals && (
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onEditJournal(j)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 cursor-pointer"
                              title="Edit jurnal"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDuplicateJournal(j)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                              title="Duplikat jurnal"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Duplikat</span>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
