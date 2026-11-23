import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  FileEdit,
  MapPin,
  NotebookPen,
  Plus,
  PlusCircle,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  DayOfWeek,
  SystemSettings,
  TeacherAgendaItem,
  TeachingScheduleItem,
} from '../types';
import { formatTanggalID, generateId, getTodayIso } from '../utils/helpers';

interface ScheduleAgendaViewProps {
  schedules: TeachingScheduleItem[];
  agendas: TeacherAgendaItem[];
  settings: SystemSettings;
  currentUserId?: string;
  currentUserName?: string;
  readOnly?: boolean;
  canManageAll?: boolean;
  onSaveSchedule: (item: TeachingScheduleItem, isEdit: boolean) => void;
  onDeleteSchedule: (id: string) => void;
  onCreateJournalFromSchedule: (slot: TeachingScheduleItem) => void;
  onSaveAgenda: (item: TeacherAgendaItem, isEdit: boolean) => void;
  onDeleteAgenda: (id: string) => void;
  onNotify: (msg: string) => void;
}

const DAYS_ORDER: DayOfWeek[] = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const ScheduleAgendaView: React.FC<ScheduleAgendaViewProps> = ({
  schedules,
  agendas,
  settings,
  currentUserId,
  currentUserName,
  readOnly = false,
  canManageAll = false,
  onSaveSchedule,
  onDeleteSchedule,
  onCreateJournalFromSchedule,
  onSaveAgenda,
  onDeleteAgenda,
  onNotify,
}) => {
  // =========================================================================
  // BAGIAN 1: JADWAL MENGAJAR MINGGUAN (SENIN - SABTU)
  // =========================================================================
  const [selectedDayFilter, setSelectedDayFilter] = useState<'ALL' | DayOfWeek>('ALL');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [schDay, setSchDay] = useState<DayOfWeek>('Senin');
  const [schPeriod, setSchPeriod] = useState('1 - 2');
  const [schStartTime, setSchStartTime] = useState('07:00');
  const [schEndTime, setSchEndTime] = useState('08:30');
  const [schClass, setSchClass] = useState(settings.classes[0] || '');
  const [schSubject, setSchSubject] = useState(settings.subjects[0] || '');
  const [schRoom, setSchRoom] = useState('');

  useEffect(() => {
    if (settings.classes.length > 0 && !settings.classes.includes(schClass)) {
      setSchClass(settings.classes[0]);
    }
    if (settings.subjects.length > 0 && !settings.subjects.includes(schSubject)) {
      setSchSubject(settings.subjects[0]);
    }
  }, [settings.classes, settings.subjects, schClass, schSubject]);

  const canModifySchedule = (item: TeachingScheduleItem) =>
    !readOnly && (canManageAll || !item.teacherId || !currentUserId || item.teacherId === currentUserId);

  const canModifyAgenda = (item: TeacherAgendaItem) =>
    !readOnly && (canManageAll || !item.teacherId || !currentUserId || item.teacherId === currentUserId);

  const resetScheduleForm = () => {
    setEditingScheduleId(null);
    setSchDay('Senin');
    setSchPeriod('1 - 2');
    setSchStartTime('07:00');
    setSchEndTime('08:30');
    setSchClass(settings.classes[0] || '');
    setSchSubject(settings.subjects[0] || '');
    setSchRoom('');
    setShowScheduleForm(false);
  };

  const handleEditSchedule = (item: TeachingScheduleItem) => {
    if (!canModifySchedule(item)) {
      onNotify('Anda hanya dapat mengubah jadwal mengajar milik Anda sendiri.');
      return;
    }
    setEditingScheduleId(item.id);
    setSchDay(item.day);
    setSchPeriod(item.period);
    setSchStartTime(item.startTime || '07:00');
    setSchEndTime(item.endTime || '08:30');
    setSchClass(item.className);
    setSchSubject(item.subject);
    setSchRoom(item.room || '');
    setShowScheduleForm(true);
  };

  const handleSubmitSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!schClass || !schSubject || !schPeriod.trim()) {
      onNotify('Hari, Jam Ke-, Kelas, dan Mata Pelajaran wajib diisi.');
      return;
    }
    const existing = editingScheduleId
      ? schedules.find((s) => s.id === editingScheduleId)
      : undefined;
    const item: TeachingScheduleItem = {
      id: editingScheduleId || generateId('sch'),
      day: schDay,
      period: schPeriod.trim(),
      startTime: schStartTime.trim() || undefined,
      endTime: schEndTime.trim() || undefined,
      className: schClass,
      subject: schSubject,
      room: schRoom.trim() || undefined,
      teacherId: existing?.teacherId || currentUserId,
      teacherName: existing?.teacherName || currentUserName || settings.teacherProfile.name,
      updatedAt: new Date().toISOString(),
    };
    onSaveSchedule(item, Boolean(editingScheduleId));
    resetScheduleForm();
  };

  const sortedFilteredSchedules = useMemo(() => {
    const dayIndex = (d: DayOfWeek) => DAYS_ORDER.indexOf(d);
    return [...schedules]
      .filter((s) => selectedDayFilter === 'ALL' || s.day === selectedDayFilter)
      .sort((a, b) => {
        const diffDay = dayIndex(a.day) - dayIndex(b.day);
        if (diffDay !== 0) return diffDay;
        return (a.startTime || a.period).localeCompare(b.startTime || b.period);
      });
  }, [schedules, selectedDayFilter]);

  const countByDay = useMemo(() => {
    const map: Record<DayOfWeek, number> = {
      Senin: 0,
      Selasa: 0,
      Rabu: 0,
      Kamis: 0,
      Jumat: 0,
      Sabtu: 0,
    };
    schedules.forEach((s) => {
      if (map[s.day] !== undefined) map[s.day]++;
    });
    return map;
  }, [schedules]);

  // =========================================================================
  // BAGIAN 2: AGENDA & CATATAN KERJA GURU
  // =========================================================================
  const [agendaFilter, setAgendaFilter] = useState<'ALL' | 'PENDING' | 'DONE'>('ALL');
  const [editingAgendaId, setEditingAgendaId] = useState<string | null>(null);
  const [agdDate, setAgdDate] = useState(getTodayIso());
  const [agdTitle, setAgdTitle] = useState('');
  const [agdNote, setAgdNote] = useState('');

  const resetAgendaForm = () => {
    setEditingAgendaId(null);
    setAgdDate(getTodayIso());
    setAgdTitle('');
    setAgdNote('');
  };

  const handleEditAgenda = (item: TeacherAgendaItem) => {
    if (!canModifyAgenda(item)) {
      onNotify('Anda hanya dapat mengubah agenda milik Anda sendiri.');
      return;
    }
    setEditingAgendaId(item.id);
    setAgdDate(item.date);
    setAgdTitle(item.title);
    setAgdNote(item.note);
  };

  const handleSubmitAgenda = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!agdTitle.trim()) {
      onNotify('Judul agenda kerja guru wajib diisi.');
      return;
    }
    const existing = editingAgendaId ? agendas.find((a) => a.id === editingAgendaId) : undefined;
    if (existing && !canModifyAgenda(existing)) {
      onNotify('Anda hanya dapat mengubah agenda milik Anda sendiri.');
      return;
    }
    const item: TeacherAgendaItem = {
      id: editingAgendaId || generateId('agd'),
      date: agdDate || getTodayIso(),
      title: agdTitle.trim(),
      note: agdNote.trim() || '-',
      done: existing?.done ?? false,
      teacherId: existing?.teacherId || currentUserId,
      teacherName: existing?.teacherName || currentUserName || settings.teacherProfile.name,
      updatedAt: new Date().toISOString(),
    };
    onSaveAgenda(item, Boolean(editingAgendaId));
    resetAgendaForm();
  };

  const handleToggleAgendaDone = (item: TeacherAgendaItem) => {
    if (!canModifyAgenda(item)) return;
    onSaveAgenda(
      {
        ...item,
        done: !item.done,
        updatedAt: new Date().toISOString(),
      },
      true
    );
  };

  const filteredAgendas = useMemo(() => {
    return [...agendas]
      .filter((a) => {
        if (agendaFilter === 'PENDING') return !a.done;
        if (agendaFilter === 'DONE') return a.done;
        return true;
      })
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return b.date.localeCompare(a.date);
      });
  }, [agendas, agendaFilter]);

  const pendingAgendaCount = useMemo(() => agendas.filter((a) => !a.done).length, [agendas]);

  return (
    <div className="space-y-8">
      {readOnly && (
        <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50 text-xs text-indigo-900">
          <p className="font-bold">Mode Pemantauan Jadwal &amp; Agenda (Hanya Baca)</p>
          <p className="mt-0.5 text-indigo-800">
            Anda masuk dengan hak akses monitoring. Anda dapat meninjau jadwal mengajar mingguan dan daftar agenda guru tanpa melakukan perubahan.
          </p>
        </div>
      )}

      {/* ===================================================================== */}
      {/* BAGIAN 1: JADWAL MENGAJAR MINGGUAN */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
              <CalendarClock className="w-4 h-4 text-indigo-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold">Jadwal Mengajar Mingguan (Senin – Sabtu)</h2>
              <p className="text-xs text-slate-300">
                Total {schedules.length} slot mengajar · Klik{' '}
                <span className="font-semibold text-white">Isi Jurnal</span> untuk langsung mencatat pertemuan
              </p>
            </div>
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={() => {
                if (showScheduleForm) resetScheduleForm();
                else setShowScheduleForm(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[40px]"
            >
              {showScheduleForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{showScheduleForm ? 'Tutup Form' : 'Tambah Jadwal'}</span>
            </button>
          )}
        </div>

        {/* Form Tambah / Edit Jadwal */}
        {!readOnly && showScheduleForm && (
          <form
            onSubmit={handleSubmitSchedule}
            className="p-4 sm:p-5 bg-indigo-50/40 border-b border-indigo-200 space-y-4"
          >
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              {editingScheduleId ? 'Edit Slot Jadwal Mengajar' : 'Tambah Slot Jadwal Mengajar Baru'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Hari</label>
                <select
                  value={schDay}
                  onChange={(e) => setSchDay(e.target.value as DayOfWeek)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  {DAYS_ORDER.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Ke-</label>
                <input
                  type="text"
                  value={schPeriod}
                  onChange={(e) => setSchPeriod(e.target.value)}
                  placeholder="Contoh: 1 - 2"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas</label>
                <select
                  value={schClass}
                  onChange={(e) => setSchClass(e.target.value)}
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
                <select
                  value={schSubject}
                  onChange={(e) => setSchSubject(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  {settings.subjects.map((subj) => (
                    <option key={subj} value={subj}>
                      {subj}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Mulai</label>
                <input
                  type="time"
                  value={schStartTime}
                  onChange={(e) => setSchStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Selesai</label>
                <input
                  type="time"
                  value={schEndTime}
                  onChange={(e) => setSchEndTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ruang / Lab (Opsional)
                </label>
                <input
                  type="text"
                  value={schRoom}
                  onChange={(e) => setSchRoom(e.target.value)}
                  placeholder="Contoh: Ruang 10 / Lab IPA"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={resetScheduleForm}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{editingScheduleId ? 'Perbarui Jadwal' : 'Simpan Jadwal'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Day Filter Strip */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDayFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              selectedDayFilter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Semua ({schedules.length})
          </button>
          {DAYS_ORDER.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDayFilter(day)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
                selectedDayFilter === day
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {day} ({countByDay[day]})
            </button>
          ))}
        </div>

        {/* Schedule List */}
        <div className="p-4 sm:p-6">
          {sortedFilteredSchedules.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Belum ada jadwal mengajar pada hari ini. Klik &ldquo;Tambah Jadwal&rdquo; untuk menyusun jadwal mingguan.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {sortedFilteredSchedules.map((slot) => (
                <div
                  key={slot.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 transition-colors flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold">
                        {slot.day} · Jam {slot.period}
                      </span>
                      {(slot.startTime || slot.endTime) && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 tabular-nums">
                          <Clock className="w-3 h-3" />
                          <span>
                            {slot.startTime || '--:--'}–{slot.endTime || '--:--'}
                          </span>
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{slot.subject}</h3>
                      <p className="text-xs font-semibold text-slate-600 mt-0.5">
                        Kelas {slot.className}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      {slot.room && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{slot.room}</span>
                        </span>
                      )}
                      {slot.teacherName && <span>Guru: {slot.teacherName}</span>}
                    </div>
                  </div>

                  {!readOnly && (
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onCreateJournalFromSchedule(slot)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[38px]"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Isi Jurnal</span>
                      </button>
                      {canModifySchedule(slot) && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEditSchedule(slot)}
                            className="inline-flex items-center justify-center p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer min-w-[38px] min-h-[38px]"
                            title="Edit slot jadwal"
                            aria-label="Edit slot jadwal"
                          >
                            <FileEdit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSchedule(slot.id)}
                            className="inline-flex items-center justify-center p-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 cursor-pointer min-w-[38px] min-h-[38px]"
                            title="Hapus slot jadwal"
                            aria-label="Hapus slot jadwal"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* BAGIAN 2: AGENDA & CATATAN KERJA GURU */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
              <NotebookPen className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Agenda &amp; Catatan Kerja Guru</h3>
              <p className="text-xs text-slate-500">
                {pendingAgendaCount} agenda belum selesai dari total {agendas.length} catatan
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(['ALL', 'PENDING', 'DONE'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setAgendaFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  agendaFilter === tab
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab === 'ALL' ? 'Semua' : tab === 'PENDING' ? 'Belum Selesai' : 'Selesai'}
              </button>
            ))}
          </div>
        </div>

        {!readOnly && (
          <form
            onSubmit={handleSubmitAgenda}
            className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
          >
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal</label>
              <input
                type="date"
                value={agdDate}
                onChange={(e) => setAgdDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Judul Agenda / Tugas
              </label>
              <input
                type="text"
                value={agdTitle}
                onChange={(e) => setAgdTitle(e.target.value)}
                placeholder="Contoh: Koreksi Soal PTS Kelas X IPA 1"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan / Keterangan
              </label>
              <input
                type="text"
                value={agdNote}
                onChange={(e) => setAgdNote(e.target.value)}
                placeholder="Detail tindak lanjut atau tenggat..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              {editingAgendaId && (
                <button
                  type="button"
                  onClick={resetAgendaForm}
                  className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer min-h-[38px]"
                >
                  Batal
                </button>
              )}
              <button
                type="submit"
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[38px]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{editingAgendaId ? 'Simpan' : 'Tambah'}</span>
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-slate-200">
          {filteredAgendas.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Belum ada agenda pada filter ini.
            </div>
          ) : (
            filteredAgendas.map((item) => (
              <div
                key={item.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                  item.done ? 'bg-slate-50/70' : 'bg-white hover:bg-slate-50/50'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    disabled={!canModifyAgenda(item)}
                    onClick={() => handleToggleAgendaDone(item)}
                    className={`mt-0.5 shrink-0 ${
                      !canModifyAgenda(item) ? 'cursor-default opacity-75' : 'cursor-pointer'
                    }`}
                    aria-label={item.done ? 'Tandai belum selesai' : 'Tandai selesai'}
                  >
                    {item.done ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-400 hover:text-indigo-600" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-bold ${
                          item.done ? 'line-through text-slate-400' : 'text-slate-900'
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[11px] font-medium text-slate-600 tabular-nums">
                        <Calendar className="w-3 h-3" />
                        <span>{formatTanggalID(item.date)}</span>
                      </span>
                    </div>
                    <p
                      className={`text-xs mt-1 ${
                        item.done ? 'text-slate-400 line-through' : 'text-slate-600'
                      }`}
                    >
                      {item.note}
                    </p>
                  </div>
                </div>

                {canModifyAgenda(item) && (
                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditAgenda(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer"
                    >
                      <FileEdit className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteAgenda(item.id)}
                      className="inline-flex items-center justify-center p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 cursor-pointer"
                      aria-label="Hapus agenda"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
