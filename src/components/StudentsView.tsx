import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileEdit,
  FileSpreadsheet,
  GraduationCap,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student, StudentStatus, SystemSettings } from '../types';
import { getStudentPhotoUrl } from '../utils/defaultAvatars';
import {
  formatStudentTtl,
  generateId,
  parseTtlFields,
  STUDENT_STATUS_LABELS,
} from '../utils/helpers';

interface StudentsViewProps {
  students: Student[];
  settings: SystemSettings;
  canManageStudents?: boolean;
  canPromoteStudents?: boolean;
  onDeleteStudent: (id: string) => void;
  onDeleteStudentsBulk?: (ids: string[]) => void;
  onImportStudents: (newStudents: Student[]) => void;
  onViewStudent: (student: Student) => void;
  onViewClass?: (className: string) => void;
  onCreateStudentModal: () => void;
  onEditStudentModal: (student: Student) => void;
  onOpenPromotionModal?: (selectedIds: string[]) => void;
  onNotify: (msg: string) => void;
}

export const StudentsView: React.FC<StudentsViewProps> = ({
  students,
  settings,
  canManageStudents = true,
  canPromoteStudents = true,
  onDeleteStudent,
  onDeleteStudentsBulk,
  onImportStudents,
  onViewStudent,
  onViewClass,
  onCreateStudentModal,
  onEditStudentModal,
  onOpenPromotionModal,
  onNotify,
}) => {
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | StudentStatus>('aktif');
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
        const stStatus: StudentStatus = st.status || 'aktif';
        if (filterStatus !== 'ALL' && stStatus !== filterStatus) return false;
        if (filterClass !== 'ALL' && st.className !== filterClass) return false;
        if (q) {
          const hay = [
            st.nis,
            st.nisn || '',
            st.absenNo || '',
            st.name,
            st.className,
            st.email || '',
            st.phone || '',
            st.birthPlace || '',
            st.birthDate || '',
            st.address || '',
            st.homeroomTeacher || '',
            st.counselor || '',
          ]
            .join(' ')
            .toLowerCase();
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
  }, [students, filterClass, filterStatus, searchQuery]);

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
        NIS: '25261099',
        NISN: '0104109901',
        Nama: 'Contoh Nama Siswa',
        Kelas: settings.classes[0] || 'X IPA 1',
        'No Absen': '01',
        Tempat: 'Bandung',
        'Tanggal Lahir': '12 Mei 2010',
        Email: 'siswa@sekolah.sch.id',
        Foto: '',
        ALAMAT: 'Jl. Pendidikan No. 10, Bandung',
        NO_HP: '0812-3456-7890',
        JENIS_KELAMIN: 'L',
        Status: 'aktif',
        'Wali Kelas': 'Budi Hartono, S.Pd.',
        'Guru BK': 'Dra. Ratna Sari, M.Pd., Kons.',
        'Tahun Masuk': settings.academicYear,
      },
      {
        NIS: '25261100',
        NISN: '0104109902',
        Nama: 'Contoh Nama Siswi',
        Kelas: settings.classes[0] || 'X IPA 1',
        'No Absen': '02',
        Tempat: 'Cimahi',
        'Tanggal Lahir': '20 Agustus 2010',
        Email: 'siswi@sekolah.sch.id',
        Foto: '',
        ALAMAT: 'Jl. Merdeka No. 25, Bandung',
        NO_HP: '0813-9876-5432',
        JENIS_KELAMIN: 'P',
        Status: 'aktif',
        'Wali Kelas': 'Budi Hartono, S.Pd.',
        'Guru BK': 'Dra. Ratna Sari, M.Pd., Kons.',
        'Tahun Masuk': settings.academicYear,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Siswa');
    XLSX.writeFile(wb, 'Template_Impor_Siswa_EGuru.xlsx');
    onNotify('Template Excel (.xlsx) siswa dengan 15 kolom standar berhasil diunduh.');
  };

  const handleExportStudents = () => {
    const targetList =
      selectedIds.length > 0
        ? filteredStudents.filter((st) => selectedIds.includes(st.id))
        : filteredStudents;
    const rows = targetList.map((st, idx) => {
      const parsedTtl = parseTtlFields(st.ttl);
      const tempat = st.birthPlace || parsedTtl.birthPlace || '-';
      const tglLahir = st.birthDate || parsedTtl.birthDate || '-';
      return {
        No: idx + 1,
        NIS: st.nis,
        NISN: st.nisn || '-',
        Nama: st.name,
        Kelas: st.className,
        'No Absen': st.absenNo || '-',
        Tempat: tempat,
        'Tanggal Lahir': tglLahir,
        Email: st.email || '-',
        Foto: st.photoDataUrl && !st.photoDataUrl.startsWith('data:') ? st.photoDataUrl : '',
        ALAMAT: st.address || '-',
        NO_HP: st.phone || '-',
        JENIS_KELAMIN: st.gender,
        Status: STUDENT_STATUS_LABELS[st.status || 'aktif'],
        'Wali Kelas': st.homeroomTeacher || '-',
        'Guru BK': st.counselor || '-',
        'Tahun Masuk': st.enrollmentYear || settings.academicYear,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa');
    XLSX.writeFile(wb, 'Data_Siswa_Portal_EGuru.xlsx');
    onNotify(
      `Berhasil mengekspor ${rows.length} data siswa${selectedIds.length > 0 ? ' terpilih' : ''} ke Excel.`
    );
  };

  const parseStatus = (raw?: string): StudentStatus => {
    const s = String(raw || '').trim().toLowerCase();
    if (s.includes('lulus') || s.includes('alumni')) return 'lulus';
    if (s.includes('pindah') || s.includes('mutasi')) return 'pindah';
    if (s.includes('keluar') || s.includes('nonaktif')) return 'keluar';
    return 'aktif';
  };

  const parseAndImportRows = (
    rawRows: Array<{
      nis: string;
      nisn?: string;
      name: string;
      className: string;
      absenNo?: string;
      birthPlace?: string;
      birthDate?: string;
      ttl?: string;
      email?: string;
      photoDataUrl?: string;
      address?: string;
      phone?: string;
      gender: string;
      status?: string;
      homeroomTeacher?: string;
      counselor?: string;
      enrollmentYear?: string;
    }>
  ) => {
    const valid: Student[] = [];
    rawRows.forEach((r) => {
      const cleanNis = String(r.nis || '').trim();
      const cleanName = String(r.name || '').trim();
      const cleanGenderRaw = String(r.gender || 'L').trim().toUpperCase();
      const cleanGender: 'L' | 'P' =
        cleanGenderRaw.startsWith('P') || cleanGenderRaw === 'PEREMPUAN' ? 'P' : 'L';
      const cleanClass = String(r.className || settings.classes[0] || 'X IPA 1').trim();
      if (cleanNis && cleanName && cleanNis.toLowerCase() !== 'nis') {
        const parsedTtl = parseTtlFields(r.ttl);
        const birthPlace = String(r.birthPlace || '').trim() || parsedTtl.birthPlace;
        const birthDate = String(r.birthDate || '').trim() || parsedTtl.birthDate;
        const combinedTtl = formatStudentTtl({ birthPlace, birthDate, ttl: r.ttl });

        valid.push({
          id: generateId('std'),
          nis: cleanNis,
          nisn: String(r.nisn || '').trim(),
          absenNo: String(r.absenNo || '').trim(),
          name: cleanName,
          gender: cleanGender,
          className: cleanClass,
          status: parseStatus(r.status),
          enrollmentYear: String(r.enrollmentYear || settings.academicYear).trim(),
          email: String(r.email || '').trim(),
          birthPlace,
          birthDate,
          ttl: combinedTtl,
          address: String(r.address || '').trim(),
          phone: String(r.phone || '').trim(),
          homeroomTeacher: String(r.homeroomTeacher || '').trim(),
          counselor: String(r.counselor || '').trim(),
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

    // Format kolom sesuai urutan user:
    // NIS | NISN | Nama | Kelas | No Absen | Tempat | Tanggal Lahir | Email | Foto | ALAMAT | NO_HP | JENIS_KELAMIN | Status | Wali Kelas | Guru BK
    const parsed = lines.map((line) => {
      const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
      const cols = line.split(delimiter).map((c) => c.trim());
      return {
        nis: cols[0] || '',
        nisn: cols[1] || '',
        name: cols[2] || '',
        className: cols[3] || settings.classes[0] || 'X IPA 1',
        absenNo: cols[4] || '',
        birthPlace: cols[5] || '',
        birthDate: cols[6] || '',
        email: cols[7] || '',
        photoDataUrl: cols[8] || '',
        address: cols[9] || '',
        phone: cols[10] || '',
        gender: cols[11] || 'L',
        status: cols[12] || 'aktif',
        homeroomTeacher: cols[13] || '',
        counselor: cols[14] || '',
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
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        raw: false,
      });

      const pick = (row: Record<string, unknown>, keys: string[], fallback = '') => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
            return String(row[k]).trim();
          }
        }
        return fallback;
      };

      const mapped = jsonRows.map((row) => ({
        nis: pick(row, ['NIS', 'nis', 'No Induk']),
        nisn: pick(row, ['NISN', 'nisn']),
        name: pick(row, ['Nama', 'Nama Lengkap', 'nama', 'Nama Siswa']),
        className: pick(row, ['Kelas', 'kelas'], settings.classes[0] || 'X IPA 1'),
        absenNo: pick(row, ['No Absen', 'No. Absen', 'Absen', 'NO_ABSEN']),
        birthPlace: pick(row, ['Tempat', 'Tempat Lahir', 'tempat', 'TEMPAT']),
        birthDate: pick(row, ['Tanggal Lahir', 'Tgl Lahir', 'TGL_LAHIR', 'tanggal_lahir']),
        ttl: pick(row, ['TTL', 'Tempat Tanggal Lahir']),
        email: pick(row, ['Email', 'email', 'EMAIL']),
        photoDataUrl: pick(row, ['Foto', 'Foto URL', 'Link Foto', 'FOTO']),
        address: pick(row, ['ALAMAT', 'Alamat', 'alamat']),
        phone: pick(row, ['NO_HP', 'No HP', 'No. HP', 'HP', 'Telepon', 'No WA']),
        gender: pick(row, ['JENIS_KELAMIN', 'Jenis Kelamin', 'L/P', 'JK'], 'L'),
        status: pick(row, ['Status', 'status', 'STATUS'], 'aktif'),
        homeroomTeacher: pick(row, ['Wali Kelas', 'WALI_KELAS', 'wali_kelas']),
        counselor: pick(row, ['Guru BK', 'GURU_BK', 'guru_bk', 'BK']),
        enrollmentYear: pick(row, ['Tahun Masuk', 'Angkatan'], settings.academicYear),
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
    <div className="space-y-5 sm:space-y-6">
      {/* Top Action Card */}
      <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900">
            Manajemen Biodata, Kenaikan Kelas &amp; Peserta Didik
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
            Kelola data lengkap siswa (NIS, NISN, TTL, Kontak, Alamat, Wali Kelas, Guru BK), proses{' '}
            <strong className="text-slate-700">Naik Kelas / Mutasi</strong>, atau klik{' '}
            <strong className="text-slate-700">Nama Siswa</strong> untuk membuka profil &amp; cetak individu.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
          {canManageStudents && (
            <button
              type="button"
              onClick={onCreateStudentModal}
              className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 min-h-[42px] px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Tambah Siswa Baru</span>
            </button>
          )}

          {canPromoteStudents && onOpenPromotionModal && (
            <button
              type="button"
              onClick={() => onOpenPromotionModal(selectedIds)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 sm:px-3.5 py-2 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              <GraduationCap className="w-4 h-4 text-indigo-700 shrink-0" />
              <span className="truncate">
                {selectedIds.length > 0
                  ? `Naik Kelas (${selectedIds.length})`
                  : 'Naik Kelas / Mutasi'}
              </span>
            </button>
          )}

          {canManageStudents && (
            <>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Unduh Template</span>
              </button>

              <button
                type="button"
                onClick={() => setShowImportPanel((v) => !v)}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                <span>{showImportPanel ? 'Tutup Impor' : 'Impor Data'}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleExportStudents}
            className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            <span>
              {selectedIds.length > 0 ? `Ekspor (${selectedIds.length})` : 'Ekspor Excel'}
            </span>
          </button>
        </div>
      </section>

      {/* Collapsible Kotak Impor Data */}
      {canManageStudents && showImportPanel && (
        <section className="bg-white rounded-xl border border-indigo-200 p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Kotak Impor Data Siswa</h3>
              <p className="text-xs text-slate-500">
                Format kolom tempel (Tab):{' '}
                <span className="font-mono font-semibold">
                  NIS [Tab] NISN [Tab] Nama [Tab] Kelas [Tab] No Absen [Tab] Tempat [Tab] Tanggal Lahir [Tab] Email [Tab] Foto [Tab] ALAMAT [Tab] NO_HP [Tab] JENIS_KELAMIN [Tab] Status [Tab] Wali Kelas [Tab] Guru BK
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
            rows={4}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`25261011\t0104109901\tBudi Santoso\tX IPA 1\t08\tBandung\t10 Mei 2010\tbudi@siswa.sch.id\t\tJl. Riau No. 12\t081234567890\tL\taktif\tBudi Hartono, S.Pd.\tDra. Ratna Sari, M.Pd., Kons.`}
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
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
          <div>
            <h3 className="text-base font-bold text-slate-900">Daftar Peserta Didik</h3>
            <p className="text-xs text-slate-500 tabular-nums">
              Menampilkan {filteredStudents.length} siswa · Laki-laki: {genderSummary.l} · Perempuan: {genderSummary.p}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 w-full lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari NIS, NISN, nama, HP, wali..."
                className="w-full min-h-[40px] pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="w-full sm:w-auto min-h-[40px] px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="ALL">Semua Kelas</option>
                {settings.classes.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'ALL' | StudentStatus)}
                className="w-full sm:w-auto min-h-[40px] px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="aktif">Status: Aktif</option>
                <option value="lulus">Status: Lulus / Alumni</option>
                <option value="pindah">Status: Pindah</option>
                <option value="keluar">Status: Keluar</option>
                <option value="ALL">Semua Status</option>
              </select>
            </div>

            {canManageStudents && selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Terpilih ({selectedIds.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile & Tablet Card List View */}
        <div className="lg:hidden">
          {filteredStudents.length > 0 && (
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer min-h-[36px]">
                <input
                  type="checkbox"
                  checked={
                    filteredStudents.length > 0 &&
                    filteredStudents.every((s) => selectedIds.includes(s.id))
                  }
                  onChange={toggleSelectAllFiltered}
                  className="w-4 h-4 rounded border-slate-300 cursor-pointer"
                />
                <span>Pilih Semua ({filteredStudents.length})</span>
              </label>
              {selectedIds.length > 0 && (
                <span className="text-[11px] font-semibold text-indigo-700 tabular-nums">
                  {selectedIds.length} terpilih
                </span>
              )}
            </div>
          )}

          <div className="divide-y divide-slate-200 max-h-[600px] overflow-y-auto eguru-scroll">
            {filteredStudents.length === 0 ? (
              <div className="py-10 px-4 text-center text-slate-500 text-sm">
                Tidak ada data siswa yang cocok dengan filter kelas/status.
              </div>
            ) : (
              filteredStudents.map((st, idx) => {
                const stStatus: StudentStatus = st.status || 'aktif';
                const displayTtl = formatStudentTtl(st);
                const checked = selectedIds.includes(st.id);
                return (
                  <div
                    key={st.id}
                    className={`p-4 space-y-3 ${checked ? 'bg-indigo-50/40' : 'bg-white'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelectRow(st.id)}
                        aria-label={`Pilih siswa ${st.name}`}
                        className="mt-2 w-4 h-4 rounded border-slate-300 cursor-pointer shrink-0"
                      />
                      <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                        <img
                          src={getStudentPhotoUrl(st)}
                          referrerPolicy="no-referrer"
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
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onViewStudent(st)}
                            className="text-left font-bold text-sm text-slate-900 hover:text-indigo-600 hover:underline cursor-pointer truncate"
                          >
                            {st.name}
                          </button>
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded border shrink-0 ${
                              stStatus === 'aktif'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {STUDENT_STATUS_LABELS[stStatus]}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                          {onViewClass ? (
                            <button
                              type="button"
                              onClick={() => onViewClass(st.className)}
                              className="font-semibold text-indigo-700 hover:underline cursor-pointer"
                            >
                              {st.className}
                            </button>
                          ) : (
                            <span className="font-semibold text-indigo-700">{st.className}</span>
                          )}
                          <span>·</span>
                          <span className="font-mono tabular-nums">
                            Absen {st.absenNo || String(idx + 1).padStart(2, '0')}
                          </span>
                          <span>·</span>
                          <span>{st.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] font-mono text-slate-500 tabular-nums">
                          NIS {st.nis}
                          {st.nisn ? ` · NISN ${st.nisn}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-7 text-xs text-slate-600">
                      <div className="truncate">
                        <span className="text-slate-400">TTL:</span> {displayTtl || '-'}
                      </div>
                      <div className="truncate font-mono">
                        <span className="text-slate-400 font-sans">HP:</span> {st.phone || '-'}
                      </div>
                      <div className="truncate sm:col-span-2">
                        <span className="text-slate-400">WK:</span> {st.homeroomTeacher || '-'} ·{' '}
                        <span className="text-slate-400">BK:</span> {st.counselor || '-'}
                      </div>
                    </div>

                    <div className="pl-7 flex flex-wrap items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => onViewStudent(st)}
                        className="flex-1 min-w-[84px] min-h-[38px] inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        <span>Detail</span>
                      </button>
                      {canManageStudents && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEditStudentModal(st)}
                            className="flex-1 min-w-[84px] min-h-[38px] inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer"
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
                            className="min-h-[38px] min-w-[40px] inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                            aria-label={`Hapus ${st.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Desktop 10-Column Table */}
        <div className="hidden lg:block max-h-[480px] overflow-auto eguru-scroll">
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
                <th className="py-2.5 px-3 font-semibold min-w-[125px]">NIS / NISN</th>
                <th className="py-2.5 px-3 font-semibold min-w-[200px]">Nama &amp; Foto</th>
                <th className="py-2.5 px-3 font-semibold text-center w-14">JK</th>
                <th className="py-2.5 px-3 font-semibold min-w-[110px]">Kelas &amp; Status</th>
                <th className="py-2.5 px-3 font-semibold min-w-[190px]">Tempat, Tgl Lahir &amp; Alamat</th>
                <th className="py-2.5 px-3 font-semibold min-w-[170px]">No. HP &amp; Email</th>
                <th className="py-2.5 px-3 font-semibold min-w-[180px]">Wali Kelas &amp; Guru BK</th>
                <th className="py-2.5 px-4 font-semibold text-right w-32">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500 text-sm">
                    Tidak ada data siswa yang cocok dengan filter kelas/status.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st, idx) => {
                  const stStatus: StudentStatus = st.status || 'aktif';
                  const displayTtl = formatStudentTtl(st);
                  return (
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
                      <td className="py-2.5 px-3 font-mono text-xs tabular-nums">
                        <div className="font-semibold text-slate-800">{st.nis}</div>
                        <div className="text-[11px] text-slate-400">
                          {st.nisn ? `NISN: ${st.nisn}` : 'NISN: -'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                            <img
                              src={getStudentPhotoUrl(st)}
                              referrerPolicy="no-referrer"
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
                        <div>
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
                        </div>
                        <div
                          className={`text-[11px] font-medium ${
                            stStatus === 'aktif' ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {STUDENT_STATUS_LABELS[stStatus]}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-600">
                        <div className="font-medium text-slate-800 truncate max-w-[200px]">
                          {displayTtl || '-'}
                        </div>
                        <div
                          className="text-[11px] text-slate-400 truncate max-w-[200px]"
                          title={st.address}
                        >
                          {st.address || '-'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-600">
                        <div className="font-mono text-slate-800 truncate max-w-[180px]">
                          {st.phone || '-'}
                        </div>
                        <div
                          className="text-[11px] text-slate-400 truncate max-w-[180px]"
                          title={st.email}
                        >
                          {st.email || '-'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-600">
                        <div className="truncate max-w-[190px]" title={st.homeroomTeacher}>
                          <span className="text-slate-400">WK:</span>{' '}
                          <span className="font-medium text-slate-800">
                            {st.homeroomTeacher || '-'}
                          </span>
                        </div>
                        <div className="text-[11px] truncate max-w-[190px]" title={st.counselor}>
                          <span className="text-slate-400">BK:</span> {st.counselor || '-'}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewStudent(st)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            <span>Detail</span>
                          </button>
                          {canManageStudents && (
                            <>
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
                            </>
                          )}
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
    </div>
  );
};
