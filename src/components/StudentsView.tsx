import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  FileEdit,
  FileSpreadsheet,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student, SystemSettings } from '../types';
import { generateId } from '../utils/helpers';

interface StudentsViewProps {
  students: Student[];
  settings: SystemSettings;
  onAddOrUpdateStudent: (student: Student, isEdit: boolean) => void;
  onDeleteStudent: (id: string) => void;
  onImportStudents: (newStudents: Student[]) => void;
  onNotify: (msg: string) => void;
}

export const StudentsView: React.FC<StudentsViewProps> = ({
  students,
  settings,
  onAddOrUpdateStudent,
  onDeleteStudent,
  onImportStudents,
  onNotify,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nis, setNis] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'L' | 'P'>('L');
  const [className, setClassName] = useState(settings.classes[0] || '');
  const [formError, setFormError] = useState<string | null>(null);

  const [showImportPanel, setShowImportPanel] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('ALL');

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...students]
      .filter((st) => {
        if (filterClass !== 'ALL' && st.className !== filterClass) return false;
        if (q) {
          const hay = `${st.nis} ${st.name} ${st.className}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
  }, [students, filterClass, searchQuery]);

  const resetForm = () => {
    setEditingId(null);
    setNis('');
    setName('');
    setGender('L');
    setClassName(settings.classes[0] || '');
    setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nis.trim() || !name.trim() || !className) {
      setFormError('NIS, Nama Lengkap, dan Kelas wajib diisi.');
      return;
    }

    onAddOrUpdateStudent(
      {
        id: editingId || generateId('std'),
        nis: nis.trim(),
        name: name.trim(),
        gender,
        className,
      },
      Boolean(editingId)
    );
    resetForm();
  };

  const handleEditClick = (st: Student) => {
    setEditingId(st.id);
    setNis(st.nis);
    setName(st.name);
    setGender(st.gender);
    setClassName(st.className);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDownloadTemplate = () => {
    const templateRows = [
      {
        NIS: '25261099',
        'Nama Lengkap': 'Contoh Nama Siswa',
        'L/P': 'L',
        Kelas: settings.classes[0] || 'X IPA 1',
      },
      {
        NIS: '25261100',
        'Nama Lengkap': 'Contoh Nama Siswi',
        'L/P': 'P',
        Kelas: settings.classes[0] || 'X IPA 1',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Siswa');
    XLSX.writeFile(wb, 'Template_Impor_Siswa_EGuru.xlsx');
    onNotify('Template Excel (.xlsx) berhasil diunduh.');
  };

  const handleExportStudents = () => {
    const rows = filteredStudents.map((st, idx) => ({
      No: idx + 1,
      NIS: st.nis,
      'Nama Lengkap': st.name,
      'L/P': st.gender,
      Kelas: st.className,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa');
    XLSX.writeFile(wb, 'Data_Siswa_Portal_EGuru.xlsx');
    onNotify(`Berhasil mengekspor ${rows.length} data siswa ke Excel.`);
  };

  const parseAndImportRows = (rawRows: Array<{ nis: string; name: string; gender: string; className: string }>) => {
    const valid: Student[] = [];
    rawRows.forEach((r) => {
      const cleanNis = String(r.nis || '').trim();
      const cleanName = String(r.name || '').trim();
      const cleanGenderRaw = String(r.gender || 'L').trim().toUpperCase();
      const cleanGender: 'L' | 'P' = cleanGenderRaw.startsWith('P') ? 'P' : 'L';
      const cleanClass = String(r.className || settings.classes[0] || 'X IPA 1').trim();
      if (cleanNis && cleanName && cleanNis.toLowerCase() !== 'nis') {
        valid.push({
          id: generateId('std'),
          nis: cleanNis,
          name: cleanName,
          gender: cleanGender,
          className: cleanClass,
        });
      }
    });

    if (valid.length === 0) {
      onNotify('Tidak ditemukan baris siswa valid untuk diimpor.');
      return;
    }

    onImportStudents(valid);
    setPasteText('');
    setShowImportPanel(false);
  };

  const handleImportPaste = () => {
    const lines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed = lines.map((line) => {
      const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
      const cols = line.split(delimiter).map((c) => c.trim());
      return {
        nis: cols[0] || '',
        name: cols[1] || '',
        gender: cols[2] || 'L',
        className: cols[3] || settings.classes[0] || 'X IPA 1',
      };
    });

    parseAndImportRows(parsed);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);

      const mapped = jsonRows.map((row) => ({
        nis: String(row['NIS'] ?? row['nis'] ?? row['No Induk'] ?? ''),
        name: String(row['Nama Lengkap'] ?? row['Nama'] ?? row['nama'] ?? row['Nama Siswa'] ?? ''),
        gender: String(row['L/P'] ?? row['Jenis Kelamin'] ?? row['JK'] ?? 'L'),
        className: String(row['Kelas'] ?? row['kelas'] ?? settings.classes[0] ?? 'X IPA 1'),
      }));

      parseAndImportRows(mapped);
    } catch {
      onNotify('Gagal membaca file Excel/CSV. Pastikan format kolom sesuai template.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const genderSummary = useMemo(() => {
    const l = filteredStudents.filter((s) => s.gender === 'L').length;
    const p = filteredStudents.filter((s) => s.gender === 'P').length;
    return { l, p };
  }, [filteredStudents]);

  return (
    <div className="space-y-6">
      {/* Top Row: Form Tambah/Edit + Toolbar Aksi Excel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <section className="xl:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold">
              {editingId ? 'Edit Biodata Siswa' : 'Tambah Siswa Baru'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Batal</span>
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">NIS</label>
                <input
                  type="text"
                  value={nis}
                  onChange={(e) => setNis(e.target.value)}
                  placeholder="25261008"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama lengkap peserta didik"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">L / P</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'L' | 'P')}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="L">L (Laki-laki)</option>
                  <option value="P">P (Perempuan)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="w-full sm:w-56">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas</label>
                <select
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  {settings.classes.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>{editingId ? 'Perbarui Siswa' : 'Tambah Siswa'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Excel Template, Impor & Ekspor Card */}
        <section className="xl:col-span-5 bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Impor & Ekspor Massal Excel</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Unduh template resmi terlebih dahulu, atau langsung tempel salinan baris dari Excel / unggah file
              <span className="font-mono"> .xlsx</span> / <span className="font-mono">.csv</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" />
              <span>Unduh Template</span>
            </button>

            <button
              type="button"
              onClick={() => setShowImportPanel((v) => !v)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-300" />
              <span>{showImportPanel ? 'Tutup Impor' : 'Impor Data'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportStudents}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Ekspor Excel</span>
            </button>
          </div>
        </section>
      </div>

      {/* Collapsible Kotak Impor Data */}
      {showImportPanel && (
        <section className="bg-white rounded-xl border border-indigo-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Kotak Impor Data Siswa</h3>
              <p className="text-xs text-slate-500">
                Format kolom berurutan: <span className="font-mono font-semibold">NIS [Tab/Koma] Nama Lengkap [Tab/Koma] L/P [Tab/Koma] Kelas</span>
              </p>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="upload-student-excel"
              />
              <label
                htmlFor="upload-student-excel"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Pilih File Excel / CSV</span>
              </label>
            </div>
          </div>

          <textarea
            rows={5}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`25261011\tBudi Santoso\tL\tX IPA 1\n25261012\tSiti Aminah\tP\tX IPA 1`}
            className="w-full p-3 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setShowImportPanel(false)}
              className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleImportPaste}
              disabled={!pasteText.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              Proses Impor Teks
            </button>
          </div>
        </section>
      )}

      {/* Tabel Data Siswa */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Daftar Peserta Didik</h3>
            <p className="text-xs text-slate-500 tabular-nums">
              Menampilkan {filteredStudents.length} siswa · Laki-laki: {genderSummary.l} · Perempuan: {genderSummary.p}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama atau NIS..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 w-52"
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
          </div>
        </div>

        <div className="max-h-[460px] overflow-auto eguru-scroll">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-900 text-white text-xs">
              <tr>
                <th className="py-2.5 px-4 font-semibold w-12 text-center">No</th>
                <th className="py-2.5 px-3 font-semibold w-32">NIS</th>
                <th className="py-2.5 px-3 font-semibold">Nama Lengkap</th>
                <th className="py-2.5 px-3 font-semibold text-center w-20">L/P</th>
                <th className="py-2.5 px-3 font-semibold w-28">Kelas</th>
                <th className="py-2.5 px-4 font-semibold text-right w-36">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 text-sm">
                    Tidak ada data siswa yang cocok.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st, idx) => (
                  <tr key={st.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 text-center text-xs text-slate-500 tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-700 tabular-nums">
                      {st.nis}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900 text-xs sm:text-sm">
                      {st.name}
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs font-semibold text-slate-700">
                      {st.gender}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-semibold text-indigo-700">
                      {st.className}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEditClick(st)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer"
                        >
                          <FileEdit className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteStudent(st.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-50 cursor-pointer"
                          aria-label={`Hapus ${st.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
