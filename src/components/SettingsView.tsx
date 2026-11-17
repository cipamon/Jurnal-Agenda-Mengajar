import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Check,
  Download,
  ExternalLink,
  FileEdit,
  FileSpreadsheet,
  Globe,
  ImagePlus,
  Italic,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Underline,
  Upload,
  UserCheck,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  AppUser,
  KopSuratLineSizes,
  KopSuratTextStyle,
  PrintFontFamily,
  SystemSettings,
  UserRole,
} from '../types';
import { DEFAULT_WEB_LOGO, getUserPhotoUrl } from '../utils/defaultAvatars';
import { DEFAULT_LEFT_LOGO, DEFAULT_RIGHT_LOGO } from '../utils/defaultLogos';
import {
  formatAssignmentSummary,
  getPrintFontCss,
  normalizeKopSurat,
  normalizeWebBrand,
  PRINT_FONT_OPTIONS,
  USER_ROLE_LABELS,
} from '../utils/helpers';
import { AdminUsersModal } from './AdminUsersModal';

interface SettingsViewProps {
  settings: SystemSettings;
  users: AppUser[];
  activeUser?: AppUser;
  currentUserRole: UserRole;
  currentUserEmail: string;
  onUpdateSettings: (next: SystemSettings) => void;
  onUpdateUsers: (nextUsers: AppUser[]) => void;
  onSwitchUserSession?: (user: AppUser) => void;
  onOpenTeacherProfileModal: () => void;
  onViewClass?: (className: string) => void;
  onViewSubject?: (subject: string) => void;
  onNotify: (msg: string) => void;
}

interface MasterListCardProps {
  title: string;
  subtitle: string;
  items: string[];
  placeholder: string;
  onItemClick?: (item: string) => void;
  onChange: (nextItems: string[]) => void;
}

const MasterListCard: React.FC<MasterListCardProps> = ({
  title,
  subtitle,
  items,
  placeholder,
  onItemClick,
  onChange,
}) => {
  const [newVal, setNewVal] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const safeFileSlug = title.replace(/[^a-zA-Z0-9]+/g, '_');

  const handleAdd = () => {
    const trimmed = newVal.trim();
    if (!trimmed) return;
    if (items.includes(trimmed)) return;
    onChange([...items, trimmed]);
    setNewVal('');
  };

  const handleSaveEdit = (idx: number) => {
    const trimmed = editVal.trim();
    if (!trimmed) return;
    const oldVal = items[idx];
    const next = [...items];
    next[idx] = trimmed;
    onChange(next);
    setSelectedItems((prev) => prev.map((x) => (x === oldVal ? trimmed : x)));
    setEditingIndex(null);
  };

  const handleDelete = (idx: number) => {
    const removed = items[idx];
    onChange(items.filter((_, i) => i !== idx));
    setSelectedItems((prev) => prev.filter((x) => x !== removed));
  };

  const toggleSelect = (val: string) => {
    setSelectedItems((prev) =>
      prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]
    );
  };

  const toggleSelectAll = () => {
    const allSelected = items.length > 0 && items.every((it) => selectedItems.includes(it));
    setSelectedItems(allSelected ? [] : [...items]);
  };

  const handleBulkDelete = () => {
    if (selectedItems.length === 0) return;
    const delSet = new Set(selectedItems);
    onChange(items.filter((it) => !delSet.has(it)));
    setSelectedItems([]);
  };

  const handleDownloadTemplate = () => {
    const rows = [
      { Nama: placeholder.replace(/^Contoh:\s*/i, '') || `${title} 1` },
      { Nama: items[0] || `${title} 2` },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `Template_${safeFileSlug}.xlsx`);
  };

  const handleExport = () => {
    const source =
      selectedItems.length > 0 ? items.filter((it) => selectedItems.includes(it)) : items;
    const rows = source.map((it, idx) => ({ No: idx + 1, Nama: it }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${safeFileSlug}_EGuru.xlsx`);
  };

  const mergeImportedValues = (values: string[]) => {
    const cleaned = values
      .map((v) => v.trim())
      .filter((v) => v && v.toLowerCase() !== 'nama');
    if (cleaned.length === 0) return;
    const merged = Array.from(new Set([...items, ...cleaned]));
    onChange(merged);
    setPasteText('');
    setShowImport(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const vals = rows.map((r) => {
        const firstVal = Object.values(r)[0];
        return String(r['Nama'] ?? r['nama'] ?? r['Nilai'] ?? firstVal ?? '');
      });
      mergeImportedValues(vals);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between gap-3">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          {items.length > 0 && (
            <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 cursor-pointer shrink-0 pt-0.5">
              <input
                type="checkbox"
                checked={items.length > 0 && items.every((it) => selectedItems.includes(it))}
                onChange={toggleSelectAll}
                className="rounded border-slate-300 cursor-pointer"
              />
              <span>Pilih</span>
            </label>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
            title="Unduh template Excel"
          >
            <Download className="w-3 h-3 text-indigo-600" />
            <span>Template</span>
          </button>
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[11px] font-semibold text-white cursor-pointer"
          >
            <Upload className="w-3 h-3 text-indigo-300" />
            <span>{showImport ? 'Tutup' : 'Impor'}</span>
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-[11px] font-semibold text-white cursor-pointer"
          >
            <FileSpreadsheet className="w-3 h-3" />
            <span>{selectedItems.length > 0 ? `Ekspor (${selectedItems.length})` : 'Ekspor'}</span>
          </button>
          {selectedItems.length > 0 && (
            <button
              type="button"
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-[11px] font-semibold text-white cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Hapus ({selectedItems.length})</span>
            </button>
          )}
        </div>

        {showImport && (
          <div className="mt-2.5 p-2.5 rounded-lg border border-indigo-200 bg-indigo-50/50 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-700">1 baris = 1 item</span>
              <label className="inline-flex items-center gap-1 px-2 py-1 rounded border border-indigo-300 bg-white text-[11px] font-semibold text-indigo-700 cursor-pointer">
                <Upload className="w-3 h-3" />
                <span>File Excel</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
            <textarea
              rows={2}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={placeholder.replace(/^Contoh:\s*/i, '')}
              className="w-full p-2 text-[11px] font-mono rounded border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="px-2 py-1 rounded border border-slate-300 bg-white text-[11px] text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => mergeImportedValues(pasteText.split(/\r?\n/))}
                disabled={!pasteText.trim()}
                className="px-2.5 py-1 rounded bg-indigo-600 text-white text-[11px] font-semibold disabled:opacity-50 cursor-pointer"
              >
                Impor
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={placeholder}
            className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah</span>
          </button>
        </div>

        <ul className="mt-3 divide-y divide-slate-100 max-h-52 overflow-y-auto eguru-scroll border border-slate-100 rounded-lg">
          {items.map((item, idx) => (
            <li
              key={`${item}-${idx}`}
              className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-50"
            >
              {editingIndex === idx ? (
                <div className="flex-1 flex items-center gap-1.5">
                  <input
                    type="text"
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs rounded border border-indigo-400 focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(idx)}
                    className="p-1 rounded bg-emerald-600 text-white cursor-pointer"
                    aria-label="Simpan perubahan"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item)}
                      onChange={() => toggleSelect(item)}
                      aria-label={`Pilih ${item}`}
                      className="rounded border-slate-300 cursor-pointer shrink-0"
                    />
                    {onItemClick ? (
                      <button
                        type="button"
                        onClick={() => onItemClick(item)}
                        className="font-semibold text-indigo-700 hover:text-indigo-900 hover:underline truncate text-left cursor-pointer"
                        title={`Klik untuk lihat detail ${item}`}
                      >
                        {item}
                      </button>
                    ) : (
                      <span className="font-medium text-slate-800 truncate">{item}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingIndex(idx);
                        setEditVal(item);
                      }}
                      className="p-1 rounded text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 cursor-pointer"
                      aria-label={`Edit ${item}`}
                    >
                      <FileEdit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(idx)}
                      className="p-1 rounded text-slate-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                      aria-label={`Hapus ${item}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  users,
  activeUser,
  currentUserRole,
  currentUserEmail,
  onUpdateSettings,
  onUpdateUsers,
  onSwitchUserSession,
  onOpenTeacherProfileModal,
  onViewClass,
  onViewSubject,
  onNotify,
}) => {
  const [draft, setDraft] = useState<SystemSettings>(settings);
  const [showAdminModal, setShowAdminModal] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const normBrand = normalizeWebBrand(draft);

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(draft);
    onNotify('Pengaturan sistem, identitas web, dan Kop Surat berhasil disimpan.');
  };

  const handleLogoUpload = (side: 'left' | 'right', file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      setDraft((prev) => ({
        ...prev,
        kopSurat: {
          ...prev.kopSurat,
          ...(side === 'left' ? { leftLogoDataUrl: result } : { rightLogoDataUrl: result }),
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleWebLogoUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      setDraft((prev) => ({
        ...prev,
        webBrand: {
          ...normalizeWebBrand(prev),
          webLogoDataUrl: result,
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  const toggleKopStyle = (
    lineKey: keyof KopSuratLineSizes,
    prop: keyof KopSuratTextStyle
  ) => {
    const norm = normalizeKopSurat(draft.kopSurat);
    const current = norm.lineStyles[lineKey];
    setDraft({
      ...draft,
      kopSurat: {
        ...draft.kopSurat,
        lineStyles: {
          ...norm.lineStyles,
          [lineKey]: {
            ...current,
            [prop]: !current[prop],
          },
        },
      },
    });
  };

  return (
    <>
    <form onSubmit={handleSaveAll} className="space-y-8">
      {/* ===================================================================== */}
      {/* 1. PENGATURAN PERIODE AKTIF & PEJABAT KEPALA SEKOLAH */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Periode Aktif & Pejabat Penandatangan</h2>
            <p className="text-xs text-slate-300">
              Tahun ajaran, semester aktif, standar KKM, serta biodata Kepala Sekolah untuk lembar resmi
            </p>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Semua Pengaturan</span>
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tahun Ajaran Aktif</label>
            <select
              value={draft.academicYear}
              onChange={(e) => setDraft({ ...draft, academicYear: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              {draft.academicYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Semester</label>
            <select
              value={draft.semester}
              onChange={(e) =>
                setDraft({ ...draft, semester: e.target.value as 'Ganjil' | 'Genap' })
              }
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="Ganjil">Ganjil</option>
              <option value="Genap">Genap</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">KKM Standar</label>
            <input
              type="number"
              min={0}
              max={100}
              value={draft.kkm}
              onChange={(e) => setDraft({ ...draft, kkm: Number(e.target.value) || 75 })}
              className="w-full px-3 py-2 text-sm tabular-nums rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Lokasi Tanda Tangan</label>
            <input
              type="text"
              value={draft.signatureCity}
              onChange={(e) => setDraft({ ...draft, signatureCity: e.target.value })}
              placeholder="Kota / Kabupaten"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Jabatan Kepala Sekolah</label>
            <input
              type="text"
              value={draft.principalTitle}
              onChange={(e) => setDraft({ ...draft, principalTitle: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nama Kepala Sekolah</label>
            <input
              type="text"
              value={draft.principalName}
              onChange={(e) => setDraft({ ...draft, principalName: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">NIP Kepala Sekolah</label>
            <input
              type="text"
              value={draft.principalNip}
              onChange={(e) => setDraft({ ...draft, principalNip: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 1B. PENGATURAN LOGO WEB & NAMA WEB DI TAB BROWSER */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-600" />
              <span>Identitas Web, Logo & Nama Tab Browser</span>
            </h3>
            <p className="text-xs text-slate-500">
              Atur nama portal pada sidebar/login, judul tab browser, dan ikon favicon web aplikasi
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-t-lg border border-b-0 border-slate-300 bg-slate-100 max-w-xs">
            <img
              src={normBrand.webLogoDataUrl}
              alt="Preview Favicon"
              className="w-4 h-4 rounded-sm object-contain shrink-0"
            />
            <span className="text-[11px] font-medium text-slate-800 truncate">{normBrand.tabTitle}</span>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nama Web / Aplikasi (Sidebar & Login)
            </label>
            <input
              type="text"
              value={normBrand.appName}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  webBrand: { ...normBrand, appName: e.target.value },
                })
              }
              placeholder="Portal E-Guru v10.2"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div className="lg:col-span-5">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nama Web di Tab Browser (Title Tab)
            </label>
            <input
              type="text"
              value={normBrand.tabTitle}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  webBrand: { ...normBrand, tabTitle: e.target.value },
                })
              }
              placeholder="Portal E-Guru — Sistem Administrasi Mengajar"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div className="lg:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Logo Web & Favicon Tab
            </label>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                <img
                  src={normBrand.webLogoDataUrl}
                  alt="Logo Web"
                  className="w-full h-full object-contain"
                />
              </div>
              <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap">
                <ImagePlus className="w-3.5 h-3.5" />
                <span>Unggah Logo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleWebLogoUpload(e.target.files?.[0])}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    webBrand: { ...normBrand, webLogoDataUrl: DEFAULT_WEB_LOGO },
                  })
                }
                className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs text-slate-600 cursor-pointer"
                title="Kembalikan logo web default"
              >
                Default
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. PENGATURAN KOP SURAT STANDAR DINAS (6 BARIS + 2 LOGO + LIVE PREVIEW) */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900">Pengaturan Kop Surat Standar Dinas</h3>
          <p className="text-xs text-slate-500">
            Ubah 6 baris teks kop surat dan unggah logo kiri/kanan dengan pratinjau langsung bergaris ganda
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Pengaturan Jenis Huruf (Font) & Ukuran Logo Kop Surat */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Jenis Huruf (Font) Kop Surat
              </label>
              <select
                value={normalizeKopSurat(draft.kopSurat).fontFamily}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    kopSurat: {
                      ...draft.kopSurat,
                      fontFamily: e.target.value as PrintFontFamily,
                    },
                  })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                {PRINT_FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                <span>Ukuran Logo Kiri</span>
                <span className="font-mono text-indigo-700 tabular-nums">
                  {normalizeKopSurat(draft.kopSurat).leftLogoSize} px
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <input
                  type="range"
                  min={36}
                  max={120}
                  step={2}
                  value={normalizeKopSurat(draft.kopSurat).leftLogoSize}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      kopSurat: {
                        ...draft.kopSurat,
                        leftLogoSize: Number(e.target.value),
                      },
                    })
                  }
                  className="flex-1 accent-indigo-600 cursor-pointer"
                />
                <input
                  type="number"
                  min={36}
                  max={120}
                  value={normalizeKopSurat(draft.kopSurat).leftLogoSize}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      kopSurat: {
                        ...draft.kopSurat,
                        leftLogoSize: Math.max(36, Math.min(120, Number(e.target.value) || 64)),
                      },
                    })
                  }
                  className="w-16 px-2 py-1 text-xs font-mono text-center rounded-md border border-slate-300 bg-white tabular-nums"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                <span>Ukuran Logo Kanan</span>
                <span className="font-mono text-indigo-700 tabular-nums">
                  {normalizeKopSurat(draft.kopSurat).rightLogoSize} px
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <input
                  type="range"
                  min={36}
                  max={120}
                  step={2}
                  value={normalizeKopSurat(draft.kopSurat).rightLogoSize}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      kopSurat: {
                        ...draft.kopSurat,
                        rightLogoSize: Number(e.target.value),
                      },
                    })
                  }
                  className="flex-1 accent-indigo-600 cursor-pointer"
                />
                <input
                  type="number"
                  min={36}
                  max={120}
                  value={normalizeKopSurat(draft.kopSurat).rightLogoSize}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      kopSurat: {
                        ...draft.kopSurat,
                        rightLogoSize: Math.max(36, Math.min(120, Number(e.target.value) || 64)),
                      },
                    })
                  }
                  className="w-16 px-2 py-1 text-xs font-mono text-center rounded-md border border-slate-300 bg-white tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 6 Baris Teks Kop + Pengaturan Ukuran Font & Bold/Italic/Underline per Baris */}
            <div className="lg:col-span-7 space-y-3">
              {(
                [
                  { key: 'line1', label: 'Baris 1 (Instansi Pemerintah / Yayasan)' },
                  { key: 'line2', label: 'Baris 2 (Dinas Pendidikan)' },
                  { key: 'line3', label: 'Baris 3 (Cabang Dinas / Wilayah)' },
                  { key: 'line4', label: 'Baris 4 (Nama Unit Sekolah)' },
                  { key: 'line5', label: 'Baris 5 (Alamat Jalan & Telepon)' },
                  { key: 'line6', label: 'Baris 6 (Website, Email, NPSN)' },
                ] as { key: keyof KopSuratLineSizes; label: string }[]
              ).map((item) => {
                const norm = normalizeKopSurat(draft.kopSurat);
                const st = norm.lineStyles[item.key];
                return (
                  <div key={item.key}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <label className="block text-xs font-semibold text-slate-700">{item.label}</label>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <div className="inline-flex items-center rounded border border-slate-300 bg-white overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleKopStyle(item.key, 'bold')}
                            aria-pressed={st.bold}
                            title="Tebal (Bold)"
                            className={`px-2 py-0.5 text-xs font-bold cursor-pointer transition-colors ${
                              st.bold
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <Bold className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleKopStyle(item.key, 'italic')}
                            aria-pressed={st.italic}
                            title="Miring (Italic)"
                            className={`px-2 py-0.5 text-xs border-l border-slate-200 cursor-pointer transition-colors ${
                              st.italic
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <Italic className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleKopStyle(item.key, 'underline')}
                            aria-pressed={st.underline}
                            title="Garis Bawah (Underline)"
                            className={`px-2 py-0.5 text-xs border-l border-slate-200 cursor-pointer transition-colors ${
                              st.underline
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <Underline className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="ml-1">Ukuran:</span>
                        <input
                          type="number"
                          min={8}
                          max={28}
                          value={norm.lineSizes[item.key]}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              kopSurat: {
                                ...draft.kopSurat,
                                lineSizes: {
                                  ...norm.lineSizes,
                                  [item.key]: Math.max(8, Math.min(28, Number(e.target.value) || 12)),
                                },
                              },
                            })
                          }
                          aria-label={`Ukuran font ${item.label}`}
                          className="w-14 px-1.5 py-0.5 text-xs font-mono text-center rounded border border-slate-300 bg-white tabular-nums"
                        />
                        <span>px</span>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={draft.kopSurat[item.key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          kopSurat: { ...draft.kopSurat, [item.key]: e.target.value },
                        })
                      }
                      style={{
                        fontWeight: st.bold ? 700 : 400,
                        fontStyle: st.italic ? 'italic' : 'normal',
                        textDecoration: st.underline ? 'underline' : 'none',
                      }}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                );
              })}
            </div>

            {/* Unggah Logo Kiri & Logo Kanan */}
            <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 flex items-center justify-center p-1.5 shrink-0">
                  {draft.kopSurat.leftLogoDataUrl ? (
                    <img
                      src={draft.kopSurat.leftLogoDataUrl}
                      alt="Preview Logo Kiri"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-400">Kosong</span>
                  )}
                </div>
                <div className="space-y-2 min-w-0">
                  <p className="text-xs font-bold text-slate-900">Logo Kiri (Dinas / Pemda)</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer">
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>Unggah Logo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleLogoUpload('left', e.target.files?.[0])}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          kopSurat: { ...draft.kopSurat, leftLogoDataUrl: DEFAULT_LEFT_LOGO },
                        })
                      }
                      className="px-2 py-1.5 rounded-md border border-slate-300 bg-white text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      Default
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 flex items-center justify-center p-1.5 shrink-0">
                  {draft.kopSurat.rightLogoDataUrl ? (
                    <img
                      src={draft.kopSurat.rightLogoDataUrl}
                      alt="Preview Logo Kanan"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-400">Kosong</span>
                  )}
                </div>
                <div className="space-y-2 min-w-0">
                  <p className="text-xs font-bold text-slate-900">Logo Kanan (Sekolah)</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer">
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>Unggah Logo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleLogoUpload('right', e.target.files?.[0])}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          kopSurat: { ...draft.kopSurat, rightLogoDataUrl: DEFAULT_RIGHT_LOGO },
                        })
                      }
                      className="px-2 py-1.5 rounded-md border border-slate-300 bg-white text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      Default
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Kotak Pratinjau Langsung (Live Preview) Kop Surat Bergaris Ganda */}
          {(() => {
            const normKop = normalizeKopSurat(draft.kopSurat);
            return (
              <div className="p-5 rounded-xl border border-slate-300 bg-white">
                <p className="text-xs font-semibold text-slate-500 mb-3">
                  Pratinjau Langsung Kop Surat Bergaris Ganda ({normKop.fontFamily} · Logo Kiri {normKop.leftLogoSize}px · Logo Kanan {normKop.rightLogoSize}px):
                </p>
                <div className="border border-slate-200 p-5 rounded-lg bg-white overflow-x-auto">
                  <div className="pb-2 border-b-[3px] border-double border-slate-900">
                    <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-900">
                      <div
                        style={{ width: normKop.leftLogoSize, height: normKop.leftLogoSize }}
                        className="shrink-0 flex items-center justify-center"
                      >
                        {normKop.leftLogoDataUrl && (
                          <img
                            src={normKop.leftLogoDataUrl}
                            alt="Live Preview Logo Kiri"
                            className="w-full h-full object-contain"
                          />
                        )}
                      </div>
                      <div
                        style={{ fontFamily: getPrintFontCss(normKop.fontFamily) }}
                        className="flex-1 text-center leading-snug text-slate-950"
                      >
                        {(
                          [
                            { key: 'line1', text: normKop.line1, mt: false },
                            { key: 'line2', text: normKop.line2, mt: false },
                            { key: 'line3', text: normKop.line3, mt: false },
                            { key: 'line4', text: normKop.line4, mt: true },
                            { key: 'line5', text: normKop.line5, mt: false },
                            { key: 'line6', text: normKop.line6, mt: false },
                          ] as { key: keyof KopSuratLineSizes; text: string; mt: boolean }[]
                        ).map(
                          (ln) =>
                            ln.text && (
                              <p
                                key={ln.key}
                                style={{
                                  fontSize: normKop.lineSizes[ln.key],
                                  fontWeight: normKop.lineStyles[ln.key].bold ? 700 : 400,
                                  fontStyle: normKop.lineStyles[ln.key].italic ? 'italic' : 'normal',
                                  textDecoration: normKop.lineStyles[ln.key].underline
                                    ? 'underline'
                                    : 'none',
                                }}
                                className={ln.mt ? 'mt-0.5' : ''}
                              >
                                {ln.text}
                              </p>
                            )
                        )}
                      </div>
                      <div
                        style={{ width: normKop.rightLogoSize, height: normKop.rightLogoSize }}
                        className="shrink-0 flex items-center justify-center"
                      >
                        {normKop.rightLogoDataUrl && (
                          <img
                            src={normKop.rightLogoDataUrl}
                            alt="Live Preview Logo Kanan"
                            className="w-full h-full object-contain"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 3. 4 KARTU MASTER DATA */}
      {/* ===================================================================== */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <MasterListCard
          title="Master Daftar Kelas"
          subtitle="Klik nama kelas untuk buka detail rombel"
          items={draft.classes}
          placeholder="Contoh: XI IPA 2"
          onItemClick={onViewClass}
          onChange={(classes) => {
            const next = { ...draft, classes };
            setDraft(next);
            onUpdateSettings(next);
          }}
        />
        <MasterListCard
          title="Master Mata Pelajaran"
          subtitle="Klik nama mapel untuk buka rekap KBM"
          items={draft.subjects}
          placeholder="Contoh: Matematika Lanjut"
          onItemClick={onViewSubject}
          onChange={(subjects) => {
            const next = { ...draft, subjects };
            setDraft(next);
            onUpdateSettings(next);
          }}
        />
        <MasterListCard
          title="Master Jenis Ujian"
          subtitle="Kolom penilaian pada Leger Matriks Nilai"
          items={draft.examTypes}
          placeholder="Contoh: Remedial 1"
          onChange={(examTypes) => {
            const next = { ...draft, examTypes };
            setDraft(next);
            onUpdateSettings(next);
          }}
        />
        <MasterListCard
          title="Master Tahun Ajaran"
          subtitle="Opsi periode pada halaman login & sistem"
          items={draft.academicYears}
          placeholder="Contoh: 2027/2028"
          onChange={(academicYears) => {
            const next = { ...draft, academicYears };
            setDraft(next);
            onUpdateSettings(next);
          }}
        />
      </section>

      {/* ===================================================================== */}
      {/* 4 & 5. KARTU LAUNCHER POP-UP PROFIL GURU & MANAJEMEN ADMIN/USER */}
      {/* ===================================================================== */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Card Launcher 1: Profil Guru Mapel, Akun Login & Sinkronisasi */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-600" />
                  <span>Profil Guru Mapel, Akun Login & Sinkronisasi</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Atur biodata guru, foto profil (unggah/URL), email login, dan sinkronisasi Google Sheets melalui pop-up
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-4">
              <img
                src={getUserPhotoUrl({
                  photoDataUrl:
                    activeUser?.photoDataUrl ??
                    (currentUserRole === 'guru' ? draft.teacherProfile.photoDataUrl : undefined),
                  role: currentUserRole,
                  gender: activeUser?.gender || draft.teacherProfile.gender || 'P',
                })}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = getUserPhotoUrl({
                    photoDataUrl: '',
                    role: currentUserRole,
                    gender: activeUser?.gender || draft.teacherProfile.gender || 'P',
                  });
                }}
                alt={activeUser?.name || draft.teacherProfile.name}
                className="w-14 h-14 rounded-xl object-cover object-top border border-slate-300 bg-white shrink-0"
              />
              <div className="min-w-0 space-y-0.5 text-xs">
                <p className="text-sm font-bold text-slate-900 truncate">
                  {activeUser?.name || draft.teacherProfile.name}
                </p>
                <p className="font-mono text-slate-600 tabular-nums truncate">
                  NIP. {activeUser?.nip || draft.teacherProfile.nip}
                </p>
                <p className="text-slate-600 truncate">
                  {activeUser?.school || draft.teacherProfile.school} ·{' '}
                  {activeUser?.email || draft.teacherProfile.email}
                </p>
                {(currentUserRole === 'guru' || currentUserRole === 'wali_kelas') && (
                  <p className="text-[11px] text-slate-700 font-medium truncate">
                    Tanggung Jawab:{' '}
                    {formatAssignmentSummary(
                      activeUser ? activeUser.assignedClasses : draft.teacherProfile.assignedClasses,
                      activeUser ? activeUser.assignedSubjects : draft.teacherProfile.assignedSubjects
                    )}
                  </p>
                )}
                <p className="text-[11px] text-indigo-700 font-medium truncate">
                  Google Sheets:{' '}
                  {draft.sheetsWebAppUrl.trim() ? 'URL Terpasang' : 'Belum dikonfigurasi (Opsional)'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onOpenTeacherProfileModal}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Buka Pop-up Profil & Tugas Mengajar</span>
            </button>
          </div>
        </div>

        {/* Card Launcher 2: Pengaturan Admin & Manajemen Pengguna (Multi-Role) */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span>Pengaturan Admin & Manajemen Pengguna (Multi-Role)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kelola akun Admin Sistem, Guru Mapel, Wali Kelas, Kepala Sekolah & Staff beserta pembagian kelas dan mata pelajaran
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-slate-500">Sesi Aktif Saat Ini</p>
                <p className="mt-0.5 font-bold text-slate-900">
                  {USER_ROLE_LABELS[currentUserRole]}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Total Pengguna</p>
                <p className="mt-0.5 font-bold text-indigo-700 tabular-nums">
                  {users.length} Akun Terdaftar
                </p>
              </div>
              <div>
                <p className="text-slate-500">Akun Aktif</p>
                <p className="mt-0.5 font-bold text-emerald-700 tabular-nums">
                  {users.filter((u) => u.active).length} Aktif
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowAdminModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5 text-indigo-300" />
              <span>Buka Pop-up Admin & Pengguna</span>
            </button>
          </div>
        </div>
      </section>
    </form>

    <AdminUsersModal
      isOpen={showAdminModal}
      users={users}
      allClasses={draft.classes}
      allSubjects={draft.subjects}
      defaultSchool={draft.teacherProfile.school}
      currentUserRole={currentUserRole}
      currentUserEmail={currentUserEmail}
      onUpdateUsers={onUpdateUsers}
      onSwitchUserSession={onSwitchUserSession}
      onNotify={onNotify}
      onClose={() => setShowAdminModal(false)}
    />
    </>
  );
};
