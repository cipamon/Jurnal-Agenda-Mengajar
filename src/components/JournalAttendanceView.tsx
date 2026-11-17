import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCheck,
  Copy,
  FileEdit,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import {
  AttendanceStatus,
  JournalEntry,
  Student,
  StudentAttendanceItem,
  SystemSettings,
} from '../types';
import {
  ATTENDANCE_META,
  formatTanggalID,
  formatTanggalShort,
  generateId,
  getTodayIso,
} from '../utils/helpers';

interface JournalAttendanceViewProps {
  students: Student[];
  journals: JournalEntry[];
  settings: SystemSettings;
  draftJournal: { mode: 'create' | 'edit' | 'duplicate'; entry: JournalEntry } | null;
  onClearDraft: () => void;
  onSaveJournal: (entry: JournalEntry, isEdit: boolean) => void;
  onDeleteJournals: (ids: string[]) => void;
  onBulkUpdateLedger: (updatedJournals: JournalEntry[]) => void;
  onNotify: (msg: string) => void;
}

const STATUS_OPTIONS: AttendanceStatus[] = ['H', 'S', 'I', 'A', 'D'];

export const JournalAttendanceView: React.FC<JournalAttendanceViewProps> = ({
  students,
  journals,
  settings,
  draftJournal,
  onClearDraft,
  onSaveJournal,
  onDeleteJournals,
  onBulkUpdateLedger,
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

  const handleResetForm = () => {
    setEditingId(null);
    setDate(getTodayIso());
    setPeriod('1 - 2');
    setClassName('');
    setSubject('');
    setTopic('');
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

    const finalAttendance: Record<string, StudentAttendanceItem> = {};
    classStudents.forEach((st) => {
      finalAttendance[st.id] = attendanceMap[st.id] ?? { status: 'H', note: '' };
    });

    const nowIso = new Date().toISOString();
    const existing = editingId ? journals.find((j) => j.id === editingId) : null;

    const entry: JournalEntry = {
      id: editingId || generateId('jrn'),
      date,
      period: period.trim() || '1 - 2',
      className,
      subject,
      topic: topic.trim(),
      activities: activities.trim() || '-',
      attendance: finalAttendance,
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

  const loadEntryToForm = (entry: JournalEntry, mode: 'edit' | 'duplicate') => {
    setEditingId(mode === 'edit' ? entry.id : null);
    setDate(mode === 'duplicate' ? getTodayIso() : entry.date);
    setPeriod(entry.period);
    setClassName(entry.className);
    setSubject(entry.subject);
    setTopic(mode === 'duplicate' ? `${entry.topic} (Salinan)` : entry.topic);
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

  return (
    <div className="space-y-8">
      {/* ===================================================================== */}
      {/* BAGIAN 1: FORM JURNAL & PRESENSI PERTEMUAN */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
          <div>
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Batal Edit</span>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmitForm} className="p-6 space-y-6">
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

                <button
                  type="button"
                  onClick={handleSetAllPresent}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Set Semua Hadir (H)</span>
                </button>
              </div>

              {classStudents.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Belum ada siswa terdaftar di kelas {className}. Tambahkan di menu Data Siswa.
                </div>
              ) : (
                <div className="max-h-[420px] overflow-auto eguru-scroll">
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
                              {st.name}
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
              )}
            </div>
          ) : (
            <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500">
              Pilih <span className="font-semibold text-slate-700">Kelas</span> di atas untuk memunculkan daftar
              presensi siswa.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleResetForm}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              Reset Form
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{editingId ? 'Perbarui Jurnal & Presensi' : 'Simpan Jurnal & Presensi'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* ===================================================================== */}
      {/* BAGIAN 2: RIWAYAT JURNAL TERSIMPAN */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Riwayat Jurnal Tersimpan</h3>
            <p className="text-xs text-slate-500">
              Total {filteredJournals.length} pertemuan ditemukan · Pilih beberapa baris untuk hapus massal
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari materi / mapel..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 w-48 sm:w-56"
              />
            </div>

            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="ALL">Semua Kelas</option>
              {settings.classes.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>

            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Terpilih ({selectedIds.length})</span>
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[420px] overflow-auto eguru-scroll">
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
                <th className="py-2.5 px-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredJournals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500 text-sm">
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
                        {j.className}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-xs font-medium text-indigo-700">
                        {j.subject}
                      </td>
                      <td className="py-3 px-3 min-w-[240px]">
                        <div className="text-xs font-semibold text-slate-900">{j.topic}</div>
                        <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">{j.activities}</div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-center text-xs font-mono tabular-nums text-slate-700">
                        H:{cnt.H} S:{cnt.S} I:{cnt.I} A:{cnt.A} D:{cnt.D}
                      </td>
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
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Leger Kehadiran per Kelas (Mendatar)</h3>
            <p className="text-xs text-slate-500">
              Ketik langsung huruf <span className="font-mono font-semibold">H / S / I / A / D</span> pada sel
              tanggal pertemuan lalu klik Simpan Perubahan
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={ledgerClass}
              onChange={(e) => {
                setLedgerClass(e.target.value);
                setLedgerEdits({});
              }}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
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
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
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
              onClick={handleSaveLedgerChanges}
              disabled={pendingEditsCount === 0}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
                  <th className="sticky left-0 z-30 bg-slate-900 py-2.5 px-3 font-semibold w-10 text-center border-r border-slate-800">
                    No
                  </th>
                  <th className="sticky left-10 z-30 bg-slate-900 py-2.5 px-3 font-semibold min-w-[180px] border-r border-slate-800">
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
                      <td className="sticky left-0 z-10 bg-white py-2 px-3 text-center text-slate-500 tabular-nums border-r border-slate-200">
                        {idx + 1}
                      </td>
                      <td className="sticky left-10 z-10 bg-white py-2 px-3 font-medium text-slate-900 border-r border-slate-200 whitespace-nowrap">
                        {st.name}
                      </td>
                      {ledgerJournals.map((j) => {
                        const code = getCellStatus(j, st.id);
                        const meta = ATTENDANCE_META[code];
                        const isDirty = Boolean(ledgerEdits[`${j.id}__${st.id}`]);
                        return (
                          <td key={j.id} className="p-1 text-center border-r border-slate-100">
                            <input
                              type="text"
                              value={code}
                              maxLength={2}
                              onChange={(e) => handleLedgerCellChange(j.id, st.id, e.target.value)}
                              aria-label={`Kehadiran ${st.name} tanggal ${j.date}`}
                              className={`w-10 h-7 text-center font-bold rounded border focus:outline-none focus:ring-2 focus:ring-indigo-600 uppercase ${
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
