import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCheck,
  Copy,
  Download,
  ExternalLink,
  FileEdit,
  FileSpreadsheet,
  FileText,
  History,
  Link2,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  Target,
  Trash2,
  Upload,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  AttendanceStatus,
  JournalEntry,
  Student,
  StudentAttendanceItem,
  SystemSettings,
} from '../types';
import { exportReportToPdf, exportReportToWord } from '../utils/exportReports';
import {
  ATTENDANCE_META,
  formatTanggalID,
  formatTanggalShort,
  generateId,
  getTodayIso,
} from '../utils/helpers';

export interface JournalPresetDraft {
  date?: string;
  period?: string;
  className?: string;
  subject?: string;
}

interface JournalAttendanceViewProps {
  students: Student[];
  journals: JournalEntry[];
  settings: SystemSettings;
  currentUserId?: string;
  currentUserName?: string;
  readOnly?: boolean;
  draftJournal: { mode: 'create' | 'edit' | 'duplicate'; entry: JournalEntry } | null;
  presetDraft?: JournalPresetDraft | null;
  onConsumePresetDraft?: () => void;
  onClearDraft: () => void;
  onSaveJournal: (entry: JournalEntry, isEdit: boolean) => void;
  onImportJournals?: (entries: JournalEntry[]) => void;
  onDeleteJournals: (ids: string[]) => void;
  onBulkUpdateLedger: (updatedJournals: JournalEntry[]) => void;
  onViewStudent: (student: Student) => void;
  onViewClass?: (className: string) => void;
  onViewSubject?: (subject: string) => void;
  onNotify: (msg: string) => void;
}

const STATUS_OPTIONS: AttendanceStatus[] = ['H', 'S', 'I', 'A', 'D'];

export const JournalAttendanceView: React.FC<JournalAttendanceViewProps> = ({
  students,
  journals,
  settings,
  currentUserId,
  currentUserName,
  readOnly = false,
  draftJournal,
  presetDraft,
  onConsumePresetDraft,
  onClearDraft,
  onSaveJournal,
  onImportJournals,
  onDeleteJournals,
  onBulkUpdateLedger,
  onViewStudent,
  onViewClass,
  onViewSubject,
  onNotify,
}) => {
  // =========================================================================
  // BAGIAN 1: FORM JURNAL & PRESENSI PERTEMUAN
  // =========================================================================
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(getTodayIso());
  const [period, setPeriod] = useState<string>('1 - 2');
  const [className, setClassName] = useState<string>('');
  const [subject, setSubject] = useState<string>(''); // Mandatory placeholder initially
  const [topic, setTopic] = useState<string>('');
  const [learningObjective, setLearningObjective] = useState<string>('');
  const [materialUrl, setMaterialUrl] = useState<string>('');
  const [activities, setActivities] = useState<string>('');
  const [attendanceMap, setAttendanceMap] = useState<Record<string, StudentAttendanceItem>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const classStudents = useMemo(() => {
    if (!className) return [];
    return students
      .filter((s) => s.className === className)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, className]);

  // Populate attendance rows when className changes (unless loading an edit/duplicate draft)
  const handleSelectClass = (newCls: string) => {
    setClassName(newCls);
    const list = students.filter((s) => s.className === newCls);
    const nextMap: Record<string, StudentAttendanceItem> = {};
    list.forEach((st) => {
      nextMap[st.id] = attendanceMap[st.id] ?? { status: 'H', note: '' };
    });
    setAttendanceMap(nextMap);
  };

  useEffect(() => {
    if (!draftJournal) return;
    const { mode, entry } = draftJournal;
    setEditingId(mode === 'edit' ? entry.id : null);
    setDate(mode === 'duplicate' ? getTodayIso() : entry.date);
    setPeriod(entry.period);
    setClassName(entry.className);
    setSubject(entry.subject);
    setTopic(mode === 'duplicate' ? `${entry.topic} (Salinan)` : entry.topic);
    setLearningObjective(entry.learningObjective || '');
    setMaterialUrl(entry.materialUrl || '');
    setActivities(entry.activities);

    const clsList = students.filter((s) => s.className === entry.className);
    const hydrated: Record<string, StudentAttendanceItem> = {};
    clsList.forEach((st) => {
      hydrated[st.id] = entry.attendance[st.id]
        ? { ...entry.attendance[st.id] }
        : { status: 'H', note: '' };
    });
    setAttendanceMap(hydrated);
    setFormError(null);
    onClearDraft();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [draftJournal, students, onClearDraft]);

  useEffect(() => {
    if (!presetDraft) return;
    setEditingId(null);
    setDate(presetDraft.date || getTodayIso());
    setPeriod(presetDraft.period || '1 - 2');
    const targetCls = presetDraft.className || '';
    setClassName(targetCls);
    setSubject(presetDraft.subject || '');
    setTopic('');
    setLearningObjective('');
    setMaterialUrl('');
    setActivities('');
    if (targetCls) {
      const clsList = students.filter((s) => s.className === targetCls);
      const nextMap: Record<string, StudentAttendanceItem> = {};
      clsList.forEach((st) => {
        nextMap[st.id] = { status: 'H', note: '' };
      });
      setAttendanceMap(nextMap);
    }
    setFormError(null);
    onConsumePresetDraft?.();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [presetDraft, students, onConsumePresetDraft]);

  const handleSetAllPresent = () => {
    const next: Record<string, StudentAttendanceItem> = {};
    classStudents.forEach((st) => {
      next[st.id] = {
        status: 'H',
        note: attendanceMap[st.id]?.note || '',
      };
    });
    setAttendanceMap(next);
    onNotify(`Seluruh ${classStudents.length} siswa kelas ${className} diset Hadir (H).`);
  };

  const handleCopyLastAttendance = () => {
    if (!className) {
      onNotify('Pilih kelas terlebih dahulu untuk menyalin presensi terakhir.');
      return;
    }
    const sorted = [...journals]
      .filter((j) => j.className === className && j.id !== editingId)
      .sort((a, b) => b.date.localeCompare(a.date));
    const preferred = subject ? sorted.find((j) => j.subject === subject) : undefined;
    const latest = preferred || sorted[0];
    if (!latest) {
      onNotify(`Belum ada riwayat presensi sebelumnya untuk kelas ${className}.`);
      return;
    }
    const next: Record<string, StudentAttendanceItem> = {};
    classStudents.forEach((st) => {
      const prevItem = latest.attendance[st.id];
      next[st.id] = prevItem ? { status: prevItem.status, note: prevItem.note || '' } : { status: 'H', note: '' };
    });
    setAttendanceMap(next);
    onNotify(
      `Presensi pertemuan ${formatTanggalID(latest.date)} (${latest.subject}) berhasil disalin.`
    );
  };

  const handleResetForm = () => {
    setEditingId(null);
    setDate(getTodayIso());
    setPeriod('1 - 2');
    setClassName('');
    setSubject('');
    setTopic('');
    setLearningObjective('');
    setMaterialUrl('');
    setActivities('');
    setAttendanceMap({});
    setFormError(null);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      setFormError('Tanggal pertemuan wajib diisi.');
      return;
    }
    if (!className) {
      setFormError('Silakan pilih Kelas terlebih dahulu.');
      return;
    }
    if (!subject) {
      setFormError('Silakan pilih Mata Pelajaran (wajib dipilih).');
      return;
    }
    if (!topic.trim()) {
      setFormError('Materi pokok pembelajaran wajib diisi.');
      return;
    }

    const normalizedPeriod = period.trim() || '1 - 2';
    const existing = editingId ? journals.find((j) => j.id === editingId) : null;
    const targetYear = existing?.academicYear || settings.academicYear;
    const targetSemester = existing?.semester || settings.semester;

    const conflicting = journals.find(
      (j) =>
        j.id !== editingId &&
        j.date === date &&
        j.period.trim().toLowerCase() === normalizedPeriod.toLowerCase() &&
        j.className === className &&
        j.subject === subject &&
        (j.academicYear || settings.academicYear) === targetYear &&
        (j.semester || settings.semester) === targetSemester
    );
    if (conflicting) {
      setFormError(
        `Jurnal untuk ${className} (${subject}) pada tanggal ${formatTanggalID(date)} Jam ${normalizedPeriod} sudah tercatat ("${conflicting.topic}"). Edit jurnal yang ada atau ubah jam pelajaran.`
      );
      return;
    }

    const finalAttendance: Record<string, StudentAttendanceItem> = {};
    classStudents.forEach((st) => {
      finalAttendance[st.id] = attendanceMap[st.id] ?? { status: 'H', note: '' };
    });

    const nowIso = new Date().toISOString();

    const safeMaterialUrl = (() => {
      const trimmed = materialUrl.trim();
      if (!trimmed) return undefined;
      if (/^https?:\/\//i.test(trimmed)) return trimmed;
      return `https://${trimmed}`;
    })();

    const entry: JournalEntry = {
      id: editingId || generateId('jrn'),
      date,
      period: normalizedPeriod,
      className,
      subject,
      topic: topic.trim(),
      learningObjective: learningObjective.trim() || undefined,
      materialUrl: safeMaterialUrl,
      activities: activities.trim() || '-',
      attendance: finalAttendance,
      teacherId: existing?.teacherId || currentUserId,
      teacherName: existing?.teacherName || currentUserName || settings.teacherProfile.name,
      academicYear: targetYear,
      semester: targetSemester,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    onSaveJournal(entry, Boolean(editingId));
    handleResetForm();
  };

  const attendanceCounts = useMemo(() => {
    const counts = { H: 0, S: 0, I: 0, A: 0, D: 0 };
    classStudents.forEach((st) => {
      const s = attendanceMap[st.id]?.status ?? 'H';
      counts[s]++;
    });
    return counts;
  }, [classStudents, attendanceMap]);

  // =========================================================================
  // BAGIAN 2: RIWAYAT JURNAL TERSIMPAN
  // =========================================================================
  const [filterClass, setFilterClass] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const journalFileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredJournals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...journals]
      .filter((j) => {
        if (filterClass !== 'ALL' && j.className !== filterClass) return false;
        if (q) {
          const hay = `${j.topic} ${j.subject} ${j.activities} ${j.className}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [journals, filterClass, searchQuery]);

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllFiltered = () => {
    const visibleIds = filteredJournals.map((j) => j.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds(Array.from(new Set([...selectedIds, ...visibleIds])));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    onDeleteJournals(selectedIds);
    setSelectedIds([]);
  };

  const handleDownloadJournalTemplate = () => {
    const rows = [
      {
        Tanggal: getTodayIso(),
        'Jam Ke-': '1 - 2',
        Kelas: settings.classes[0] || 'X IPA 1',
        'Mata Pelajaran': settings.subjects[0] || 'Matematika',
        'Materi Pokok': 'Contoh Materi Pertemuan KBM',
        'Kegiatan Pembelajaran': 'Penyampaian materi, diskusi kelompok, dan latihan soal.',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Jurnal');
    XLSX.writeFile(wb, 'Template_Impor_Jurnal_EGuru.xlsx');
    onNotify('Template Excel (.xlsx) Jurnal Mengajar berhasil diunduh.');
  };

  const handleExportJournals = () => {
    const source =
      selectedIds.length > 0
        ? filteredJournals.filter((j) => selectedIds.includes(j.id))
        : filteredJournals;
    const rows = source.map((j, idx) => {
      const cnt = { H: 0, S: 0, I: 0, A: 0, D: 0 };
      Object.values(j.attendance).forEach((item) => {
        cnt[item.status] = (cnt[item.status] || 0) + 1;
      });
      return {
        No: idx + 1,
        Tanggal: j.date,
        'Jam Ke-': j.period,
        Kelas: j.className,
        'Mata Pelajaran': j.subject,
        'Materi Pokok': j.topic,
        'Kegiatan Pembelajaran': j.activities,
        Hadir: cnt.H,
        Sakit: cnt.S,
        Izin: cnt.I,
        Alpha: cnt.A,
        Dispen: cnt.D,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Jurnal');
    XLSX.writeFile(wb, 'Data_Jurnal_Mengajar_EGuru.xlsx');
    onNotify(
      `Berhasil mengekspor ${rows.length} jurnal${selectedIds.length > 0 ? ' terpilih' : ''} ke Excel.`
    );
  };

  const parseAndImportJournalRows = (
    rawRows: Array<{
      date: string;
      period: string;
      className: string;
      subject: string;
      topic: string;
      activities: string;
    }>
  ) => {
    const nowIso = new Date().toISOString();
    const valid: JournalEntry[] = [];
    rawRows.forEach((r) => {
      const cleanTopic = String(r.topic || '').trim();
      const cleanDate = String(r.date || getTodayIso()).trim();
      if (!cleanTopic || cleanDate.toLowerCase() === 'tanggal') return;
      const cls = String(r.className || settings.classes[0] || 'X IPA 1').trim();
      const subj = String(r.subject || settings.subjects[0] || 'Matematika').trim();
      const att: Record<string, StudentAttendanceItem> = {};
      students
        .filter((s) => s.className === cls)
        .forEach((s) => {
          att[s.id] = { status: 'H', note: '' };
        });
      valid.push({
        id: generateId('jrn'),
        date: /^\d{4}-\d{2}-\d{2}$/.test(cleanDate) ? cleanDate : getTodayIso(),
        period: String(r.period || '1 - 2').trim(),
        className: cls,
        subject: subj,
        topic: cleanTopic,
        activities: String(r.activities || '-').trim(),
        attendance: att,
        teacherId: currentUserId,
        teacherName: currentUserName || settings.teacherProfile.name,
        academicYear: settings.academicYear,
        semester: settings.semester,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    });

    if (valid.length === 0) {
      onNotify('Tidak ditemukan baris jurnal valid untuk diimpor.');
      return;
    }

    if (onImportJournals) {
      onImportJournals(valid);
    } else {
      valid.forEach((entry) => onSaveJournal(entry, false));
    }
    setPasteText('');
    setShowImportPanel(false);
  };

  const handleImportJournalPaste = () => {
    const lines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed = lines.map((line) => {
      const delim = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
      const cols = line.split(delim).map((c) => c.trim());
      return {
        date: cols[0] || getTodayIso(),
        period: cols[1] || '1 - 2',
        className: cols[2] || settings.classes[0] || 'X IPA 1',
        subject: cols[3] || settings.subjects[0] || 'Matematika',
        topic: cols[4] || '',
        activities: cols[5] || '-',
      };
    });
    parseAndImportJournalRows(parsed);
  };

  const handleJournalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const mapped = rows.map((row) => ({
        date: String(row['Tanggal'] ?? row['tanggal'] ?? getTodayIso()),
        period: String(row['Jam Ke-'] ?? row['Jam'] ?? row['jam'] ?? '1 - 2'),
        className: String(row['Kelas'] ?? row['kelas'] ?? settings.classes[0] ?? 'X IPA 1'),
        subject: String(
          row['Mata Pelajaran'] ?? row['Mapel'] ?? row['mapel'] ?? settings.subjects[0] ?? 'Matematika'
        ),
        topic: String(row['Materi Pokok'] ?? row['Materi'] ?? row['materi'] ?? ''),
        activities: String(row['Kegiatan Pembelajaran'] ?? row['Kegiatan'] ?? row['kegiatan'] ?? '-'),
      }));
      parseAndImportJournalRows(mapped);
    } catch {
      onNotify('Gagal membaca file Excel/CSV Jurnal. Pastikan format kolom sesuai template.');
    } finally {
      if (journalFileInputRef.current) journalFileInputRef.current.value = '';
    }
  };

  const loadEntryToForm = (entry: JournalEntry, mode: 'edit' | 'duplicate') => {
    setEditingId(mode === 'edit' ? entry.id : null);
    setDate(mode === 'duplicate' ? getTodayIso() : entry.date);
    setPeriod(entry.period);
    setClassName(entry.className);
    setSubject(entry.subject);
    setTopic(mode === 'duplicate' ? `${entry.topic} (Salinan)` : entry.topic);
    setLearningObjective(entry.learningObjective || '');
    setMaterialUrl(entry.materialUrl || '');
    setActivities(entry.activities);

    const clsList = students.filter((s) => s.className === entry.className);
    const hydrated: Record<string, StudentAttendanceItem> = {};
    clsList.forEach((st) => {
      hydrated[st.id] = entry.attendance[st.id]
        ? { ...entry.attendance[st.id] }
        : { status: 'H', note: '' };
    });
    setAttendanceMap(hydrated);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // =========================================================================
  // BAGIAN 3: LEGER KEHADIRAN PER KELAS (MENDATAR)
  // =========================================================================
  const [ledgerClass, setLedgerClass] = useState<string>(settings.classes[0] || '');
  const [ledgerSubject, setLedgerSubject] = useState<string>('ALL');
  // Draft map: `${journalId}__${studentId}` -> AttendanceStatus
  const [ledgerEdits, setLedgerEdits] = useState<Record<string, AttendanceStatus>>({});

  useEffect(() => {
    if (className && !settings.classes.includes(className)) {
      setClassName('');
      setAttendanceMap({});
    }
    if (subject && !settings.subjects.includes(subject)) {
      setSubject('');
    }
    if (filterClass !== 'ALL' && !settings.classes.includes(filterClass)) {
      setFilterClass('ALL');
    }
    if (
      (!ledgerClass && settings.classes.length > 0) ||
      (ledgerClass && !settings.classes.includes(ledgerClass))
    ) {
      setLedgerClass(settings.classes[0] || '');
      setLedgerEdits({});
    }
    if (ledgerSubject !== 'ALL' && !settings.subjects.includes(ledgerSubject)) {
      setLedgerSubject('ALL');
      setLedgerEdits({});
    }
  }, [settings.classes, settings.subjects, className, subject, filterClass, ledgerClass, ledgerSubject]);

  const ledgerStudents = useMemo(() => {
    return students
      .filter((s) => s.className === ledgerClass)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, ledgerClass]);

  const ledgerJournals = useMemo(() => {
    return journals
      .filter((j) => {
        if (j.className !== ledgerClass) return false;
        if (ledgerSubject !== 'ALL' && j.subject !== ledgerSubject) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [journals, ledgerClass, ledgerSubject]);

  const getCellStatus = (journal: JournalEntry, studentId: string): AttendanceStatus => {
    const key = `${journal.id}__${studentId}`;
    if (ledgerEdits[key]) return ledgerEdits[key];
    return journal.attendance[studentId]?.status ?? 'H';
  };

  const handleLedgerCellChange = (journalId: string, studentId: string, raw: string) => {
    const upper = raw.trim().toUpperCase().slice(-1);
    if (!['H', 'S', 'I', 'A', 'D'].includes(upper)) return;
    setLedgerEdits((prev) => ({
      ...prev,
      [`${journalId}__${studentId}`]: upper as AttendanceStatus,
    }));
  };

  const handleSaveLedgerChanges = () => {
    const entriesCount = Object.keys(ledgerEdits).length;
    if (entriesCount === 0) {
      onNotify('Tidak ada perubahan pada leger kehadiran.');
      return;
    }

    const updatedList: JournalEntry[] = [];
    ledgerJournals.forEach((j) => {
      let touched = false;
      const nextAttendance = { ...j.attendance };
      ledgerStudents.forEach((st) => {
        const key = `${j.id}__${st.id}`;
        if (ledgerEdits[key]) {
          touched = true;
          nextAttendance[st.id] = {
            status: ledgerEdits[key],
            note: nextAttendance[st.id]?.note || '',
          };
        }
      });
      if (touched) {
        updatedList.push({
          ...j,
          attendance: nextAttendance,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    if (updatedList.length > 0) {
      onBulkUpdateLedger(updatedList);
      setLedgerEdits({});
    }
  };

  const pendingEditsCount = Object.keys(ledgerEdits).length;

  const handleLedgerCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number
  ) => {
    let nextRow = rowIdx;
    let nextCol = colIdx;
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      nextRow = Math.min(ledgerStudents.length - 1, rowIdx + 1);
    } else if (e.key === 'ArrowUp') {
      nextRow = Math.max(0, rowIdx - 1);
    } else if (e.key === 'ArrowRight') {
      nextCol = Math.min(ledgerJournals.length - 1, colIdx + 1);
    } else if (e.key === 'ArrowLeft') {
      nextCol = Math.max(0, colIdx - 1);
    } else {
      return;
    }
    e.preventDefault();
    const el = document.querySelector<HTMLInputElement>(
      `input[data-att-row="${nextRow}"][data-att-col="${nextCol}"]`
    );
    if (el) {
      el.focus();
      el.select();
    }
  };

  const handleQuickExportJournalsPdf = async () => {
    const source =
      selectedIds.length > 0
        ? filteredJournals.filter((j) => selectedIds.includes(j.id))
        : filteredJournals;
    try {
      await exportReportToPdf(students, source, [], settings, {
        reportTypes: ['jurnal'],
        selectedClasses: filterClass !== 'ALL' ? [filterClass] : settings.classes,
        selectedSubject: 'ALL',
        startDate: '',
        endDate: '',
        showKopSurat: true,
        showPrincipalSig: false,
        showTeacherSig: true,
        showStampImg: settings.signatureStamp?.showStampDefault ?? true,
        paperSize: settings.reportPaperSize || 'A4',
        orientation: settings.reportOrientation || 'landscape',
        fontFamily: settings.reportFontFamily || settings.kopSurat.fontFamily || 'Times New Roman',
      });
      onNotify(`PDF Riwayat Jurnal (${source.length} entri) berhasil diunduh.`);
    } catch {
      onNotify('Gagal mengekspor PDF Riwayat Jurnal.');
    }
  };

  const handleQuickExportJournalsWord = async () => {
    const source =
      selectedIds.length > 0
        ? filteredJournals.filter((j) => selectedIds.includes(j.id))
        : filteredJournals;
    try {
      await exportReportToWord(students, source, [], settings, {
        reportTypes: ['jurnal'],
        selectedClasses: filterClass !== 'ALL' ? [filterClass] : settings.classes,
        selectedSubject: 'ALL',
        startDate: '',
        endDate: '',
        showKopSurat: true,
        showPrincipalSig: false,
        showTeacherSig: true,
        paperSize: settings.reportPaperSize || 'A4',
        orientation: settings.reportOrientation || 'landscape',
        fontFamily: settings.reportFontFamily || settings.kopSurat.fontFamily || 'Times New Roman',
      });
      onNotify(`Dokumen Word (.doc) Riwayat Jurnal (${source.length} entri) berhasil diunduh.`);
    } catch {
      onNotify('Gagal mengekspor Dokumen Word Riwayat Jurnal.');
    }
  };

  const handleQuickExportLedgerPdf = async () => {
    try {
      await exportReportToPdf(students, ledgerJournals, [], settings, {
        reportTypes: ['kehadiran'],
        selectedClasses: ledgerClass ? [ledgerClass] : settings.classes,
        selectedSubject: ledgerSubject,
        startDate: '',
        endDate: '',
        showKopSurat: true,
        showPrincipalSig: false,
        showTeacherSig: true,
        showStampImg: settings.signatureStamp?.showStampDefault ?? true,
        paperSize: settings.reportPaperSize || 'A4',
        orientation: 'landscape',
        fontFamily: settings.reportFontFamily || settings.kopSurat.fontFamily || 'Times New Roman',
      });
      onNotify(`PDF Leger Kehadiran kelas ${ledgerClass} berhasil diunduh.`);
    } catch {
      onNotify('Gagal mengekspor PDF Leger Kehadiran.');
    }
  };

  const handleQuickExportLedgerWord = async () => {
    try {
      await exportReportToWord(students, ledgerJournals, [], settings, {
        reportTypes: ['kehadiran'],
        selectedClasses: ledgerClass ? [ledgerClass] : settings.classes,
        selectedSubject: ledgerSubject,
        startDate: '',
        endDate: '',
        showKopSurat: true,
        showPrincipalSig: false,
        showTeacherSig: true,
        paperSize: settings.reportPaperSize || 'A4',
        orientation: 'landscape',
        fontFamily: settings.reportFontFamily || settings.kopSurat.fontFamily || 'Times New Roman',
      });
      onNotify(`Dokumen Word (.doc) Leger Kehadiran kelas ${ledgerClass} berhasil diunduh.`);
    } catch {
      onNotify('Gagal mengekspor Dokumen Word Leger Kehadiran.');
    }
  };

  return (
    <div className="space-y-8">
      {readOnly && (
        <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50 text-xs text-indigo-900">
          <p className="font-bold">Mode Pemantauan / Supervisi (Hanya Baca)</p>
          <p className="mt-0.5 text-indigo-800">
            Anda masuk dengan hak akses monitoring. Anda dapat memantau riwayat jurnal, melihat leger kehadiran, mengklik nama siswa/kelas/mapel, serta mengekspor data Excel tanpa mengubah catatan mengajar guru.
          </p>
        </div>
      )}

      {/* ===================================================================== */}
      {/* BAGIAN 1: FORM JURNAL & PRESENSI PERTEMUAN */}
      {/* ===================================================================== */}
      {!readOnly && (
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold">
              {editingId ? 'Edit Jurnal & Presensi Pertemuan' : 'Form Jurnal & Presensi Pertemuan'}
            </h2>
            <p className="text-xs text-slate-300">
              Catat materi pertemuan dan tandai kehadiran siswa secara langsung
            </p>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={handleResetForm}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white cursor-pointer whitespace-nowrap min-h-[38px]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Batal Edit</span>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmitForm} className="p-4 sm:p-6 space-y-5 sm:space-y-6">
          {formError && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tanggal</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Jam Ke-</label>
              <input
                type="text"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="Contoh: 1 - 2"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Kelas</label>
              <select
                value={className}
                onChange={(e) => handleSelectClass(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="">-- Pilih Kelas --</option>
                {settings.classes.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Mata Pelajaran <span className="text-rose-600">*</span>
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="">-- Pilih Mata Pelajaran --</option>
                {settings.subjects.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Materi Pokok / Topik Pembelajaran
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Tuliskan materi yang diajarkan pada pertemuan ini"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kegiatan Pembelajaran & Catatan KBM
              </label>
              <input
                type="text"
                value={activities}
                onChange={(e) => setActivities(e.target.value)}
                placeholder="Diskusi kelompok, latihan soal, praktik laboratorium, dll."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Target className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Tujuan Pembelajaran (TP / ATP) — Opsional</span>
                </label>
                {(settings.learningObjectives?.length || 0) > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setLearningObjective(e.target.value);
                    }}
                    className="px-2 py-1 text-[11px] rounded-md border border-slate-300 bg-white text-slate-700 max-w-[200px]"
                    title="Pilih dari Bank TP/ATP Pengaturan"
                  >
                    <option value="">+ Pilih Bank TP</option>
                    {(settings.learningObjectives || []).map((tp) => (
                      <option key={tp} value={tp}>
                        {tp}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <input
                type="text"
                value={learningObjective}
                onChange={(e) => setLearningObjective(e.target.value)}
                list="tp-bank-suggestions"
                placeholder="Ketik atau pilih Tujuan Pembelajaran / ATP..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
              <datalist id="tp-bank-suggestions">
                {(settings.learningObjectives || []).map((tp) => (
                  <option key={tp} value={tp} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                <Link2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Tautan Bahan Ajar / Modul / LKPD — Opsional</span>
              </label>
              <input
                type="url"
                value={materialUrl}
                onChange={(e) => setMaterialUrl(e.target.value)}
                placeholder="https://drive.google.com/... atau link Canva/Modul Ajar"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          {/* Daftar Presensi Siswa Saat Kelas Dipilih */}
          {className ? (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <span className="font-bold text-slate-900">
                    Daftar Presensi Kelas {className} ({classStudents.length} siswa)
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums font-medium text-emerald-700">H: {attendanceCounts.H}</span>
                  <span className="tabular-nums font-medium text-amber-700">S: {attendanceCounts.S}</span>
                  <span className="tabular-nums font-medium text-blue-700">I: {attendanceCounts.I}</span>
                  <span className="tabular-nums font-medium text-rose-700">A: {attendanceCounts.A}</span>
                  <span className="tabular-nums font-medium text-violet-700">D: {attendanceCounts.D}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLastAttendance}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    title="Salin status kehadiran dari pertemuan sebelumnya di kelas ini"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Salin Presensi Terakhir</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSetAllPresent}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Set Semua Hadir (H)</span>
                  </button>
                </div>
              </div>

              {classStudents.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Belum ada siswa terdaftar di kelas {className}. Tambahkan di menu Data Siswa.
                </div>
              ) : (
                <>
                  {/* Mobile Attendance Card List */}
                  <div className="md:hidden divide-y divide-slate-200 max-h-[480px] overflow-y-auto eguru-scroll">
                    {classStudents.map((st, idx) => {
                      const current = attendanceMap[st.id] ?? { status: 'H', note: '' };
                      return (
                        <div key={st.id} className="p-3.5 space-y-2.5 bg-white">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onViewStudent(st)}
                                className="text-left text-sm font-bold text-slate-900 hover:text-indigo-600 hover:underline cursor-pointer"
                              >
                                {idx + 1}. {st.name}
                              </button>
                              <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                                NIS {st.nis}
                              </p>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded border text-[11px] font-bold shrink-0 ${ATTENDANCE_META[current.status].bgClass} ${ATTENDANCE_META[current.status].textClass} ${ATTENDANCE_META[current.status].borderClass}`}
                            >
                              {ATTENDANCE_META[current.status].label}
                            </span>
                          </div>

                          <div className="grid grid-cols-5 gap-1.5">
                            {STATUS_OPTIONS.map((code) => {
                              const meta = ATTENDANCE_META[code];
                              const checked = current.status === code;
                              return (
                                <label
                                  key={code}
                                  className={`cursor-pointer select-none inline-flex items-center justify-center min-h-[42px] rounded-lg border text-xs font-bold transition-colors ${
                                    checked
                                      ? `${meta.bgClass} ${meta.textClass} ${meta.borderClass} ring-1 ring-inset ring-current`
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                  }`}
                                  title={meta.label}
                                >
                                  <input
                                    type="radio"
                                    name={`att-mobile-${st.id}`}
                                    value={code}
                                    checked={checked}
                                    onChange={() =>
                                      setAttendanceMap((prev) => ({
                                        ...prev,
                                        [st.id]: { ...current, status: code },
                                      }))
                                    }
                                    className="sr-only"
                                  />
                                  {code}
                                </label>
                              );
                            })}
                          </div>

                          <input
                            type="text"
                            value={current.note}
                            onChange={(e) =>
                              setAttendanceMap((prev) => ({
                                ...prev,
                                [st.id]: { ...current, note: e.target.value },
                              }))
                            }
                            placeholder="Catatan keterangan siswa (opsional)..."
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Attendance Table */}
                  <div className="hidden md:block max-h-[420px] overflow-auto eguru-scroll">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 z-10 bg-slate-900 text-white text-xs">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold w-12 text-center">No</th>
                          <th className="py-2.5 px-3 font-semibold w-28">NIS</th>
                          <th className="py-2.5 px-3 font-semibold min-w-[180px]">Nama Siswa</th>
                          <th className="py-2.5 px-3 font-semibold text-center min-w-[260px]">
                            Status Kehadiran (H / S / I / A / D)
                          </th>
                          <th className="py-2.5 px-3 font-semibold min-w-[180px]">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm">
                        {classStudents.map((st, idx) => {
                          const current = attendanceMap[st.id] ?? { status: 'H', note: '' };
                          return (
                            <tr key={st.id} className="hover:bg-slate-50">
                              <td className="py-2 px-3 text-center text-xs text-slate-500 tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3 text-xs font-mono text-slate-600 tabular-nums">
                                {st.nis}
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-900 text-xs sm:text-sm">
                                <button
                                  type="button"
                                  onClick={() => onViewStudent(st)}
                                  className="text-left font-semibold text-slate-900 hover:text-indigo-600 hover:underline focus-visible:outline-none focus-visible:underline cursor-pointer"
                                  title="Klik untuk lihat info siswa & aktivitas kelas"
                                >
                                  {st.name}
                                </button>
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex items-center justify-center gap-1.5">
                                  {STATUS_OPTIONS.map((code) => {
                                    const meta = ATTENDANCE_META[code];
                                    const checked = current.status === code;
                                    return (
                                      <label
                                        key={code}
                                        className={`cursor-pointer select-none inline-flex items-center justify-center w-9 h-8 rounded-md border text-xs font-bold transition-colors ${
                                          checked
                                            ? `${meta.bgClass} ${meta.textClass} ${meta.borderClass} ring-1 ring-inset ring-current`
                                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                                        }`}
                                        title={meta.label}
                                      >
                                        <input
                                          type="radio"
                                          name={`att-${st.id}`}
                                          value={code}
                                          checked={checked}
                                          onChange={() =>
                                            setAttendanceMap((prev) => ({
                                              ...prev,
                                              [st.id]: { ...current, status: code },
                                            }))
                                          }
                                          className="sr-only"
                                        />
                                        {code}
                                      </label>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  value={current.note}
                                  onChange={(e) =>
                                    setAttendanceMap((prev) => ({
                                      ...prev,
                                      [st.id]: { ...current, note: e.target.value },
                                    }))
                                  }
                                  placeholder="Catatan opsional..."
                                  className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500">
              Pilih <span className="font-semibold text-slate-700">Kelas</span> di atas untuk memunculkan daftar
              presensi siswa.
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={handleResetForm}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap min-h-[42px]"
            >
              Reset Form
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap min-h-[42px]"
            >
              {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{editingId ? 'Perbarui Jurnal & Presensi' : 'Simpan Jurnal & Presensi'}</span>
            </button>
          </div>
        </form>
      </section>
      )}

      {/* ===================================================================== */}
      {/* BAGIAN 2: RIWAYAT JURNAL TERSIMPAN */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 sm:gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Riwayat Jurnal Tersimpan</h3>
            <p className="text-xs text-slate-500">
              Total {filteredJournals.length} pertemuan ditemukan · Pilih beberapa baris untuk hapus massal
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari materi / mapel..."
                className="pl-8 pr-3 py-2 sm:py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 w-full sm:w-56 min-h-[40px] sm:min-h-0"
              />
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="col-span-2 sm:col-span-1 px-3 py-2 sm:py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 min-h-[40px] sm:min-h-0"
              >
                <option value="ALL">Semua Kelas</option>
                {settings.classes.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>

              {!readOnly && (
                <>
                  <button
                    type="button"
                    onClick={handleDownloadJournalTemplate}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Template</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowImportPanel((v) => !v)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0"
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-300" />
                    <span>{showImportPanel ? 'Tutup Impor' : 'Impor'}</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleExportJournals}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>
                  {selectedIds.length > 0 ? `Ekspor (${selectedIds.length})` : 'Ekspor Excel'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleQuickExportJournalsPdf}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>

              <button
                type="button"
                onClick={handleQuickExportJournalsWord}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Word (.doc)</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>Cetak</span>
              </button>

              {!readOnly && selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus ({selectedIds.length})</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {!readOnly && showImportPanel && (
          <div className="p-5 bg-indigo-50/50 border-b border-indigo-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-slate-900">Kotak Impor Jurnal Mengajar</h4>
                <p className="text-[11px] text-slate-600">
                  Urutan kolom:{' '}
                  <span className="font-mono font-semibold">
                    Tanggal (YYYY-MM-DD) [Tab] Jam Ke- [Tab] Kelas [Tab] Mata Pelajaran [Tab] Materi Pokok [Tab] Kegiatan
                  </span>
                </p>
              </div>
              <div>
                <input
                  ref={journalFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleJournalFileUpload}
                  className="hidden"
                  id="upload-journal-excel"
                />
                <label
                  htmlFor="upload-journal-excel"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Pilih File Excel / CSV</span>
                </label>
              </div>
            </div>

            <textarea
              rows={4}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`${getTodayIso()}\t1 - 2\t${settings.classes[0] || 'X IPA 1'}\t${settings.subjects[0] || 'Matematika'}\tPersamaan Kuadrat\tDiskusi kelompok & latihan soal`}
              className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportPanel(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleImportJournalPaste}
                disabled={!pasteText.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                Proses Impor Jurnal
              </button>
            </div>
          </div>
        )}

        {/* Mobile & Tablet Journal Card View */}
        <div className="lg:hidden">
          {filteredJournals.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              Tidak ada jurnal yang cocok dengan filter pencarian.
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer min-h-[34px]">
                  <input
                    type="checkbox"
                    checked={
                      filteredJournals.length > 0 &&
                      filteredJournals.every((j) => selectedIds.includes(j.id))
                    }
                    onChange={toggleSelectAllFiltered}
                    aria-label="Pilih semua jurnal"
                    className="w-4 h-4 rounded border-slate-400 cursor-pointer"
                  />
                  <span>Pilih Semua ({filteredJournals.length})</span>
                </label>
                {selectedIds.length > 0 && (
                  <span className="font-semibold text-indigo-700 tabular-nums">
                    {selectedIds.length} terpilih
                  </span>
                )}
              </div>

              <div className="divide-y divide-slate-200 max-h-[520px] overflow-y-auto eguru-scroll">
                {filteredJournals.map((j) => {
                  const cnt = { H: 0, S: 0, I: 0, A: 0, D: 0 };
                  Object.values(j.attendance).forEach((item) => {
                    cnt[item.status] = (cnt[item.status] || 0) + 1;
                  });
                  return (
                    <div key={j.id} className="p-4 space-y-2.5 hover:bg-slate-50/70">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(j.id)}
                            onChange={() => toggleSelectRow(j.id)}
                            aria-label={`Pilih jurnal ${j.topic}`}
                            className="w-4 h-4 mt-0.5 rounded border-slate-300 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="font-bold text-slate-900 tabular-nums">
                                {formatTanggalID(j.date)}
                              </span>
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-600 tabular-nums">Jam {j.period}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                              {onViewClass ? (
                                <button
                                  type="button"
                                  onClick={() => onViewClass(j.className)}
                                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 font-semibold text-slate-900 hover:text-indigo-700 cursor-pointer"
                                >
                                  {j.className}
                                </button>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-900">
                                  {j.className}
                                </span>
                              )}
                              {onViewSubject ? (
                                <button
                                  type="button"
                                  onClick={() => onViewSubject(j.subject)}
                                  className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold hover:underline cursor-pointer text-left"
                                >
                                  {j.subject}
                                </button>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">
                                  {j.subject}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums px-2 py-1 rounded bg-slate-100 text-slate-700 shrink-0">
                          H:{cnt.H} S:{cnt.S} I:{cnt.I} A:{cnt.A}
                        </span>
                      </div>

                      <div className="pl-6.5 space-y-1">
                        <p className="text-xs sm:text-sm font-bold text-slate-900">{j.topic}</p>
                        {j.learningObjective && (
                          <p className="text-[11px] font-medium text-indigo-700">
                            TP: {j.learningObjective}
                          </p>
                        )}
                        <p className="text-xs text-slate-600 line-clamp-2">{j.activities}</p>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          <span>
                            Oleh: {j.teacherName || settings.teacherProfile.name} ·{' '}
                            {j.academicYear || settings.academicYear} ({j.semester || settings.semester})
                          </span>
                          {j.materialUrl && /^https?:\/\//i.test(j.materialUrl) && (
                            <a
                              href={j.materialUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-semibold"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Bahan Ajar</span>
                            </a>
                          )}
                        </div>
                      </div>

                      {!readOnly && (
                        <div className="pl-6.5 flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => loadEntryToForm(j, 'edit')}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer min-h-[38px]"
                          >
                            <FileEdit className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => loadEntryToForm(j, 'duplicate')}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer min-h-[38px]"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Duplikat</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteJournals([j.id])}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer min-h-[38px]"
                            aria-label="Hapus jurnal"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block max-h-[420px] overflow-auto eguru-scroll">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-900 text-white text-xs">
              <tr>
                <th className="py-2.5 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredJournals.length > 0 &&
                      filteredJournals.every((j) => selectedIds.includes(j.id))
                    }
                    onChange={toggleSelectAllFiltered}
                    aria-label="Pilih semua jurnal"
                    className="rounded border-slate-400 cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-3 font-semibold">Tanggal / Jam</th>
                <th className="py-2.5 px-3 font-semibold">Kelas</th>
                <th className="py-2.5 px-3 font-semibold">Mata Pelajaran</th>
                <th className="py-2.5 px-3 font-semibold">Materi Pokok & Kegiatan</th>
                <th className="py-2.5 px-3 font-semibold text-center">Rekap</th>
                {!readOnly && <th className="py-2.5 px-4 font-semibold text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredJournals.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 6 : 7} className="py-10 text-center text-slate-500 text-sm">
                    Tidak ada jurnal yang cocok dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                filteredJournals.map((j) => {
                  const cnt = { H: 0, S: 0, I: 0, A: 0, D: 0 };
                  Object.values(j.attendance).forEach((item) => {
                    cnt[item.status] = (cnt[item.status] || 0) + 1;
                  });
                  return (
                    <tr key={j.id} className="hover:bg-slate-50 align-top">
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(j.id)}
                          onChange={() => toggleSelectRow(j.id)}
                          aria-label={`Pilih jurnal ${j.topic}`}
                          className="rounded border-slate-300 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-xs text-slate-700 tabular-nums">
                        <div className="font-semibold text-slate-900">{formatTanggalID(j.date)}</div>
                        <div className="text-slate-500">Jam {j.period}</div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-semibold text-xs text-slate-900">
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
                      <td className="py-3 px-3 whitespace-nowrap text-xs font-medium text-indigo-700">
                        {onViewSubject ? (
                          <button
                            type="button"
                            onClick={() => onViewSubject(j.subject)}
                            className="font-semibold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer text-left"
                            title={`Klik untuk lihat detail mata pelajaran ${j.subject}`}
                          >
                            {j.subject}
                          </button>
                        ) : (
                          j.subject
                        )}
                      </td>
                      <td className="py-3 px-3 min-w-[240px]">
                        <div className="text-xs font-semibold text-slate-900">{j.topic}</div>
                        {j.learningObjective && (
                          <div className="text-[11px] font-medium text-indigo-700 mt-0.5">
                            TP: {j.learningObjective}
                          </div>
                        )}
                        <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">{j.activities}</div>
                        <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                          <span>
                            Oleh: {j.teacherName || settings.teacherProfile.name} ·{' '}
                            {j.academicYear || settings.academicYear} ({j.semester || settings.semester})
                          </span>
                          {j.materialUrl && /^https?:\/\//i.test(j.materialUrl) && (
                            <a
                              href={j.materialUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-semibold"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Bahan Ajar</span>
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-center text-xs font-mono tabular-nums text-slate-700">
                        H:{cnt.H} S:{cnt.S} I:{cnt.I} A:{cnt.A} D:{cnt.D}
                      </td>
                      {!readOnly && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => loadEntryToForm(j, 'edit')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => loadEntryToForm(j, 'duplicate')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Duplikat</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteJournals([j.id])}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-50 cursor-pointer"
                              aria-label="Hapus jurnal"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* BAGIAN 3: LEGER KEHADIRAN PER KELAS (MENDATAR) */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 sm:gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Leger Kehadiran per Kelas (Mendatar)</h3>
            <p className="text-xs text-slate-500">
              Ketik langsung huruf <span className="font-mono font-semibold">H / S / I / A / D</span> pada sel
              tanggal pertemuan lalu klik Simpan Perubahan
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5">
            <select
              value={ledgerClass}
              onChange={(e) => {
                setLedgerClass(e.target.value);
                setLedgerEdits({});
              }}
              className="px-3 py-2 sm:py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 min-h-[40px] sm:min-h-0"
            >
              {settings.classes.map((cls) => (
                <option key={cls} value={cls}>
                  Kelas: {cls}
                </option>
              ))}
            </select>

            <select
              value={ledgerSubject}
              onChange={(e) => {
                setLedgerSubject(e.target.value);
                setLedgerEdits({});
              }}
              className="px-3 py-2 sm:py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 min-h-[40px] sm:min-h-0"
            >
              <option value="ALL">Semua Mapel</option>
              {settings.subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleQuickExportLedgerPdf}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>

            <button
              type="button"
              onClick={handleQuickExportLedgerWord}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Word (.doc)</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Cetak</span>
            </button>

            {!readOnly && (
              <button
                type="button"
                onClick={handleSaveLedgerChanges}
                disabled={pendingEditsCount === 0}
                className={`col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] sm:min-h-0 ${
                  pendingEditsCount > 0
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  Simpan Perubahan{pendingEditsCount > 0 ? ` (${pendingEditsCount})` : ''}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[460px] overflow-auto eguru-scroll">
          {ledgerStudents.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Belum ada siswa di kelas {ledgerClass}.
            </div>
          ) : ledgerJournals.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Belum ada pertemuan jurnal untuk kelas {ledgerClass} pada filter ini.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-900 text-white text-xs">
                <tr>
                  <th className="sticky left-0 z-30 bg-slate-900 py-2.5 px-2 sm:px-3 font-semibold w-9 sm:w-10 text-center border-r border-slate-800">
                    No
                  </th>
                  <th className="sticky left-9 sm:left-10 z-30 bg-slate-900 py-2.5 px-2.5 sm:px-3 font-semibold min-w-[130px] max-w-[145px] sm:min-w-[180px] sm:max-w-none border-r border-slate-800">
                    Nama Siswa
                  </th>
                  {ledgerJournals.map((j, idx) => (
                    <th
                      key={j.id}
                      className="py-2 px-2 font-semibold text-center min-w-[64px] border-r border-slate-800 tabular-nums"
                      title={`${formatTanggalID(j.date)} · ${j.subject} · ${j.topic}`}
                    >
                      <div>#{idx + 1}</div>
                      <div className="text-[10px] font-normal text-slate-300">
                        {formatTanggalShort(j.date)}
                      </div>
                    </th>
                  ))}
                  <th className="py-2.5 px-2 font-semibold text-center bg-slate-800">H</th>
                  <th className="py-2.5 px-2 font-semibold text-center bg-slate-800">S</th>
                  <th className="py-2.5 px-2 font-semibold text-center bg-slate-800">I</th>
                  <th className="py-2.5 px-2 font-semibold text-center bg-slate-800">A</th>
                  <th className="py-2.5 px-2 font-semibold text-center bg-slate-800">D</th>
                  <th className="py-2.5 px-3 font-semibold text-right bg-slate-800">% H</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {ledgerStudents.map((st, idx) => {
                  const sum = { H: 0, S: 0, I: 0, A: 0, D: 0 };
                  ledgerJournals.forEach((j) => {
                    const code = getCellStatus(j, st.id);
                    sum[code]++;
                  });
                  const pct =
                    ledgerJournals.length > 0
                      ? Math.round(((sum.H + sum.D) / ledgerJournals.length) * 100)
                      : 0;

                  return (
                    <tr key={st.id} className="hover:bg-slate-50">
                      <td className="sticky left-0 z-10 bg-white py-2 px-2 sm:px-3 text-center text-slate-500 tabular-nums border-r border-slate-200">
                        {idx + 1}
                      </td>
                      <td className="sticky left-9 sm:left-10 z-10 bg-white py-2 px-2.5 sm:px-3 font-medium text-slate-900 border-r border-slate-200 whitespace-nowrap min-w-[130px] max-w-[145px] sm:min-w-[180px] sm:max-w-none">
                        <button
                          type="button"
                          onClick={() => onViewStudent(st)}
                          className="text-left font-semibold text-slate-900 hover:text-indigo-600 hover:underline focus-visible:outline-none focus-visible:underline cursor-pointer truncate block max-w-[125px] sm:max-w-none"
                          title={`Klik untuk lihat info siswa ${st.name}`}
                        >
                          {st.name}
                        </button>
                      </td>
                      {ledgerJournals.map((j, colIdx) => {
                        const code = getCellStatus(j, st.id);
                        const meta = ATTENDANCE_META[code];
                        const isDirty = Boolean(ledgerEdits[`${j.id}__${st.id}`]);
                        return (
                          <td key={j.id} className="p-1 text-center border-r border-slate-100">
                            <input
                              type="text"
                              value={code}
                              maxLength={2}
                              readOnly={readOnly}
                              disabled={readOnly}
                              data-att-row={idx}
                              data-att-col={colIdx}
                              onKeyDown={(e) => handleLedgerCellKeyDown(e, idx, colIdx)}
                              onChange={(e) => handleLedgerCellChange(j.id, st.id, e.target.value)}
                              aria-label={`Kehadiran ${st.name} tanggal ${j.date}`}
                              className={`w-10 h-8 sm:h-7 text-center font-bold rounded border focus:outline-none focus:ring-2 focus:ring-indigo-600 uppercase disabled:cursor-default ${
                                meta.bgClass
                              } ${meta.textClass} ${
                                isDirty ? 'border-indigo-600 ring-1 ring-indigo-600' : meta.borderClass
                              }`}
                            />
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-center font-semibold text-emerald-700 tabular-nums bg-slate-50">
                        {sum.H}
                      </td>
                      <td className="py-2 px-2 text-center font-semibold text-amber-700 tabular-nums bg-slate-50">
                        {sum.S}
                      </td>
                      <td className="py-2 px-2 text-center font-semibold text-blue-700 tabular-nums bg-slate-50">
                        {sum.I}
                      </td>
                      <td className="py-2 px-2 text-center font-semibold text-rose-700 tabular-nums bg-slate-50">
                        {sum.A}
                      </td>
                      <td className="py-2 px-2 text-center font-semibold text-violet-700 tabular-nums bg-slate-50">
                        {sum.D}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900 tabular-nums bg-slate-50">
                        {pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};
