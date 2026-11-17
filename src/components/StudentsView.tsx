import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileEdit,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student, SystemSettings } from '../types';
import { getStudentPhotoUrl } from '../utils/defaultAvatars';
import { generateId } from '../utils/helpers';

interface StudentsViewProps {
  students: Student[];
  settings: SystemSettings;
  onDeleteStudent: (id: string) => void;
  onDeleteStudentsBulk?: (ids: string[]) => void;
  onImportStudents: (newStudents: Student[]) => void;
  onViewStudent: (student: Student) => void;
  onViewClass?: (className: string) => void;
  onCreateStudentModal: () => void;
  onEditStudentModal: (student: Student) => void;
  onNotify: (msg: string) => void;
}

export const StudentsView: React.FC<StudentsViewProps> = ({
  students,
  settings,
  onDeleteStudent,
  onDeleteStudentsBulk,
  onImportStudents,
  onViewStudent,
  onViewClass,
  onCreateStudentModal,
  onEditStudentModal,
  onNotify,
}) => {
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (filterClass !== 'ALL' && !settings.classes.includes(filterClass)) {
      setFilterClass('ALL');
      setSelectedIds([]);
    }
  }, [settings.classes, filterClass]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...students]
      .filter((st) => {
        if (filterClass !== 'ALL' && st.className !== filterClass) return false;
        if (q) {
          const hay = `${st.nis} ${st.absenNo || ''} ${st.name} ${st.className} ${st.email || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          a.className.localeCompare(b.className) ||
          (a.absenNo || '').localeCompare(b.absenNo || '', undefined, { numeric: true }) ||
          a.name.localeCompare(b.name)
      );
  }, [students, filterClass, searchQuery]);

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllFiltered = () => {
    const visibleIds = filteredStudents.map((s) => s.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds(Array.from(new Set([...selectedIds, ...visibleIds])));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (onDeleteStudentsBulk) {
      onDeleteStudentsBulk(selectedIds);
    } else {
      selectedIds.forEach((id) => onDeleteStudent(id));
    }
    setSelectedIds([]);
  };

  const handleDownloadTemplate = () => {
    const templateRows = [
      {
        'No Absen': '01',
        NIS: '25261099',
        'Nama Lengkap': 'Contoh Nama Siswa',
        'L/P': 'L',
        Kelas: settings.classes[0] || 'X IPA 1',
        Email: 'siswa@sekolah.sch.id',
        TTL: 'Bandung, 12 Mei 2010',
        Alamat: 'Jl. Pendidikan No. 10, Bandung',
        'Foto URL': '',
      },
      {
        'No Absen': '02',
        NIS: '25261100',
        'Nama Lengkap': 'Contoh Nama Siswi',
        'L/P': 'P',
        Kelas: settings.classes[0] || 'X IPA 1',
        Email: 'siswi@sekolah.sch.id',
        TTL: 'Bandung, 20 Agustus 2010',
        Alamat: 'Jl. Merdeka No. 25, Bandung',
        'Foto URL': '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Siswa');
    XLSX.writeFile(wb, 'Template_Impor_Siswa_EGuru.xlsx');
    onNotify('Template Excel (.xlsx) siswa berhasil diunduh.');
  };

  const handleExportStudents = () => {
    const targetList =
      selectedIds.length > 0
        ? filteredStudents.filter((st) => selectedIds.includes(st.id))
        : filteredStudents;
    const rows = targetList.map((st, idx) => ({
      No: idx + 1,
      'No Absen': st.absenNo || '-',
      NIS: st.nis,
      'Nama Lengkap': st.name,
      'L/P': st.gender,
      Kelas: st.className,
      Email: st.email || '-',
      TTL: st.ttl || '-',
      Alamat: st.address || '-',
      'Foto URL': st.photoDataUrl && !st.photoDataUrl.startsWith('data:') ? st.photoDataUrl : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa');
    XLSX.writeFile(wb, 'Data_Siswa_Portal_EGuru.xlsx');
    onNotify(
      `Berhasil mengekspor ${rows.length} data siswa${selectedIds.length > 0 ? ' terpilih' : ''} ke Excel.`
    );
  };

  const parseAndImportRows = (
    rawRows: Array<{
      nis: string;
      name: string;
      gender: string;
      className: string;
      absenNo?: string;
      email?: string;
      ttl?: string;
      address?: string;
      photoDataUrl?: string;
    }>
  ) => {
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
          absenNo: String(r.absenNo || '').trim(),
          name: cleanName,
          gender: cleanGender,
          className: cleanClass,
          email: String(r.email || '').trim(),
          ttl: String(r.ttl || '').trim(),
          address: String(r.address || '').trim(),
          photoDataUrl: String(r.photoDataUrl || '').trim(),
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
        absenNo: cols[4] || '',
        email: cols[5] || '',
        ttl: cols[6] || '',
        address: cols[7] || '',
        photoDataUrl: cols[8] || '',
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
        absenNo: String(row['No Absen'] ?? row['No. Absen'] ?? row['Absen'] ?? ''),
        name: String(row['Nama Lengkap'] ?? row['Nama'] ?? row['nama'] ?? row['Nama Siswa'] ?? ''),
        gender: String(row['L/P'] ?? row['Jenis Kelamin'] ?? row['JK'] ?? 'L'),
        className: String(row['Kelas'] ?? row['kelas'] ?? settings.classes[0] ?? 'X IPA 1'),
        email: String(row['Email'] ?? row['email'] ?? ''),
        ttl: String(row['TTL'] ?? row['Tempat Tanggal Lahir'] ?? ''),
        address: String(row['Alamat'] ?? row['alamat'] ?? ''),
        photoDataUrl: String(row['Foto URL'] ?? row['Link Foto'] ?? row['Foto'] ?? ''),
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
      {/* Top Action Card: Tambah Siswa (Pop-up) & Impor/Ekspor Excel */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900">
            Manajemen Biodata & Peserta Didik
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
            Tambah siswa baru melalui pop-up biodata (lengkap dengan foto file/link URL), klik{' '}
            <strong className="text-slate-700">Nama Siswa</strong> untuk profil & aktivitas individu,
            atau klik <strong className="text-slate-700">Kelas</strong> untuk membuka detail rombongan belajar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onCreateStudentModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Siswa Baru</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            <span>Unduh Template</span>
          </button>

          <button
            type="button"
            onClick={() => setShowImportPanel((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-300" />
            <span>{showImportPanel ? 'Tutup Impor' : 'Impor Data'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportStudents}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>
              {selectedIds.length > 0 ? `Ekspor Terpilih (${selectedIds.length})` : 'Ekspor Excel'}
            </span>
          </button>
        </div>
      </section>

      {/* Collapsible Kotak Impor Data */}
      {showImportPanel && (
        <section className="bg-white rounded-xl border border-indigo-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Kotak Impor Data Siswa</h3>
              <p className="text-xs text-slate-500">
                Format kolom berurutan:{' '}
                <span className="font-mono font-semibold">
                  NIS [Tab] Nama Lengkap [Tab] L/P [Tab] Kelas [Tab] No Absen [Tab] Email [Tab] TTL [Tab] Alamat [Tab] Foto URL
                </span>
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
            placeholder={`25261011\tBudi Santoso\tL\tX IPA 1\t08\tbudi@siswa.sch.id\tBandung, 10 Mei 2010\tJl. Riau No. 12`}
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
                placeholder="Cari nama, NIS, atau email..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 w-56"
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

        <div className="max-h-[460px] overflow-auto eguru-scroll">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-900 text-white text-xs">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredStudents.length > 0 &&
                      filteredStudents.every((s) => selectedIds.includes(s.id))
                    }
                    onChange={toggleSelectAllFiltered}
                    aria-label="Pilih semua siswa"
                    className="rounded border-slate-400 cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-3 font-semibold w-14 text-center">Absen</th>
                <th className="py-2.5 px-3 font-semibold w-28">NIS</th>
                <th className="py-2.5 px-3 font-semibold min-w-[210px]">Nama Lengkap</th>
                <th className="py-2.5 px-3 font-semibold text-center w-16">L/P</th>
                <th className="py-2.5 px-3 font-semibold w-24">Kelas</th>
                <th className="py-2.5 px-3 font-semibold min-w-[180px]">Email & TTL</th>
                <th className="py-2.5 px-4 font-semibold text-right w-32">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500 text-sm">
                    Tidak ada data siswa yang cocok.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st, idx) => (
                  <tr key={st.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(st.id)}
                        onChange={() => toggleSelectRow(st.id)}
                        aria-label={`Pilih siswa ${st.name}`}
                        className="rounded border-slate-300 cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs font-mono text-slate-600 tabular-nums">
                      {st.absenNo || String(idx + 1).padStart(2, '0')}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-700 tabular-nums">
                      {st.nis}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                          <img
                            src={getStudentPhotoUrl(st)}
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = getStudentPhotoUrl({
                                photoDataUrl: '',
                                gender: st.gender,
                              });
                            }}
                            alt={st.name}
                            className="w-full h-full object-cover object-top"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => onViewStudent(st)}
                          className="text-left font-semibold text-slate-900 hover:text-indigo-600 hover:underline focus-visible:outline-none focus-visible:underline cursor-pointer text-xs sm:text-sm"
                          title="Klik untuk lihat profil & aktivitas kelas"
                        >
                          {st.name}
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs font-semibold text-slate-700">
                      {st.gender}
                    </td>
                    <td className="py-2.5 px-3 text-xs whitespace-nowrap">
                      {onViewClass ? (
                        <button
                          type="button"
                          onClick={() => onViewClass(st.className)}
                          className="font-semibold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer"
                          title={`Klik untuk lihat detail kelas ${st.className}`}
                        >
                          {st.className}
                        </button>
                      ) : (
                        <span className="font-semibold text-indigo-700">{st.className}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-600">
                      <div className="truncate max-w-[220px]">{st.email || '-'}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[220px]">
                        {st.ttl || '-'}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEditStudentModal(st)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer"
                        >
                          <FileEdit className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIds((prev) => prev.filter((id) => id !== st.id));
                            onDeleteStudent(st.id);
                          }}
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
