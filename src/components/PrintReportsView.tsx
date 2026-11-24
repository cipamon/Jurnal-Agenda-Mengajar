import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  FileText,
  Lock,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import {
  AppUser,
  GradeRecord,
  JournalEntry,
  PaperOrientation,
  PaperSize,
  PrintFontFamily,
  ReportPageLayoutConfig,
  ReportPageLayoutsMap,
  ReportType,
  SignatureExtraRow,
  SignatureExtraSigner,
  SingleReportType,
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
  exportCustomImportedReportToPdf,
  exportReportToPdf,
  exportReportToSpreadsheet,
  exportReportToWord,
  filterGradesForReport,
  filterJournalsForReport,
  ImportedReportData,
  ReportFilterOptions,
  summarizeStudentAttendance,
} from '../utils/exportReports';
import {
  formatTanggalID,
  formatTanggalShort,
  generateId,
  getCssNamedPageName,
  getMonthRange,
  getPaperDimensionsMm,
  getPaperSizeMeta,
  getPrintFontCss,
  getTodayIso,
  normalizeExtraSignatureRows,
  normalizeKopSurat,
  normalizeSignatureStamp,
  PAPER_SIZE_OPTIONS,
  PRINT_FONT_OPTIONS,
  resolveEffectiveTeacherSignature,
  resolveReportPageLayout,
  USER_ROLE_LABELS,
} from '../utils/helpers';

interface PrintReportsViewProps {
  students: Student[];
  journals: JournalEntry[];
  grades: GradeRecord[];
  users?: AppUser[];
  activeUser?: AppUser;
  currentUserRole?: UserRole;
  initialReportType?: ReportType;
  initialTeacherFilter?: string;
  onConsumePreset?: () => void;
  settings: SystemSettings;
  onUpdateSettings?: (next: SystemSettings) => Promise<boolean> | boolean | void;
  onNotify: (msg: string) => void;
}

export const PrintReportsView: React.FC<PrintReportsViewProps> = ({
  students,
  journals,
  grades,
  users = [],
  activeUser,
  currentUserRole = 'guru',
  initialReportType,
  initialTeacherFilter,
  onConsumePreset,
  settings,
  onUpdateSettings,
  onNotify,
}) => {
  const sigStamp = useMemo(() => normalizeSignatureStamp(settings), [settings]);
  const isFormatLocked = settings.lockReportFormat ?? true;
  const adminFontFamily: PrintFontFamily =
    settings.reportFontFamily || normalizeKopSurat(settings.kopSurat).fontFamily || 'Times New Roman';
  const adminPaperSize: PaperSize = settings.reportPaperSize || 'A4';
  const adminOrientation: PaperOrientation = settings.reportOrientation || 'landscape';

  const canFilterAllTeachers = currentUserRole === 'admin' || currentUserRole === 'kepala_sekolah';
  const isStaffTuRole = currentUserRole === 'karyawan';

  const availableReportOptions = useMemo(() => {
    const ALL: {
      id: SingleReportType;
      label: string;
      category: string;
      desc: string;
    }[] = [
      {
        id: 'jurnal',
        label: 'Jurnal Mengajar',
        category: 'Mengajar',
        desc: 'Catatan materi, jam & kegiatan KBM',
      },
      {
        id: 'kehadiran',
        label: 'Kehadiran Mendatar',
        category: 'Presensi',
        desc: 'Matriks H/S/I/A/D per tanggal',
      },
      {
        id: 'rekap_presensi',
        label: 'Rekap Presensi Bulanan',
        category: 'Presensi',
        desc: 'Akumulasi & persentase hadir siswa',
      },
      {
        id: 'ketidakhadiran',
        label: 'Monitoring S/I/A/D',
        category: 'Presensi',
        desc: 'Rekap & kronologi tidak hadir',
      },
      {
        id: 'nilai',
        label: 'Rekap Nilai Mapel',
        category: 'Akademik',
        desc: 'Matriks skor ujian & status KKM',
      },
      {
        id: 'remedial',
        label: 'Ketuntasan & Remedial',
        category: 'Akademik',
        desc: 'Daya serap & daftar siswa < KKM',
      },
      {
        id: 'leger_kelas',
        label: 'Leger Gabungan Kelas',
        category: 'Akademik',
        desc: 'Nilai lintas mapel & peringkat',
      },
      {
        id: 'daftar_siswa',
        label: 'Daftar Peserta Didik',
        category: 'Kesiswaan',
        desc: 'Daftar induk siswa & wali kelas',
      },
      {
        id: 'aktivitas_guru',
        label: 'Aktivitas & Penilaian Guru',
        category: 'Pimpinan',
        desc: 'Ringkasan & riwayat kinerja guru',
      },
    ];
    return ALL.filter((item) => {
      if (item.id === 'aktivitas_guru' && !canFilterAllTeachers) return false;
      if (
        isStaffTuRole &&
        !['daftar_siswa', 'kehadiran', 'rekap_presensi', 'ketidakhadiran'].includes(item.id)
      ) {
        return false;
      }
      return true;
    });
  }, [canFilterAllTeachers, isStaffTuRole]);

  const resolveInitialReports = (preset?: ReportType): SingleReportType[] => {
    const allowedSet = new Set(availableReportOptions.map((o) => o.id));
    if (!preset || preset === 'semua') {
      const defaults: SingleReportType[] = isStaffTuRole
        ? ['daftar_siswa', 'rekap_presensi']
        : ['jurnal', 'kehadiran', 'nilai'];
      return defaults.filter((id) => allowedSet.has(id));
    }
    if (allowedSet.has(preset)) return [preset];
    return isStaffTuRole ? ['daftar_siswa', 'rekap_presensi'] : ['jurnal', 'kehadiran', 'nilai'];
  };

  const [selectedReports, setSelectedReports] = useState<SingleReportType[]>(() =>
    resolveInitialReports(initialReportType)
  );
  const [reportDropdownOpen, setReportDropdownOpen] = useState(false);
  const reportDropdownRef = useRef<HTMLDivElement | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([...settings.classes]);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    canFilterAllTeachers ? initialTeacherFilter || 'ALL' : 'ALL'
  );
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Saklar Pratinjau Real-Time & Pengesahan Independen
  const [showKopSurat, setShowKopSurat] = useState(true);
  const [showPrincipalSig, setShowPrincipalSig] = useState(true);
  const [showTeacherSig, setShowTeacherSig] = useState(true);
  const [showPrincipalSigImg, setShowPrincipalSigImg] = useState<boolean>(
    sigStamp.showPrincipalSigImgDefault !== false
  );
  const [showTeacherSigImg, setShowTeacherSigImg] = useState<boolean>(
    sigStamp.showTeacherSigImgDefault !== false
  );
  const [showStampImg, setShowStampImg] = useState<boolean>(sigStamp.showStampDefault);
  const [showExtraSigRows, setShowExtraSigRows] = useState<boolean>(true);
  const [extraRowsDraft, setExtraRowsDraft] = useState<SignatureExtraRow[]>(() =>
    normalizeExtraSignatureRows(sigStamp.extraRows)
  );
  const [extraRowsDirty, setExtraRowsDirty] = useState(false);
  const [documentNumber, setDocumentNumber] = useState('');
  const [showQrVerification, setShowQrVerification] = useState(false);
  const [qrPreviewDataUrl, setQrPreviewDataUrl] = useState<string>('');
  const [importedReport, setImportedReport] = useState<ImportedReportData | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [paperSize, setPaperSize] = useState<PaperSize>(adminPaperSize);
  const [orientation, setOrientation] = useState<PaperOrientation>(adminOrientation);
  const [fontFamily, setFontFamily] = useState<PrintFontFamily>(adminFontFamily);
  const [pageOverrides, setPageOverrides] = useState<
    Partial<Record<string, Partial<ReportPageLayoutConfig>>>
  >({});
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [savingLayoutPrefs, setSavingLayoutPrefs] = useState(false);

  const effectiveFontFamily: PrintFontFamily = isFormatLocked ? adminFontFamily : fontFamily;
  const effectivePaperSize: PaperSize = isFormatLocked ? adminPaperSize : paperSize;
  const effectiveOrientation: PaperOrientation = isFormatLocked ? adminOrientation : orientation;
  const paperMeta = useMemo(() => getPaperSizeMeta(effectivePaperSize), [effectivePaperSize]);

  useEffect(() => {
    if (!extraRowsDirty) {
      setExtraRowsDraft(normalizeExtraSignatureRows(sigStamp.extraRows));
    }
  }, [sigStamp.extraRows, extraRowsDirty]);

  const selectedTeacherUser = useMemo(() => {
    if (selectedTeacherId && selectedTeacherId !== 'ALL') {
      const byId = users.find((u) => u.id === selectedTeacherId);
      if (byId) return byId;
      if (selectedTeacherId.startsWith('name:')) {
        const tName = selectedTeacherId.slice(5).trim().toLowerCase();
        return users.find((u) => u.name.trim().toLowerCase() === tName);
      }
    }
    return activeUser;
  }, [selectedTeacherId, users, activeUser]);

  const effectiveTeacherSig = useMemo(
    () => resolveEffectiveTeacherSignature(settings, activeUser, selectedTeacherUser),
    [settings, activeUser, selectedTeacherUser]
  );

  const signerTeacherName = selectedTeacherUser?.name || settings.teacherProfile.name;
  const signerTeacherNip = selectedTeacherUser?.nip || settings.teacherProfile.nip;

  useEffect(() => {
    if (!showQrVerification) {
      setQrPreviewDataUrl('');
      return;
    }
    const payload = [
      settings.kopSurat.line4 || settings.teacherProfile.school || 'Portal E-Guru',
      documentNumber.trim() ? `No: ${documentNumber.trim()}` : 'Dokumen Resmi Portal E-Guru',
      `TA ${settings.academicYear} (${settings.semester})`,
      `Tanggal: ${formatTanggalID(getTodayIso())}`,
      `Penandatangan: ${signerTeacherName}`,
    ].join(' | ');
    let cancelled = false;
    QRCode.toDataURL(payload, { width: 180, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setQrPreviewDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrPreviewDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [showQrVerification, documentNumber, settings, signerTeacherName]);

  useEffect(() => {
    const allowedSet = new Set(availableReportOptions.map((o) => o.id));
    setSelectedReports((prev) => {
      const filtered = prev.filter((id) => allowedSet.has(id));
      if (filtered.length === 0 && prev.length > 0) {
        return isStaffTuRole ? ['daftar_siswa', 'rekap_presensi'] : ['jurnal', 'kehadiran', 'nilai'];
      }
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [availableReportOptions, isStaffTuRole]);

  useEffect(() => {
    if (!canFilterAllTeachers && selectedTeacherId !== 'ALL') {
      setSelectedTeacherId('ALL');
    }
  }, [canFilterAllTeachers, selectedTeacherId]);

  useEffect(() => {
    if (initialReportType || initialTeacherFilter) {
      if (initialReportType) setSelectedReports(resolveInitialReports(initialReportType));
      if (initialTeacherFilter && canFilterAllTeachers) setSelectedTeacherId(initialTeacherFilter);
      onConsumePreset?.();
    }
  }, [initialReportType, initialTeacherFilter, canFilterAllTeachers, onConsumePreset]);

  useEffect(() => {
    setFontFamily(adminFontFamily);
    setPaperSize(adminPaperSize);
    setOrientation(adminOrientation);
  }, [adminFontFamily, adminPaperSize, adminOrientation, isFormatLocked]);

  // Close multi-select dropdowns when clicking outside or pressing Escape
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setClassDropdownOpen(false);
      }
      if (reportDropdownRef.current && !reportDropdownRef.current.contains(target)) {
        setReportDropdownOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setClassDropdownOpen(false);
        setReportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
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

  const toggleReportOption = (id: SingleReportType) => {
    setSelectedReports((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectMainPackage = () => {
    setSelectedReports(
      isStaffTuRole ? ['daftar_siswa', 'rekap_presensi'] : ['jurnal', 'kehadiran', 'nilai']
    );
  };

  const selectAllReports = () => {
    setSelectedReports(availableReportOptions.map((opt) => opt.id));
  };

  const clearAllReports = () => {
    setSelectedReports([]);
  };

  const isReportSelected = (id: SingleReportType) =>
    availableReportOptions.some((o) => o.id === id) && selectedReports.includes(id);

  const mergedPageLayouts = useMemo<Partial<Record<string, Partial<ReportPageLayoutConfig>>>>(() => {
    const base: Partial<Record<string, Partial<ReportPageLayoutConfig>>> = {
      ...(settings.reportPageLayouts || {}),
    };
    if (!isFormatLocked) {
      availableReportOptions.forEach((opt) => {
        if (!settings.reportPageLayouts?.[opt.id]) {
          base[opt.id] = { paperSize, orientation };
        }
      });
    }
    Object.entries(pageOverrides).forEach(([k, v]) => {
      if (v) {
        base[k] = { ...(base[k] || {}), ...v };
      }
    });
    return base;
  }, [
    settings.reportPageLayouts,
    isFormatLocked,
    availableReportOptions,
    paperSize,
    orientation,
    pageOverrides,
  ]);

  const resolveSheetLayout = (
    reportType: SingleReportType | 'imported',
    pageKey?: string
  ): { paperSize: PaperSize; orientation: PaperOrientation } => {
    if (reportType === 'imported') {
      const imp = mergedPageLayouts.imported;
      return {
        paperSize: imp?.paperSize || effectivePaperSize,
        orientation: imp?.orientation || effectiveOrientation,
      };
    }
    return resolveReportPageLayout(
      {
        ...settings,
        reportPaperSize: effectivePaperSize,
        reportOrientation: effectiveOrientation,
      },
      reportType,
      mergedPageLayouts,
      pageKey
    );
  };

  const updatePageLayout = (
    pageKey: string,
    reportType: SingleReportType | 'imported',
    patch: Partial<ReportPageLayoutConfig>
  ) => {
    const current = resolveSheetLayout(reportType, pageKey);
    setPageOverrides((prev) => ({
      ...prev,
      [pageKey]: {
        paperSize: patch.paperSize || prev[pageKey]?.paperSize || current.paperSize,
        orientation: patch.orientation || prev[pageKey]?.orientation || current.orientation,
      },
    }));
  };

  const createDefaultExtraSigner = (index: number): SignatureExtraSigner => ({
    id: generateId('sigs'),
    topLabel: index === 0 ? 'Mengetahui,' : '',
    title: index === 0 ? 'Wali Kelas,' : index === 1 ? 'Wakil Kepala Sekolah,' : 'Koordinator,',
    name: '',
    nipLabel: 'NIP.',
    nip: '',
    signatureDataUrl: '',
    signatureSize: 52,
  });

  const handleAddExtraSigRow = () => {
    setExtraRowsDirty(true);
    setShowExtraSigRows(true);
    setExtraRowsDraft((prev) => [
      ...prev,
      {
        id: generateId('sigrow'),
        signers: [createDefaultExtraSigner(0), createDefaultExtraSigner(1)],
      },
    ]);
  };

  const handleRemoveExtraSigRow = (rowId: string) => {
    setExtraRowsDirty(true);
    setExtraRowsDraft((prev) => prev.filter((r) => r.id !== rowId));
  };

  const handleSetExtraRowCols = (rowId: string, cols: 1 | 2 | 3) => {
    setExtraRowsDirty(true);
    setExtraRowsDraft((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const nextSigners = [...row.signers];
        while (nextSigners.length < cols) {
          nextSigners.push(createDefaultExtraSigner(nextSigners.length));
        }
        return { ...row, signers: nextSigners.slice(0, cols) };
      })
    );
  };

  const handleUpdateExtraSigner = (
    rowId: string,
    signerId: string,
    patch: Partial<SignatureExtraSigner>
  ) => {
    setExtraRowsDirty(true);
    setExtraRowsDraft((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              signers: row.signers.map((s) => (s.id === signerId ? { ...s, ...patch } : s)),
            }
          : row
      )
    );
  };

  const handleUploadExtraSignerFile = (rowId: string, signerId: string, file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onNotify('Format gambar tanda tangan harus PNG/JPG/WebP.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        handleUpdateExtraSigner(rowId, signerId, { signatureDataUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSavePrefsToSettings = async () => {
    if (!onUpdateSettings) return;
    setSavingLayoutPrefs(true);
    try {
      const nextReportLayouts: ReportPageLayoutsMap = { ...(settings.reportPageLayouts || {}) };
      availableReportOptions.forEach((opt) => {
        const directOverride = pageOverrides[opt.id];
        if (directOverride && (directOverride.paperSize || directOverride.orientation)) {
          nextReportLayouts[opt.id] = {
            paperSize:
              directOverride.paperSize ||
              nextReportLayouts[opt.id]?.paperSize ||
              effectivePaperSize,
            orientation:
              directOverride.orientation ||
              nextReportLayouts[opt.id]?.orientation ||
              effectiveOrientation,
          };
        }
      });

      const ok = await onUpdateSettings({
        ...settings,
        reportPageLayouts: nextReportLayouts,
        signatureStamp: {
          ...sigStamp,
          extraRows: normalizeExtraSignatureRows(extraRowsDraft),
        },
      });
      if (ok !== false) {
        setExtraRowsDirty(false);
        onNotify('Baris tanda tangan tambahan & pengaturan kertas per jenis laporan disimpan ke sistem.');
      }
    } finally {
      setSavingLayoutPrefs(false);
    }
  };

  const reportOpts: ReportFilterOptions = useMemo(
    () => ({
      reportTypes: selectedReports,
      selectedClasses,
      selectedSubject,
      selectedTeacherId,
      users,
      startDate,
      endDate,
      showKopSurat,
      showPrincipalSig,
      showTeacherSig,
      showStamp: showStampImg,
      showPrincipalSigImg,
      showTeacherSigImg,
      showStampImg,
      showExtraSigRows,
      extraSigRowsOverride: extraRowsDraft,
      teacherSignatureOverride: {
        dataUrl: effectiveTeacherSig.teacherSignatureDataUrl,
        size: effectiveTeacherSig.teacherSignatureSize,
        offsetX: effectiveTeacherSig.teacherSigOffsetX,
        offsetY: effectiveTeacherSig.teacherSigOffsetY,
        teacherName: signerTeacherName,
        teacherNip: signerTeacherNip,
      },
      documentNumber,
      showQrVerification,
      paperSize: effectivePaperSize,
      orientation: effectiveOrientation,
      pageLayouts: mergedPageLayouts,
      fontFamily: effectiveFontFamily,
    }),
    [
      selectedReports,
      selectedClasses,
      selectedSubject,
      selectedTeacherId,
      users,
      startDate,
      endDate,
      showKopSurat,
      showPrincipalSig,
      showTeacherSig,
      showStampImg,
      showPrincipalSigImg,
      showTeacherSigImg,
      showExtraSigRows,
      extraRowsDraft,
      effectiveTeacherSig,
      signerTeacherName,
      signerTeacherNip,
      documentNumber,
      showQrVerification,
      effectivePaperSize,
      effectiveOrientation,
      mergedPageLayouts,
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
    if (selectedReports.length === 0 && !importedReport) {
      onNotify('Centang minimal satu jenis laporan terlebih dahulu.');
      return;
    }
    if (importedReport) {
      const ws = XLSX.utils.aoa_to_sheet([importedReport.headers, ...importedReport.rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Laporan Impor');
      XLSX.writeFile(wb, `${importedReport.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format}`, {
        bookType: format === 'xls' ? 'biff8' : 'xlsx',
      });
      onNotify(`Dokumen impor berhasil diekspor ulang sebagai .${format.toUpperCase()}.`);
      return;
    }
    exportReportToSpreadsheet(format, students, journals, grades, settings, reportOpts);
    onNotify(
      `${selectedReports.length} jenis laporan berhasil diunduh dalam format .${format.toUpperCase()}.`
    );
  };

  const handleDownloadPdf = async () => {
    if (selectedReports.length === 0 && !importedReport) {
      onNotify('Centang minimal satu jenis laporan terlebih dahulu.');
      return;
    }
    setExportingPdf(true);
    try {
      if (importedReport) {
        await exportCustomImportedReportToPdf(importedReport, settings, reportOpts);
        onNotify(`PDF Resmi Dokumen Impor (${paperMeta.id}) berhasil diunduh.`);
      } else {
        await exportReportToPdf(students, journals, grades, settings, reportOpts);
        onNotify(
          `PDF Vektor (${selectedReports.length} jenis · ${paperMeta.id} · ${effectiveFontFamily}) berhasil dibuat dan diunduh.`
        );
      }
    } catch {
      onNotify('Terjadi kendala saat membuat PDF. Silakan coba ulang.');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDownloadWord = async () => {
    if (selectedReports.length === 0 && !importedReport) {
      onNotify('Centang minimal satu jenis laporan terlebih dahulu.');
      return;
    }
    setExportingWord(true);
    try {
      await exportReportToWord(students, journals, grades, settings, reportOpts, importedReport);
      onNotify('Dokumen Word (.doc) berkop & orientasi per halaman berhasil diunduh.');
    } catch {
      onNotify('Terjadi kendala saat membuat Dokumen Word. Silakan coba ulang.');
    } finally {
      setExportingWord(false);
    }
  };

  const handleImportSpreadsheetToOfficial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      const nonEmptyRows = aoa.filter((r) => Array.isArray(r) && r.some((cell) => String(cell ?? '').trim() !== ''));
      if (nonEmptyRows.length < 1) {
        onNotify('File Excel/CSV kosong atau tidak memiliki header kolom.');
        return;
      }
      const headers = nonEmptyRows[0].map((c, idx) => String(c ?? '').trim() || `Kolom ${idx + 1}`);
      const rows = nonEmptyRows.slice(1).map((r) => headers.map((_, idx) => String(r[idx] ?? '').trim()));
      const baseTitle = file.name.replace(/\.(xlsx|xls|csv)$/i, '').replace(/[_-]+/g, ' ').trim();
      setImportedReport({
        title: `LAPORAN RESMI — ${baseTitle || sheetName}`,
        fileName: file.name,
        headers,
        rows,
      });
      onNotify(`Berhasil mengimpor "${file.name}" (${rows.length} baris) menjadi Dokumen Resmi Berkop.`);
    } catch {
      onNotify('Gagal membaca file Excel/CSV. Pastikan format valid.');
    }
  };

  const handlePrintDirect = () => {
    if (selectedReports.length === 0 && !importedReport) {
      onNotify('Centang minimal satu jenis laporan terlebih dahulu.');
      return;
    }
    window.print();
  };

  const selectedReportLabels = useMemo(
    () =>
      availableReportOptions
        .filter((opt) => selectedReports.includes(opt.id))
        .map((opt) => opt.label),
    [availableReportOptions, selectedReports]
  );

  const reportSummaryLabel =
    selectedReports.length === 0
      ? 'Belum ada jenis laporan dipilih'
      : selectedReports.length === availableReportOptions.length
        ? `Semua Jenis Laporan (${availableReportOptions.length})`
        : `${selectedReports.length} Dipilih: ${selectedReportLabels.join(', ')}`;

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

  const visibleExtraRows = showExtraSigRows
    ? extraRowsDraft.filter((r) => r.signers && r.signers.length > 0)
    : [];

  const SignatureBlock = () => {
    if (!showPrincipalSig && !showTeacherSig && !qrPreviewDataUrl && visibleExtraRows.length === 0) {
      return null;
    }
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
      <div className="mt-8 space-y-6 text-xs text-slate-950 overflow-visible">
        {(showPrincipalSig || showTeacherSig || qrPreviewDataUrl) && (
          <div
            style={{
              paddingTop: 8 + extraPadTop,
              paddingBottom: extraPadBottom,
            }}
            className="grid grid-cols-12 gap-4 overflow-visible items-end"
          >
            <div className="col-span-5 pl-2 overflow-visible">
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

            <div className="col-span-2 flex flex-col items-center justify-center pb-1">
              {showQrVerification && qrPreviewDataUrl && (
                <>
                  <img
                    src={qrPreviewDataUrl}
                    alt="QR Verifikasi Digital"
                    className="w-16 h-16 object-contain border border-slate-200 p-0.5 bg-white"
                  />
                  <span className="text-[9px] text-slate-500 mt-0.5 text-center">Verifikasi Digital</span>
                </>
              )}
            </div>

            <div className="col-span-5 pl-4 sm:pl-8 overflow-visible">
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
                  <p className="font-bold underline">{signerTeacherName}</p>
                  <p>NIP. {signerTeacherNip}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {visibleExtraRows.map((row) => {
          const colClass =
            row.signers.length === 1
              ? 'grid-cols-1 max-w-xs mx-auto text-center'
              : row.signers.length === 2
                ? 'grid-cols-2'
                : 'grid-cols-3';
          return (
            <div key={row.id} className={`grid ${colClass} gap-6 pt-2 items-end`}>
              {row.signers.map((signer) => (
                <div
                  key={signer.id}
                  className={row.signers.length === 1 ? 'text-center' : 'pl-2'}
                >
                  <p className="min-h-[1rem]">{signer.topLabel || '\u00A0'}</p>
                  <p>{signer.title || 'Penandatangan'}</p>
                  <div
                    className={`h-[70px] flex items-center ${
                      row.signers.length === 1 ? 'justify-center' : 'justify-start'
                    }`}
                  >
                    {signer.signatureDataUrl && (
                      <img
                        src={signer.signatureDataUrl}
                        alt={`TTD ${signer.name || signer.title}`}
                        style={{ height: signer.signatureSize || 52, width: 'auto' }}
                        className="object-contain pointer-events-none select-none"
                      />
                    )}
                  </div>
                  <p className="font-bold underline">{signer.name || 'Nama Penandatangan'}</p>
                  {signer.nip && (
                    <p>
                      {signer.nipLabel ? `${signer.nipLabel} ` : ''}
                      {signer.nip}
                    </p>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <style>{`@media print { @page { size: ${paperMeta.cssPageSize} ${effectiveOrientation}; margin: 12mm; } }`}</style>

      {/* CONTROL PANEL (HIDDEN WHEN PRINTING) */}
      <section className="no-print bg-white rounded-xl border border-slate-200 overflow-visible">
        <div className="px-4 sm:px-6 py-4 bg-slate-900 text-white rounded-t-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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

        <div className="p-4 sm:p-6 space-y-5">
          {/* Pilihan Multi-Select Dropdown Jenis Laporan dengan Checkbox */}
          <div className="space-y-2.5 pb-4 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-slate-800">
                  Pilih Jenis Laporan Resmi (Multi-Select)
                </h3>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {selectedReports.length} dari {availableReportOptions.length} jenis laporan dicentang · Pratinjau, Cetak, PDF Vektor &amp; Excel multi-sheet
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={selectMainPackage}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap min-h-[36px]"
                >
                  {isStaffTuRole ? 'Paket Utama (2)' : 'Paket Utama (3)'}
                </button>
                <button
                  type="button"
                  onClick={selectAllReports}
                  className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 cursor-pointer whitespace-nowrap min-h-[36px]"
                >
                  Pilih Semua ({availableReportOptions.length})
                </button>
                <button
                  type="button"
                  onClick={clearAllReports}
                  disabled={selectedReports.length === 0}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap min-h-[36px]"
                >
                  Kosongkan
                </button>
              </div>
            </div>

            <div className="relative" ref={reportDropdownRef}>
              <button
                type="button"
                aria-expanded={reportDropdownOpen}
                aria-haspopup="listbox"
                onClick={() => setReportDropdownOpen((o) => !o)}
                className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-[44px] text-xs rounded-xl border bg-white text-left transition-colors cursor-pointer ${
                  reportDropdownOpen
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20 text-slate-900'
                    : 'border-slate-300 text-slate-800 hover:bg-slate-50'
                }`}
              >
                <span className="truncate font-semibold">{reportSummaryLabel}</span>
                <span className="flex items-center gap-2 shrink-0 text-[11px] text-slate-500 tabular-nums">
                  <span>
                    {selectedReports.length}/{availableReportOptions.length}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-500 transition-transform duration-150 ${
                      reportDropdownOpen ? 'rotate-180 text-indigo-600' : ''
                    }`}
                  />
                </span>
              </button>

              {reportDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1.5 z-40 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                    <label className="flex items-center gap-2 text-xs font-bold text-indigo-700 cursor-pointer select-none min-h-[32px]">
                      <input
                        type="checkbox"
                        checked={selectedReports.length === availableReportOptions.length}
                        onChange={() =>
                          selectedReports.length === availableReportOptions.length
                            ? clearAllReports()
                            : selectAllReports()
                        }
                        className="w-4 h-4 rounded border-slate-300 accent-indigo-600 cursor-pointer"
                      />
                      <span>Centang Semua ({availableReportOptions.length} Laporan)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setReportDropdownOpen(false)}
                      className="px-3 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-semibold hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                    >
                      Selesai
                    </button>
                  </div>

                  <div className="p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto">
                    {availableReportOptions.map((item) => {
                      const checked = isReportSelected(item.id);
                      return (
                        <label
                          key={item.id}
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors min-h-[48px] select-none ${
                            checked
                              ? 'border-indigo-400 bg-indigo-50/75 text-indigo-900'
                              : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleReportOption(item.id)}
                            className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-indigo-600 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`text-xs font-semibold leading-snug truncate ${
                                  checked ? 'text-indigo-700' : 'text-slate-900'
                                }`}
                              >
                                {item.label}
                              </span>
                              <span className="text-[10px] font-medium text-slate-400 shrink-0">
                                {item.category}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug truncate">
                              {item.desc}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {selectedReportLabels.length > 0 && (
              <p className="text-[11px] text-slate-600 leading-relaxed">
                <span className="font-semibold text-slate-700">Terpilih:</span>{' '}
                {selectedReportLabels.join(' · ')}
              </p>
            )}
          </div>

          {/* Row 1: Filter Laporan */}
          <div className={`grid grid-cols-1 ${canFilterAllTeachers ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>

            {/* Filter Guru Pengajar (Admin & Kepala Sekolah) */}
            {canFilterAllTeachers && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Filter Guru Pengajar ({currentUserRole === 'admin' ? 'Admin' : 'Pimpinan'})
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
            )}

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

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
              <p className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>
                  {isFormatLocked
                    ? `Standar Bawaan Admin: ${effectiveFontFamily} · ${paperMeta.shortLabel} · ${
                        effectiveOrientation === 'landscape' ? 'Landscape' : 'Portrait'
                      }.`
                    : 'Mode Fleksibel aktif: penyesuaian format global berlaku untuk sesi cetak saat ini.'}{' '}
                  Anda dapat mengatur <strong>Ukuran Kertas &amp; Portrait/Landscape</strong> secara terpisah di bar atas setiap lembar pratinjau.
                </span>
              </p>
              {Object.keys(pageOverrides).length > 0 && (
                <button
                  type="button"
                  onClick={() => setPageOverrides({})}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Pengaturan Kertas Halaman ({Object.keys(pageOverrides).length})</span>
                </button>
              )}
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

            <div className="lg:col-span-6 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => applyPresetRange('thisMonth')}
                className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap min-h-[40px]"
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={() => applyPresetRange('lastMonth')}
                className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap min-h-[40px]"
              >
                Bulan Lalu
              </button>
              <button
                type="button"
                onClick={() => applyPresetRange('reset')}
                className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-600 cursor-pointer whitespace-nowrap min-h-[40px]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Tanggal</span>
              </button>
              {canFilterAllTeachers && selectedTeacherId !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedTeacherId('ALL')}
                  className="col-span-2 sm:col-span-1 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[40px]"
                >
                  Tampilkan Semua Guru
                </button>
              )}
            </div>
          </div>

          {/* Row 2B: Nomor Surat, QR Verifikasi Digital & Impor Excel ke Laporan Resmi */}
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nomor Surat / Dokumen Resmi (Opsional)
              </label>
              <input
                type="text"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="Contoh: 421.3/084/SMAN1-BDG/2026"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div className="md:col-span-3 flex items-center pb-1.5">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer min-h-[34px]">
                <input
                  type="checkbox"
                  checked={showQrVerification}
                  onChange={(e) => setShowQrVerification(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                <span>QR Verifikasi Digital</span>
              </label>
            </div>

            <div className="md:col-span-4 flex flex-wrap items-center justify-end gap-2">
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportSpreadsheetToOfficial}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold text-indigo-700 cursor-pointer whitespace-nowrap min-h-[38px]"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Impor Excel/CSV → Laporan Berkop</span>
              </button>
              {importedReport && (
                <button
                  type="button"
                  onClick={() => setImportedReport(null)}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 cursor-pointer whitespace-nowrap min-h-[38px]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Tutup Impor</span>
                </button>
              )}
            </div>
          </div>

          {/* Row 3: Saklar Blok Pengesahan + 3 Kontrol Gambar Independen + Tombol Output */}
          <div className="pt-4 border-t border-slate-200 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer min-h-[32px]">
                <input
                  type="checkbox"
                  checked={showKopSurat}
                  onChange={(e) => setShowKopSurat(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Kop Surat Dinas</span>
              </label>

              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer min-h-[32px]">
                <input
                  type="checkbox"
                  checked={showPrincipalSig}
                  onChange={(e) => setShowPrincipalSig(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Blok Kepsek</span>
              </label>

              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer min-h-[32px]">
                <input
                  type="checkbox"
                  checked={showTeacherSig}
                  onChange={(e) => setShowTeacherSig(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Blok Guru</span>
              </label>

              <span className="text-slate-300 hidden sm:inline">|</span>

              <label className="inline-flex items-center gap-2 font-semibold text-indigo-800 cursor-pointer min-h-[32px]">
                <input
                  type="checkbox"
                  checked={showPrincipalSigImg}
                  onChange={(e) => setShowPrincipalSigImg(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Gbr TTD Kepsek</span>
              </label>

              <label className="inline-flex items-center gap-2 font-semibold text-indigo-800 cursor-pointer min-h-[32px]">
                <input
                  type="checkbox"
                  checked={showStampImg}
                  onChange={(e) => setShowStampImg(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Gbr Stempel Sekolah</span>
              </label>

              <label className="inline-flex items-center gap-2 font-semibold text-indigo-800 cursor-pointer min-h-[32px]">
                <input
                  type="checkbox"
                  checked={showTeacherSigImg}
                  onChange={(e) => setShowTeacherSigImg(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Gbr TTD Guru Mapel</span>
              </label>

              {extraRowsDraft.length > 0 && (
                <label className="inline-flex items-center gap-2 font-semibold text-emerald-800 cursor-pointer min-h-[32px]">
                  <input
                    type="checkbox"
                    checked={showExtraSigRows}
                    onChange={(e) => setShowExtraSigRows(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Baris TTD Tambahan ({extraRowsDraft.length})</span>
                </label>
              )}

              <button
                type="button"
                onClick={handleAddExtraSigRow}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-[11px] font-semibold text-indigo-700 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Baris Tanda Tangan</span>
              </button>

              {onUpdateSettings && currentUserRole === 'admin' && (extraRowsDirty || Object.keys(pageOverrides).length > 0) && (
                <button
                  type="button"
                  onClick={handleSavePrefsToSettings}
                  disabled={savingLayoutPrefs}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-semibold text-emerald-800 cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingLayoutPrefs ? 'Menyimpan...' : 'Simpan ke Pengaturan Sistem'}</span>
                </button>
              )}
            </div>

            {extraRowsDraft.length > 0 && (
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">
                      Baris Tanda Tangan Tambahan ({extraRowsDraft.length} Baris)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Ditampilkan di bawah Kepala Sekolah &amp; Guru pada Pratinjau, Cetak Langsung, PDF, dan Word.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddExtraSigRow}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Baris Baru</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {extraRowsDraft.map((row, rowIdx) => (
                    <div
                      key={row.id}
                      className="p-3 rounded-lg border border-slate-200 bg-white space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-700">
                          Baris Tambahan #{rowIdx + 1}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500 mr-1">Kolom:</span>
                          {([1, 2, 3] as const).map((cols) => (
                            <button
                              key={cols}
                              type="button"
                              onClick={() => handleSetExtraRowCols(row.id, cols)}
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold border cursor-pointer ${
                                row.signers.length === cols
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              {cols}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleRemoveExtraSigRow(row.id)}
                            className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[11px] font-semibold text-rose-700 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      </div>

                      <div
                        className={`grid grid-cols-1 ${
                          row.signers.length === 1
                            ? 'md:grid-cols-1'
                            : row.signers.length === 2
                              ? 'md:grid-cols-2'
                              : 'md:grid-cols-3'
                        } gap-2.5`}
                      >
                        {row.signers.map((signer, sIdx) => (
                          <div
                            key={signer.id}
                            className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5 text-[11px]"
                          >
                            <div className="font-bold text-slate-700">
                              Penandatangan #{sIdx + 1}
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <input
                                type="text"
                                value={signer.topLabel || ''}
                                onChange={(e) =>
                                  handleUpdateExtraSigner(row.id, signer.id, { topLabel: e.target.value })
                                }
                                placeholder="Label atas (opsional)"
                                className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-[11px]"
                              />
                              <input
                                type="text"
                                value={signer.title}
                                onChange={(e) =>
                                  handleUpdateExtraSigner(row.id, signer.id, { title: e.target.value })
                                }
                                placeholder="Jabatan (misal: Wali Kelas,)"
                                className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-[11px]"
                              />
                            </div>
                            <input
                              type="text"
                              value={signer.name}
                              onChange={(e) =>
                                handleUpdateExtraSigner(row.id, signer.id, { name: e.target.value })
                              }
                              placeholder="Nama lengkap & gelar penandatangan"
                              className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-[11px] font-semibold"
                            />
                            <div className="grid grid-cols-3 gap-1.5">
                              <input
                                type="text"
                                value={signer.nipLabel || ''}
                                onChange={(e) =>
                                  handleUpdateExtraSigner(row.id, signer.id, { nipLabel: e.target.value })
                                }
                                placeholder="NIP."
                                className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-[11px]"
                              />
                              <input
                                type="text"
                                value={signer.nip}
                                onChange={(e) =>
                                  handleUpdateExtraSigner(row.id, signer.id, { nip: e.target.value })
                                }
                                placeholder="Nomor NIP / NUPTK"
                                className="col-span-2 w-full px-2 py-1 rounded border border-slate-300 bg-white text-[11px]"
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <label className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer font-semibold text-slate-700">
                                <Upload className="w-3 h-3" />
                                <span>{signer.signatureDataUrl ? 'Ganti Gbr TTD' : 'Unggah TTD'}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    handleUploadExtraSignerFile(row.id, signer.id, e.target.files?.[0]);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              {signer.signatureDataUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateExtraSigner(row.id, signer.id, { signatureDataUrl: '' })
                                  }
                                  className="text-rose-600 hover:underline font-semibold cursor-pointer"
                                >
                                  Hapus TTD
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-end gap-2 sm:gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => handleDownloadExcel('xlsx')}
                disabled={selectedReports.length === 0 && !importedReport}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[42px]"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Unduh Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadExcel('xls')}
                disabled={selectedReports.length === 0 && !importedReport}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[42px]"
              >
                <FileDown className="w-4 h-4" />
                <span>Unduh .XLS</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadWord}
                disabled={exportingWord || (selectedReports.length === 0 && !importedReport)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[42px]"
              >
                <FileText className="w-4 h-4" />
                <span>{exportingWord ? 'Membuat Word...' : 'Unduh Word (.doc)'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={exportingPdf || (selectedReports.length === 0 && !importedReport)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[42px]"
              >
                <FileText className="w-4 h-4" />
                <span>{exportingPdf ? 'Membuat PDF...' : 'Unduh PDF'}</span>
              </button>

              <button
                type="button"
                onClick={handlePrintDirect}
                disabled={selectedReports.length === 0 && !importedReport}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[42px]"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Langsung</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* PRATINJAU REAL-TIME LEMBAR CETAK RESMI (PER HALAMAN) */}
      {(() => {
        interface PreviewPageSpec {
          pageKey: string;
          reportType: SingleReportType | 'imported';
          label: string;
          content: React.ReactNode;
        }

        const pages: PreviewPageSpec[] = [];
        const emptyBlocks: string[] = [];

        if (importedReport) {
          pages.push({
            pageKey: 'imported',
            reportType: 'imported',
            label: `Dokumen Impor (${importedReport.fileName})`,
            content: (
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                    {importedReport.title}
                  </h3>
                  <p className="text-xs text-slate-700 mt-0.5">
                    Sumber Berkas: {importedReport.fileName} · Tahun Ajaran {settings.academicYear} (
                    {settings.semester})
                  </p>
                </div>
                <table className="w-full border-collapse border border-slate-900 text-[10.5px] text-slate-950">
                  <thead>
                    <tr className="bg-[#0f172a] text-white">
                      {importedReport.headers.map((h, i) => (
                        <th
                          key={i}
                          className="border border-slate-700 px-2 py-1.5 text-center font-bold text-white"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importedReport.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={importedReport.headers.length}
                          className="border border-slate-900 py-5 text-center text-slate-500"
                        >
                          Tidak ada baris data dalam file impor.
                        </td>
                      </tr>
                    ) : (
                      importedReport.rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="border border-slate-900 px-2 py-1">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ),
          });
        } else {
          if (isReportSelected('aktivitas_guru')) {
            pages.push({
              pageKey: 'aktivitas_guru',
              reportType: 'aktivitas_guru',
              label: 'Aktivitas & Penilaian Guru',
              content: (
                <div className="space-y-5">
                  <div className="text-center">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                      RIWAYAT JURNAL AKTIVITAS MENGAJAR &amp; PENILAIAN GURU
                    </h3>
                    <p className="text-xs text-slate-700 mt-0.5">
                      Tahun Ajaran {settings.academicYear} · Semester {settings.semester}
                      {selectedTeacherId !== 'ALL'
                        ? ` · Filter: ${
                            teacherOptions.find((t) => t.value === selectedTeacherId)?.label ||
                            selectedTeacherId
                          }`
                        : ' · Semua Guru Pengajar'}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase mb-2 text-slate-950">
                      A. Ringkasan Aktivitas per Guru ({teacherActivitySummary.length} Guru)
                    </h4>
                    <table className="w-full border-collapse border border-slate-900 text-[10.5px] text-slate-950">
                      <thead>
                        <tr className="bg-[#0f172a] text-white">
                          <th className="border border-slate-700 px-2 py-1.5 text-center w-8">No</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-left">Nama Guru</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-left">Jabatan</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">
                            Jurnal Mengajar
                          </th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">
                            Entri Nilai
                          </th>
                          <th className="border border-slate-700 px-2 py-1.5 text-left">Kelas Diampu</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-left">
                            Mata Pelajaran
                          </th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">
                            Aktivitas Terakhir
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {teacherActivitySummary.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="border border-slate-900 py-5 text-center text-slate-500"
                            >
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

                  <div>
                    <h4 className="text-xs font-bold uppercase mb-2 text-slate-950">
                      B. Rincian Jurnal Aktivitas Mengajar Guru ({filteredJournals.length} Sesi)
                    </h4>
                    <table className="w-full border-collapse border border-slate-900 text-[10px] text-slate-950">
                      <thead>
                        <tr className="bg-[#0f172a] text-white">
                          <th className="border border-slate-700 px-2 py-1 text-center w-8">No</th>
                          <th className="border border-slate-700 px-2 py-1 w-24">Tanggal</th>
                          <th className="border border-slate-700 px-2 py-1 text-center w-12">Jam</th>
                          <th className="border border-slate-700 px-2 py-1 w-32">Guru Pengajar</th>
                          <th className="border border-slate-700 px-2 py-1 w-16">Kelas</th>
                          <th className="border border-slate-700 px-2 py-1 w-24">Mapel</th>
                          <th className="border border-slate-700 px-2 py-1">Materi &amp; Kegiatan</th>
                          <th className="border border-slate-700 px-2 py-1 text-center w-24">
                            Presensi
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredJournals.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="border border-slate-900 py-5 text-center text-slate-500"
                            >
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
                                  <div className="text-[9.5px] text-slate-700">{j.activities}</div>
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

                  <div>
                    <h4 className="text-xs font-bold uppercase mb-2 text-slate-950">
                      C. Rincian Riwayat Penilaian Guru ({filteredGrades.length} Entri)
                    </h4>
                    <table className="w-full border-collapse border border-slate-900 text-[10px] text-slate-950">
                      <thead>
                        <tr className="bg-[#0f172a] text-white">
                          <th className="border border-slate-700 px-2 py-1 text-center w-8">No</th>
                          <th className="border border-slate-700 px-2 py-1">Guru Penilai</th>
                          <th className="border border-slate-700 px-2 py-1 w-16">Kelas</th>
                          <th className="border border-slate-700 px-2 py-1">Mapel</th>
                          <th className="border border-slate-700 px-2 py-1">Jenis Ujian</th>
                          <th className="border border-slate-700 px-2 py-1">Nama Siswa</th>
                          <th className="border border-slate-700 px-2 py-1 text-center w-14">Nilai</th>
                          <th className="border border-slate-700 px-2 py-1 text-center w-20">
                            Status KKM
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredGrades.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="border border-slate-900 py-5 text-center text-slate-500"
                            >
                              Belum ada riwayat penilaian guru pada filter yang dipilih.
                            </td>
                          </tr>
                        ) : (
                          filteredGrades.slice(0, 120).map((g, idx) => {
                            const st = studentNameById.get(g.studentId);
                            const ket =
                              g.score !== null ? (g.score >= settings.kkm ? 'Tuntas' : 'Remedial') : '-';
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
                                <td className="border border-slate-900 px-2 py-1">
                                  {st?.name || g.studentId}
                                </td>
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
                </div>
              ),
            });
          }

          if (isReportSelected('jurnal')) {
            pages.push({
              pageKey: 'jurnal',
              reportType: 'jurnal',
              label: 'Jurnal Mengajar Guru',
              content: (
                <div>
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

                  <table className="w-full border-collapse border border-slate-900 text-[10.5px] text-slate-950">
                    <thead>
                      <tr className="bg-[#0f172a] text-white">
                        <th className="border border-slate-700 px-2 py-1.5 text-center w-8">No</th>
                        <th className="border border-slate-700 px-2 py-1.5 w-24">Tanggal</th>
                        <th className="border border-slate-700 px-2 py-1.5 text-center w-12">Jam</th>
                        <th className="border border-slate-700 px-2 py-1.5 w-28">Guru Pengajar</th>
                        <th className="border border-slate-700 px-2 py-1.5 w-16">Kelas</th>
                        <th className="border border-slate-700 px-2 py-1.5 w-24">Mata Pelajaran</th>
                        <th className="border border-slate-700 px-2 py-1.5">Materi Pokok</th>
                        <th className="border border-slate-700 px-2 py-1.5">Kegiatan Pembelajaran</th>
                        <th className="border border-slate-700 px-2 py-1.5 text-center w-24">Presensi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredJournals.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            className="border border-slate-900 py-6 text-center text-slate-500"
                          >
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
                              <td className="border border-slate-900 px-2 py-1.5 font-medium">
                                {j.topic}
                              </td>
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
                </div>
              ),
            });
          }

          if (isReportSelected('kehadiran')) {
            if (attendanceMatrices.length === 0) {
              emptyBlocks.push('Kehadiran Mendatar (belum ada data pada filter kelas/tanggal terpilih)');
            } else {
              attendanceMatrices.forEach((m) => {
                pages.push({
                  pageKey: `kehadiran:${m.className}`,
                  reportType: 'kehadiran',
                  label: `Kehadiran Mendatar · Kelas ${m.className}`,
                  content: (
                    <div>
                      <div className="text-center mb-4">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                          LEGER KEHADIRAN SISWA MENDATAR — KELAS {m.className}
                        </h3>
                        <p className="text-xs text-slate-700 mt-0.5">
                          Tahun Ajaran {settings.academicYear} · Semester {settings.semester} · Jumlah
                          Pertemuan: {m.journals.length}
                        </p>
                      </div>

                      <table className="w-full border-collapse border border-slate-900 text-[10px] text-slate-950">
                        <thead>
                          <tr className="bg-[#0f172a] text-white">
                            <th className="border border-slate-700 px-1.5 py-1 text-center w-7">No</th>
                            <th className="border border-slate-700 px-2 py-1 w-20">NIS</th>
                            <th className="border border-slate-700 px-2 py-1 text-left min-w-[130px]">
                              Nama Siswa
                            </th>
                            <th className="border border-slate-700 px-1 py-1 text-center w-8">L/P</th>
                            {m.journals.map((j) => (
                              <th
                                key={j.id}
                                className="border border-slate-700 px-1 py-1 text-center tabular-nums"
                              >
                                {formatTanggalShort(j.date)}
                              </th>
                            ))}
                            <th className="border border-slate-700 px-1.5 py-1 text-center">H</th>
                            <th className="border border-slate-700 px-1.5 py-1 text-center">S</th>
                            <th className="border border-slate-700 px-1.5 py-1 text-center">I</th>
                            <th className="border border-slate-700 px-1.5 py-1 text-center">A</th>
                            <th className="border border-slate-700 px-1.5 py-1 text-center">D</th>
                            <th className="border border-slate-700 px-1.5 py-1 text-center">%</th>
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
                                <td className="border border-slate-900 px-2 py-1 tabular-nums">
                                  {st.nis}
                                </td>
                                <td className="border border-slate-900 px-2 py-1 font-medium">
                                  {st.name}
                                </td>
                                <td className="border border-slate-900 px-1 py-1 text-center">
                                  {st.gender}
                                </td>
                                {m.journals.map((j) => (
                                  <td
                                    key={j.id}
                                    className="border border-slate-900 px-1 py-1 text-center font-bold"
                                  >
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
                    </div>
                  ),
                });
              });
            }
          }

          if (isReportSelected('nilai')) {
            if (gradeMatrices.length === 0) {
              emptyBlocks.push(
                'Rekap Nilai Mapel (belum ada data nilai untuk kombinasi kelas, guru & mapel terpilih)'
              );
            } else {
              gradeMatrices.forEach((m) => {
                pages.push({
                  pageKey: `nilai:${m.className}:${m.subject}`,
                  reportType: 'nilai',
                  label: `Rekap Nilai · ${m.className} (${m.subject})`,
                  content: (
                    <div>
                      <div className="text-center mb-4">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                          REKAPITULASI NILAI HASIL BELAJAR — KELAS {m.className}
                        </h3>
                        <p className="text-xs text-slate-700 mt-0.5">
                          Mata Pelajaran: {m.subject} · KKM: {settings.kkm} · TA {settings.academicYear} (
                          {settings.semester})
                        </p>
                      </div>

                      <table className="w-full border-collapse border border-slate-900 text-[10.5px] text-slate-950">
                        <thead>
                          <tr className="bg-[#0f172a] text-white">
                            <th className="border border-slate-700 px-2 py-1.5 text-center w-8">No</th>
                            <th className="border border-slate-700 px-2 py-1.5 w-24">NIS</th>
                            <th className="border border-slate-700 px-2 py-1.5 text-left min-w-[150px]">
                              Nama Siswa
                            </th>
                            <th className="border border-slate-700 px-1.5 py-1.5 text-center w-10">
                              L/P
                            </th>
                            {m.examTypes.map((ex) => {
                              const w = settings.examWeights?.[ex];
                              return (
                                <th
                                  key={ex}
                                  className="border border-slate-700 px-2 py-1.5 text-center"
                                >
                                  <div>{ex}</div>
                                  {settings.useWeightedAverage && w !== undefined && (
                                    <div className="text-[9px] font-normal text-slate-300 tabular-nums">
                                      ({w}%)
                                    </div>
                                  )}
                                </th>
                              );
                            })}
                            <th className="border border-slate-700 px-2 py-1.5 text-center">
                              {settings.useWeightedAverage ? 'Nilai Akhir' : 'Rata-Rata'}
                            </th>
                            <th className="border border-slate-700 px-2 py-1.5 text-center">
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
                    </div>
                  ),
                });
              });
            }
          }

          if (isReportSelected('rekap_presensi')) {
            if (attendanceRecaps.length === 0) {
              pages.push({
                pageKey: 'rekap_presensi',
                reportType: 'rekap_presensi',
                label: 'Rekap Presensi Bulanan',
                content: (
                  <div className="py-8 text-center">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                      REKAPITULASI PRESENSI SISWA
                    </h3>
                    <p className="text-xs text-slate-600 mt-2">
                      Belum ada data siswa maupun catatan presensi pada kelas yang dipilih.
                    </p>
                  </div>
                ),
              });
            } else {
              attendanceRecaps.forEach((recap) => {
                pages.push({
                  pageKey: `rekap_presensi:${recap.className}`,
                  reportType: 'rekap_presensi',
                  label: `Rekap Presensi · Kelas ${recap.className}`,
                  content: (
                    <div>
                      <div className="text-center mb-4">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                          REKAPITULASI PRESENSI SISWA — KELAS {recap.className}
                        </h3>
                        <p className="text-xs text-slate-700 mt-0.5">
                          Tahun Ajaran {settings.academicYear} · Semester {settings.semester} ·
                          Pertemuan: {recap.totalMeetings} · Rata-rata Kehadiran:{' '}
                          {recap.avgPresencePct}% · Perlu Pembinaan: {recap.attentionCount} siswa
                        </p>
                      </div>

                      <table className="w-full border-collapse border border-slate-900 text-[10.5px] text-slate-950">
                        <thead>
                          <tr className="bg-[#0f172a] text-white">
                            <th className="border border-slate-700 px-2 py-1.5 text-center w-8">No</th>
                            <th className="border border-slate-700 px-2 py-1.5 w-24">NIS</th>
                            <th className="border border-slate-700 px-2 py-1.5 text-left min-w-[150px]">
                              Nama Siswa
                            </th>
                            <th className="border border-slate-700 px-1.5 py-1.5 text-center w-10">
                              L/P
                            </th>
                            <th className="border border-slate-700 px-2 py-1.5 text-center">
                              Pertemuan
                            </th>
                            <th className="border border-slate-700 px-2 py-1.5 text-center">H</th>
                            <th className="border border-slate-700 px-2 py-1.5 text-center">S</th>
                            <th className="border border-slate-700 px-2 py-1.5 text-center">I</th>
                            <th className="border border-slate-700 px-2 py-1.5 text-center">A</th>
                            <th className="border border-slate-700 px-2 py-1.5 text-center">D</th>
                            <th className="border border-slate-700 px-2 py-1.5 text-center">
                              % Hadir
                            </th>
                            <th className="border border-slate-700 px-2 py-1.5 text-left">
                              Keterangan
                            </th>
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
                    </div>
                  ),
                });
              });
            }
          }

          if (isReportSelected('ketidakhadiran')) {
            pages.push({
              pageKey: 'ketidakhadiran',
              reportType: 'ketidakhadiran',
              label: 'Monitoring Ketidakhadiran (S/I/A/D)',
              content: (
                <div className="space-y-5">
                  <div className="text-center">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                      LAPORAN MONITORING &amp; TINDAK LANJUT KETIDAKHADIRAN SISWA
                    </h3>
                    <p className="text-xs text-slate-700 mt-0.5">
                      Tahun Ajaran {settings.academicYear} · Semester {settings.semester} · Sakit:{' '}
                      {absenceLog.counts.S} · Izin: {absenceLog.counts.I} · Alpha:{' '}
                      {absenceLog.counts.A} · Dispen: {absenceLog.counts.D}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase mb-2 text-slate-950">
                      A. Rekap Akumulasi Siswa Tidak Hadir ({absenceLog.summary.length} Siswa)
                    </h4>
                    <table className="w-full border-collapse border border-slate-900 text-[10.5px] text-slate-950">
                      <thead>
                        <tr className="bg-[#0f172a] text-white">
                          <th className="border border-slate-700 px-2 py-1.5 text-center w-8">No</th>
                          <th className="border border-slate-700 px-2 py-1.5 w-24">NIS</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-left">Nama Siswa</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center w-20">Kelas</th>
                          <th className="border border-slate-700 px-1.5 py-1.5 text-center w-10">
                            L/P
                          </th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">Sakit (S)</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">Izin (I)</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">Alpha (A)</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">Dispen (D)</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {absenceLog.summary.length === 0 ? (
                          <tr>
                            <td
                              colSpan={10}
                              className="border border-slate-900 py-5 text-center text-slate-500"
                            >
                              Tidak ada siswa yang tercatat tidak hadir pada filter tanggal/kelas
                              terpilih.
                            </td>
                          </tr>
                        ) : (
                          absenceLog.summary.map((s, idx) => (
                            <tr key={s.studentId}>
                              <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="border border-slate-900 px-2 py-1.5 tabular-nums">
                                {s.nis}
                              </td>
                              <td className="border border-slate-900 px-2 py-1.5 font-semibold">
                                {s.name}
                              </td>
                              <td className="border border-slate-900 px-2 py-1.5 text-center">
                                {s.className}
                              </td>
                              <td className="border border-slate-900 px-1.5 py-1.5 text-center">
                                {s.gender}
                              </td>
                              <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                                {s.S}
                              </td>
                              <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                                {s.I}
                              </td>
                              <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums font-bold">
                                {s.A}
                              </td>
                              <td className="border border-slate-900 px-2 py-1.5 text-center tabular-nums">
                                {s.D}
                              </td>
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
                    <table className="w-full border-collapse border border-slate-900 text-[10px] text-slate-950">
                      <thead>
                        <tr className="bg-[#0f172a] text-white">
                          <th className="border border-slate-700 px-2 py-1 text-center w-8">No</th>
                          <th className="border border-slate-700 px-2 py-1 w-24">Tanggal</th>
                          <th className="border border-slate-700 px-2 py-1 text-center w-12">Jam</th>
                          <th className="border border-slate-700 px-2 py-1 w-16">Kelas</th>
                          <th className="border border-slate-700 px-2 py-1 w-24">Mapel</th>
                          <th className="border border-slate-700 px-2 py-1">Nama Siswa</th>
                          <th className="border border-slate-700 px-2 py-1 text-center w-24">
                            Status
                          </th>
                          <th className="border border-slate-700 px-2 py-1">Catatan Guru</th>
                        </tr>
                      </thead>
                      <tbody>
                        {absenceLog.logs.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="border border-slate-900 py-5 text-center text-slate-500"
                            >
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
                              <td className="border border-slate-900 px-2 py-1 font-semibold">
                                {l.className}
                              </td>
                              <td className="border border-slate-900 px-2 py-1">{l.subject}</td>
                              <td className="border border-slate-900 px-2 py-1 font-medium">
                                {l.studentName}
                              </td>
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
                </div>
              ),
            });
          }

          if (isReportSelected('remedial')) {
            const allRemedials = remedialBlocks.flatMap((b) =>
              b.remedialStudents.map((r) => ({ block: b, row: r }))
            );
            pages.push({
              pageKey: 'remedial',
              reportType: 'remedial',
              label: 'Analisis Ketuntasan & Remedial',
              content: (
                <div className="space-y-5">
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
                      A. Ringkasan Daya Serap &amp; Ketuntasan Klasikal ({remedialBlocks.length}{' '}
                      Kelompok)
                    </h4>
                    <table className="w-full border-collapse border border-slate-900 text-[10.5px] text-slate-950">
                      <thead>
                        <tr className="bg-[#0f172a] text-white">
                          <th className="border border-slate-700 px-2 py-1.5 text-center w-8">No</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center w-20">
                            Kelas
                          </th>
                          <th className="border border-slate-700 px-2 py-1.5 text-left">
                            Mata Pelajaran
                          </th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">Siswa</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">Dinilai</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">Tuntas</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">
                            Remedial
                          </th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">
                            Daya Serap
                          </th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">
                            Rata-rata
                          </th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center">
                            Min / Maks
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {remedialBlocks.length === 0 ? (
                          <tr>
                            <td
                              colSpan={10}
                              className="border border-slate-900 py-5 text-center text-slate-500"
                            >
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
                              <td className="border border-slate-900 px-2 py-1.5 font-medium">
                                {b.subject}
                              </td>
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
                                {b.lowest !== null && b.highest !== null
                                  ? `${b.lowest} / ${b.highest}`
                                  : '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase mb-2 text-slate-950">
                      B. Daftar Siswa Wajib Remedial (&lt; KKM {settings.kkm}) — {allRemedials.length}{' '}
                      Entri
                    </h4>
                    <table className="w-full border-collapse border border-slate-900 text-[10px] text-slate-950">
                      <thead>
                        <tr className="bg-[#0f172a] text-white">
                          <th className="border border-slate-700 px-2 py-1 text-center w-8">No</th>
                          <th className="border border-slate-700 px-2 py-1 w-16">Kelas</th>
                          <th className="border border-slate-700 px-2 py-1">Mata Pelajaran</th>
                          <th className="border border-slate-700 px-2 py-1 w-24">NIS</th>
                          <th className="border border-slate-700 px-2 py-1">Nama Siswa</th>
                          <th className="border border-slate-700 px-2 py-1 text-center w-14">Nilai</th>
                          <th className="border border-slate-700 px-2 py-1 text-center w-14">
                            Kurang
                          </th>
                          <th className="border border-slate-700 px-2 py-1">Komponen &lt; KKM</th>
                          <th className="border border-slate-700 px-2 py-1">
                            Rekomendasi Tindak Lanjut
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {allRemedials.length === 0 ? (
                          <tr>
                            <td
                              colSpan={9}
                              className="border border-slate-900 py-5 text-center text-slate-500"
                            >
                              Seluruh siswa yang sudah dinilai memenuhi KKM ({settings.kkm}).
                            </td>
                          </tr>
                        ) : (
                          allRemedials.map((item, idx) => (
                            <tr
                              key={`${item.block.className}-${item.block.subject}-${item.row.student.id}`}
                            >
                              <td className="border border-slate-900 px-2 py-1 text-center tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="border border-slate-900 px-2 py-1 font-semibold">
                                {item.block.className}
                              </td>
                              <td className="border border-slate-900 px-2 py-1">
                                {item.block.subject}
                              </td>
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
                              <td className="border border-slate-900 px-2 py-1">
                                {item.row.actionNote}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ),
            });
          }

          if (isReportSelected('leger_kelas')) {
            if (classLedgers.length === 0) {
              emptyBlocks.push(
                'Leger Gabungan Kelas (belum ada data siswa/nilai pada filter kelas terpilih)'
              );
            } else {
              classLedgers.forEach((l) => {
                pages.push({
                  pageKey: `leger_kelas:${l.className}`,
                  reportType: 'leger_kelas',
                  label: `Leger Gabungan · Kelas ${l.className}`,
                  content: (
                    <div>
                      <div className="text-center mb-4">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                          LEGER NILAI GABUNGAN MATA PELAJARAN — KELAS {l.className}
                        </h3>
                        <p className="text-xs text-slate-700 mt-0.5">
                          KKM: {settings.kkm} · Tahun Ajaran {settings.academicYear} · Semester{' '}
                          {settings.semester}
                        </p>
                      </div>

                      <table className="w-full border-collapse border border-slate-900 text-[9.5px] text-slate-950">
                        <thead>
                          <tr className="bg-[#0f172a] text-white">
                            <th className="border border-slate-700 px-1.5 py-1 text-center w-7">No</th>
                            <th className="border border-slate-700 px-2 py-1 w-20">NIS</th>
                            <th className="border border-slate-700 px-2 py-1 text-left min-w-[130px]">
                              Nama Siswa
                            </th>
                            <th className="border border-slate-700 px-1 py-1 text-center w-8">L/P</th>
                            {l.subjects.map((subj) => (
                              <th
                                key={subj}
                                className="border border-slate-700 px-1.5 py-1 text-center"
                              >
                                {subj}
                              </th>
                            ))}
                            <th className="border border-slate-700 px-1.5 py-1 text-center">
                              Jumlah
                            </th>
                            <th className="border border-slate-700 px-1.5 py-1 text-center">
                              Rata-rata
                            </th>
                            <th className="border border-slate-700 px-1.5 py-1 text-center">Rank</th>
                            <th className="border border-slate-700 px-2 py-1 text-left">
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
                    </div>
                  ),
                });
              });
            }
          }

          if (isReportSelected('daftar_siswa')) {
            if (studentRosters.length === 0) {
              emptyBlocks.push('Daftar Peserta Didik (belum ada data siswa pada kelas terpilih)');
            } else {
              studentRosters.forEach((b) => {
                pages.push({
                  pageKey: `daftar_siswa:${b.className}`,
                  reportType: 'daftar_siswa',
                  label: `Daftar Peserta Didik · Kelas ${b.className}`,
                  content: (
                    <div>
                      <div className="text-center mb-4">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-950">
                          DAFTAR INDUK PESERTA DIDIK — KELAS {b.className}
                        </h3>
                        <p className="text-xs text-slate-700 mt-0.5">
                          Wali Kelas: {b.homeroomTeacher} · Laki-laki: {b.maleCount} · Perempuan:{' '}
                          {b.femaleCount} · Total: {b.totalCount} Siswa · TA {settings.academicYear}
                        </p>
                      </div>

                      <table className="w-full border-collapse border border-slate-900 text-[10.5px] text-slate-950">
                        <thead>
                          <tr className="bg-[#0f172a] text-white">
                            <th className="border border-slate-700 px-2 py-1.5 text-center w-8">No</th>
                            <th className="border border-slate-700 px-2 py-1.5 text-center w-14">
                              Absen
                            </th>
                            <th className="border border-slate-700 px-2 py-1.5 w-24">NIS</th>
                            <th className="border border-slate-700 px-2 py-1.5 w-28">NISN</th>
                            <th className="border border-slate-700 px-2 py-1.5 text-left">
                              Nama Lengkap
                            </th>
                            <th className="border border-slate-700 px-1.5 py-1.5 text-center w-10">
                              L/P
                            </th>
                            <th className="border border-slate-700 px-2 py-1.5 text-left">
                              Tempat, Tanggal Lahir
                            </th>
                            <th className="border border-slate-700 px-2 py-1.5 text-left">
                              Wali Kelas
                            </th>
                            <th className="border border-slate-700 px-2 py-1.5 text-center w-20">
                              Status
                            </th>
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
                              <td className="border border-slate-900 px-2 py-1.5">
                                {item.ttlDisplay}
                              </td>
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
                    </div>
                  ),
                });
              });
            }
          }
        }

        const pageLayoutsList = pages.map((p) => resolveSheetLayout(p.reportType, p.pageKey));
        const hasLandscape = pageLayoutsList.some((l) => l.orientation === 'landscape');
        const hasPortrait = pageLayoutsList.some((l) => l.orientation === 'portrait');
        const orientSummary =
          pages.length === 0
            ? paperMeta.id
            : hasLandscape && hasPortrait
              ? 'Campuran Portrait & Landscape'
              : hasLandscape
                ? 'Landscape'
                : 'Portrait';

        return (
          <>
            <div className="no-print flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
              <span>
                Pratinjau 1:1 (<strong className="text-slate-800">{pages.length} Halaman</strong> ·{' '}
                <strong className="text-slate-800">{orientSummary}</strong> · Huruf:{' '}
                <strong className="text-slate-800">{effectiveFontFamily}</strong>)
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {pages.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setPageOverrides((prev) => {
                          const next = { ...prev };
                          pages.forEach((p) => {
                            const cur = resolveSheetLayout(p.reportType, p.pageKey);
                            next[p.pageKey] = { paperSize: cur.paperSize, orientation: 'portrait' };
                          });
                          return next;
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
                    >
                      Semua Halaman Portrait
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPageOverrides((prev) => {
                          const next = { ...prev };
                          pages.forEach((p) => {
                            const cur = resolveSheetLayout(p.reportType, p.pageKey);
                            next[p.pageKey] = { paperSize: cur.paperSize, orientation: 'landscape' };
                          });
                          return next;
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
                    >
                      Semua Halaman Landscape
                    </button>
                  </>
                )}
              </div>
            </div>

            {emptyBlocks.length > 0 && (
              <div className="no-print p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800">
                <span className="font-semibold">Bagian tanpa data tidak dirender ke kertas:</span>{' '}
                {emptyBlocks.join(' · ')}
              </div>
            )}

            <section
              id="official-print-sheet"
              className="print-only-container eguru-scroll w-full overflow-x-auto py-4 px-2 sm:px-4 bg-slate-200/60 rounded-xl border border-slate-200 space-y-8 print:bg-transparent print:border-0 print:p-0 print:space-y-0 print:overflow-visible"
            >
              {pages.length === 0 ? (
                <div className="no-print py-16 px-6 text-center text-slate-600 bg-white space-y-2 border border-dashed border-slate-300 rounded-lg max-w-2xl mx-auto">
                  <p className="text-sm font-bold text-slate-800">
                    {selectedReports.length === 0
                      ? 'Belum ada jenis laporan yang dicentang'
                      : 'Tidak ada data yang cocok dengan filter'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Centang jenis laporan atau sesuaikan filter kelas/mapel/tanggal pada panel di atas untuk melihat pratinjau, mencetak, atau mengunduh PDF/Word.
                  </p>
                </div>
              ) : (
                pages.map((p, idx) => {
                  const layout = pageLayoutsList[idx];
                  const dims = getPaperDimensionsMm(layout.paperSize, layout.orientation);
                  const namedPage = getCssNamedPageName(layout.paperSize, layout.orientation);

                  return (
                    <div key={p.pageKey} className="space-y-2 print:space-y-0">
                      {/* Bar Pengatur Ukuran Kertas & Orientasi Independen per Halaman */}
                      <div
                        style={{ maxWidth: `${dims.widthMm}mm` }}
                        className="no-print mx-auto flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-slate-300 shadow-xs text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-bold text-[11px] shrink-0 tabular-nums">
                            Hal. {idx + 1}/{pages.length}
                          </span>
                          <span className="font-semibold text-slate-800 truncate">{p.label}</span>
                          <span className="hidden sm:inline text-[11px] text-slate-500 tabular-nums shrink-0">
                            ({dims.widthMm} × {dims.heightMm} mm)
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <select
                            aria-label={`Ukuran kertas ${p.label}`}
                            value={layout.paperSize}
                            onChange={(e) =>
                              updatePageLayout(p.pageKey, p.reportType, {
                                paperSize: e.target.value as PaperSize,
                              })
                            }
                            className="px-2 py-1 rounded border border-slate-300 bg-white text-[11px] font-semibold text-slate-800"
                          >
                            {PAPER_SIZE_OPTIONS.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.id}
                              </option>
                            ))}
                          </select>

                          <div className="inline-grid grid-cols-2 rounded border border-slate-300 bg-slate-50 p-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                updatePageLayout(p.pageKey, p.reportType, {
                                  orientation: 'portrait',
                                })
                              }
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                                layout.orientation === 'portrait'
                                  ? 'bg-slate-900 text-white'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Portrait
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updatePageLayout(p.pageKey, p.reportType, {
                                  orientation: 'landscape',
                                })
                              }
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                                layout.orientation === 'landscape'
                                  ? 'bg-slate-900 text-white'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Landscape
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Lembar Kertas Pratinjau & Cetak Resmi (1:1 Fisik mm + CSS Named Page) */}
                      <div
                        style={
                          {
                            width: `${dims.widthMm}mm`,
                            minHeight: `${dims.heightMm}mm`,
                            padding: '12mm',
                            fontFamily: previewFontCss,
                            page: namedPage,
                          } as React.CSSProperties
                        }
                        className={`eguru-paper-preview eguru-print-page bg-white border border-slate-300 shadow-md mx-auto print:border-0 print:shadow-none print:m-0 ${
                          idx > 0 ? 'eguru-print-page-break' : ''
                        }`}
                      >
                        <KopSuratPreviewBlock />
                        {documentNumber.trim() && (
                          <p className="text-xs text-slate-900 mb-2">
                            Nomor Dokumen: <strong>{documentNumber.trim()}</strong>
                          </p>
                        )}
                        {p.content}
                        <SignatureBlock />
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </>
        );
      })()}
    </div>
  );
};
