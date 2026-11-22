import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award, CheckCircle2, Download, FileSpreadsheet, Save, Trash2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { GradeRecord, RowMarkerColor, Student, SystemSettings } from '../types';
import { computeWeightedAverage, ROW_MARKER_META } from '../utils/helpers';

interface GradesMatrixViewProps {
  students: Student[];
  grades: GradeRecord[];
  settings: SystemSettings;
  currentUserId?: string;
  currentUserName?: string;
  readOnly?: boolean;
  onSaveGradesBatch: (records: GradeRecord[]) => void;
  onDeleteGrades?: (ids: string[]) => void;
  onViewStudent: (student: Student) => void;
  onViewClass?: (className: string) => void;
  onViewSubject?: (subject: string) => void;
  onNotify: (msg: string) => void;
}

const MARKER_KEYS: RowMarkerColor[] = ['neutral', 'green', 'yellow', 'red', 'blue'];

function makeGradeCompositeId(
  academicYear: string,
  semester: 'Ganjil' | 'Genap',
  studentId: string,
  subject: string,
  examType: string
): string {
  const yrSlug = academicYear.replace(/[^a-zA-Z0-9]/g, '');
  const subjSlug = subject.replace(/\s+/g, '');
  const exSlug = examType.replace(/\s+/g, '');
  return `grd-${yrSlug}-${semester}-${studentId}-${subjSlug}-${exSlug}`;
}

export const GradesMatrixView: React.FC<GradesMatrixViewProps> = ({
  students,
  grades,
  settings,
  currentUserId,
  currentUserName,
  readOnly = false,
  onSaveGradesBatch,
  onDeleteGrades,
  onViewStudent,
  onViewClass,
  onViewSubject,
  onNotify,
}) => {
  // =========================================================================
  // BAGIAN 1: INPUT NILAI PER JENIS UJIAN
  // =========================================================================
  const [selectedClass, setSelectedClass] = useState<string>(settings.classes[0] || '');
  const [selectedSubject, setSelectedSubject] = useState<string>(settings.subjects[0] || '');
  const [selectedExamType, setSelectedExamType] = useState<string>(settings.examTypes[0] || '');

  const [draftScores, setDraftScores] = useState<
    Record<string, { score: string; note: string; marker: RowMarkerColor }>
  >({});
  const [selectedInputIds, setSelectedInputIds] = useState<string[]>([]);
  const [showInputImport, setShowInputImport] = useState(false);
  const [inputPasteText, setInputPasteText] = useState('');
  const inputFileRef = useRef<HTMLInputElement | null>(null);

  const classStudents = useMemo(() => {
    return students
      .filter((s) => s.className === selectedClass)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, selectedClass]);

  // Hydrate Bagian 1 draft whenever filters or persisted grades change
  useEffect(() => {
    const next: Record<string, { score: string; note: string; marker: RowMarkerColor }> = {};
    classStudents.forEach((st) => {
      const existing = grades.find(
        (g) =>
          g.studentId === st.id &&
          g.className === selectedClass &&
          g.subject === selectedSubject &&
          g.examType === selectedExamType
      );
      next[st.id] = {
        score: existing && existing.score !== null ? String(existing.score) : '',
        note: existing?.note || '',
        marker: existing?.marker || 'neutral',
      };
    });
    setDraftScores(next);
  }, [classStudents, grades, selectedClass, selectedSubject, selectedExamType]);

  const liveStats = useMemo(() => {
    let sum = 0;
    let count = 0;
    let passed = 0;
    classStudents.forEach((st) => {
      const raw = draftScores[st.id]?.score;
      if (raw !== undefined && raw !== '') {
        const num = Number(raw);
        if (!Number.isNaN(num)) {
          sum += num;
          count++;
          if (num >= settings.kkm) passed++;
        }
      }
    });
    const avg = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
    return { avg, count, passed };
  }, [classStudents, draftScores, settings.kkm]);

  const handleAutoKKM = () => {
    const targetKkm = settings.kkm || 75;
    setDraftScores((prev) => {
      const next = { ...prev };
      classStudents.forEach((st) => {
        const cur = next[st.id] ?? { score: '', note: '', marker: 'neutral' };
        const num = cur.score === '' ? NaN : Number(cur.score);
        if (cur.score === '' || Number.isNaN(num) || num < targetKkm) {
          next[st.id] = {
            ...cur,
            score: String(targetKkm),
            marker: cur.marker === 'neutral' || cur.marker === 'yellow' || cur.marker === 'red' ? 'green' : cur.marker,
            note: cur.note || `Tuntas KKM (${targetKkm})`,
          };
        }
      });
      return next;
    });
    onNotify(`Nilai kosong atau di bawah KKM otomatis disesuaikan ke ${targetKkm}.`);
  };

  const handleSaveInputGrades = () => {
    const nowIso = new Date().toISOString();
    const teacherNameVal = currentUserName || settings.teacherProfile.name;
    const batch: GradeRecord[] = classStudents.map((st) => {
      const row = draftScores[st.id] ?? { score: '', note: '', marker: 'neutral' };
      const parsed = row.score.trim() === '' ? null : Math.max(0, Math.min(100, Number(row.score)));
      return {
        id: makeGradeCompositeId(
          settings.academicYear,
          settings.semester,
          st.id,
          selectedSubject,
          selectedExamType
        ),
        studentId: st.id,
        className: selectedClass,
        subject: selectedSubject,
        examType: selectedExamType,
        score: parsed !== null && Number.isNaN(parsed) ? null : parsed,
        note: row.note.trim(),
        marker: row.marker,
        teacherId: currentUserId,
        teacherName: teacherNameVal,
        academicYear: settings.academicYear,
        semester: settings.semester,
        updatedAt: nowIso,
      };
    });
    onSaveGradesBatch(batch);
  };

  const toggleSelectInputRow = (studentId: string) => {
    setSelectedInputIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const toggleSelectAllInput = () => {
    const visible = classStudents.map((s) => s.id);
    const allSelected = visible.length > 0 && visible.every((id) => selectedInputIds.includes(id));
    setSelectedInputIds(allSelected ? [] : visible);
  };

  const handleDeleteInputGrades = (studentIds: string[]) => {
    if (studentIds.length === 0) return;
    const targetGradeIds = grades
      .filter(
        (g) =>
          studentIds.includes(g.studentId) &&
          g.className === selectedClass &&
          g.subject === selectedSubject &&
          g.examType === selectedExamType
      )
      .map((g) => g.id);

    if (onDeleteGrades && targetGradeIds.length > 0) {
      onDeleteGrades(targetGradeIds);
    } else if (targetGradeIds.length === 0) {
      onNotify(`Isian nilai sementara untuk ${studentIds.length} siswa dikosongkan.`);
    }

    setDraftScores((prev) => {
      const next = { ...prev };
      studentIds.forEach((id) => {
        next[id] = { score: '', note: '', marker: 'neutral' };
      });
      return next;
    });
    setSelectedInputIds((prev) => prev.filter((id) => !studentIds.includes(id)));
  };

  const handleDownloadInputTemplate = () => {
    const rows =
      classStudents.length > 0
        ? classStudents.map((st, idx) => ({
            No: idx + 1,
            NIS: st.nis,
            'Nama Lengkap': st.name,
            Kelas: selectedClass,
            'Mata Pelajaran': selectedSubject,
            'Jenis Ujian': selectedExamType,
            Nilai: 80,
            Catatan: '',
          }))
        : [
            {
              No: 1,
              NIS: '25261001',
              'Nama Lengkap': 'Contoh Siswa',
              Kelas: selectedClass || 'X IPA 1',
              'Mata Pelajaran': selectedSubject || 'Matematika',
              'Jenis Ujian': selectedExamType || 'UH 1',
              Nilai: 85,
              Catatan: 'Sangat baik',
            },
          ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Nilai');
    XLSX.writeFile(wb, `Template_Nilai_${selectedClass}_${selectedExamType}.xlsx`);
    onNotify('Template Excel (.xlsx) Input Nilai berhasil diunduh.');
  };

  const handleExportInputGrades = () => {
    const targetStudents =
      selectedInputIds.length > 0
        ? classStudents.filter((st) => selectedInputIds.includes(st.id))
        : classStudents;
    const rows = targetStudents.map((st, idx) => {
      const row = draftScores[st.id] ?? { score: '', note: '', marker: 'neutral' };
      return {
        No: idx + 1,
        NIS: st.nis,
        'Nama Lengkap': st.name,
        Kelas: selectedClass,
        'Mata Pelajaran': selectedSubject,
        'Jenis Ujian': selectedExamType,
        Nilai: row.score === '' ? '-' : Number(row.score),
        Status: ROW_MARKER_META[row.marker].label,
        Catatan: row.note || '-',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nilai Ujian');
    XLSX.writeFile(wb, `Nilai_${selectedClass}_${selectedSubject}_${selectedExamType}.xlsx`);
    onNotify(
      `Berhasil mengekspor ${rows.length} data nilai${selectedInputIds.length > 0 ? ' terpilih' : ''} ke Excel.`
    );
  };

  const applyImportedInputRows = (
    rawRows: Array<{ nis: string; name: string; score: string; note: string }>
  ) => {
    const nowIso = new Date().toISOString();
    const toSave: GradeRecord[] = [];
    const nextDraft = { ...draftScores };

    rawRows.forEach((r) => {
      const cleanNis = String(r.nis || '').trim();
      const cleanName = String(r.name || '').trim().toLowerCase();
      if (cleanNis.toLowerCase() === 'nis' || r.score === '') return;

      const student = classStudents.find(
        (s) => s.nis === cleanNis || (cleanName && s.name.toLowerCase() === cleanName)
      );
      if (!student) return;

      const num = Number(r.score);
      if (Number.isNaN(num)) return;
      const clamped = Math.max(0, Math.min(100, num));
      const marker: RowMarkerColor = clamped >= settings.kkm ? 'green' : 'yellow';

      nextDraft[student.id] = {
        score: String(clamped),
        note: String(r.note || '').trim(),
        marker,
      };
      toSave.push({
        id: makeGradeCompositeId(
          settings.academicYear,
          settings.semester,
          student.id,
          selectedSubject,
          selectedExamType
        ),
        studentId: student.id,
        className: selectedClass,
        subject: selectedSubject,
        examType: selectedExamType,
        score: clamped,
        note: String(r.note || '').trim(),
        marker,
        teacherId: currentUserId,
        teacherName: currentUserName || settings.teacherProfile.name,
        academicYear: settings.academicYear,
        semester: settings.semester,
        updatedAt: nowIso,
      });
    });

    if (toSave.length === 0) {
      onNotify('Tidak ada baris nilai yang cocok dengan NIS/Nama siswa di kelas ini.');
      return;
    }

    setDraftScores(nextDraft);
    onSaveGradesBatch(toSave);
    setInputPasteText('');
    setShowInputImport(false);
  };

  const handleImportInputPaste = () => {
    const lines = inputPasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed = lines.map((line) => {
      const delim = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
      const cols = line.split(delim).map((c) => c.trim());
      return {
        nis: cols[0] || '',
        name: cols[1] || '',
        score: cols[2] ?? '',
        note: cols[3] || '',
      };
    });
    applyImportedInputRows(parsed);
  };

  const handleImportInputFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const mapped = rows.map((row) => ({
        nis: String(row['NIS'] ?? row['nis'] ?? ''),
        name: String(row['Nama Lengkap'] ?? row['Nama'] ?? row['Nama Siswa'] ?? ''),
        score: String(row['Nilai'] ?? row['Skor'] ?? row['nilai'] ?? ''),
        note: String(row['Catatan'] ?? row['Keterangan'] ?? ''),
      }));
      applyImportedInputRows(mapped);
    } catch {
      onNotify('Gagal membaca file Excel/CSV nilai. Pastikan format kolom sesuai template.');
    } finally {
      if (inputFileRef.current) inputFileRef.current.value = '';
    }
  };

  // =========================================================================
  // BAGIAN 2: RIWAYAT MATRIKS NILAI PER KELAS (LEGER MENDATAR)
  // =========================================================================
  const [matrixClass, setMatrixClass] = useState<string>(settings.classes[0] || '');
  const [matrixSubject, setMatrixSubject] = useState<string>(settings.subjects[0] || '');
  const [matrixEdits, setMatrixEdits] = useState<Record<string, string>>({}); // `${studentId}__${examType}` -> string
  const [selectedMatrixIds, setSelectedMatrixIds] = useState<string[]>([]);
  const [showMatrixImport, setShowMatrixImport] = useState(false);
  const [matrixPasteText, setMatrixPasteText] = useState('');
  const matrixFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectedClass || !settings.classes.includes(selectedClass)) {
      setSelectedClass(settings.classes[0] || '');
      setSelectedInputIds([]);
    }
    if (!selectedSubject || !settings.subjects.includes(selectedSubject)) {
      setSelectedSubject(settings.subjects[0] || '');
    }
    if (!matrixClass || !settings.classes.includes(matrixClass)) {
      setMatrixClass(settings.classes[0] || '');
      setMatrixEdits({});
      setSelectedMatrixIds([]);
    }
    if (!matrixSubject || !settings.subjects.includes(matrixSubject)) {
      setMatrixSubject(settings.subjects[0] || '');
      setMatrixEdits({});
    }
  }, [settings.classes, settings.subjects, selectedClass, selectedSubject, matrixClass, matrixSubject]);

  const matrixStudents = useMemo(() => {
    return students
      .filter((s) => s.className === matrixClass)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, matrixClass]);

  const getMatrixCellValue = (studentId: string, examType: string): string => {
    const key = `${studentId}__${examType}`;
    if (key in matrixEdits) return matrixEdits[key];
    const rec = grades.find(
      (g) =>
        g.studentId === studentId &&
        g.className === matrixClass &&
        g.subject === matrixSubject &&
        g.examType === examType
    );
    return rec && rec.score !== null ? String(rec.score) : '';
  };

  const handleMatrixCellChange = (studentId: string, examType: string, val: string) => {
    if (val !== '' && !/^\d{0,3}$/.test(val)) return;
    if (val !== '' && Number(val) > 100) return;
    setMatrixEdits((prev) => ({
      ...prev,
      [`${studentId}__${examType}`]: val,
    }));
  };

  const handleSaveMatrixEdits = () => {
    const keys = Object.keys(matrixEdits);
    if (keys.length === 0) {
      onNotify('Tidak ada perubahan nilai pada matriks.');
      return;
    }

    const nowIso = new Date().toISOString();
    const batch: GradeRecord[] = [];

    keys.forEach((key) => {
      const [studentId, examType] = key.split('__');
      const raw = matrixEdits[key].trim();
      const score = raw === '' ? null : Math.max(0, Math.min(100, Number(raw)));
      const existing = grades.find(
        (g) =>
          g.studentId === studentId &&
          g.className === matrixClass &&
          g.subject === matrixSubject &&
          g.examType === examType
      );
      batch.push({
        id:
          existing?.id ||
          makeGradeCompositeId(
            settings.academicYear,
            settings.semester,
            studentId,
            matrixSubject,
            examType
          ),
        studentId,
        className: matrixClass,
        subject: matrixSubject,
        examType,
        score: score !== null && Number.isNaN(score) ? null : score,
        note: existing?.note || '',
        marker:
          existing?.marker ||
          (score !== null ? (score >= settings.kkm ? 'green' : 'yellow') : 'neutral'),
        teacherId: existing?.teacherId || currentUserId,
        teacherName: existing?.teacherName || currentUserName || settings.teacherProfile.name,
        academicYear: existing?.academicYear || settings.academicYear,
        semester: existing?.semester || settings.semester,
        updatedAt: nowIso,
      });
    });

    onSaveGradesBatch(batch);
    setMatrixEdits({});
  };

  const pendingMatrixCount = Object.keys(matrixEdits).length;

  const toggleSelectMatrixRow = (studentId: string) => {
    setSelectedMatrixIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const toggleSelectAllMatrix = () => {
    const visible = matrixStudents.map((s) => s.id);
    const allSelected = visible.length > 0 && visible.every((id) => selectedMatrixIds.includes(id));
    setSelectedMatrixIds(allSelected ? [] : visible);
  };

  const handleDeleteMatrixSelected = () => {
    if (selectedMatrixIds.length === 0) return;
    const idsToDelete = grades
      .filter(
        (g) =>
          selectedMatrixIds.includes(g.studentId) &&
          g.className === matrixClass &&
          g.subject === matrixSubject
      )
      .map((g) => g.id);
    if (onDeleteGrades && idsToDelete.length > 0) {
      onDeleteGrades(idsToDelete);
    } else if (idsToDelete.length === 0) {
      onNotify('Tidak ada nilai tersimpan pada siswa yang dipilih.');
    }
    setMatrixEdits((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        const [sid] = k.split('__');
        if (selectedMatrixIds.includes(sid)) delete next[k];
      });
      return next;
    });
    setSelectedMatrixIds([]);
  };

  const handleDownloadMatrixTemplate = () => {
    const rows = (matrixStudents.length > 0
      ? matrixStudents
      : [{ nis: '25261001', name: 'Contoh Siswa' }]
    ).map((st, idx) => {
      const row: Record<string, string | number> = {
        No: idx + 1,
        NIS: st.nis,
        'Nama Siswa': st.name,
      };
      settings.examTypes.forEach((ex) => {
        row[ex] = 80;
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Matriks');
    XLSX.writeFile(wb, `Template_Matriks_${matrixClass}_${matrixSubject}.xlsx`);
    onNotify('Template Excel (.xlsx) Matriks Nilai berhasil diunduh.');
  };

  const handleExportMatrix = () => {
    const targetStudents =
      selectedMatrixIds.length > 0
        ? matrixStudents.filter((st) => selectedMatrixIds.includes(st.id))
        : matrixStudents;
    const rows = targetStudents.map((st, idx) => {
      const scoreByExam: Record<string, number | null> = {};
      const row: Record<string, string | number> = {
        No: idx + 1,
        NIS: st.nis,
        'Nama Siswa': st.name,
      };
      settings.examTypes.forEach((ex) => {
        const val = getMatrixCellValue(st.id, ex);
        const num = val === '' || Number.isNaN(Number(val)) ? null : Number(val);
        row[ex] = num !== null ? num : '-';
        scoreByExam[ex] = num;
      });
      const { avg } = computeWeightedAverage(
        scoreByExam,
        settings.examTypes,
        settings.examWeights,
        settings.useWeightedAverage
      );
      row[settings.useWeightedAverage ? 'Nilai Akhir (Berbobot)' : 'Rata-Rata'] =
        avg !== null ? avg : '-';
      row['Status KKM'] = avg !== null ? (avg >= settings.kkm ? 'Tuntas' : 'Remedial') : '-';
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Matriks Nilai');
    XLSX.writeFile(wb, `Matriks_Nilai_${matrixClass}_${matrixSubject}.xlsx`);
    onNotify(
      `Berhasil mengekspor ${rows.length} baris matriks nilai${selectedMatrixIds.length > 0 ? ' terpilih' : ''} ke Excel.`
    );
  };

  const handleMatrixFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const nowIso = new Date().toISOString();
      const batch: GradeRecord[] = [];

      rows.forEach((row) => {
        const cleanNis = String(row['NIS'] ?? row['nis'] ?? '').trim();
        const cleanName = String(row['Nama Siswa'] ?? row['Nama Lengkap'] ?? row['Nama'] ?? '')
          .trim()
          .toLowerCase();
        const st = matrixStudents.find(
          (s) => s.nis === cleanNis || (cleanName && s.name.toLowerCase() === cleanName)
        );
        if (!st) return;
        settings.examTypes.forEach((ex) => {
          const raw = row[ex];
          if (raw === undefined || raw === null || String(raw).trim() === '' || String(raw) === '-') {
            return;
          }
          const num = Number(raw);
          if (Number.isNaN(num)) return;
          const clamped = Math.max(0, Math.min(100, num));
          batch.push({
            id: makeGradeCompositeId(
              settings.academicYear,
              settings.semester,
              st.id,
              matrixSubject,
              ex
            ),
            studentId: st.id,
            className: matrixClass,
            subject: matrixSubject,
            examType: ex,
            score: clamped,
            note: '',
            marker: clamped >= settings.kkm ? 'green' : 'yellow',
            teacherId: currentUserId,
            teacherName: currentUserName || settings.teacherProfile.name,
            academicYear: settings.academicYear,
            semester: settings.semester,
            updatedAt: nowIso,
          });
        });
      });

      if (batch.length === 0) {
        onNotify('Tidak ada sel nilai matriks yang cocok untuk diimpor.');
        return;
      }
      onSaveGradesBatch(batch);
      setMatrixEdits({});
      setShowMatrixImport(false);
    } catch {
      onNotify('Gagal membaca file Excel matriks nilai.');
    } finally {
      if (matrixFileRef.current) matrixFileRef.current.value = '';
    }
  };

  const handleImportMatrixPaste = () => {
    const lines = matrixPasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const nowIso = new Date().toISOString();
    const batch: GradeRecord[] = [];
    lines.forEach((line) => {
      const delim = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
      const cols = line.split(delim).map((c) => c.trim());
      const cleanNis = cols[0] || '';
      const cleanName = (cols[1] || '').toLowerCase();
      const st = matrixStudents.find(
        (s) => s.nis === cleanNis || (cleanName && s.name.toLowerCase() === cleanName)
      );
      if (!st) return;
      settings.examTypes.forEach((ex, idx) => {
        const raw = cols[2 + idx];
        if (!raw || raw === '-') return;
        const num = Number(raw);
        if (Number.isNaN(num)) return;
        const clamped = Math.max(0, Math.min(100, num));
        batch.push({
          id: makeGradeCompositeId(
            settings.academicYear,
            settings.semester,
            st.id,
            matrixSubject,
            ex
          ),
          studentId: st.id,
          className: matrixClass,
          subject: matrixSubject,
          examType: ex,
          score: clamped,
          note: '',
          marker: clamped >= settings.kkm ? 'green' : 'yellow',
          teacherId: currentUserId,
          teacherName: currentUserName || settings.teacherProfile.name,
          academicYear: settings.academicYear,
          semester: settings.semester,
          updatedAt: nowIso,
        });
      });
    });
    if (batch.length === 0) {
      onNotify('Tidak ditemukan baris matriks nilai valid untuk diimpor.');
      return;
    }
    onSaveGradesBatch(batch);
    setMatrixPasteText('');
    setShowMatrixImport(false);
  };

  return (
    <div className="space-y-8">
      {readOnly && (
        <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50 text-xs text-indigo-900">
          <p className="font-bold">Mode Pemantauan Matriks Nilai (Hanya Baca)</p>
          <p className="mt-0.5 text-indigo-800">
            Anda dapat memantau leger nilai per kelas &amp; mata pelajaran, melihat status ketuntasan KKM, serta mengekspor rekap Excel tanpa mengubah skor input guru.
          </p>
        </div>
      )}

      {/* ===================================================================== */}
      {/* BAGIAN 1: INPUT NILAI PER JENIS UJIAN */}
      {/* ===================================================================== */}
      {!readOnly && (
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 bg-slate-900 text-white flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-base font-bold">Input Nilai per Jenis Ujian</h2>
            <p className="text-xs text-slate-300">
              Lengkapi skor 0–100, catatan guru, serta 5 penanda status pembinaan siswa
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 tabular-nums">
              Rata-rata Live:{' '}
              <span className="font-bold text-indigo-300 text-sm ml-1">{liveStats.avg}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 tabular-nums">
              Tuntas KKM ({settings.kkm}):{' '}
              <span className="font-bold text-emerald-300 ml-1">
                {liveStats.passed} / {liveStats.count}
              </span>
            </div>
          </div>
        </div>

        {/* Filter & Action Toolbar */}
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">Kelas</label>
                {onViewClass && selectedClass && (
                  <button
                    type="button"
                    onClick={() => onViewClass(selectedClass)}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                  >
                    Detail Kelas
                  </button>
                )}
              </div>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                {settings.classes.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">Mata Pelajaran</label>
                {onViewSubject && selectedSubject && (
                  <button
                    type="button"
                    onClick={() => onViewSubject(selectedSubject)}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                  >
                    Detail Mapel
                  </button>
                )}
              </div>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                {settings.subjects.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Ujian</label>
              <select
                value={selectedExamType}
                onChange={(e) => setSelectedExamType(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                {settings.examTypes.map((ex) => (
                  <option key={ex} value={ex}>
                    {ex}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
            <button
              type="button"
              onClick={handleDownloadInputTemplate}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" />
              <span>Template</span>
            </button>
            <button
              type="button"
              onClick={() => setShowInputImport((v) => !v)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-300" />
              <span>{showInputImport ? 'Tutup Impor' : 'Impor'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportInputGrades}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>
                {selectedInputIds.length > 0
                  ? `Ekspor (${selectedInputIds.length})`
                  : 'Ekspor Excel'}
              </span>
            </button>
            {selectedInputIds.length > 0 && (
              <button
                type="button"
                onClick={() => handleDeleteInputGrades(selectedInputIds)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus ({selectedInputIds.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleAutoKKM}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <Award className="w-4 h-4" />
              <span>Auto KKM {settings.kkm || 75}</span>
            </button>
            <button
              type="button"
              onClick={handleSaveInputGrades}
              className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[42px] sm:min-h-[40px]"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Nilai</span>
            </button>
          </div>
        </div>

        {showInputImport && (
          <div className="p-5 bg-indigo-50/50 border-b border-indigo-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Kotak Impor Nilai ({selectedClass} · {selectedSubject} · {selectedExamType})
                </h4>
                <p className="text-[11px] text-slate-600">
                  Urutan kolom:{' '}
                  <span className="font-mono font-semibold">
                    NIS [Tab] Nama Lengkap [Tab] Nilai (0-100) [Tab] Catatan
                  </span>
                </p>
              </div>
              <div>
                <input
                  ref={inputFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportInputFile}
                  className="hidden"
                  id="upload-input-grades-excel"
                />
                <label
                  htmlFor="upload-input-grades-excel"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Pilih File Excel / CSV</span>
                </label>
              </div>
            </div>
            <textarea
              rows={4}
              value={inputPasteText}
              onChange={(e) => setInputPasteText(e.target.value)}
              placeholder={`25261001\tAhmad Fauzan\t88\tTuntas dengan baik`}
              className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowInputImport(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleImportInputPaste}
                disabled={!inputPasteText.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                Proses Impor Nilai
              </button>
            </div>
          </div>
        )}

        {/* Marker Legend */}
        <div className="px-4 sm:px-5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Penanda Baris:</span>
          {MARKER_KEYS.map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${ROW_MARKER_META[key].dotClass}`} />
              <span>{ROW_MARKER_META[key].label}</span>
            </span>
          ))}
        </div>

        {/* Mobile & Tablet Student Score Card View */}
        <div className="lg:hidden">
          {classStudents.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Belum ada siswa di kelas {selectedClass}.
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer min-h-[34px]">
                  <input
                    type="checkbox"
                    checked={
                      classStudents.length > 0 &&
                      classStudents.every((s) => selectedInputIds.includes(s.id))
                    }
                    onChange={toggleSelectAllInput}
                    aria-label="Pilih semua siswa untuk input nilai"
                    className="w-4 h-4 rounded border-slate-400 cursor-pointer"
                  />
                  <span>Pilih Semua ({classStudents.length} Siswa)</span>
                </label>
                {selectedInputIds.length > 0 && (
                  <span className="font-semibold text-indigo-700 tabular-nums">
                    {selectedInputIds.length} terpilih
                  </span>
                )}
              </div>

              <div className="divide-y divide-slate-200 max-h-[540px] overflow-y-auto eguru-scroll">
                {classStudents.map((st, idx) => {
                  const row = draftScores[st.id] ?? { score: '', note: '', marker: 'neutral' };
                  const markerMeta = ROW_MARKER_META[row.marker];
                  const numScore = row.score !== '' ? Number(row.score) : null;
                  const passedKkm = numScore !== null && !Number.isNaN(numScore) && numScore >= settings.kkm;
                  return (
                    <div key={st.id} className={`p-3.5 space-y-2.5 ${markerMeta.rowBgClass} transition-colors`}>
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedInputIds.includes(st.id)}
                            onChange={() => toggleSelectInputRow(st.id)}
                            aria-label={`Pilih nilai ${st.name}`}
                            className="w-4 h-4 mt-0.5 rounded border-slate-300 cursor-pointer shrink-0"
                          />
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
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={row.score}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val !== '' && (Number(val) < 0 || Number(val) > 100)) return;
                              setDraftScores((prev) => ({
                                ...prev,
                                [st.id]: { ...row, score: val },
                              }));
                            }}
                            placeholder="0-100"
                            aria-label={`Nilai ${st.name}`}
                            className="w-20 px-2.5 py-2 text-center text-sm font-bold tabular-nums rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 min-h-[40px]"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteInputGrades([st.id])}
                            className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0"
                            title={`Kosongkan / hapus nilai ${st.name}`}
                            aria-label={`Hapus nilai ${st.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="pl-6.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {MARKER_KEYS.map((mk) => {
                            const active = row.marker === mk;
                            return (
                              <button
                                key={mk}
                                type="button"
                                onClick={() =>
                                  setDraftScores((prev) => ({
                                    ...prev,
                                    [st.id]: { ...row, marker: mk },
                                  }))
                                }
                                title={ROW_MARKER_META[mk].label}
                                aria-label={`Tandai ${ROW_MARKER_META[mk].label}`}
                                className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-transform ${
                                  ROW_MARKER_META[mk].dotClass
                                } ${
                                  active ? 'ring-2 ring-offset-2 ring-slate-900 scale-110' : 'opacity-65 hover:opacity-100'
                                }`}
                              />
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`font-semibold ${markerMeta.textClass}`}>
                            {markerMeta.label}
                          </span>
                          {numScore !== null && !Number.isNaN(numScore) && (
                            <span
                              className={`px-2 py-0.5 rounded font-semibold ${
                                passedKkm
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {passedKkm ? 'Tuntas' : 'Remedial'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pl-6.5">
                        <input
                          type="text"
                          value={row.note}
                          onChange={(e) =>
                            setDraftScores((prev) => ({
                              ...prev,
                              [st.id]: { ...row, note: e.target.value },
                            }))
                          }
                          placeholder="Catatan pencapaian siswa..."
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Desktop Student Score Input Table */}
        <div className="hidden lg:block max-h-[420px] overflow-auto eguru-scroll">
          {classStudents.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Belum ada siswa di kelas {selectedClass}.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-900 text-white text-xs">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        classStudents.length > 0 &&
                        classStudents.every((s) => selectedInputIds.includes(s.id))
                      }
                      onChange={toggleSelectAllInput}
                      aria-label="Pilih semua siswa untuk input nilai"
                      className="rounded border-slate-400 cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-3 font-semibold w-12 text-center">No</th>
                  <th className="py-2.5 px-3 font-semibold w-28">NIS</th>
                  <th className="py-2.5 px-3 font-semibold min-w-[180px]">Nama Siswa</th>
                  <th className="py-2.5 px-3 font-semibold w-28 text-center">Nilai (0–100)</th>
                  <th className="py-2.5 px-3 font-semibold min-w-[200px]">Catatan Evaluasi</th>
                  <th className="py-2.5 px-4 font-semibold min-w-[210px]">Penanda Status Baris</th>
                  <th className="py-2.5 px-3 font-semibold w-16 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {classStudents.map((st, idx) => {
                  const row = draftScores[st.id] ?? { score: '', note: '', marker: 'neutral' };
                  const markerMeta = ROW_MARKER_META[row.marker];
                  return (
                    <tr key={st.id} className={`${markerMeta.rowBgClass} transition-colors`}>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedInputIds.includes(st.id)}
                          onChange={() => toggleSelectInputRow(st.id)}
                          aria-label={`Pilih nilai ${st.name}`}
                          className="rounded border-slate-300 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-center text-xs text-slate-500 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-mono text-slate-600 tabular-nums">
                        {st.nis}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900 text-xs sm:text-sm">
                        <button
                          type="button"
                          onClick={() => onViewStudent(st)}
                          className="text-left font-semibold text-slate-900 hover:text-indigo-600 hover:underline focus-visible:outline-none focus-visible:underline cursor-pointer"
                          title="Klik untuk lihat info siswa & aktivitas kelas"
                        >
                          {st.name}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={row.score}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val !== '' && (Number(val) < 0 || Number(val) > 100)) return;
                            setDraftScores((prev) => ({
                              ...prev,
                              [st.id]: { ...row, score: val },
                            }));
                          }}
                          placeholder="0-100"
                          className="w-20 px-2.5 py-1.5 text-center text-sm font-bold tabular-nums rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={row.note}
                          onChange={(e) =>
                            setDraftScores((prev) => ({
                              ...prev,
                              [st.id]: { ...row, note: e.target.value },
                            }))
                          }
                          placeholder="Catatan pencapaian siswa..."
                          className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        />
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {MARKER_KEYS.map((mk) => {
                              const active = row.marker === mk;
                              return (
                                <button
                                  key={mk}
                                  type="button"
                                  onClick={() =>
                                    setDraftScores((prev) => ({
                                      ...prev,
                                      [st.id]: { ...row, marker: mk },
                                    }))
                                  }
                                  title={ROW_MARKER_META[mk].label}
                                  aria-label={`Tandai ${ROW_MARKER_META[mk].label}`}
                                  className={`w-5 h-5 rounded-full flex items-center justify-center cursor-pointer transition-transform ${
                                    ROW_MARKER_META[mk].dotClass
                                  } ${
                                    active ? 'ring-2 ring-offset-2 ring-slate-900 scale-110' : 'opacity-60 hover:opacity-100'
                                  }`}
                                />
                              );
                            })}
                          </div>
                          <span className={`text-xs font-semibold whitespace-nowrap ${markerMeta.textClass}`}>
                            {markerMeta.label}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteInputGrades([st.id])}
                          className="inline-flex items-center justify-center p-1.5 rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50 cursor-pointer"
                          title={`Kosongkan / hapus nilai ${st.name}`}
                          aria-label={`Hapus nilai ${st.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
      )}

      {/* ===================================================================== */}
      {/* BAGIAN 2: RIWAYAT MATRIKS NILAI PER KELAS (LEGER MENDATAR) */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 sm:gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Riwayat Matriks Nilai per Kelas (Leger Mendatar)
            </h3>
            <p className="text-xs text-slate-500">
              Edit skor langsung di dalam sel ujian ·{' '}
              {settings.useWeightedAverage
                ? 'Nilai Akhir berbobot (%) & ketuntasan KKM'
                : 'Rata-rata & ketuntasan KKM'}{' '}
              ({settings.kkm}) dihitung otomatis
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5">
            <select
              value={matrixClass}
              onChange={(e) => {
                setMatrixClass(e.target.value);
                setMatrixEdits({});
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
              value={matrixSubject}
              onChange={(e) => {
                setMatrixSubject(e.target.value);
                setMatrixEdits({});
              }}
              className="px-3 py-2 sm:py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 min-h-[40px] sm:min-h-0"
            >
              {settings.subjects.map((subj) => (
                <option key={subj} value={subj}>
                  {subj}
                </option>
              ))}
            </select>

            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadMatrixTemplate}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Template</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowMatrixImport((v) => !v)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-300" />
                  <span>{showMatrixImport ? 'Tutup Impor' : 'Impor'}</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleExportMatrix}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>
                {selectedMatrixIds.length > 0
                  ? `Ekspor (${selectedMatrixIds.length})`
                  : 'Ekspor Excel'}
              </span>
            </button>

            {!readOnly && selectedMatrixIds.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteMatrixSelected}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus ({selectedMatrixIds.length})</span>
              </button>
            )}

            {!readOnly && (
              <button
                type="button"
                onClick={handleSaveMatrixEdits}
                disabled={pendingMatrixCount === 0}
                className={`col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] sm:min-h-0 ${
                  pendingMatrixCount > 0
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  Simpan Perubahan Matriks{pendingMatrixCount > 0 ? ` (${pendingMatrixCount})` : ''}
                </span>
              </button>
            )}
          </div>
        </div>

        {!readOnly && showMatrixImport && (
          <div className="p-5 bg-indigo-50/50 border-b border-indigo-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Kotak Impor Matriks Nilai ({matrixClass} · {matrixSubject})
                </h4>
                <p className="text-[11px] text-slate-600">
                  Urutan kolom:{' '}
                  <span className="font-mono font-semibold">
                    NIS [Tab] Nama Siswa [Tab] {settings.examTypes.join(' [Tab] ')}
                  </span>
                </p>
              </div>
              <div>
                <input
                  ref={matrixFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleMatrixFileUpload}
                  className="hidden"
                  id="upload-matrix-excel"
                />
                <label
                  htmlFor="upload-matrix-excel"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Pilih File Excel / CSV</span>
                </label>
              </div>
            </div>
            <textarea
              rows={4}
              value={matrixPasteText}
              onChange={(e) => setMatrixPasteText(e.target.value)}
              placeholder={`25261001\tAhmad Fauzan\t${settings.examTypes.map(() => '85').join('\t')}`}
              className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMatrixImport(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleImportMatrixPaste}
                disabled={!matrixPasteText.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                Proses Impor Matriks
              </button>
            </div>
          </div>
        )}

        <div className="max-h-[460px] overflow-auto eguru-scroll">
          {matrixStudents.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Belum ada siswa di kelas {matrixClass}.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-900 text-white text-xs">
                <tr>
                  <th className="sm:sticky sm:left-0 z-30 bg-slate-900 py-2.5 px-2.5 sm:px-3 w-10 text-center border-r border-slate-800">
                    <input
                      type="checkbox"
                      checked={
                        matrixStudents.length > 0 &&
                        matrixStudents.every((s) => selectedMatrixIds.includes(s.id))
                      }
                      onChange={toggleSelectAllMatrix}
                      aria-label="Pilih semua siswa di matriks nilai"
                      className="rounded border-slate-400 cursor-pointer"
                    />
                  </th>
                  <th className="sticky left-0 sm:left-10 z-30 bg-slate-900 py-2.5 px-2 sm:px-3 font-semibold w-9 sm:w-10 text-center border-r border-slate-800">
                    No
                  </th>
                  <th className="sticky left-9 sm:left-20 z-30 bg-slate-900 py-2.5 px-2.5 sm:px-3 font-semibold min-w-[130px] max-w-[145px] sm:min-w-[180px] sm:max-w-none border-r border-slate-800">
                    Nama Siswa
                  </th>
                  {settings.examTypes.map((ex) => {
                    const weight = settings.examWeights?.[ex];
                    return (
                      <th
                        key={ex}
                        className="py-2.5 px-3 font-semibold text-center min-w-[82px] sm:min-w-[90px] border-r border-slate-800"
                      >
                        <div>{ex}</div>
                        {settings.useWeightedAverage && weight !== undefined && (
                          <div className="text-[10px] font-normal text-indigo-300 tabular-nums">
                            Bobot {weight}%
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className="py-2.5 px-3 font-semibold text-right bg-slate-800 min-w-[96px]">
                    {settings.useWeightedAverage ? 'Nilai Akhir' : 'Rata-Rata'}
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-center bg-slate-800 min-w-[95px]">
                    Status KKM
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {matrixStudents.map((st, idx) => {
                  const scoreByExam: Record<string, number | null> = {};
                  settings.examTypes.forEach((ex) => {
                    const v = getMatrixCellValue(st.id, ex);
                    if (v !== '') {
                      const num = Number(v);
                      scoreByExam[ex] = Number.isNaN(num) ? null : num;
                    } else {
                      scoreByExam[ex] = null;
                    }
                  });
                  const { avg } = computeWeightedAverage(
                    scoreByExam,
                    settings.examTypes,
                    settings.examWeights,
                    settings.useWeightedAverage
                  );
                  const tuntas = avg !== null && avg >= settings.kkm;

                  return (
                    <tr key={st.id} className="hover:bg-slate-50">
                      <td className="sm:sticky sm:left-0 z-10 bg-white py-2 px-2.5 sm:px-3 text-center border-r border-slate-200">
                        <input
                          type="checkbox"
                          checked={selectedMatrixIds.includes(st.id)}
                          onChange={() => toggleSelectMatrixRow(st.id)}
                          aria-label={`Pilih baris matriks ${st.name}`}
                          className="rounded border-slate-300 cursor-pointer"
                        />
                      </td>
                      <td className="sticky left-0 sm:left-10 z-10 bg-white py-2 px-2 sm:px-3 text-center text-slate-500 tabular-nums border-r border-slate-200">
                        {idx + 1}
                      </td>
                      <td className="sticky left-9 sm:left-20 z-10 bg-white py-2 px-2.5 sm:px-3 font-medium text-slate-900 border-r border-slate-200 whitespace-nowrap min-w-[130px] max-w-[145px] sm:min-w-[180px] sm:max-w-none">
                        <button
                          type="button"
                          onClick={() => onViewStudent(st)}
                          className="text-left font-semibold text-slate-900 hover:text-indigo-600 hover:underline focus-visible:outline-none focus-visible:underline cursor-pointer truncate block max-w-[125px] sm:max-w-none"
                          title={`Klik untuk lihat info siswa ${st.name}`}
                        >
                          {st.name}
                        </button>
                      </td>
                      {settings.examTypes.map((ex) => {
                        const cellVal = getMatrixCellValue(st.id, ex);
                        const num = cellVal === '' ? null : Number(cellVal);
                        const isDirty = `${st.id}__${ex}` in matrixEdits;
                        const lowScore = num !== null && num < settings.kkm;

                        return (
                          <td key={ex} className="p-1.5 text-center border-r border-slate-100">
                            <input
                              type="text"
                              value={cellVal}
                              readOnly={readOnly}
                              disabled={readOnly}
                              onChange={(e) => handleMatrixCellChange(st.id, ex, e.target.value)}
                              placeholder="-"
                              aria-label={`Nilai ${ex} untuk ${st.name}`}
                              className={`w-14 sm:w-16 h-8 sm:h-7 text-center font-semibold tabular-nums rounded border focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:cursor-default ${
                                isDirty
                                  ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                                  : lowScore
                                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                                    : 'border-slate-200 bg-white text-slate-900'
                              }`}
                            />
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-right font-bold tabular-nums text-slate-900 bg-slate-50">
                        {avg !== null ? avg : '-'}
                      </td>
                      <td className="py-2 px-3 text-center font-semibold bg-slate-50">
                        {avg === null ? (
                          <span className="text-slate-400">Belum ada</span>
                        ) : tuntas ? (
                          <span className="text-emerald-700">Tuntas</span>
                        ) : (
                          <span className="text-rose-700">Remedial</span>
                        )}
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
