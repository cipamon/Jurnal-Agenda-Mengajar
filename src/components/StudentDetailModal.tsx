import React, { useEffect, useMemo, useState } from 'react';
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  ExternalLink,
  FileEdit,
  FileSpreadsheet,
  FileText,
  Lock,
  MapPin,
  Phone,
  Printer,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import {
  AppUser,
  GradeRecord,
  JournalEntry,
  KopSuratTextStyle,
  PrintFontFamily,
  Student,
  SystemSettings,
} from '../types';
import { getStudentPhotoUrl, hasRealPhoto } from '../utils/defaultAvatars';
import { exportStudentIndividualPdf } from '../utils/exportReports';
import {
  ATTENDANCE_META,
  formatStudentTtl,
  formatTanggalID,
  getPaperSizeMeta,
  getPrintFontCss,
  getTodayIso,
  normalizeKopSurat,
  normalizeSignatureStamp,
  PRINT_FONT_OPTIONS,
  resolveEffectiveTeacherSignature,
  ROW_MARKER_META,
  STUDENT_STATUS_LABELS,
} from '../utils/helpers';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface StudentDetailModalProps {
  student: Student | null;
  journals: JournalEntry[];
  grades: GradeRecord[];
  settings: SystemSettings;
  activeUser?: AppUser;
  canEditStudent?: boolean;
  onEditStudent?: (student: Student) => void;
  onViewClass?: (className: string) => void;
  onViewSubject?: (subject: string) => void;
  onNotify?: (msg: string) => void;
  onClose: () => void;
}

function getKopLineStyleObj(fontSize: number, style?: KopSuratTextStyle): React.CSSProperties {
  return {
    fontSize,
    fontWeight: style?.bold ? 700 : 400,
    fontStyle: style?.italic ? 'italic' : 'normal',
    textDecoration: style?.underline ? 'underline' : 'none',
  };
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  student,
  journals,
  grades,
  settings,
  activeUser,
  canEditStudent = true,
  onEditStudent,
  onViewClass,
  onViewSubject,
  onNotify,
  onClose,
}) => {
  const sigStamp = useMemo(() => normalizeSignatureStamp(settings), [settings]);
  const effectiveTeacherSig = useMemo(
    () => resolveEffectiveTeacherSignature(settings, activeUser),
    [settings, activeUser]
  );
  const isFormatLocked = settings.lockReportFormat ?? true;
  const paperMeta = useMemo(
    () => getPaperSizeMeta(settings.reportPaperSize),
    [settings.reportPaperSize]
  );
  const adminFont: PrintFontFamily =
    settings.reportFontFamily || normalizeKopSurat(settings.kopSurat).fontFamily || 'Times New Roman';

  const [activeTab, setActiveTab] = useState<'aktivitas' | 'nilai'>('aktivitas');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showPrincipalSig, setShowPrincipalSig] = useState(false);
  const [showTeacherSig, setShowTeacherSig] = useState(true);
  const [showPrincipalSigImg, setShowPrincipalSigImg] = useState<boolean>(
    sigStamp.showPrincipalSigImgDefault !== false
  );
  const [showTeacherSigImg, setShowTeacherSigImg] = useState<boolean>(
    sigStamp.showTeacherSigImgDefault !== false
  );
  const [showStampImg, setShowStampImg] = useState<boolean>(sigStamp.showStampDefault);
  const [printFont, setPrintFont] = useState<PrintFontFamily>(adminFont);
  const effectiveFont: PrintFontFamily = isFormatLocked ? adminFont : printFont;

  useEffect(() => {
    if (!student) return;
    setActiveTab('aktivitas');
    setShowPrincipalSigImg(sigStamp.showPrincipalSigImgDefault !== false);
    setShowTeacherSigImg(sigStamp.showTeacherSigImgDefault !== false);
    setShowStampImg(sigStamp.showStampDefault);
    setPrintFont(adminFont);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    student,
    onClose,
    sigStamp.showPrincipalSigImgDefault,
    sigStamp.showTeacherSigImgDefault,
    sigStamp.showStampDefault,
    adminFont,
  ]);

  const studentJournals = useMemo(() => {
    if (!student) return [];
    return journals
      .filter((j) => j.className === student.className)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [student, journals]);

  const studentGrades = useMemo(() => {
    if (!student) return [];
    return grades
      .filter((g) => g.studentId === student.id && g.score !== null)
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }, [student, grades]);

  const summary = useMemo(() => {
    if (!student) {
      return { H: 0, S: 0, I: 0, A: 0, D: 0, pct: 0, avgScore: null as number | null };
    }
    let H = 0;
    let S = 0;
    let I = 0;
    let A = 0;
    let D = 0;
    studentJournals.forEach((j) => {
      const st = j.attendance[student.id]?.status ?? 'H';
      if (st === 'H') H++;
      else if (st === 'S') S++;
      else if (st === 'I') I++;
      else if (st === 'A') A++;
      else if (st === 'D') D++;
    });
    const total = studentJournals.length;
    const pct = total > 0 ? Math.round(((H + D) / total) * 100) : 0;

    const validScores = studentGrades
      .map((g) => g.score)
      .filter((sc): sc is number => sc !== null);
    const avgScore =
      validScores.length > 0
        ? Math.round((validScores.reduce((acc, v) => acc + v, 0) / validScores.length) * 10) / 10
        : null;

    return { H, S, I, A, D, pct, avgScore };
  }, [student, studentJournals, studentGrades]);

  const gradeChartData = useMemo(() => {
    if (!student) return null;
    const examLabels = settings.examTypes.length > 0 ? settings.examTypes : ['UH 1', 'PTS', 'PAS'];
    const studentPoints: (number | null)[] = [];
    const classAvgPoints: (number | null)[] = [];

    examLabels.forEach((ex) => {
      const stuScores = studentGrades
        .filter((g) => g.examType === ex && g.score !== null)
        .map((g) => g.score as number);
      studentPoints.push(
        stuScores.length > 0
          ? Math.round((stuScores.reduce((a, b) => a + b, 0) / stuScores.length) * 10) / 10
          : null
      );

      const clsScores = grades
        .filter(
          (g) => g.className === student.className && g.examType === ex && g.score !== null
        )
        .map((g) => g.score as number);
      classAvgPoints.push(
        clsScores.length > 0
          ? Math.round((clsScores.reduce((a, b) => a + b, 0) / clsScores.length) * 10) / 10
          : null
      );
    });

    const hasAnyPoint = studentPoints.some((v) => v !== null) || classAvgPoints.some((v) => v !== null);
    if (!hasAnyPoint) return null;

    return {
      labels: examLabels,
      datasets: [
        {
          label: `Nilai ${student.name}`,
          data: studentPoints,
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.18)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#4f46e5',
          tension: 0.25,
          spanGaps: true,
        },
        {
          label: `Rata-rata Kelas ${student.className}`,
          data: classAvgPoints,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 3.5,
          pointBackgroundColor: '#10b981',
          tension: 0.25,
          spanGaps: true,
        },
      ],
    };
  }, [student, settings.examTypes, studentGrades, grades]);

  if (!student) return null;

  const photoSrc = getStudentPhotoUrl(student);
  const fallbackPhotoSrc = getStudentPhotoUrl({ photoDataUrl: '', gender: student.gender });
  const normKop = normalizeKopSurat(settings.kopSurat);
  const effectiveTeacherName = activeUser?.name || settings.teacherProfile.name;
  const effectiveTeacherNip = activeUser?.nip || settings.teacherProfile.nip;

  const handleDownloadPdf = async () => {
    setExportingPdf(true);
    try {
      await exportStudentIndividualPdf(student, journals, grades, settings, {
        showPrincipalSig,
        showTeacherSig,
        showStamp: showStampImg,
        showStampImg,
        showPrincipalSigImg,
        showTeacherSigImg,
        teacherSignatureOverride: effectiveTeacherSig.teacherSignatureDataUrl
          ? {
              dataUrl: effectiveTeacherSig.teacherSignatureDataUrl,
              size: effectiveTeacherSig.teacherSignatureSize,
              offsetX: effectiveTeacherSig.teacherSigOffsetX,
              offsetY: effectiveTeacherSig.teacherSigOffsetY,
              teacherName: effectiveTeacherName,
              teacherNip: effectiveTeacherNip,
            }
          : {
              dataUrl: '',
              teacherName: effectiveTeacherName,
              teacherNip: effectiveTeacherNip,
            },
        fontFamily: effectiveFont,
        paperSize: paperMeta.id,
      });
      onNotify?.(`PDF individu untuk ${student.name} (${paperMeta.id} · ${effectiveFont}) berhasil diunduh.`);
    } catch {
      onNotify?.('Gagal membuat PDF profil siswa.');
    } finally {
      setExportingPdf(false);
    }
  };

  const handlePrintIndividual = () => {
    window.print();
  };

  return (
    <>
      <div
        className="no-print fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/60 backdrop-blur-[1px]"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-modal-title"
      >
        <div
          className="w-full max-w-3xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with Photo & Identity */}
          <div className="px-4 py-4 sm:px-6 sm:py-5 bg-slate-900 text-white flex items-start justify-between gap-2.5 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-white border border-indigo-400/40 flex items-center justify-center shrink-0 overflow-hidden">
                <img
                  src={photoSrc}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = fallbackPhotoSrc;
                  }}
                  alt={`Foto ${student.name}`}
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div className="min-w-0">
                <h2 id="student-modal-title" className="text-sm sm:text-lg font-bold text-white truncate">
                  {student.name}
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-300 font-mono tabular-nums mt-0.5 break-words">
                  {onViewClass ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onViewClass(student.className);
                      }}
                      className="underline decoration-indigo-400 hover:text-white cursor-pointer"
                      title={`Klik untuk lihat detail kelas ${student.className}`}
                    >
                      Kelas {student.className}
                    </button>
                  ) : (
                    <>Kelas {student.className}</>
                  )}{' '}
                  · Absen {student.absenNo || '-'} · NIS {student.nis}
                  {student.nisn ? ` · NISN ${student.nisn}` : ''}
                </p>
                <p className="text-[11px] sm:text-xs text-indigo-300 mt-0.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {STUDENT_STATUS_LABELS[student.status || 'aktif']} ·{' '}
                    {student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                    {student.enrollmentYear ? ` · Masuk ${student.enrollmentYear}` : ''}
                    {hasRealPhoto(student.photoDataUrl) ? ' · Foto Asli' : ' · Foto Dummy'}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {canEditStudent && onEditStudent && (
                <button
                  type="button"
                  onClick={() => onEditStudent(student)}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 min-h-[38px] rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-100 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <FileEdit className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Edit Biodata</span>
                  <span className="sm:hidden">Edit</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
                aria-label="Tutup informasi siswa"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Biodata Lengkap Siswa */}
          <div className="px-4 sm:px-6 py-4 bg-white border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 text-xs">
            <div className="flex items-start gap-2.5 min-w-0">
              <Calendar className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-slate-500 font-medium">Tempat, Tanggal Lahir</p>
                <p className="text-slate-900 font-semibold mt-0.5 break-words">
                  {formatStudentTtl(student) || 'Belum diisi'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 min-w-0">
              <Phone className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-slate-500 font-medium">No. HP &amp; Email Siswa</p>
                <p className="text-slate-900 font-semibold mt-0.5 font-mono">
                  {student.phone || 'Belum diisi'}
                </p>
                <p className="text-slate-500 break-all">{student.email || '-'}</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 min-w-0">
              <UserCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-slate-500 font-medium">Wali Kelas &amp; Guru BK</p>
                <p className="text-slate-900 font-semibold mt-0.5 break-words">
                  WK: {student.homeroomTeacher || 'Belum ditentukan'}
                </p>
                <p className="text-slate-500 break-words">
                  BK: {student.counselor || 'Belum ditentukan'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 min-w-0 sm:col-span-2 lg:col-span-3 pt-2 border-t border-slate-100">
              <MapPin className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-slate-500 font-medium">Alamat Tempat Tinggal</p>
                <p className="text-slate-900 font-semibold mt-0.5 break-words">
                  {student.address || 'Belum diisi'}
                </p>
              </div>
            </div>
          </div>

          {/* Summary Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-200 bg-slate-50 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-3 sm:p-3.5 sm:px-5">
              <p className="text-xs text-slate-500">Pertemuan Kelas</p>
              <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
                {studentJournals.length} Sesi
              </p>
            </div>
            <div className="p-3 sm:p-3.5 sm:px-5">
              <p className="text-xs text-slate-500">Persentase Kehadiran</p>
              <p className="mt-0.5 text-base font-bold text-emerald-700 tabular-nums">{summary.pct}%</p>
            </div>
            <div className="p-3 sm:p-3.5 sm:px-5">
              <p className="text-xs text-slate-500">Rincian Presensi</p>
              <p className="mt-1 text-xs font-mono font-semibold text-slate-800 tabular-nums">
                H:{summary.H} S:{summary.S} I:{summary.I} A:{summary.A} D:{summary.D}
              </p>
            </div>
            <div className="p-3 sm:p-3.5 sm:px-5">
              <p className="text-xs text-slate-500">Rata-Rata Nilai (KKM {settings.kkm})</p>
              <p
                className={`mt-0.5 text-base font-bold tabular-nums ${
                  summary.avgScore === null
                    ? 'text-slate-400'
                    : summary.avgScore >= settings.kkm
                      ? 'text-indigo-700'
                      : 'text-amber-700'
                }`}
              >
                {summary.avgScore !== null ? summary.avgScore : '-'}
              </p>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="px-4 sm:px-6 pt-3 border-b border-slate-200 flex items-center gap-2 bg-white overflow-x-auto eguru-scroll">
            <button
              type="button"
              onClick={() => setActiveTab('aktivitas')}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[40px] text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'aktivitas'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>Aktivitas & Kehadiran di Kelas ({studentJournals.length})</span>
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
              <span>Riwayat Nilai & Evaluasi ({studentGrades.length})</span>
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto eguru-scroll p-4 sm:p-6">
            {activeTab === 'aktivitas' ? (
              studentJournals.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Belum ada catatan pertemuan atau aktivitas KBM di kelas {student.className}.
                </div>
              ) : (
                <div className="space-y-3">
                  {studentJournals.map((j) => {
                    const item = j.attendance[student.id] ?? { status: 'H', note: '' };
                    const meta = ATTENDANCE_META[item.status];
                    return (
                      <div
                        key={j.id}
                        className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/70 transition-colors"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                              <span className="font-semibold text-slate-900">{formatTanggalID(j.date)}</span>
                              <span aria-hidden="true">·</span>
                              <span>Jam ke-{j.period}</span>
                              <span aria-hidden="true">·</span>
                              {onViewSubject ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onViewSubject(j.subject);
                                  }}
                                  className="font-semibold text-indigo-700 hover:underline cursor-pointer"
                                >
                                  {j.subject}
                                </button>
                              ) : (
                                <span className="font-semibold text-indigo-700">{j.subject}</span>
                              )}
                              {j.teacherName && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{j.teacherName}</span>
                                </>
                              )}
                              {(j.academicYear || j.semester) && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    {j.academicYear || settings.academicYear} ({j.semester || settings.semester})
                                  </span>
                                </>
                              )}
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 pt-0.5">
                              <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{j.topic}</span>
                            </h4>
                          </div>

                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-bold whitespace-nowrap ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
                          >
                            {meta.shortLabel} — {meta.label}
                          </span>
                        </div>

                        <p className="mt-2 text-xs text-slate-600 leading-relaxed">{j.activities}</p>

                        {j.learningObjective && (
                          <p className="mt-1.5 text-[11px] font-medium text-indigo-700">
                            TP: {j.learningObjective}
                          </p>
                        )}

                        {j.materialUrl && /^https?:\/\//i.test(j.materialUrl) && (
                          <a
                            href={j.materialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Buka Bahan Ajar / Modul</span>
                          </a>
                        )}

                        {item.note && (
                          <p className="mt-2 text-xs text-slate-700 bg-slate-100 px-3 py-1.5 rounded-md">
                            <span className="font-semibold">Catatan Guru:</span> {item.note}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : studentGrades.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Belum ada nilai ujian yang diinput untuk siswa ini.
              </div>
            ) : (
              <div className="space-y-4">
                {gradeChartData && (
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          Grafik Perkembangan Nilai Siswa vs Rata-rata Kelas
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Perbandingan capaian {student.name} terhadap rata-rata kelas {student.className} (KKM {settings.kkm})
                        </p>
                      </div>
                    </div>
                    <div className="h-52">
                      <Line
                        data={gradeChartData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                          },
                          scales: {
                            y: { beginAtZero: true, max: 100 },
                          },
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="border border-slate-200 rounded-xl overflow-x-auto eguru-scroll">
                  <table className="w-full min-w-[540px] text-left border-collapse">
                    <thead className="bg-slate-900 text-white text-xs">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Mata Pelajaran</th>
                        <th className="py-2.5 px-3 font-semibold">Jenis Ujian</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Nilai</th>
                        <th className="py-2.5 px-3 font-semibold">Status Pembinaan</th>
                        <th className="py-2.5 px-4 font-semibold">Catatan Guru</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {studentGrades.map((g) => {
                        const mk = ROW_MARKER_META[g.marker || 'neutral'];
                        return (
                          <tr key={g.id} className={mk.rowBgClass}>
                            <td className="py-2.5 px-4 font-semibold text-slate-900">
                              {onViewSubject ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onViewSubject(g.subject);
                                  }}
                                  className="font-semibold text-indigo-700 hover:underline cursor-pointer text-left"
                                >
                                  {g.subject}
                                </button>
                              ) : (
                                g.subject
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">{g.examType}</td>
                            <td className="py-2.5 px-3 text-right font-bold tabular-nums text-slate-900">
                              {g.score}
                            </td>
                            <td className={`py-2.5 px-3 font-semibold ${mk.textClass}`}>{mk.label}</td>
                            <td className="py-2.5 px-4 text-slate-600">{g.note || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer with Print Font & TTD/Stempel toggles */}
          <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs text-slate-700">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-500">Format:</span>
                {isFormatLocked ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
                    <Lock className="w-3 h-3 text-slate-500" />
                    <span>
                      {effectiveFont} · {paperMeta.id} (Terkunci Admin)
                    </span>
                  </span>
                ) : (
                  <div className="inline-flex items-center gap-1.5">
                    <select
                      value={printFont}
                      onChange={(e) => setPrintFont(e.target.value as PrintFontFamily)}
                      className="px-2 py-1 text-xs rounded-md border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    >
                      {PRINT_FONT_OPTIONS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] font-semibold text-slate-500">· {paperMeta.id}</span>
                  </div>
                )}
              </div>
              <label className="inline-flex items-center gap-1.5 font-medium cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={showTeacherSig}
                  onChange={(e) => setShowTeacherSig(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Blok Guru</span>
              </label>
              <label className="inline-flex items-center gap-1.5 font-medium cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={showPrincipalSig}
                  onChange={(e) => setShowPrincipalSig(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Blok Kepsek</span>
              </label>
              <label className="inline-flex items-center gap-1.5 font-medium cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={showTeacherSigImg}
                  onChange={(e) => setShowTeacherSigImg(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Gbr TTD Guru</span>
              </label>
              <label className="inline-flex items-center gap-1.5 font-medium cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={showPrincipalSigImg}
                  onChange={(e) => setShowPrincipalSigImg(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Gbr TTD Kepsek</span>
              </label>
              <label className="inline-flex items-center gap-1.5 font-medium cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={showStampImg}
                  onChange={(e) => setShowStampImg(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Gbr Stempel</span>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto lg:ml-auto">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={exportingPdf}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{exportingPdf ? 'Membuat PDF...' : 'Unduh PDF'}</span>
              </button>
              <button
                type="button"
                onClick={handlePrintIndividual}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Individu</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="col-span-2 sm:col-span-1 px-4 py-2 min-h-[40px] rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap text-center"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PRINT-ONLY A4 SHEET FOR INDIVIDUAL STUDENT REPORT */}
      {/* ===================================================================== */}
      <section
        id="student-individual-print-sheet"
        style={{ fontFamily: getPrintFontCss(effectiveFont) }}
        className="hidden print:block print-only-container bg-white text-slate-950 p-2"
      >
        <style>{`@media print { @page { size: ${paperMeta.cssPageSize} portrait; margin: 12mm; } }`}</style>

        {/* Kop Surat Dinas */}
        <div className="mb-5 pb-2 border-b-[3px] border-double border-slate-900">
          <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-900">
            <div
              style={{
                width: Math.max(normKop.leftLogoSize, normKop.rightLogoSize),
                minHeight: normKop.leftLogoSize,
              }}
              className="shrink-0 flex items-center justify-center"
            >
              {normKop.leftLogoDataUrl && (
                <img
                  src={normKop.leftLogoDataUrl}
                  alt="Logo Kiri Instansi"
                  style={{ width: normKop.leftLogoSize, height: normKop.leftLogoSize }}
                  className="object-contain"
                />
              )}
            </div>
            <div className="flex-1 text-center leading-snug text-slate-950">
              {normKop.line1 && (
                <p style={getKopLineStyleObj(normKop.lineSizes.line1, normKop.lineStyles.line1)}>
                  {normKop.line1}
                </p>
              )}
              {normKop.line2 && (
                <p style={getKopLineStyleObj(normKop.lineSizes.line2, normKop.lineStyles.line2)}>
                  {normKop.line2}
                </p>
              )}
              {normKop.line3 && (
                <p style={getKopLineStyleObj(normKop.lineSizes.line3, normKop.lineStyles.line3)}>
                  {normKop.line3}
                </p>
              )}
              {normKop.line4 && (
                <p
                  style={getKopLineStyleObj(normKop.lineSizes.line4, normKop.lineStyles.line4)}
                  className="mt-0.5"
                >
                  {normKop.line4}
                </p>
              )}
              {normKop.line5 && (
                <p style={getKopLineStyleObj(normKop.lineSizes.line5, normKop.lineStyles.line5)}>
                  {normKop.line5}
                </p>
              )}
              {normKop.line6 && (
                <p style={getKopLineStyleObj(normKop.lineSizes.line6, normKop.lineStyles.line6)}>
                  {normKop.line6}
                </p>
              )}
            </div>
            <div
              style={{
                width: Math.max(normKop.leftLogoSize, normKop.rightLogoSize),
                minHeight: normKop.rightLogoSize,
              }}
              className="shrink-0 flex items-center justify-center"
            >
              {normKop.rightLogoDataUrl && (
                <img
                  src={normKop.rightLogoDataUrl}
                  alt="Logo Kanan Sekolah"
                  style={{ width: normKop.rightLogoSize, height: normKop.rightLogoSize }}
                  className="object-contain"
                />
              )}
            </div>
          </div>
        </div>

        <div className="text-center mb-5">
          <h3 className="text-sm font-bold uppercase tracking-wide">
            PROFIL & LAPORAN AKTIVITAS INDIVIDU SISWA
          </h3>
          <p className="text-xs text-slate-700 mt-0.5">
            Tahun Ajaran {settings.academicYear} · Semester {settings.semester}
          </p>
        </div>

        {/* Biodata + Foto */}
        <div className="flex items-start gap-5 mb-5 p-4 border border-slate-900 rounded">
          <div className="w-24 h-28 border border-slate-400 shrink-0 overflow-hidden bg-slate-50">
            <img
              src={photoSrc}
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = fallbackPhotoSrc;
              }}
              alt={student.name}
              className="w-full h-full object-cover object-top"
            />
          </div>
          <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            <div>
              <span className="text-slate-600">Nama Lengkap:</span>{' '}
              <strong className="text-slate-950">{student.name}</strong>
            </div>
            <div>
              <span className="text-slate-600">Kelas / No. Absen:</span>{' '}
              <strong>
                {student.className} / {student.absenNo || '-'}
              </strong>
            </div>
            <div>
              <span className="text-slate-600">NIS / NISN:</span>{' '}
              <strong className="tabular-nums">
                {student.nis} / {student.nisn || '-'}
              </strong>
            </div>
            <div>
              <span className="text-slate-600">Jenis Kelamin / Status:</span>{' '}
              <strong>
                {student.gender === 'L' ? 'Laki-laki' : 'Perempuan'} (
                {STUDENT_STATUS_LABELS[student.status || 'aktif']})
              </strong>
            </div>
            <div>
              <span className="text-slate-600">Tempat, Tgl Lahir:</span>{' '}
              <strong>{formatStudentTtl(student) || '-'}</strong>
            </div>
            <div>
              <span className="text-slate-600">No. HP / Email:</span>{' '}
              <strong className="break-all">
                {student.phone || '-'} / {student.email || '-'}
              </strong>
            </div>
            <div>
              <span className="text-slate-600">Wali Kelas:</span>{' '}
              <strong>{student.homeroomTeacher || '-'}</strong>
            </div>
            <div>
              <span className="text-slate-600">Guru BK:</span>{' '}
              <strong>{student.counselor || '-'}</strong>
            </div>
            <div className="col-span-2">
              <span className="text-slate-600">Alamat:</span>{' '}
              <strong>{student.address || '-'}</strong>
            </div>
            <div className="col-span-2 pt-1 border-t border-slate-300 mt-1 flex flex-wrap gap-5">
              <span>
                Kehadiran: <strong>{summary.pct}%</strong> (H:{summary.H} S:{summary.S} I:{summary.I} A:{summary.A} D:{summary.D})
              </span>
              <span>
                Rata-rata Nilai: <strong>{summary.avgScore !== null ? summary.avgScore : '-'}</strong> (KKM {settings.kkm})
              </span>
            </div>
          </div>
        </div>

        {/* Bagian A: Aktivitas */}
        <h4 className="text-xs font-bold uppercase mb-2">
          A. Riwayat Aktivitas & Kehadiran di Kelas ({studentJournals.length} Sesi)
        </h4>
        <table className="w-full border-collapse border border-slate-900 text-[10.5px] mb-5">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-900 px-2 py-1 text-center w-8">No</th>
              <th className="border border-slate-900 px-2 py-1 w-24">Tanggal</th>
              <th className="border border-slate-900 px-2 py-1 text-center w-12">Jam</th>
              <th className="border border-slate-900 px-2 py-1 w-28">Mapel</th>
              <th className="border border-slate-900 px-2 py-1">Materi & Kegiatan</th>
              <th className="border border-slate-900 px-2 py-1 text-center w-24">Status</th>
              <th className="border border-slate-900 px-2 py-1 w-28">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {studentJournals.length === 0 ? (
              <tr>
                <td colSpan={7} className="border border-slate-900 py-4 text-center text-slate-500">
                  Belum ada catatan pertemuan kelas.
                </td>
              </tr>
            ) : (
              studentJournals.map((j, idx) => {
                const att = j.attendance[student.id] ?? { status: 'H', note: '' };
                const meta = ATTENDANCE_META[att.status];
                return (
                  <tr key={j.id}>
                    <td className="border border-slate-900 px-2 py-1 text-center tabular-nums">{idx + 1}</td>
                    <td className="border border-slate-900 px-2 py-1 whitespace-nowrap">
                      {formatTanggalID(j.date)}
                    </td>
                    <td className="border border-slate-900 px-2 py-1 text-center tabular-nums">{j.period}</td>
                    <td className="border border-slate-900 px-2 py-1">{j.subject}</td>
                    <td className="border border-slate-900 px-2 py-1">
                      <div className="font-semibold">{j.topic}</div>
                      <div className="text-[10px] text-slate-700">{j.activities}</div>
                    </td>
                    <td className="border border-slate-900 px-2 py-1 text-center font-semibold">
                      {meta.shortLabel} ({meta.label})
                    </td>
                    <td className="border border-slate-900 px-2 py-1">{att.note || '-'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Bagian B: Nilai */}
        <h4 className="text-xs font-bold uppercase mb-2">
          B. Riwayat Penilaian & Evaluasi (KKM {settings.kkm})
        </h4>
        <table className="w-full border-collapse border border-slate-900 text-[10.5px] mb-6">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-900 px-2 py-1 text-center w-8">No</th>
              <th className="border border-slate-900 px-2 py-1">Mata Pelajaran</th>
              <th className="border border-slate-900 px-2 py-1">Jenis Ujian</th>
              <th className="border border-slate-900 px-2 py-1 text-right w-16">Nilai</th>
              <th className="border border-slate-900 px-2 py-1 w-28">Status</th>
              <th className="border border-slate-900 px-2 py-1">Catatan Guru</th>
            </tr>
          </thead>
          <tbody>
            {studentGrades.length === 0 ? (
              <tr>
                <td colSpan={6} className="border border-slate-900 py-4 text-center text-slate-500">
                  Belum ada nilai tercatat.
                </td>
              </tr>
            ) : (
              studentGrades.map((g, idx) => {
                const mk = ROW_MARKER_META[g.marker || 'neutral'];
                return (
                  <tr key={g.id}>
                    <td className="border border-slate-900 px-2 py-1 text-center tabular-nums">{idx + 1}</td>
                    <td className="border border-slate-900 px-2 py-1 font-semibold">{g.subject}</td>
                    <td className="border border-slate-900 px-2 py-1">{g.examType}</td>
                    <td className="border border-slate-900 px-2 py-1 text-right font-bold tabular-nums">
                      {g.score}
                    </td>
                    <td className="border border-slate-900 px-2 py-1 font-semibold">{mk.label}</td>
                    <td className="border border-slate-900 px-2 py-1">{g.note || '-'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Tanda Tangan */}
        {(showPrincipalSig || showTeacherSig) && (() => {
          const stampOnTeacher =
            (sigStamp.stampTarget === 'teacher' && showTeacherSig) || !showPrincipalSig;
          const extraPadTop = Math.max(
            0,
            -Math.min(sigStamp.principalBlockOffsetY, sigStamp.teacherBlockOffsetY)
          );
          const extraPadBottom = Math.max(
            0,
            sigStamp.principalBlockOffsetY,
            sigStamp.teacherBlockOffsetY
          );
          return (
            <div
              style={{
                paddingTop: 8 + extraPadTop,
                paddingBottom: extraPadBottom,
              }}
              className="grid grid-cols-2 gap-8 text-xs overflow-visible"
            >
              <div className="pl-4 overflow-visible">
                {showPrincipalSig && (
                  <div
                    style={{
                      transform: `translate(${sigStamp.principalBlockOffsetX}px, ${sigStamp.principalBlockOffsetY}px)`,
                    }}
                    className="relative"
                  >
                    <p>Mengetahui,</p>
                    <p>{settings.principalTitle}</p>
                    <div className="relative h-[78px] w-full overflow-visible">
                      {!stampOnTeacher && showStampImg && sigStamp.stampDataUrl && (
                        <img
                          src={sigStamp.stampDataUrl}
                          alt="Stempel Sekolah"
                          referrerPolicy="no-referrer"
                          style={{
                            left: '32px',
                            top: '50%',
                            width: sigStamp.stampSize,
                            height: sigStamp.stampSize,
                            maxWidth: 'none',
                            transform: `translate(calc(-50% + ${sigStamp.stampOffsetX}px), calc(-50% + ${sigStamp.stampOffsetY}px))`,
                          }}
                          className="absolute z-10 object-contain opacity-85 mix-blend-multiply pointer-events-none select-none"
                        />
                      )}
                      {showPrincipalSigImg && sigStamp.principalSignatureDataUrl && (
                        <img
                          src={sigStamp.principalSignatureDataUrl}
                          alt="TTD Kepala Sekolah"
                          referrerPolicy="no-referrer"
                          style={{
                            left: '74px',
                            top: '50%',
                            height: sigStamp.signatureSize,
                            width: 'auto',
                            maxWidth: 'none',
                            transform: `translate(calc(-50% + ${sigStamp.principalSigOffsetX}px), calc(-50% + ${sigStamp.principalSigOffsetY}px))`,
                          }}
                          className="absolute z-20 object-contain pointer-events-none select-none"
                        />
                      )}
                    </div>
                    <p className="font-bold underline">{settings.principalName}</p>
                    <p>NIP. {settings.principalNip}</p>
                  </div>
                )}
              </div>
              <div className="pl-12 overflow-visible">
                {showTeacherSig && (
                  <div
                    style={{
                      transform: `translate(${sigStamp.teacherBlockOffsetX}px, ${sigStamp.teacherBlockOffsetY}px)`,
                    }}
                    className="relative"
                  >
                    <p>
                      {settings.signatureCity}, {formatTanggalID(getTodayIso())}
                    </p>
                    <p>Guru Mata Pelajaran,</p>
                    <div className="relative h-[78px] w-full overflow-visible">
                      {stampOnTeacher && showStampImg && sigStamp.stampDataUrl && (
                        <img
                          src={sigStamp.stampDataUrl}
                          alt="Stempel Sekolah"
                          referrerPolicy="no-referrer"
                          style={{
                            left: '32px',
                            top: '50%',
                            width: sigStamp.stampSize,
                            height: sigStamp.stampSize,
                            maxWidth: 'none',
                            transform: `translate(calc(-50% + ${sigStamp.stampOffsetX}px), calc(-50% + ${sigStamp.stampOffsetY}px))`,
                          }}
                          className="absolute z-10 object-contain opacity-85 mix-blend-multiply pointer-events-none select-none"
                        />
                      )}
                      {showTeacherSigImg && effectiveTeacherSig.teacherSignatureDataUrl && (
                        <img
                          src={effectiveTeacherSig.teacherSignatureDataUrl}
                          alt="TTD Guru Mapel"
                          referrerPolicy="no-referrer"
                          style={{
                            left: '74px',
                            top: '50%',
                            height: effectiveTeacherSig.teacherSignatureSize,
                            width: 'auto',
                            maxWidth: 'none',
                            transform: `translate(calc(-50% + ${effectiveTeacherSig.teacherSigOffsetX}px), calc(-50% + ${effectiveTeacherSig.teacherSigOffsetY}px))`,
                          }}
                          className="absolute z-20 object-contain pointer-events-none select-none"
                        />
                      )}
                    </div>
                    <p className="font-bold underline">{effectiveTeacherName}</p>
                    <p>NIP. {effectiveTeacherNip}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </section>
    </>
  );
};

