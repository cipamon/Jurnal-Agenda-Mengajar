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
import { Copy, FileEdit, FileSpreadsheet, PlusCircle, Printer } from 'lucide-react';
import { GradeRecord, JournalEntry, MenuId, Student, SystemSettings } from '../types';
import { formatTanggalID } from '../utils/helpers';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

interface DashboardViewProps {
  students: Student[];
  journals: JournalEntry[];
  grades: GradeRecord[];
  settings: SystemSettings;
  onNavigate: (menu: MenuId) => void;
  onEditJournal: (journal: JournalEntry) => void;
  onDuplicateJournal: (journal: JournalEntry) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  students,
  journals,
  grades,
  settings,
  onNavigate,
  onEditJournal,
  onDuplicateJournal,
}) => {
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
        backgroundColor: '#4f46e5',
        borderRadius: 6,
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
        backgroundColor: '#0f172a',
        borderRadius: 6,
        maxBarThickness: 42,
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Banner Gradient Indigo-Violet */}
      <section className="rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 text-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-indigo-100">
              {settings.teacherProfile.school} · Tahun Ajaran {settings.academicYear} · Semester{' '}
              {settings.semester}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white [text-wrap:balance]">
              Selamat Datang, {settings.teacherProfile.name}
            </h2>
            <p className="text-sm text-indigo-100 max-w-2xl">
              Pantau ringkasan keaktifan pembelajaran, persentase kehadiran peserta didik, dan capaian nilai kelas
              secara langsung.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('jurnal')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white text-indigo-700 hover:bg-indigo-50 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Catat Jurnal Baru</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('nilai')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-950/50 hover:bg-indigo-950/70 text-white border border-white/20 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Input Nilai</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('laporan')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-950/50 hover:bg-indigo-950/70 text-white border border-white/20 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Laporan</span>
            </button>
          </div>
        </div>
      </section>

      {/* 5 Primary Stat Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500">Total Jurnal</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{stats.totalJournals}</p>
          <p className="mt-1 text-xs text-slate-500">Pertemuan tercatat</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500">Kehadiran (H)</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">{stats.attendancePct}%</p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">{stats.counts.H} hadir tercatat</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500">Rata-Rata Nilai</p>
          <p className="mt-2 text-2xl font-bold text-indigo-700 tabular-nums">{stats.avgScore}</p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">Standar KKM {settings.kkm}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500">Total Siswa</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{stats.totalStudents}</p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">{settings.classes.length} rombongan belajar</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500">Total Ujian Dinilai</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{stats.evaluatedExams}</p>
          <p className="mt-1 text-xs text-slate-500">Sesi evaluasi terinput</p>
        </div>
      </section>

      {/* 3 Interactive Chart.js Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Komposisi Kehadiran</h3>
            <p className="text-xs text-slate-500">Distribusi H, S, I, A, dan D keseluruhan</p>
          </div>
          <div className="h-60 flex items-center justify-center">
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

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Persentase Kehadiran per Kelas</h3>
            <p className="text-xs text-slate-500">Rasio hadir (%) setiap rombongan belajar</p>
          </div>
          <div className="h-60">
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

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Rata-Rata Nilai per Kelas</h3>
            <p className="text-xs text-slate-500">Perbandingan capaian skor seluruh kelas</p>
          </div>
          <div className="h-60">
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

      {/* Bottom Tables: Rekap Kelas + Kegiatan Mengajar Terbaru */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Table 1: Rekap Kehadiran & Nilai per Kelas */}
        <div className="xl:col-span-5 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">Rekap Kehadiran & Nilai Kelas</h3>
            <p className="text-xs text-slate-500">Ringkasan per rombongan belajar aktif</p>
          </div>
          <div className="max-h-[420px] overflow-auto eguru-scroll">
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
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{row.className}</td>
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
        <div className="xl:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Kegiatan Mengajar Terbaru</h3>
              <p className="text-xs text-slate-500">Klik Edit atau Duplikat untuk membuka di modul Jurnal</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('jurnal')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Lihat Semua
            </button>
          </div>
          <div className="max-h-[420px] overflow-auto eguru-scroll">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-900 text-white text-xs">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Tanggal</th>
                  <th className="py-2.5 px-3 font-semibold">Kelas</th>
                  <th className="py-2.5 px-3 font-semibold">Mata Pelajaran & Materi</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {latestJournals.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-slate-500 text-sm">
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
                        {j.className}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 text-xs">{j.subject}</div>
                        <div className="text-xs text-slate-600 line-clamp-1">{j.topic}</div>
                      </td>
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
