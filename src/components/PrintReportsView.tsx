import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  FileText,
  Lock,
  Printer,
  RotateCcw,
} from 'lucide-react';
import {
  AppUser,
  GradeRecord,
  JournalEntry,
  PaperOrientation,
  PaperSize,
  PrintFontFamily,
  ReportType,
  Student,
  SystemSettings,
  UserRole,
} from '../types';
import {
  buildAbsenceLog,
  buildAttendanceMatrices,
  buildAttendanceRecapByClass,
  buildClassMultiSubjectLedger,
  buildGradeMatrices,
  buildRemedialAnalysis,
  buildStudentRosterByClass,
  buildTeacherActivitySummary,
  exportReportToPdf,
  exportReportToSpreadsheet,
  filterGradesForReport,
  filterJournalsForReport,
  ReportFilterOptions,
  summarizeStudentAttendance,
} from '../utils/exportReports';
import {
  formatTanggalID,
  formatTanggalShort,
  getMonthRange,
  getPaperSizeMeta,
  getPrintFontCss,
  getTodayIso,
  normalizeKopSurat,
  normalizeSignatureStamp,
  PAPER_SIZE_OPTIONS,
  PRINT_FONT_OPTIONS,
  USER_ROLE_LABELS,
} from '../utils/helpers';

interface PrintReportsViewProps {
  students: Student[];
  journals: JournalEntry[];
  grades: GradeRecord[];
  users?: AppUser[];
  currentUserRole?: UserRole;
  initialReportType?: ReportType;
  initialTeacherFilter?: string;
  onConsumePreset?: () => void;
  settings: SystemSettings;
  onNotify: (msg: string) => void;
}

export const PrintReportsView: React.FC<PrintReportsViewProps> = ({
  students,
  journals,
  grades,
  users = [],
  currentUserRole = 'guru',
  initialReportType,
  initialTeacherFilter,
  onConsumePreset,
  settings,
  onNotify,
}) => {
  const sigStamp = useMemo(() => normalizeSignatureStamp(settings), [settings]);
  const isFormatLocked = settings.lockReportFormat ?? true;
  const adminFontFamily: PrintFontFamily =
    settings.reportFontFamily || normalizeKopSurat(settings.kopSurat).fontFamily || 'Times New Roman';
  const adminPaperSize: PaperSize = settings.reportPaperSize || 'A4';
  const adminOrientation: PaperOrientation = settings.reportOrientation || 'landscape';

  const [reportType, setReportType] = useState<ReportType>(initialReportType || 'semua');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([...settings.classes]);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(initialTeacherFilter || 'ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Saklar Pratinjau Real-Time
  const [showKopSurat, setShowKopSurat] = useState(true);
  const [showPrincipalSig, setShowPrincipalSig] = useState(true);
  const [showTeacherSig, setShowTeacherSig] = useState(true);
  const [showStamp, setShowStamp] = useState<boolean>(sigStamp.showStampDefault);
  const [paperSize, setPaperSize] = useState<PaperSize>(adminPaperSize);
  const [orientation, setOrientation] = useState<PaperOrientation>(adminOrientation);
  const [fontFamily, setFontFamily] = useState<PrintFontFamily>(adminFontFamily);
  const [exportingPdf, setExportingPdf] = useState(false);

  const effectiveFontFamily: PrintFontFamily = isFormatLocked ? adminFontFamily : fontFamily;
  const effectivePaperSize: PaperSize = isFormatLocked ? adminPaperSize : paperSize;
  const effectiveOrientation: PaperOrientation = isFormatLocked ? adminOrientation : orientation;
  const paperMeta = useMemo(() => getPaperSizeMeta(effectivePaperSize), [effectivePaperSize]);

  useEffect(() => {
    if (initialReportType || initialTeacherFilter) {
      if (initialReportType) setReportType(initialReportType);
      if (initialTeacherFilter) setSelectedTeacherId(initialTeacherFilter);
      onConsumePreset?.();
    }
  }, [initialReportType, initialTeacherFilter, onConsumePreset]);

  useEffect(() => {
    setFontFamily(adminFontFamily);
    setPaperSize(adminPaperSize);
    setOrientation(adminOrientation);
  }, [adminFontFamily, adminPaperSize, adminOrientation, isFormatLocked]);

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

  const teacherOptions = useMemo(() => {
    const list: { value: string; label: string }[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();

    users
      .filter((u) => u.role === 'guru' || u.role === 'wali_kelas' || u.role === 'kepala_sekolah')
      .forEach((u) => {
        seenIds.add(u.id);
        seenNames.add(u.name.trim().toLowerCase());
        list.push({ value: u.id, label: `${u.name} (${USER_ROLE_LABELS[u.role]})` });
      });

    [...journals, ...grades].forEach((rec) => {
      if (rec.teacherId && seenIds.has(rec.teacherId)) return;
      const tName = (rec.teacherName || '').trim();
      if (!tName || seenNames.has(tName.toLowerCase())) return;
      seenNames.add(tName.toLowerCase());
      list.push({
        value: rec.teacherId || `name:${tName}`,
        label: tName,
      });
    });

    return list;
  }, [users, journals, grades]);

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
      selectedTeacherId,
      users,
      startDate,
      endDate,
      showKopSurat,
      showPrincipalSig,
      showTeacherSig,
      showStamp,
      paperSize: effectivePaperSize,
      orientation: effectiveOrientation,
      fontFamily: effectiveFontFamily,
    }),
    [
      reportType,
      selectedClasses,
      selectedSubject,
      selectedTeacherId,
      users,
      startDate,
      endDate,
      showKopSurat,
      showPrincipalSig,
      showTeacherSig,
      showStamp,
      effectivePaperSize,
      effectiveOrientation,
      effectiveFontFamily,
    ]
  );

  const filteredJournals = useMemo(
    () => filterJournalsForReport(journals, reportOpts),
    [journals, reportOpts]
  );

  const filteredGrades = useMemo(
    () => filterGradesForReport(grades, reportOpts),
    [grades, reportOpts]
  );

  const teacherActivitySummary = useMemo(
    () => buildTeacherActivitySummary(filteredJournals, filteredGrades, users),
    [filteredJournals, filteredGrades, users]
  );

  const attendanceMatrices = useMemo(
    () => buildAttendanceMatrices(students, filteredJournals, selectedClasses),
    [students, filteredJournals, selectedClasses]
  );

  const gradeMatrices = useMemo(
    () => buildGradeMatrices(students, grades, settings, reportOpts),
    [students, grades, settings, reportOpts]
  );

  const attendanceRecaps = useMemo(
    () => buildAttendanceRecapByClass(students, filteredJournals, selectedClasses),
    [students, filteredJournals, selectedClasses]
  );

  const absenceLog = useMemo(
    () => buildAbsenceLog(students, filteredJournals),
    [students, filteredJournals]
  );

  const remedialBlocks = useMemo(
    () => buildRemedialAnalysis(students, grades, settings, reportOpts),
    [students, grades, settings, reportOpts]
  );

  const classLedgers = useMemo(
    () => buildClassMultiSubjectLedger(students, grades, settings, reportOpts),
    [students, grades, settings, reportOpts]
  );

  const studentRosters = useMemo(
    () => buildStudentRosterByClass(students, selectedClasses),
    [students, selectedClasses]
  );

  const studentNameById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  );

  const handleDownloadExcel = (format: 'xlsx' | 'xls') => {
    exportReportToSpreadsheet(format, students, journals, grades, settings, reportOpts);
    onNotify(`Laporan berhasil diunduh dalam format .${format.toUpperCase()}.`);
  };

  const handleDownloadPdf = async () => {
    setExportingPdf(true);
    try {
      await exportReportToPdf(students, journals, grades, settings, reportOpts);
      onNotify(`PDF Vektor (${paperMeta.id} · ${effectiveFontFamily}) berhasil dibuat dan diunduh.`);
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

  const previewFontCss = getPrintFontCss(effectiveFontFamily);

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
    const logoSlotSize = Math.max(normKop.leftLogoSize, normKop.rightLogoSize);
    return (
      <div className="mb-5 pb-2 border-b-[3px] border-double border-slate-900">
        <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-900">
          <div
            style={{ width: logoSlotSize, minHeight: normKop.leftLogoSize }}
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
            style={{ width: logoSlotSize, minHeight: normKop.rightLogoSize }}
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
    );
  };

  const SignatureBlock = () => {
    if (!showPrincipalSig && !showTeacherSig) return null;
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
        className="mt-8 grid grid-cols-2 gap-8 text-xs text-slate-950 overflow-visible"
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
                {!stampOnTeacher && showStamp && sigStamp.stampDataUrl && (
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
                {sigStamp.principalSignatureDataUrl && (
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
        <div className="pl-8 sm:pl-16 overflow-visible">
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
                {stampOnTeacher && showStamp && sigStamp.stampDataUrl && (
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
                {sigStamp.teacherSignatureDataUrl && (
                  <img
                    src={sigStamp.teacherSignatureDataUrl}
                    alt="TTD Guru Mapel"
                    referrerPolicy="no-referrer"
                    style={{
                      left: '74px',
                      top: '50%',
                      height: sigStamp.signatureSize,
                      width: 'auto',
                      maxWidth: 'none',
                      transform: `translate(calc(-50% + ${sigStamp.teacherSigOffsetX}px), calc(-50% + ${sigStamp.teacherSigOffsetY}px))`,
                    }}
                    className="absolute z-20 object-contain pointer-events-none select-none"
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
      <style>{`@media print { @page { size: ${paperMeta.cssPageSize} ${effectiveOrientation}; margin: 12mm; } }`}</style>

      {/* CONTROL PANEL (HIDDEN WHEN PRINTING) */}
      <section className="no-print bg-white rounded-xl border border-slate-200 overflow-visible">
        <div className="px-6 py-4 bg-slate-900 text-white rounded-t-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Filter &amp; Pengaturan Cetak Laporan Resmi</h2>
            <p className="text-xs text-slate-300">
              Sesuaikan jenis laporan, filter guru pengajar, kelas, dan rentang tanggal sebelum mencetak atau mengunduh PDF/Excel
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-200 shrink-0">
            <Lock className="w-3.5 h-3.5 text-amber-300" />
            <span>
              {paperMeta.id} · {effectiveOrientation === 'landscape' ? 'Landscape' : 'Portrait'} · {effectiveFontFamily}
            </span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Pilihan Cepat Jenis Laporan */}
          <div className="space-y-2 pb-4 border-b border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">Pilih Jenis Laporan Resmi</span>
              <span className="text-[11px] text-slate-500">
                10 format siap cetak · PDF Vektor · Excel (.xlsx / .xls)
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'semua', label: 'Paket Utama (Lengkap)' },
                  { id: 'jurnal', label: 'Jurnal Mengajar' },
                  { id: 'kehadiran', label: 'Kehadiran Mendatar' },
                  { id: 'rekap_presensi', label: 'Rekap Presensi Bulanan' },
                  { id: 'ketidakhadiran', label: 'Monitoring S/I/A/D' },
                  { id: 'nilai', label: 'Rekap Nilai Mapel' },
                  { id: 'remedial', label: 'Ketuntasan & Remedial' },
                  { id: 'leger_kelas', label: 'Leger Gabungan Kelas' },
                  { id: 'daftar_siswa', label: 'Daftar Peserta Didik' },
                  { id: 'aktivitas_guru', label: 'Aktivitas & Penilaian Guru' },
                ] as { id: ReportType; label: string }[]
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setReportType(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    reportType === item.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 1: Filter Laporan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Jenis Laporan</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ReportType)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <optgroup label="Administrasi Mengajar">
                  <option value="jurnal">Jurnal Mengajar</option>
                  <option value="aktivitas_guru">Riwayat Mengajar &amp; Penilaian Guru</option>
                </optgroup>
                <optgroup label="Presensi &amp; Kedisiplinan">
                  <option value="kehadiran">Kehadiran Mendatar (Per Tanggal)</option>
                  <option value="rekap_presensi">Rekap Presensi Bulanan / Ringkas</option>
                  <option value="ketidakhadiran">Monitoring Ketidakhadiran (S/I/A/D)</option>
                </optgroup>
                <optgroup label="Akademik &amp; Penilaian">
                  <option value="nilai">Rekap Nilai per Mapel</option>
                  <option value="remedial">Analisis Ketuntasan &amp; Remedial KKM</option>
                  <option value="leger_kelas">Leger Nilai Gabungan Kelas</option>
                </optgroup>
                <optgroup label="Kesiswaan &amp; Paket Lengkap">
                  <option value="daftar_siswa">Daftar Induk Peserta Didik per Kelas</option>
                  <option value="semua">Semua Laporan Utama (Lengkap)</option>
                </optgroup>
              </select>
            </div>

            {/* Filter Guru Pengajar */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Filter Guru Pengajar {currentUserRole === 'admin' || currentUserRole === 'kepala_sekolah' ? '(Admin)' : ''}
              </label>
              <select
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="ALL">Semua Guru Pengajar</option>
                {teacherOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
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
          </div>

          {/* Row 1B: Standar Format Dokumen (Huruf, Kertas & Orientasi dari Pengaturan Admin) */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Jenis Huruf Cetak &amp; PDF
                </label>
                <select
                  value={effectiveFontFamily}
                  disabled={isFormatLocked}
                  onChange={(e) => setFontFamily(e.target.value as PrintFontFamily)}
                  className={`w-full px-3 py-2 text-xs rounded-lg border font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
                    isFormatLocked
                      ? 'border-slate-200 bg-slate-100 text-slate-700 cursor-not-allowed'
                      : 'border-indigo-300 bg-white text-slate-900'
                  }`}
                >
                  {PRINT_FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Ukuran / Jenis Kertas
                </label>
                <select
                  value={effectivePaperSize}
                  disabled={isFormatLocked}
                  onChange={(e) => setPaperSize(e.target.value as PaperSize)}
                  className={`w-full px-3 py-2 text-xs rounded-lg border font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
                    isFormatLocked
                      ? 'border-slate-200 bg-slate-100 text-slate-700 cursor-not-allowed'
                      : 'border-indigo-300 bg-white text-slate-900'
                  }`}
                >
                  {PAPER_SIZE_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Orientasi Kertas
                </label>
                <div
                  className={`grid grid-cols-2 rounded-lg border p-0.5 ${
                    isFormatLocked ? 'border-slate-200 bg-slate-100' : 'border-slate-300 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    disabled={isFormatLocked}
                    onClick={() => setOrientation('landscape')}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${
                      effectiveOrientation === 'landscape'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    } ${isFormatLocked ? 'cursor-not-allowed opacity-85' : 'cursor-pointer'}`}
                  >
                    Landscape
                  </button>
                  <button
                    type="button"
                    disabled={isFormatLocked}
                    onClick={() => setOrientation('portrait')}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${
                      effectiveOrientation === 'portrait'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    } ${isFormatLocked ? 'cursor-not-allowed opacity-85' : 'cursor-pointer'}`}
                  >
                    Portrait
                  </button>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-600 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>
                {isFormatLocked
                  ? `Terkunci Standar Admin: ${effectiveFontFamily} · ${paperMeta.shortLabel} · ${
                      effectiveOrientation === 'landscape' ? 'Landscape' : 'Portrait'
                    }. ${
                      currentUserRole === 'admin'
                        ? 'Ubah standar huruf, jenis kertas, dan kop surat di menu Pengaturan Sistem.'
                        : 'Format dokumen disamakan untuk semua akun oleh Admin Sistem agar tidak berubah-ubah.'
                    }`
                  : 'Mode Fleksibel aktif: penyesuaian huruf, kertas, dan orientasi hanya berlaku untuk sesi cetak saat ini (standar Admin tetap aman).'}
              </span>
            </p>
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
              {selectedTeacherId !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedTeacherId('ALL')}
                  className="px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Tampilkan Semua Guru
                </button>
              )}
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
            </div>

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

      {/* PRATINJAU REAL-TIME LEMBAR CETAK RESMI */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
        <span>
          Pratinjau Real-Time Kertas <strong className="text-slate-800">{paperMeta.id}</strong>{' '}
          <strong className="text-slate-800 uppercase">{effectiveOrientation}</strong> · Huruf:{' '}
          <strong className="text-slate-800">{effectiveFontFamily}</strong>
        </span>
        <span>
          Skala {paperMeta.shortLabel}
          {isFormatLocked ? ' · Standar Terkunci Admin' : ''}
        </span>
      </div>

      <section
        id="official-print-sheet"
        style={{ fontFamily: previewFontCss }}
        className={`print-only-container eguru-paper-preview bg-white border border-slate-300 shadow-sm mx-auto p-6 sm:p-10 rounded-lg overflow-x-auto ${
          effectiveOrientation === 'landscape'
            ? effectivePaperSize === 'F4' || effectivePaperSize === 'Legal'
              ? 'max-w-[1220px]'
              : 'max-w-[1120px]'
            : 'max-w-[820px]'
        }`}
      >
        {/* BAGIAN KHUSUS ADMIN: RIWAYAT AKTIVITAS MENGAJAR & PENILAIAN GURU */}
        {reportType === 'aktivitas_guru' && (
          <div className="mb-10 space-y-6">
            <KopSuratPreviewBlock />

            <div className="text-center">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                RIWAYAT JURNAL AKTIVITAS MENGAJAR &amp; PENILAIAN GURU
              </h3>
              <p className="text-xs text-slate-700 mt-0.5">
                Tahun Ajaran {settings.academicYear} · Semester {settings.semester}
                {selectedTeacherId !== 'ALL'
                  ? ` · Filter: ${
                      teacherOptions.find((t) => t.value === selectedTeacherId)?.label || selectedTeacherId
                    }`
                  : ' · Semua Guru Pengajar'}
              </p>
            </div>

            {/* A. Ringkasan per Guru */}
            <div>
              <h4 className="text-xs font-bold uppercase mb-2 text-slate-950">
                A. Ringkasan Aktivitas per Guru ({teacherActivitySummary.length} Guru)
              </h4>
              <table className="w-full border-collapse border border-slate-900 text-[11px] text-slate-950">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-900 px-2 py-1.5 text-center w-8">No</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-left">Nama Guru</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-left">Jabatan</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center">Jurnal Mengajar</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center">Entri Nilai</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-left">Kelas Diampu</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-left">Mata Pelajaran</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center">Aktivitas Terakhir</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherActivitySummary.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="border border-slate-900 py-5 text-center text-slate-500">
                        Belum ada catatan aktivitas mengajar maupun penilaian pada filter ini.
                      </td>
                    </tr>
                  ) : (
                    teacherActivitySummary.map((row, idx) => (
                      <tr key={row.teacherKey}>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 font-semibold">
                          {row.teacherName}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5">{row.roleLabel}</td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums font-bold">
                          {row.journalCount} Sesi
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums font-bold">
                          {row.gradeCount} Nilai
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5">
                          {row.classesHandled.join(', ') || '-'}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5">
                          {row.subjectsHandled.join(', ') || '-'}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center whitespace-nowrap">
                          {row.lastActivityDate ? formatTanggalID(row.lastActivityDate) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* B. Rincian Riwayat Jurnal Mengajar */}
            <div>
              <h4 className="text-xs font-bold uppercase mb-2 text-slate-950">
                B. Rincian Jurnal Aktivitas Mengajar Guru ({filteredJournals.length} Sesi)
              </h4>
              <table className="w-full border-collapse border border-slate-900 text-[10.5px] text-slate-950">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-900 px-2 py-1 text-center w-8">No</th>
                    <th className="border border-slate-900 px-2 py-1 w-24">Tanggal</th>
                    <th className="border border-slate-900 px-2 py-1 text-center w-12">Jam</th>
                    <th className="border border-slate-900 px-2 py-1 w-36">Guru Pengajar</th>
                    <th className="border border-slate-900 px-2 py-1 w-20">Kelas</th>
                    <th className="border border-slate-900 px-2 py-1 w-28">Mapel</th>
                    <th className="border border-slate-900 px-2 py-1">Materi &amp; Kegiatan</th>
                    <th className="border border-slate-900 px-2 py-1 text-center w-24">Presensi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJournals.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="border border-slate-900 py-5 text-center text-slate-500">
                        Belum ada riwayat jurnal mengajar pada filter yang dipilih.
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
                          <td className="border border-slate-900 px-2 py-1 text-center tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="border border-slate-900 px-2 py-1 whitespace-nowrap">
                            {formatTanggalID(j.date)}
                          </td>
                          <td className="border border-slate-900 px-2 py-1 text-center tabular-nums">
                            {j.period}
                          </td>
                          <td className="border border-slate-900 px-2 py-1 font-medium">
                            {j.teacherName || settings.teacherProfile.name}
                          </td>
                          <td className="border border-slate-900 px-2 py-1 font-semibold">
                            {j.className}
                          </td>
                          <td className="border border-slate-900 px-2 py-1">{j.subject}</td>
                          <td className="border border-slate-900 px-2 py-1">
                            <div className="font-semibold">{j.topic}</div>
                            <div className="text-[10px] text-slate-700">{j.activities}</div>
                          </td>
                          <td className="border border-slate-900 px-2 py-1 text-center tabular-nums whitespace-nowrap">
                            H:{c.H} S:{c.S} I:{c.I} A:{c.A} D:{c.D}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* C. Rincian Riwayat Penilaian Guru */}
            <div>
              <h4 className="text-xs font-bold uppercase mb-2 text-slate-950">
                C. Rincian Riwayat Penilaian Guru ({filteredGrades.length} Entri)
              </h4>
              <table className="w-full border-collapse border border-slate-900 text-[10.5px] text-slate-950">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-900 px-2 py-1 text-center w-8">No</th>
                    <th className="border border-slate-900 px-2 py-1">Guru Penilai</th>
                    <th className="border border-slate-900 px-2 py-1 w-20">Kelas</th>
                    <th className="border border-slate-900 px-2 py-1">Mapel</th>
                    <th className="border border-slate-900 px-2 py-1">Jenis Ujian</th>
                    <th className="border border-slate-900 px-2 py-1">Nama Siswa</th>
                    <th className="border border-slate-900 px-2 py-1 text-center w-14">Nilai</th>
                    <th className="border border-slate-900 px-2 py-1 text-center w-20">Status KKM</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGrades.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="border border-slate-900 py-5 text-center text-slate-500">
                        Belum ada riwayat penilaian guru pada filter yang dipilih.
                      </td>
                    </tr>
                  ) : (
                    filteredGrades.slice(0, 120).map((g, idx) => {
                      const st = studentNameById.get(g.studentId);
                      const ket = g.score !== null ? (g.score >= settings.kkm ? 'Tuntas' : 'Remedial') : '-';
                      return (
                        <tr key={g.id}>
                          <td className="border border-slate-900 px-2 py-1 text-center tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="border border-slate-900 px-2 py-1 font-medium">
                            {g.teacherName || settings.teacherProfile.name}
                          </td>
                          <td className="border border-slate-900 px-2 py-1 font-semibold">
                            {g.className}
                          </td>
                          <td className="border border-slate-900 px-2 py-1">{g.subject}</td>
                          <td className="border border-slate-900 px-2 py-1">{g.examType}</td>
                          <td className="border border-slate-900 px-2 py-1">{st?.name || g.studentId}</td>
                          <td className="border border-slate-900 px-2 py-1 text-center font-bold tabular-nums">
                            {g.score ?? '-'}
                          </td>
                          <td className="border border-slate-900 px-2 py-1 text-center font-semibold">
                            {ket}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <SignatureBlock />
          </div>
        )}

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
                  <th className="border border-slate-900 px-2 py-1.5 w-24">Tanggal</th>
                  <th className="border border-slate-900 px-2 py-1.5 text-center w-12">Jam</th>
                  <th className="border border-slate-900 px-2 py-1.5 w-32">Guru Pengajar</th>
                  <th className="border border-slate-900 px-2 py-1.5 w-16">Kelas</th>
                  <th className="border border-slate-900 px-2 py-1.5 w-28">Mata Pelajaran</th>
                  <th className="border border-slate-900 px-2 py-1.5">Materi Pokok</th>
                  <th className="border border-slate-900 px-2 py-1.5">Kegiatan Pembelajaran</th>
                  <th className="border border-slate-900 px-2 py-1.5 text-center w-24">Presensi</th>
                </tr>
              </thead>
              <tbody>
                {filteredJournals.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="border border-slate-900 py-6 text-center text-slate-500">
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
                        <td className="border border-slate-900 px-2 py-1.5">
                          {j.teacherName || settings.teacherProfile.name}
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
              Belum ada data nilai untuk kombinasi kelas, guru, dan mata pelajaran terpilih.
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

        {/* BAGIAN 4: REKAP PRESENSI RINGKAS PER SISWA & KELAS */}
        {reportType === 'rekap_presensi' &&
          (attendanceRecaps.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-slate-200 rounded">
              Belum ada data siswa maupun catatan presensi pada kelas yang dipilih.
            </div>
          ) : (
            attendanceRecaps.map((recap, idx) => (
              <div
                key={recap.className}
                className={`mb-10 ${
                  idx > 0
                    ? 'print-page-break pt-4 border-t border-dashed border-slate-300 print:border-none'
                    : ''
                }`}
              >
                <KopSuratPreviewBlock />

                <div className="text-center mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                    REKAPITULASI PRESENSI SISWA — KELAS {recap.className}
                  </h3>
                  <p className="text-xs text-slate-700 mt-0.5">
                    Tahun Ajaran {settings.academicYear} · Semester {settings.semester} · Pertemuan:{' '}
                    {recap.totalMeetings} · Rata-rata Kehadiran: {recap.avgPresencePct}% · Perlu Pembinaan:{' '}
                    {recap.attentionCount} siswa
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
                      <th className="border border-slate-900 px-2 py-1.5 text-center">Pertemuan</th>
                      <th className="border border-slate-900 px-2 py-1.5 text-center">H</th>
                      <th className="border border-slate-900 px-2 py-1.5 text-center">S</th>
                      <th className="border border-slate-900 px-2 py-1.5 text-center">I</th>
                      <th className="border border-slate-900 px-2 py-1.5 text-center">A</th>
                      <th className="border border-slate-900 px-2 py-1.5 text-center">D</th>
                      <th className="border border-slate-900 px-2 py-1.5 text-center bg-slate-200">% Hadir</th>
                      <th className="border border-slate-900 px-2 py-1.5 text-left bg-slate-200">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recap.rows.map((r, rIdx) => (
                      <tr key={r.student.id}>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {rIdx + 1}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 tabular-nums">
                          {r.student.nis}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 font-medium">
                          {r.student.name}
                        </td>
                        <td className="border border-slate-900 px-1.5 py-1.5 text-center">
                          {r.student.gender}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {r.totalMeetings}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums font-semibold">
                          {r.H}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {r.S}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {r.I}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums font-semibold">
                          {r.A}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {r.D}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums font-bold">
                          {r.pct}%
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 font-semibold">
                          {r.statusLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <SignatureBlock />
              </div>
            ))
          ))}

        {/* BAGIAN 5: MONITORING KETIDAKHADIRAN (S / I / A / D) */}
        {reportType === 'ketidakhadiran' && (
          <div className="mb-10 space-y-6">
            <KopSuratPreviewBlock />

            <div className="text-center">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                LAPORAN MONITORING &amp; TINDAK LANJUT KETIDAKHADIRAN SISWA
              </h3>
              <p className="text-xs text-slate-700 mt-0.5">
                Tahun Ajaran {settings.academicYear} · Semester {settings.semester} · Sakit:{' '}
                {absenceLog.counts.S} · Izin: {absenceLog.counts.I} · Alpha: {absenceLog.counts.A} · Dispen:{' '}
                {absenceLog.counts.D}
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase mb-2 text-slate-950">
                A. Rekap Akumulasi Siswa Tidak Hadir ({absenceLog.summary.length} Siswa)
              </h4>
              <table className="w-full border-collapse border border-slate-900 text-[11px] text-slate-950">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-900 px-2 py-1.5 text-center w-8">No</th>
                    <th className="border border-slate-900 px-2 py-1.5 w-24">NIS</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-left">Nama Siswa</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center w-20">Kelas</th>
                    <th className="border border-slate-900 px-1.5 py-1.5 text-center w-10">L/P</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center">Sakit (S)</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center">Izin (I)</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center">Alpha (A)</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center">Dispen (D)</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center bg-slate-200">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {absenceLog.summary.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="border border-slate-900 py-5 text-center text-slate-500">
                        Tidak ada siswa yang tercatat tidak hadir pada filter tanggal/kelas terpilih.
                      </td>
                    </tr>
                  ) : (
                    absenceLog.summary.map((s, idx) => (
                      <tr key={s.studentId}>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 tabular-nums">{s.nis}</td>
                        <td className="border border-slate-900 px-2 py-1.5 font-semibold">{s.name}</td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center">{s.className}</td>
                        <td className="border border-slate-900 px-1.5 py-1.5 text-center">{s.gender}</td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">{s.S}</td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">{s.I}</td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums font-bold">
                          {s.A}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">{s.D}</td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums font-bold">
                          {s.total}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase mb-2 text-slate-950">
                B. Rincian Kronologis Ketidakhadiran ({absenceLog.logs.length} Catatan)
              </h4>
              <table className="w-full border-collapse border border-slate-900 text-[10.5px] text-slate-950">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-900 px-2 py-1 text-center w-8">No</th>
                    <th className="border border-slate-900 px-2 py-1 w-24">Tanggal</th>
                    <th className="border border-slate-900 px-2 py-1 text-center w-12">Jam</th>
                    <th className="border border-slate-900 px-2 py-1 w-20">Kelas</th>
                    <th className="border border-slate-900 px-2 py-1 w-28">Mapel</th>
                    <th className="border border-slate-900 px-2 py-1">Nama Siswa</th>
                    <th className="border border-slate-900 px-2 py-1 text-center w-24">Status</th>
                    <th className="border border-slate-900 px-2 py-1">Catatan Guru</th>
                  </tr>
                </thead>
                <tbody>
                  {absenceLog.logs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="border border-slate-900 py-5 text-center text-slate-500">
                        Belum ada rincian ketidakhadiran pada filter ini.
                      </td>
                    </tr>
                  ) : (
                    absenceLog.logs.slice(0, 150).map((l, idx) => (
                      <tr key={l.id}>
                        <td className="border border-slate-900 px-2 py-1 text-center tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="border border-slate-900 px-2 py-1 whitespace-nowrap">
                          {formatTanggalID(l.date)}
                        </td>
                        <td className="border border-slate-900 px-2 py-1 text-center tabular-nums">
                          {l.period}
                        </td>
                        <td className="border border-slate-900 px-2 py-1 font-semibold">{l.className}</td>
                        <td className="border border-slate-900 px-2 py-1">{l.subject}</td>
                        <td className="border border-slate-900 px-2 py-1 font-medium">{l.studentName}</td>
                        <td className="border border-slate-900 px-2 py-1 text-center font-semibold">
                          {l.status} ({l.statusLabel})
                        </td>
                        <td className="border border-slate-900 px-2 py-1">{l.note}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <SignatureBlock />
          </div>
        )}

        {/* BAGIAN 6: ANALISIS KETUNTASAN & DAFTAR REMEDIAL */}
        {reportType === 'remedial' && (
          <div className="mb-10 space-y-6">
            <KopSuratPreviewBlock />

            <div className="text-center">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                LAPORAN ANALISIS KETUNTASAN BELAJAR &amp; PROGRAM REMEDIAL
              </h3>
              <p className="text-xs text-slate-700 mt-0.5">
                KKM Sekolah: {settings.kkm} · Tahun Ajaran {settings.academicYear} · Semester{' '}
                {settings.semester}
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase mb-2 text-slate-950">
                A. Ringkasan Daya Serap &amp; Ketuntasan Klasikal ({remedialBlocks.length} Kelompok)
              </h4>
              <table className="w-full border-collapse border border-slate-900 text-[11px] text-slate-950">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-900 px-2 py-1.5 text-center w-8">No</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center w-20">Kelas</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-left">Mata Pelajaran</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center">Siswa</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center">Dinilai</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center">Tuntas</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center">Remedial</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center bg-slate-200">Daya Serap</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center">Rata-rata</th>
                    <th className="border border-slate-900 px-2 py-1.5 text-center">Min / Maks</th>
                  </tr>
                </thead>
                <tbody>
                  {remedialBlocks.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="border border-slate-900 py-5 text-center text-slate-500">
                        Belum ada data nilai untuk dianalisis pada filter yang dipilih.
                      </td>
                    </tr>
                  ) : (
                    remedialBlocks.map((b, idx) => (
                      <tr key={`${b.className}-${b.subject}`}>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center font-semibold">
                          {b.className}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 font-medium">{b.subject}</td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {b.totalStudents}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {b.assessedCount}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums font-semibold">
                          {b.tuntasCount}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums font-semibold">
                          {b.remedialCount}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums font-bold">
                          {b.passRatePct}%
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {b.classAvg ?? '-'}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {b.lowest !== null && b.highest !== null ? `${b.lowest} / ${b.highest}` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {(() => {
              const allRemedials = remedialBlocks.flatMap((b) =>
                b.remedialStudents.map((r) => ({ block: b, row: r }))
              );
              return (
                <div>
                  <h4 className="text-xs font-bold uppercase mb-2 text-slate-950">
                    B. Daftar Siswa Wajib Remedial (&lt; KKM {settings.kkm}) — {allRemedials.length} Entri
                  </h4>
                  <table className="w-full border-collapse border border-slate-900 text-[10.5px] text-slate-950">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-900 px-2 py-1 text-center w-8">No</th>
                        <th className="border border-slate-900 px-2 py-1 w-20">Kelas</th>
                        <th className="border border-slate-900 px-2 py-1">Mata Pelajaran</th>
                        <th className="border border-slate-900 px-2 py-1 w-24">NIS</th>
                        <th className="border border-slate-900 px-2 py-1">Nama Siswa</th>
                        <th className="border border-slate-900 px-2 py-1 text-center w-14">Nilai</th>
                        <th className="border border-slate-900 px-2 py-1 text-center w-14">Kurang</th>
                        <th className="border border-slate-900 px-2 py-1">Komponen &lt; KKM</th>
                        <th className="border border-slate-900 px-2 py-1">Rekomendasi Tindak Lanjut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allRemedials.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="border border-slate-900 py-5 text-center text-slate-500">
                            Seluruh siswa yang sudah dinilai memenuhi KKM ({settings.kkm}).
                          </td>
                        </tr>
                      ) : (
                        allRemedials.map((item, idx) => (
                          <tr key={`${item.block.className}-${item.block.subject}-${item.row.student.id}`}>
                            <td className="border border-slate-900 px-2 py-1 text-center tabular-nums">
                              {idx + 1}
                            </td>
                            <td className="border border-slate-900 px-2 py-1 font-semibold">
                              {item.block.className}
                            </td>
                            <td className="border border-slate-900 px-2 py-1">{item.block.subject}</td>
                            <td className="border border-slate-900 px-2 py-1 tabular-nums">
                              {item.row.student.nis}
                            </td>
                            <td className="border border-slate-900 px-2 py-1 font-medium">
                              {item.row.student.name}
                            </td>
                            <td className="border border-slate-900 px-2 py-1 text-center font-bold tabular-nums">
                              {item.row.avgScore}
                            </td>
                            <td className="border border-slate-900 px-2 py-1 text-center tabular-nums">
                              -{item.row.deficit}
                            </td>
                            <td className="border border-slate-900 px-2 py-1">
                              {item.row.belowExamDetails}
                            </td>
                            <td className="border border-slate-900 px-2 py-1">{item.row.actionNote}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            <SignatureBlock />
          </div>
        )}

        {/* BAGIAN 7: LEGER NILAI GABUNGAN SEMUA MAPEL PER KELAS */}
        {reportType === 'leger_kelas' &&
          (classLedgers.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-slate-200 rounded">
              Belum ada data siswa/nilai untuk menyusun leger gabungan kelas.
            </div>
          ) : (
            classLedgers.map((l, idx) => (
              <div
                key={l.className}
                className={`mb-10 ${
                  idx > 0
                    ? 'print-page-break pt-4 border-t border-dashed border-slate-300 print:border-none'
                    : ''
                }`}
              >
                <KopSuratPreviewBlock />

                <div className="text-center mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                    LEGER NILAI GABUNGAN MATA PELAJARAN — KELAS {l.className}
                  </h3>
                  <p className="text-xs text-slate-700 mt-0.5">
                    KKM: {settings.kkm} · Tahun Ajaran {settings.academicYear} · Semester{' '}
                    {settings.semester}
                  </p>
                </div>

                <table className="w-full border-collapse border border-slate-900 text-[10px] text-slate-950">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-900 px-1.5 py-1 text-center w-7">No</th>
                      <th className="border border-slate-900 px-2 py-1 w-20">NIS</th>
                      <th className="border border-slate-900 px-2 py-1 text-left min-w-[140px]">
                        Nama Siswa
                      </th>
                      <th className="border border-slate-900 px-1 py-1 text-center w-8">L/P</th>
                      {l.subjects.map((subj) => (
                        <th key={subj} className="border border-slate-900 px-1.5 py-1 text-center">
                          {subj}
                        </th>
                      ))}
                      <th className="border border-slate-900 px-1.5 py-1 text-center bg-slate-200">
                        Jumlah
                      </th>
                      <th className="border border-slate-900 px-1.5 py-1 text-center bg-slate-200">
                        Rata-rata
                      </th>
                      <th className="border border-slate-900 px-1.5 py-1 text-center bg-slate-200">
                        Rank
                      </th>
                      <th className="border border-slate-900 px-2 py-1 text-left bg-slate-200">
                        Status KKM
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.rows.map((r, rIdx) => (
                      <tr key={r.student.id}>
                        <td className="border border-slate-900 px-1.5 py-1 text-center tabular-nums">
                          {rIdx + 1}
                        </td>
                        <td className="border border-slate-900 px-2 py-1 tabular-nums">
                          {r.student.nis}
                        </td>
                        <td className="border border-slate-900 px-2 py-1 font-medium">
                          {r.student.name}
                        </td>
                        <td className="border border-slate-900 px-1 py-1 text-center">
                          {r.student.gender}
                        </td>
                        {l.subjects.map((subj) => {
                          const v = r.subjectAvgMap[subj];
                          return (
                            <td
                              key={subj}
                              className="border border-slate-900 px-1.5 py-1 text-center tabular-nums"
                            >
                              {v !== null && v !== undefined ? v : '-'}
                            </td>
                          );
                        })}
                        <td className="border border-slate-900 px-1.5 py-1 text-center tabular-nums font-semibold">
                          {r.totalScore ?? '-'}
                        </td>
                        <td className="border border-slate-900 px-1.5 py-1 text-center tabular-nums font-bold">
                          {r.overallAvg ?? '-'}
                        </td>
                        <td className="border border-slate-900 px-1.5 py-1 text-center tabular-nums font-bold">
                          {r.rank ?? '-'}
                        </td>
                        <td className="border border-slate-900 px-2 py-1 font-semibold">
                          {r.statusLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <SignatureBlock />
              </div>
            ))
          ))}

        {/* BAGIAN 8: DAFTAR INDUK PESERTA DIDIK PER KELAS */}
        {reportType === 'daftar_siswa' &&
          (studentRosters.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-slate-200 rounded">
              Belum ada data peserta didik pada kelas terpilih.
            </div>
          ) : (
            studentRosters.map((b, idx) => (
              <div
                key={b.className}
                className={`mb-10 ${
                  idx > 0
                    ? 'print-page-break pt-4 border-t border-dashed border-slate-300 print:border-none'
                    : ''
                }`}
              >
                <KopSuratPreviewBlock />

                <div className="text-center mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                    DAFTAR INDUK PESERTA DIDIK — KELAS {b.className}
                  </h3>
                  <p className="text-xs text-slate-700 mt-0.5">
                    Wali Kelas: {b.homeroomTeacher} · Laki-laki: {b.maleCount} · Perempuan:{' '}
                    {b.femaleCount} · Total: {b.totalCount} Siswa · TA {settings.academicYear}
                  </p>
                </div>

                <table className="w-full border-collapse border border-slate-900 text-[11px] text-slate-950">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-900 px-2 py-1.5 text-center w-8">No</th>
                      <th className="border border-slate-900 px-2 py-1.5 text-center w-14">Absen</th>
                      <th className="border border-slate-900 px-2 py-1.5 w-24">NIS</th>
                      <th className="border border-slate-900 px-2 py-1.5 w-28">NISN</th>
                      <th className="border border-slate-900 px-2 py-1.5 text-left">Nama Lengkap</th>
                      <th className="border border-slate-900 px-1.5 py-1.5 text-center w-10">L/P</th>
                      <th className="border border-slate-900 px-2 py-1.5 text-left">
                        Tempat, Tanggal Lahir
                      </th>
                      <th className="border border-slate-900 px-2 py-1.5 text-left">Wali Kelas</th>
                      <th className="border border-slate-900 px-2 py-1.5 text-center w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.students.map((item, sIdx) => (
                      <tr key={item.student.id}>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {sIdx + 1}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                          {item.student.absenNo || '-'}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 tabular-nums">
                          {item.student.nis}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 tabular-nums">
                          {item.student.nisn || '-'}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 font-medium">
                          {item.student.name}
                        </td>
                        <td className="border border-slate-900 px-1.5 py-1.5 text-center">
                          {item.student.gender}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5">{item.ttlDisplay}</td>
                        <td className="border border-slate-900 px-2 py-1.5">
                          {item.student.homeroomTeacher || '-'}
                        </td>
                        <td className="border border-slate-900 px-2 py-1.5 text-center font-semibold">
                          {item.statusText}
                        </td>
                      </tr>
                    ))}
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
