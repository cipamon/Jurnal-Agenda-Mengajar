import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  FileEdit,
  FileSpreadsheet,
  FileText,
  Mail,
  MapPin,
  Printer,
  User,
  X,
} from 'lucide-react';
import { GradeRecord, JournalEntry, KopSuratTextStyle, Student, SystemSettings } from '../types';
import { getStudentPhotoUrl } from '../utils/defaultAvatars';
import { exportStudentIndividualPdf } from '../utils/exportReports';
import {
  ATTENDANCE_META,
  formatTanggalID,
  getPrintFontCss,
  getTodayIso,
  normalizeKopSurat,
  ROW_MARKER_META,
} from '../utils/helpers';

interface StudentDetailModalProps {
  student: Student | null;
  journals: JournalEntry[];
  grades: GradeRecord[];
  settings: SystemSettings;
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
  onEditStudent,
  onViewClass,
  onViewSubject,
  onNotify,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'aktivitas' | 'nilai'>('aktivitas');
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    if (!student) return;
    setActiveTab('aktivitas');
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [student, onClose]);

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

  if (!student) return null;

  const photoSrc = getStudentPhotoUrl(student);
  const fallbackPhotoSrc = getStudentPhotoUrl({ photoDataUrl: '', gender: student.gender });
  const normKop = normalizeKopSurat(settings.kopSurat);

  const handleDownloadPdf = async () => {
    setExportingPdf(true);
    try {
      await exportStudentIndividualPdf(student, journals, grades, settings);
      onNotify?.(`PDF individu untuk ${student.name} berhasil diunduh.`);
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
        className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[1px]"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-modal-title"
      >
        <div
          className="w-full max-w-3xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with Photo & Identity */}
          <div className="px-6 py-5 bg-slate-900 text-white flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-16 h-16 rounded-xl bg-white border border-indigo-400/40 flex items-center justify-center shrink-0 overflow-hidden">
                <img
                  src={photoSrc}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = fallbackPhotoSrc;
                  }}
                  alt={`Foto ${student.name}`}
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div className="min-w-0">
                <h2 id="student-modal-title" className="text-base sm:text-lg font-bold text-white truncate">
                  {student.name}
                </h2>
                <p className="text-xs text-slate-300 font-mono tabular-nums mt-0.5">
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
                  · No. Absen {student.absenNo || '-'} · NIS {student.nis}
                </p>
                <p className="text-xs text-indigo-300 mt-0.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Peserta Didik · {student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                    {!student.photoDataUrl && ' (Foto Default)'}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onEditStudent && (
                <button
                  type="button"
                  onClick={() => onEditStudent(student)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-100 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <FileEdit className="w-3.5 h-3.5" />
                  <span>Edit Biodata</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
                aria-label="Tutup informasi siswa"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Biodata Lengkap Siswa */}
          <div className="px-6 py-4 bg-white border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="flex items-start gap-2.5 min-w-0">
              <Calendar className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-slate-500 font-medium">Tempat, Tanggal Lahir</p>
                <p className="text-slate-900 font-semibold mt-0.5 break-words">
                  {student.ttl || 'Belum diisi'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 min-w-0">
              <Mail className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-slate-500 font-medium">Email Siswa</p>
                <p className="text-slate-900 font-semibold mt-0.5 break-all">
                  {student.email || 'Belum diisi'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 min-w-0">
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
            <div className="p-3.5 px-5">
              <p className="text-xs text-slate-500">Pertemuan Kelas</p>
              <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
                {studentJournals.length} Sesi
              </p>
            </div>
            <div className="p-3.5 px-5">
              <p className="text-xs text-slate-500">Persentase Kehadiran</p>
              <p className="mt-0.5 text-base font-bold text-emerald-700 tabular-nums">{summary.pct}%</p>
            </div>
            <div className="p-3.5 px-5">
              <p className="text-xs text-slate-500">Rincian Presensi</p>
              <p className="mt-1 text-xs font-mono font-semibold text-slate-800 tabular-nums">
                H:{summary.H} S:{summary.S} I:{summary.I} A:{summary.A} D:{summary.D}
              </p>
            </div>
            <div className="p-3.5 px-5">
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
          <div className="px-6 pt-3 border-b border-slate-200 flex items-center gap-2 bg-white">
            <button
              type="button"
              onClick={() => setActiveTab('aktivitas')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
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
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
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
          <div className="flex-1 overflow-y-auto eguru-scroll p-6">
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
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
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
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 hidden sm:block">
              Tekan <span className="font-mono font-semibold">Esc</span> untuk menutup
            </p>
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={exportingPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{exportingPdf ? 'Membuat PDF...' : 'Unduh PDF Individu'}</span>
              </button>
              <button
                type="button"
                onClick={handlePrintIndividual}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Individu</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
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
        style={{ fontFamily: getPrintFontCss(normKop.fontFamily) }}
        className="hidden print:block print-only-container bg-white text-slate-950 p-2"
      >
        <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>

        {/* Kop Surat Dinas */}
        <div className="mb-5 pb-2 border-b-[3px] border-double border-slate-900">
          <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-900">
            <div
              style={{ width: normKop.leftLogoSize, height: normKop.leftLogoSize }}
              className="shrink-0 flex items-center justify-center"
            >
              {normKop.leftLogoDataUrl && (
                <img
                  src={normKop.leftLogoDataUrl}
                  alt="Logo Kiri Instansi"
                  className="w-full h-full object-contain"
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
              style={{ width: normKop.rightLogoSize, height: normKop.rightLogoSize }}
              className="shrink-0 flex items-center justify-center"
            >
              {normKop.rightLogoDataUrl && (
                <img
                  src={normKop.rightLogoDataUrl}
                  alt="Logo Kanan Sekolah"
                  className="w-full h-full object-contain"
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
              <span className="text-slate-600">NIS:</span>{' '}
              <strong className="tabular-nums">{student.nis}</strong>
            </div>
            <div>
              <span className="text-slate-600">Jenis Kelamin:</span>{' '}
              <strong>{student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</strong>
            </div>
            <div>
              <span className="text-slate-600">Tempat, Tgl Lahir:</span>{' '}
              <strong>{student.ttl || '-'}</strong>
            </div>
            <div>
              <span className="text-slate-600">Email:</span>{' '}
              <strong className="break-all">{student.email || '-'}</strong>
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
        <div className="grid grid-cols-2 gap-8 text-xs pt-2">
          <div />
          <div className="pl-12">
            <p>
              {settings.signatureCity}, {formatTanggalID(getTodayIso())}
            </p>
            <p>Guru Mata Pelajaran,</p>
            <div className="h-16" />
            <p className="font-bold underline">{settings.teacherProfile.name}</p>
            <p>NIP. {settings.teacherProfile.nip}</p>
          </div>
        </div>
      </section>
    </>
  );
};

