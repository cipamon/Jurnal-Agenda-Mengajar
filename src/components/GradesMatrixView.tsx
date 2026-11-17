import React, { useEffect, useMemo, useState } from 'react';
import { Award, CheckCircle2, Save } from 'lucide-react';
import { GradeRecord, RowMarkerColor, Student, SystemSettings } from '../types';
import { ROW_MARKER_META } from '../utils/helpers';

interface GradesMatrixViewProps {
  students: Student[];
  grades: GradeRecord[];
  settings: SystemSettings;
  onSaveGradesBatch: (records: GradeRecord[]) => void;
  onNotify: (msg: string) => void;
}

const MARKER_KEYS: RowMarkerColor[] = ['neutral', 'green', 'yellow', 'red', 'blue'];

export const GradesMatrixView: React.FC<GradesMatrixViewProps> = ({
  students,
  grades,
  settings,
  onSaveGradesBatch,
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
    const batch: GradeRecord[] = classStudents.map((st) => {
      const row = draftScores[st.id] ?? { score: '', note: '', marker: 'neutral' };
      const parsed = row.score.trim() === '' ? null : Math.max(0, Math.min(100, Number(row.score)));
      return {
        id: `grd-${st.id}-${selectedSubject.replace(/\s+/g, '')}-${selectedExamType.replace(/\s+/g, '')}`,
        studentId: st.id,
        className: selectedClass,
        subject: selectedSubject,
        examType: selectedExamType,
        score: parsed !== null && Number.isNaN(parsed) ? null : parsed,
        note: row.note.trim(),
        marker: row.marker,
        updatedAt: nowIso,
      };
    });
    onSaveGradesBatch(batch);
  };

  // =========================================================================
  // BAGIAN 2: RIWAYAT MATRIKS NILAI PER KELAS (LEGER MENDATAR)
  // =========================================================================
  const [matrixClass, setMatrixClass] = useState<string>(settings.classes[0] || '');
  const [matrixSubject, setMatrixSubject] = useState<string>(settings.subjects[0] || '');
  const [matrixEdits, setMatrixEdits] = useState<Record<string, string>>({}); // `${studentId}__${examType}` -> string

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
          `grd-${studentId}-${matrixSubject.replace(/\s+/g, '')}-${examType.replace(/\s+/g, '')}`,
        studentId,
        className: matrixClass,
        subject: matrixSubject,
        examType,
        score: score !== null && Number.isNaN(score) ? null : score,
        note: existing?.note || '',
        marker:
          existing?.marker ||
          (score !== null ? (score >= settings.kkm ? 'green' : 'yellow') : 'neutral'),
        updatedAt: nowIso,
      });
    });

    onSaveGradesBatch(batch);
    setMatrixEdits({});
  };

  const pendingMatrixCount = Object.keys(matrixEdits).length;

  return (
    <div className="space-y-8">
      {/* ===================================================================== */}
      {/* BAGIAN 1: INPUT NILAI PER JENIS UJIAN */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 text-white flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold">Input Nilai per Jenis Ujian</h2>
            <p className="text-xs text-slate-300">
              Lengkapi skor 0–100, catatan guru, serta 5 penanda status pembinaan siswa
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
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
        <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas</label>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
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

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleAutoKKM}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              <Award className="w-4 h-4" />
              <span>Auto KKM {settings.kkm || 75}</span>
            </button>
            <button
              type="button"
              onClick={handleSaveInputGrades}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Nilai</span>
            </button>
          </div>
        </div>

        {/* Marker Legend */}
        <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Penanda Baris:</span>
          {MARKER_KEYS.map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${ROW_MARKER_META[key].dotClass}`} />
              <span>{ROW_MARKER_META[key].label}</span>
            </span>
          ))}
        </div>

        {/* Student Score Input Table */}
        <div className="max-h-[420px] overflow-auto eguru-scroll">
          {classStudents.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Belum ada siswa di kelas {selectedClass}.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-900 text-white text-xs">
                <tr>
                  <th className="py-2.5 px-3 font-semibold w-12 text-center">No</th>
                  <th className="py-2.5 px-3 font-semibold w-28">NIS</th>
                  <th className="py-2.5 px-3 font-semibold min-w-[180px]">Nama Siswa</th>
                  <th className="py-2.5 px-3 font-semibold w-28 text-center">Nilai (0–100)</th>
                  <th className="py-2.5 px-3 font-semibold min-w-[200px]">Catatan Evaluasi</th>
                  <th className="py-2.5 px-4 font-semibold min-w-[210px]">Penanda Status Baris</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {classStudents.map((st, idx) => {
                  const row = draftScores[st.id] ?? { score: '', note: '', marker: 'neutral' };
                  const markerMeta = ROW_MARKER_META[row.marker];
                  return (
                    <tr key={st.id} className={`${markerMeta.rowBgClass} transition-colors`}>
                      <td className="py-2.5 px-3 text-center text-xs text-slate-500 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-mono text-slate-600 tabular-nums">
                        {st.nis}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900 text-xs sm:text-sm">
                        {st.name}
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* BAGIAN 2: RIWAYAT MATRIKS NILAI PER KELAS (LEGER MENDATAR) */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Riwayat Matriks Nilai per Kelas (Leger Mendatar)
            </h3>
            <p className="text-xs text-slate-500">
              Edit skor langsung di dalam sel ujian · Rata-rata dan ketuntasan KKM ({settings.kkm}) dihitung otomatis
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={matrixClass}
              onChange={(e) => {
                setMatrixClass(e.target.value);
                setMatrixEdits({});
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
              value={matrixSubject}
              onChange={(e) => {
                setMatrixSubject(e.target.value);
                setMatrixEdits({});
              }}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              {settings.subjects.map((subj) => (
                <option key={subj} value={subj}>
                  {subj}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleSaveMatrixEdits}
              disabled={pendingMatrixCount === 0}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
          </div>
        </div>

        <div className="max-h-[460px] overflow-auto eguru-scroll">
          {matrixStudents.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Belum ada siswa di kelas {matrixClass}.
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
                  {settings.examTypes.map((ex) => (
                    <th key={ex} className="py-2.5 px-3 font-semibold text-center min-w-[90px] border-r border-slate-800">
                      {ex}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 font-semibold text-right bg-slate-800 min-w-[90px]">
                    Rata-Rata
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-center bg-slate-800 min-w-[95px]">
                    Status KKM
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {matrixStudents.map((st, idx) => {
                  let sum = 0;
                  let cnt = 0;
                  settings.examTypes.forEach((ex) => {
                    const v = getMatrixCellValue(st.id, ex);
                    if (v !== '') {
                      const num = Number(v);
                      if (!Number.isNaN(num)) {
                        sum += num;
                        cnt++;
                      }
                    }
                  });
                  const avg = cnt > 0 ? Math.round((sum / cnt) * 10) / 10 : null;
                  const tuntas = avg !== null && avg >= settings.kkm;

                  return (
                    <tr key={st.id} className="hover:bg-slate-50">
                      <td className="sticky left-0 z-10 bg-white py-2 px-3 text-center text-slate-500 tabular-nums border-r border-slate-200">
                        {idx + 1}
                      </td>
                      <td className="sticky left-10 z-10 bg-white py-2 px-3 font-medium text-slate-900 border-r border-slate-200 whitespace-nowrap">
                        {st.name}
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
                              onChange={(e) => handleMatrixCellChange(st.id, ex, e.target.value)}
                              placeholder="-"
                              aria-label={`Nilai ${ex} untuk ${st.name}`}
                              className={`w-16 h-7 text-center font-semibold tabular-nums rounded border focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
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
