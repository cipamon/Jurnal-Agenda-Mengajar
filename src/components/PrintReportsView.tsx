import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  FileText,
  Printer,
  RotateCcw,
} from 'lucide-react';
import {
  GradeRecord,
  JournalEntry,
  PaperOrientation,
  PrintFontFamily,
  ReportType,
  Student,
  SystemSettings,
} from '../types';
import {
  buildAttendanceMatrices,
  buildGradeMatrices,
  exportReportToPdf,
  exportReportToSpreadsheet,
  filterJournalsForReport,
  ReportFilterOptions,
  summarizeStudentAttendance,
} from '../utils/exportReports';
import {
  formatTanggalID,
  formatTanggalShort,
  getMonthRange,
  getPrintFontCss,
  getTodayIso,
  normalizeKopSurat,
  normalizeSignatureStamp,
  PRINT_FONT_OPTIONS,
} from '../utils/helpers';

interface PrintReportsViewProps {
  students: Student[];
  journals: JournalEntry[];
  grades: GradeRecord[];
  settings: SystemSettings;
  onUpdateSettings?: (next: SystemSettings) => void;
  onNotify: (msg: string) => void;
}

export const PrintReportsView: React.FC<PrintReportsViewProps> = ({
  students,
  journals,
  grades,
  settings,
  onUpdateSettings,
  onNotify,
}) => {
  const sigStamp = useMemo(() => normalizeSignatureStamp(settings), [settings]);
  const [reportType, setReportType] = useState<ReportType>('semua');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([...settings.classes]);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Saklar Pratinjau Real-Time
  const [showKopSurat, setShowKopSurat] = useState(true);
  const [showPrincipalSig, setShowPrincipalSig] = useState(true);
  const [showTeacherSig, setShowTeacherSig] = useState(true);
  const [showStamp, setShowStamp] = useState<boolean>(sigStamp.showStampDefault);
  const [orientation, setOrientation] = useState<PaperOrientation>('landscape');
  const [fontFamily, setFontFamily] = useState<PrintFontFamily>(
    settings.reportFontFamily || 'Times New Roman'
  );
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    if (settings.reportFontFamily) {
      setFontFamily(settings.reportFontFamily);
    }
  }, [settings.reportFontFamily]);

  // Close multi-select dropdown when clicking outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setClassDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    setSelectedClasses((prev) => {
      const filtered = prev.filter((c) => settings.classes.includes(c));
      if (filtered.length === 0 && settings.classes.length > 0) {
        return [...settings.classes];
      }
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [settings.classes]);

  useEffect(() => {
    if (selectedSubject !== 'ALL' && !settings.subjects.includes(selectedSubject)) {
      setSelectedSubject('ALL');
    }
  }, [settings.subjects, selectedSubject]);

  const toggleClassOption = (cls: string) => {
    setSelectedClasses((prev) =>
      prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]
    );
  };

  const toggleAllClasses = () => {
    if (selectedClasses.length === settings.classes.length) {
      setSelectedClasses([]);
    } else {
      setSelectedClasses([...settings.classes]);
    }
  };

  const applyPresetRange = (preset: 'thisMonth' | 'lastMonth' | 'reset') => {
    if (preset === 'reset') {
      setStartDate('');
      setEndDate('');
      return;
    }
    const range = getMonthRange(preset === 'thisMonth' ? 0 : -1);
    setStartDate(range.start);
    setEndDate(range.end);
  };

  const reportOpts: ReportFilterOptions = useMemo(
    () => ({
      reportType,
      selectedClasses,
      selectedSubject,
      startDate,
      endDate,
      showKopSurat,
      showPrincipalSig,
      showTeacherSig,
      showStamp,
      orientation,
      fontFamily,
    }),
    [
      reportType,
      selectedClasses,
      selectedSubject,
      startDate,
      endDate,
      showKopSurat,
      showPrincipalSig,
      showTeacherSig,
      showStamp,
      orientation,
      fontFamily,
    ]
  );

  const filteredJournals = useMemo(
    () => filterJournalsForReport(journals, reportOpts),
    [journals, reportOpts]
  );

  const attendanceMatrices = useMemo(
    () => buildAttendanceMatrices(students, filteredJournals, selectedClasses),
    [students, filteredJournals, selectedClasses]
  );

  const gradeMatrices = useMemo(
    () => buildGradeMatrices(students, grades, settings, reportOpts),
    [students, grades, settings, reportOpts]
  );

  const handleDownloadExcel = (format: 'xlsx' | 'xls') => {
    exportReportToSpreadsheet(format, students, journals, grades, settings, reportOpts);
    onNotify(`Laporan berhasil diunduh dalam format .${format.toUpperCase()}.`);
  };

  const handleDownloadPdf = async () => {
    setExportingPdf(true);
    try {
      await exportReportToPdf(students, journals, grades, settings, reportOpts);
      onNotify(`PDF Vektor (${fontFamily}) berhasil dibuat dan diunduh.`);
    } catch {
      onNotify('Terjadi kendala saat membuat PDF. Silakan coba ulang.');
    } finally {
      setExportingPdf(false);
    }
  };

  const handlePrintDirect = () => {
    window.print();
  };

  const classSummaryLabel =
    selectedClasses.length === 0
      ? 'Belum ada kelas dipilih'
      : selectedClasses.length === settings.classes.length
        ? `Semua Kelas (${settings.classes.length})`
        : `${selectedClasses.length} Kelas: ${selectedClasses.join(', ')}`;

  const previewFontCss =
    fontFamily === 'Calibri'
      ? 'Calibri, "Segoe UI", Arial, sans-serif'
      : fontFamily === 'Times New Roman'
        ? '"Times New Roman", Times, serif'
        : fontFamily === 'Georgia'
          ? 'Georgia, "Times New Roman", serif'
          : `"${fontFamily}", Arial, sans-serif`;

  const KopSuratPreviewBlock = () => {
    if (!showKopSurat) return null;
    const normKop = normalizeKopSurat(settings.kopSurat);
    const getLineCss = (
      size: number,
      st: { bold: boolean; italic: boolean; underline: boolean }
    ): React.CSSProperties => ({
      fontSize: size,
      fontWeight: st.bold ? 700 : 400,
      fontStyle: st.italic ? 'italic' : 'normal',
      textDecoration: st.underline ? 'underline' : 'none',
    });
    return (
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
          <div
            style={{ fontFamily: getPrintFontCss(normKop.fontFamily) }}
            className="flex-1 text-center leading-snug text-slate-950"
          >
            {normKop.line1 && (
              <p style={getLineCss(normKop.lineSizes.line1, normKop.lineStyles.line1)} className="tracking-wide">
                {normKop.line1}
              </p>
            )}
            {normKop.line2 && (
              <p style={getLineCss(normKop.lineSizes.line2, normKop.lineStyles.line2)}>
                {normKop.line2}
              </p>
            )}
            {normKop.line3 && (
              <p style={getLineCss(normKop.lineSizes.line3, normKop.lineStyles.line3)}>
                {normKop.line3}
              </p>
            )}
            {normKop.line4 && (
              <p
                style={getLineCss(normKop.lineSizes.line4, normKop.lineStyles.line4)}
                className="tracking-wide mt-0.5"
              >
                {normKop.line4}
              </p>
            )}
            {normKop.line5 && (
              <p style={getLineCss(normKop.lineSizes.line5, normKop.lineStyles.line5)}>
                {normKop.line5}
              </p>
            )}
            {normKop.line6 && (
              <p style={getLineCss(normKop.lineSizes.line6, normKop.lineStyles.line6)}>
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
    );
  };

  const SignatureBlock = () => {
    if (!showPrincipalSig && !showTeacherSig) return null;
    return (
      <div className="mt-8 grid grid-cols-2 gap-8 text-xs text-slate-950 pt-2">
        <div className="pl-4">
          {showPrincipalSig && (
            <div>
              <p>Mengetahui,</p>
              <p>{settings.principalTitle}</p>
              <div className="relative min-h-[68px] flex items-center py-1">
                {showStamp && sigStamp.stampDataUrl && (
                  <img
                    src={sigStamp.stampDataUrl}
                    alt="Stempel Sekolah"
                    style={{ width: sigStamp.stampSize, height: sigStamp.stampSize }}
                    className="object-contain opacity-85 mix-blend-multiply -ml-3 pointer-events-none select-none"
                  />
                )}
                {sigStamp.principalSignatureDataUrl && (
                  <img
                    src={sigStamp.principalSignatureDataUrl}
                    alt="TTD Kepala Sekolah"
                    style={{ height: sigStamp.signatureSize }}
                    className={`object-contain ${
                      showStamp && sigStamp.stampDataUrl ? '-ml-9' : ''
                    }`}
                  />
                )}
              </div>
              <p className="font-bold underline">{settings.principalName}</p>
              <p>NIP. {settings.principalNip}</p>
            </div>
          )}
        </div>
        <div className="pl-8 sm:pl-16">
          {showTeacherSig && (
            <div>
              <p>
                {settings.signatureCity}, {formatTanggalID(getTodayIso())}
              </p>
              <p>Guru Mata Pelajaran,</p>
              <div className="relative min-h-[68px] flex items-center py-1">
                {!showPrincipalSig && showStamp && sigStamp.stampDataUrl && (
                  <img
                    src={sigStamp.stampDataUrl}
                    alt="Stempel Sekolah"
                    style={{ width: sigStamp.stampSize, height: sigStamp.stampSize }}
                    className="object-contain opacity-85 mix-blend-multiply -ml-4 pointer-events-none select-none"
                  />
                )}
                {sigStamp.teacherSignatureDataUrl && (
                  <img
                    src={sigStamp.teacherSignatureDataUrl}
                    alt="TTD Guru Mapel"
                    style={{ height: sigStamp.signatureSize }}
                    className={`object-contain ${
                      !showPrincipalSig && showStamp && sigStamp.stampDataUrl ? '-ml-9' : ''
                    }`}
                  />
                )}
              </div>
              <p className="font-bold underline">{settings.teacherProfile.name}</p>
              <p>NIP. {settings.teacherProfile.nip}</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Dynamic @page orientation helper for browser print */}
      <style>{`@media print { @page { size: A4 ${orientation}; margin: 12mm; } }`}</style>

      {/* ===================================================================== */}
      {/* CONTROL PANEL (HIDDEN WHEN PRINTING) */}
      {/* ===================================================================== */}
      <section className="no-print bg-white rounded-xl border border-slate-200 overflow-visible">
        <div className="px-6 py-4 bg-slate-900 text-white rounded-t-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Filter & Pengaturan Cetak Laporan Resmi</h2>
            <p className="text-xs text-slate-300">
              Sesuaikan filter, orientasi kertas, serta jenis huruf cetak sebelum unduh PDF/Excel atau cetak langsung
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Row 1: Filter Laporan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Jenis Laporan</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ReportType)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="jurnal">Jurnal Mengajar</option>
                <option value="kehadiran">Kehadiran Mendatar</option>
                <option value="nilai">Rekap Nilai</option>
                <option value="semua">Semua Laporan (Lengkap)</option>
              </select>
            </div>

            {/* Multi-select Dropdown Kelas dengan Checkbox */}
            <div className="relative" ref={dropdownRef}>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Pilih Kelas (Multi-Select)
              </label>
              <button
                type="button"
                onClick={() => setClassDropdownOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-800 font-medium hover:bg-slate-50 cursor-pointer"
              >
                <span className="truncate">{classSummaryLabel}</span>
                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
              </button>

              {classDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 z-30 bg-white rounded-lg border border-slate-200 shadow-lg p-2 space-y-1 max-h-56 overflow-y-auto">
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer text-xs font-bold text-indigo-700 border-b border-slate-100">
                    <input
                      type="checkbox"
                      checked={selectedClasses.length === settings.classes.length}
                      onChange={toggleAllClasses}
                      className="rounded border-slate-300"
                    />
                    <span>Pilih Semua Kelas</span>
                  </label>
                  {settings.classes.map((cls) => (
                    <label
                      key={cls}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-xs text-slate-800"
                    >
                      <input
                        type="checkbox"
                        checked={selectedClasses.includes(cls)}
                        onChange={() => toggleClassOption(cls)}
                        className="rounded border-slate-300"
                      />
                      <span>{cls}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Mata Pelajaran</label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="ALL">Semua Mata Pelajaran</option>
                {settings.subjects.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
            </div>

            {/* Jenis Huruf Cetak */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Jenis Huruf Cetak &amp; PDF (Font)
              </label>
              <select
                value={fontFamily}
                onChange={(e) => {
                  const nextFont = e.target.value as PrintFontFamily;
                  setFontFamily(nextFont);
                  if (onUpdateSettings) {
                    onUpdateSettings({ ...settings, reportFontFamily: nextFont });
                  }
                }}
                className="w-full px-3 py-2 text-xs rounded-lg border border-indigo-300 bg-indigo-50/40 font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                {PRINT_FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Rentang Tanggal & Pintasan */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end pt-2 border-t border-slate-100">
            <div className="lg:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tanggal Mulai</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tanggal Selesai</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div className="lg:col-span-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => applyPresetRange('thisMonth')}
                className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={() => applyPresetRange('lastMonth')}
                className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
              >
                Bulan Lalu
              </button>
              <button
                type="button"
                onClick={() => applyPresetRange('reset')}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-600 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Tanggal</span>
              </button>
            </div>
          </div>

          {/* Row 3: Saklar Pratinjau Real-Time & Orientasi + 4 Tombol Output */}
          <div className="pt-4 border-t border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showKopSurat}
                  onChange={(e) => setShowKopSurat(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Kop Surat Dinas</span>
              </label>

              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPrincipalSig}
                  onChange={(e) => setShowPrincipalSig(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>TTD Kepala Sekolah</span>
              </label>

              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTeacherSig}
                  onChange={(e) => setShowTeacherSig(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>TTD Guru Mapel</span>
              </label>

              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showStamp}
                  onChange={(e) => setShowStamp(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Stempel Sekolah</span>
              </label>

              <div className="inline-flex items-center rounded-lg border border-slate-300 bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    orientation === 'landscape'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Landscape
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    orientation === 'portrait'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Portrait
                </button>
              </div>
            </div>

            {/* 4 Tombol Output */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => handleDownloadExcel('xlsx')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Unduh Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadExcel('xls')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <FileDown className="w-4 h-4" />
                <span>Unduh .XLS</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={exportingPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-4 h-4" />
                <span>{exportingPdf ? 'Membuat PDF...' : 'Unduh PDF'}</span>
              </button>

              <button
                type="button"
                onClick={handlePrintDirect}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Langsung</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* PRATINJAU REAL-TIME LEMBAR CETAK RESMI */}
      {/* ===================================================================== */}
      <div className="no-print flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          Pratinjau Real-Time Kertas <strong className="text-slate-800 uppercase">{orientation}</strong> · Huruf:{' '}
          <strong className="text-slate-800">{fontFamily}</strong>
        </span>
        <span>Skala A4 Resmi</span>
      </div>

      <section
        id="official-print-sheet"
        style={{ fontFamily: previewFontCss }}
        className={`print-only-container bg-white border border-slate-300 shadow-sm mx-auto p-6 sm:p-10 rounded-lg overflow-x-auto ${
          orientation === 'landscape' ? 'max-w-[1120px]' : 'max-w-[820px]'
        }`}
      >
        {/* BAGIAN 1: JURNAL MENGAJAR */}
        {(reportType === 'jurnal' || reportType === 'semua') && (
          <div className="mb-10">
            <KopSuratPreviewBlock />

            <div className="text-center mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                LAPORAN JURNAL KEGIATAN MENGAJAR GURU
              </h3>
              <p className="text-xs text-slate-700 mt-0.5">
                Tahun Ajaran {settings.academicYear} · Semester {settings.semester}
                {startDate || endDate
                  ? ` · Periode ${startDate ? formatTanggalID(startDate) : 'Awal'} s.d. ${
                      endDate ? formatTanggalID(endDate) : 'Akhir'
                    }`
                  : ''}
              </p>
            </div>

            <table className="w-full border-collapse border border-slate-900 text-[11px] text-slate-950">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-900 px-2 py-1.5 text-center w-8">No</th>
                  <th className="border border-slate-900 px-2 py-1.5 w-28">Tanggal</th>
                  <th className="border border-slate-900 px-2 py-1.5 text-center w-14">Jam</th>
                  <th className="border border-slate-900 px-2 py-1.5 w-20">Kelas</th>
                  <th className="border border-slate-900 px-2 py-1.5 w-32">Mata Pelajaran</th>
                  <th className="border border-slate-900 px-2 py-1.5">Materi Pokok</th>
                  <th className="border border-slate-900 px-2 py-1.5">Kegiatan Pembelajaran</th>
                  <th className="border border-slate-900 px-2 py-1.5 text-center w-28">Presensi</th>
                </tr>
              </thead>
              <tbody>
                {filteredJournals.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="border border-slate-900 py-6 text-center text-slate-500">
                      Tidak ada data jurnal pada filter yang dipilih.
                    </td>
                  </tr>
                ) : (
                  filteredJournals.map((j, idx) => {
                    const c = { H: 0, S: 0, I: 0, A: 0, D: 0 };
                    Object.values(j.attendance).forEach((item) => {
                      c[item.status] = (c[item.status] || 0) + 1;
                    });
                    return (
                      <tr key={j.id}>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 whitespace-nowrap">
                          {formatTanggalID(j.date)}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {j.period}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 font-semibold">
                          {j.className}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5">{j.subject}</td>
                        <td className="border border-slate-900 px-2 py-1.5 font-medium">{j.topic}</td>
                        <td className="border border-slate-900 px-2 py-1.5">{j.activities}</td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums whitespace-nowrap">
                          H:{c.H} S:{c.S} I:{c.I} A:{c.A} D:{c.D}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <SignatureBlock />
          </div>
        )}

        {/* BAGIAN 2: KEHADIRAN MENDATAR */}
        {(reportType === 'kehadiran' || reportType === 'semua') &&
          attendanceMatrices.map((m, idx) => (
            <div
              key={m.className}
              className={`mb-10 ${
                reportType === 'semua' || idx > 0 ? 'print-page-break pt-4 border-t border-dashed border-slate-300 print:border-none' : ''
              }`}
            >
              <KopSuratPreviewBlock />

              <div className="text-center mb-4">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                  LEGER KEHADIRAN SISWA MENDATAR — KELAS {m.className}
                </h3>
                <p className="text-xs text-slate-700 mt-0.5">
                  Tahun Ajaran {settings.academicYear} · Semester {settings.semester} · Jumlah Pertemuan:{' '}
                  {m.journals.length}
                </p>
              </div>

              <table className="w-full border-collapse border border-slate-900 text-[10.5px] text-slate-950">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-900 px-1.5 py-1 text-center w-7">No</th>
                    <th className="border border-slate-900 px-2 py-1 w-20">NIS</th>
                    <th className="border border-slate-900 px-2 py-1 text-left min-w-[140px]">
                      Nama Siswa
                    </th>
                    <th className="border border-slate-900 px-1 py-1 text-center w-8">L/P</th>
                    {m.journals.map((j) => (
                      <th key={j.id} className="border border-slate-900 px-1 py-1 text-center tabular-nums">
                        {formatTanggalShort(j.date)}
                      </th>
                    ))}
                    <th className="border border-slate-900 px-1.5 py-1 text-center bg-slate-200">H</th>
                    <th className="border border-slate-900 px-1.5 py-1 text-center bg-slate-200">S</th>
                    <th className="border border-slate-900 px-1.5 py-1 text-center bg-slate-200">I</th>
                    <th className="border border-slate-900 px-1.5 py-1 text-center bg-slate-200">A</th>
                    <th className="border border-slate-900 px-1.5 py-1 text-center bg-slate-200">D</th>
                    <th className="border border-slate-900 px-1.5 py-1 text-center bg-slate-200">%</th>
                  </tr>
                </thead>
                <tbody>
                  {m.students.map((st, sIdx) => {
                    const sum = summarizeStudentAttendance(st.id, m.journals);
                    return (
                      <tr key={st.id}>
                        <td className="border border-slate-900 px-1.5 py-1 text-center tabular-nums">
                          {sIdx + 1}
                        </td>
                        <td className="border border-slate-900 px-2 py-1 tabular-nums">{st.nis}</td>
                        <td className="border border-slate-900 px-2 py-1 font-medium">{st.name}</td>
                        <td className="border border-slate-900 px-1 py-1 text-center">{st.gender}</td>
                        {m.journals.map((j) => (
                          <td key={j.id} className="border border-slate-900 px-1 py-1 text-center font-bold">
                            {j.attendance[st.id]?.status || '-'}
                          </td>
                        ))}
                        <td className="border border-slate-900 px-1.5 py-1 text-center tabular-nums font-semibold">
                          {sum.H}
                        </td>
                        <td className="border border-slate-900 px-1.5 py-1 text-center tabular-nums">
                          {sum.S}
                        </td>
                        <td className="border border-slate-900 px-1.5 py-1 text-center tabular-nums">
                          {sum.I}
                        </td>
                        <td className="border border-slate-900 px-1.5 py-1 text-center tabular-nums">
                          {sum.A}
                        </td>
                        <td className="border border-slate-900 px-1.5 py-1 text-center tabular-nums">
                          {sum.D}
                        </td>
                        <td className="border border-slate-900 px-1.5 py-1 text-center tabular-nums font-bold">
                          {sum.pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <SignatureBlock />
            </div>
          ))}

        {/* BAGIAN 3: REKAP NILAI */}
        {(reportType === 'nilai' || reportType === 'semua') &&
          (gradeMatrices.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-slate-200 rounded">
              Belum ada data nilai untuk kombinasi kelas dan mata pelajaran terpilih.
            </div>
          ) : (
            gradeMatrices.map((m, idx) => (
              <div
                key={`${m.className}-${m.subject}`}
                className={`mb-10 ${
                  reportType === 'semua' || idx > 0
                    ? 'print-page-break pt-4 border-t border-dashed border-slate-300 print:border-none'
                    : ''
                }`}
              >
                <KopSuratPreviewBlock />

                <div className="text-center mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                    REKAPITULASI NILAI HASIL BELAJAR — KELAS {m.className}
                  </h3>
                  <p className="text-xs text-slate-700 mt-0.5">
                    Mata Pelajaran: {m.subject} · KKM: {settings.kkm} · TA {settings.academicYear} (
                    {settings.semester})
                  </p>
                </div>

                <table className="w-full border-collapse border border-slate-900 text-[11px] text-slate-950">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-900 px-2 py-1.5 text-center w-8">No</th>
                      <th className="border border-slate-900 px-2 py-1.5 w-24">NIS</th>
                      <th className="border border-slate-900 px-2 py-1.5 text-left min-w-[160px]">
                        Nama Siswa
                      </th>
                      <th className="border border-slate-900 px-1.5 py-1.5 text-center w-10">L/P</th>
                      {m.examTypes.map((ex) => {
                        const w = settings.examWeights?.[ex];
                        return (
                          <th key={ex} className="border border-slate-900 px-2 py-1.5 text-center">
                            <div>{ex}</div>
                            {settings.useWeightedAverage && w !== undefined && (
                              <div className="text-[9px] font-normal text-slate-600 tabular-nums">
                                ({w}%)
                              </div>
                            )}
                          </th>
                        );
                      })}
                      <th className="border border-slate-900 px-2 py-1.5 text-center bg-slate-200">
                        {settings.useWeightedAverage ? 'Nilai Akhir' : 'Rata-Rata'}
                      </th>
                      <th className="border border-slate-900 px-2 py-1.5 text-center bg-slate-200">
                        Keterangan
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.students.map((st, sIdx) => {
                      const avg = m.avgMap[st.id];
                      const ket =
                        avg === null ? '-' : avg >= settings.kkm ? 'Tuntas' : 'Remedial';
                      return (
                        <tr key={st.id}>
                          <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                            {sIdx + 1}
                          </td>
                          <td className="border border-slate-900 px-2 py-1.5 tabular-nums">
                            {st.nis}
                          </td>
                          <td className="border border-slate-900 px-2 py-1.5 font-medium">
                            {st.name}
                          </td>
                          <td className="border border-slate-900 px-1.5 py-1.5 text-center">
                            {st.gender}
                          </td>
                          {m.examTypes.map((ex) => {
                            const val = m.scoreMap[st.id]?.[ex];
                            return (
                              <td
                                key={ex}
                                className="border border-slate-900 px-2 py-1.5 text-center tabular-nums"
                              >
                                {val !== null && val !== undefined ? val : '-'}
                              </td>
                            );
                          })}
                          <td className="border border-slate-900 px-2 py-1.5 text-center font-bold tabular-nums">
                            {avg !== null ? avg : '-'}
                          </td>
                          <td className="border border-slate-900 px-2 py-1.5 text-center font-semibold">
                            {ket}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <SignatureBlock />
              </div>
            ))
          ))}
      </section>
    </div>
  );
};
