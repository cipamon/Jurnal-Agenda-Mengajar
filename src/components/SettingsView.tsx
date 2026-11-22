import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Check,
  DatabaseBackup,
  Download,
  FileEdit,
  FileSpreadsheet,
  Globe,
  HardDriveDownload,
  ImagePlus,
  Italic,
  Lock,
  Move,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Underline,
  Unlock,
  Upload,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  KopSuratLineSizes,
  KopSuratTextStyle,
  PaperOrientation,
  PaperSize,
  PortalDatabase,
  PrintFontFamily,
  SystemSettings,
  ThemeId,
} from '../types';
import { DEFAULT_WEB_LOGO } from '../utils/defaultAvatars';
import {
  DEFAULT_LEFT_LOGO,
  DEFAULT_PRINCIPAL_TTD,
  DEFAULT_RIGHT_LOGO,
  DEFAULT_SCHOOL_STAMP,
  DEFAULT_TEACHER_TTD,
} from '../utils/defaultLogos';
import {
  getPaperSizeMeta,
  getPrintFontCss,
  normalizeKopSurat,
  normalizeSignatureStamp,
  normalizeWebBrand,
  PAPER_SIZE_OPTIONS,
  PRINT_FONT_OPTIONS,
  THEME_PRESETS,
} from '../utils/helpers';
import { migrateDatabase } from '../utils/storage';

interface SettingsViewProps {
  database?: PortalDatabase;
  settings: SystemSettings;
  onUpdateSettings: (next: SystemSettings) => Promise<boolean> | boolean | void;
  onRestoreDatabase?: (restored: PortalDatabase) => void;
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
  database,
  settings,
  onUpdateSettings,
  onRestoreDatabase,
  onViewClass,
  onViewSubject,
  onNotify,
}) => {
  const [draft, setDraft] = useState<SystemSettings>(settings);
  const backupFileRef = useRef<HTMLInputElement | null>(null);
  const [dragTarget, setDragTarget] = useState<
    'principalSig' | 'teacherSig' | 'stamp' | 'principalBlock' | 'teacherBlock' | null
  >(null);
  const dragOriginRef = useRef<{
    target: 'principalSig' | 'teacherSig' | 'stamp' | 'principalBlock' | 'teacherBlock';
    startX: number;
    startY: number;
    initOffX: number;
    initOffY: number;
  } | null>(null);

  const [isFormatLockedUi, setIsFormatLockedUi] = useState(true);
  const [isKopLockedUi, setIsKopLockedUi] = useState(true);
  const [syncKopFontWithStandard, setSyncKopFontWithStandard] = useState(true);
  const [isSavingFormat, setIsSavingFormat] = useState(false);
  const [isSavingKop, setIsSavingKop] = useState(false);

  const prevSavedKopJsonRef = useRef<string>(JSON.stringify(settings.kopSurat));
  const getFormatSignature = (s: SystemSettings) =>
    JSON.stringify({
      reportFontFamily: s.reportFontFamily || 'Times New Roman',
      reportPaperSize: s.reportPaperSize || 'A4',
      reportOrientation: s.reportOrientation || 'landscape',
      lockReportFormat: s.lockReportFormat ?? true,
    });
  const prevSavedFormatRef = useRef<string>(getFormatSignature(settings));

  useEffect(() => {
    const nextSavedKopJson = JSON.stringify(settings.kopSurat);
    const nextSavedFormatJson = getFormatSignature(settings);
    setDraft((prev) => {
      const hasUnsavedKop =
        !isKopLockedUi && JSON.stringify(prev.kopSurat) !== prevSavedKopJsonRef.current;
      const hasUnsavedFormat =
        !isFormatLockedUi && getFormatSignature(prev) !== prevSavedFormatRef.current;
      return {
        ...settings,
        kopSurat: hasUnsavedKop ? prev.kopSurat : settings.kopSurat,
        reportFontFamily: hasUnsavedFormat ? prev.reportFontFamily : settings.reportFontFamily,
        reportPaperSize: hasUnsavedFormat ? prev.reportPaperSize : settings.reportPaperSize,
        reportOrientation: hasUnsavedFormat ? prev.reportOrientation : settings.reportOrientation,
        lockReportFormat: hasUnsavedFormat ? prev.lockReportFormat : settings.lockReportFormat,
      };
    });
    prevSavedKopJsonRef.current = nextSavedKopJson;
    prevSavedFormatRef.current = nextSavedFormatJson;
  }, [settings, isFormatLockedUi, isKopLockedUi]);

  const normBrand = normalizeWebBrand(draft);
  const activeThemeId: ThemeId = draft.themeId || 'indigo';
  const isKopDirty = JSON.stringify(draft.kopSurat) !== JSON.stringify(settings.kopSurat);
  const isFormatDirty = getFormatSignature(draft) !== getFormatSignature(settings);

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onUpdateSettings(draft);
    if (ok === false) return;
    prevSavedKopJsonRef.current = JSON.stringify(draft.kopSurat);
    prevSavedFormatRef.current = getFormatSignature(draft);
    setIsFormatLockedUi(true);
    setIsKopLockedUi(true);
    onNotify(
      'Pengaturan sistem, format kertas/huruf, identitas web, dan Kop Surat berhasil disimpan & dikunci.'
    );
  };

  const handleSaveFormatDokumen = async () => {
    setIsSavingFormat(true);
    try {
      const targetFont = draft.reportFontFamily || 'Times New Roman';
      const nextKop = syncKopFontWithStandard
        ? { ...settings.kopSurat, fontFamily: targetFont }
        : settings.kopSurat;
      const next: SystemSettings = {
        ...settings,
        reportFontFamily: targetFont,
        reportPaperSize: draft.reportPaperSize || 'A4',
        reportOrientation: draft.reportOrientation || 'landscape',
        lockReportFormat: draft.lockReportFormat ?? true,
        kopSurat: nextKop,
      };
      const ok = await onUpdateSettings(next);
      if (ok === false) return;
      prevSavedFormatRef.current = getFormatSignature(next);
      if (syncKopFontWithStandard) {
        prevSavedKopJsonRef.current = JSON.stringify(nextKop);
        setDraft((prev) => ({ ...prev, kopSurat: { ...prev.kopSurat, fontFamily: targetFont } }));
      }
      setIsFormatLockedUi(true);
      onNotify('Standar jenis huruf & kertas berhasil disimpan dan langsung dikunci untuk semua akun.');
    } finally {
      setIsSavingFormat(false);
    }
  };

  const handleResetFormatDraft = () => {
    setDraft((prev) => ({
      ...prev,
      reportFontFamily: settings.reportFontFamily || 'Times New Roman',
      reportPaperSize: settings.reportPaperSize || 'A4',
      reportOrientation: settings.reportOrientation || 'landscape',
      lockReportFormat: settings.lockReportFormat ?? true,
    }));
    setIsFormatLockedUi(true);
    onNotify('Perubahan format dokumen dibatalkan dan panel dikunci kembali.');
  };

  const handleSaveKopSurat = async () => {
    setIsSavingKop(true);
    try {
      const next: SystemSettings = {
        ...settings,
        kopSurat: draft.kopSurat,
      };
      const ok = await onUpdateSettings(next);
      if (ok === false) return;
      prevSavedKopJsonRef.current = JSON.stringify(draft.kopSurat);
      setIsKopLockedUi(true);
      onNotify('Pengaturan Kop Surat berhasil disimpan dan langsung dikunci.');
    } finally {
      setIsSavingKop(false);
    }
  };

  const handleResetKopDraft = () => {
    setDraft((prev) => ({
      ...prev,
      kopSurat: settings.kopSurat,
    }));
    setIsKopLockedUi(true);
    onNotify('Perubahan Kop Surat dibatalkan dan panel dikunci kembali.');
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
          <div className="lg:col-span-3">
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

          <div className="lg:col-span-4">
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

          <div className="lg:col-span-5 space-y-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Logo Web, Favicon &amp; Ukuran Logo ({normBrand.webLogoSize} px)
            </label>
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                <img
                  src={normBrand.webLogoDataUrl}
                  alt="Logo Web"
                  style={{ width: Math.min(36, normBrand.webLogoSize), height: Math.min(36, normBrand.webLogoSize) }}
                  className="object-contain"
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
                onClick={() => {
                  const nextBrand = {
                    ...normBrand,
                    webLogoDataUrl: DEFAULT_WEB_LOGO,
                    webLogoSize: 36,
                  };
                  setDraft((prev) => ({ ...prev, webBrand: nextBrand }));
                  onUpdateSettings({ ...settings, webBrand: nextBrand });
                }}
                className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs text-slate-600 cursor-pointer"
                title="Kembalikan logo & ukuran web default"
              >
                Default
              </button>
            </div>
            <div className="flex items-center gap-2.5 pt-1">
              <span className="text-[11px] font-semibold text-slate-600 shrink-0">Ukuran:</span>
              <input
                type="range"
                min={24}
                max={80}
                step={2}
                value={normBrand.webLogoSize}
                onChange={(e) => {
                  const nextBrand = { ...normBrand, webLogoSize: Number(e.target.value) };
                  setDraft((prev) => ({ ...prev, webBrand: nextBrand }));
                  onUpdateSettings({ ...settings, webBrand: nextBrand });
                }}
                className="flex-1 accent-indigo-600 cursor-pointer"
              />
              <input
                type="number"
                min={24}
                max={80}
                value={normBrand.webLogoSize}
                onChange={(e) => {
                  const val = Math.max(24, Math.min(80, Number(e.target.value) || 36));
                  const nextBrand = { ...normBrand, webLogoSize: val };
                  setDraft((prev) => ({ ...prev, webBrand: nextBrand }));
                  onUpdateSettings({ ...settings, webBrand: nextBrand });
                }}
                className="w-16 px-2 py-1 text-xs font-mono text-center rounded-md border border-slate-300 bg-white tabular-nums"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 1C. PILIHAN TEMA TAMPILAN APLIKASI */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Palette className="w-4 h-4 text-indigo-600" />
              <span>Pilihan Tema Tampilan Portal</span>
            </h3>
            <p className="text-xs text-slate-500">
              Pilih skema warna ruang kerja yang nyaman digunakan. Lembar cetak laporan tetap putih bersih sesuai standar dinas.
            </p>
          </div>
          <span className="text-xs font-semibold text-indigo-700">
            Tema Aktif: {THEME_PRESETS.find((t) => t.id === activeThemeId)?.name || 'Royal Indigo'}
          </span>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {THEME_PRESETS.map((preset) => {
            const selected = preset.id === activeThemeId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setDraft((prev) => ({ ...prev, themeId: preset.id }));
                  onUpdateSettings({ ...settings, themeId: preset.id });
                  onNotify(`Tema tampilan diubah ke "${preset.name}".`);
                }}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                  selected
                    ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-600/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-5 h-5 rounded-md border border-black/10"
                      style={{ backgroundColor: preset.sidebarHex }}
                    />
                    <span
                      className="w-5 h-5 rounded-md border border-black/10"
                      style={{ backgroundColor: preset.primaryHex }}
                    />
                    <span
                      className="w-5 h-5 rounded-md border border-black/10"
                      style={{ backgroundColor: preset.secondaryHex }}
                    />
                  </div>
                  {selected && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700">
                      <Check className="w-3.5 h-3.5" />
                      <span>Aktif</span>
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">{preset.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {preset.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 1D. STANDAR FORMAT DOKUMEN, JENIS HURUF & KERTAS RESMI (GLOBAL ADMIN) */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                Standar Format Dokumen, Jenis Huruf &amp; Jenis Kertas (Untuk Semua Akun)
              </h3>
              <span
                className={`inline-flex items-center gap-1 text-xs font-bold ${
                  isFormatLockedUi
                    ? 'text-emerald-700'
                    : isFormatDirty
                      ? 'text-amber-700'
                      : 'text-indigo-700'
                }`}
              >
                {isFormatLockedUi ? (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Tersimpan &amp; Terkunci</span>
                  </>
                ) : isFormatDirty ? (
                  <span>· Mode Edit (Belum Disimpan)</span>
                ) : (
                  <span>· Mode Edit Terbuka</span>
                )}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tetapkan jenis huruf, ukuran kertas (A4, F4/Folio, Letter, Legal), dan orientasi baku. Setelah disimpan, panel otomatis terkunci agar tidak berubah saat berganti akun.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isFormatLockedUi ? (
              <button
                type="button"
                onClick={() => setIsFormatLockedUi(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Unlock className="w-3.5 h-3.5 text-indigo-600" />
                <span>Buka Kunci / Edit</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleResetFormatDraft}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Batal</span>
                </button>
                <button
                  type="button"
                  disabled={isSavingFormat}
                  onClick={handleSaveFormatDokumen}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shadow-sm"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isSavingFormat ? 'Menyimpan...' : 'Simpan & Kunci Format'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Jenis Huruf Standar Laporan &amp; PDF
              </label>
              <select
                disabled={isFormatLockedUi}
                value={draft.reportFontFamily || 'Times New Roman'}
                onChange={(e) =>
                  setDraft({ ...draft, reportFontFamily: e.target.value as PrintFontFamily })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
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
                Jenis Kertas Cetak &amp; PDF
              </label>
              <select
                disabled={isFormatLockedUi}
                value={draft.reportPaperSize || 'A4'}
                onChange={(e) =>
                  setDraft({ ...draft, reportPaperSize: e.target.value as PaperSize })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
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
                Orientasi Kertas Standar
              </label>
              <select
                disabled={isFormatLockedUi}
                value={draft.reportOrientation || 'landscape'}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    reportOrientation: e.target.value as PaperOrientation,
                  })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="landscape">Landscape (Mendatar)</option>
                <option value="portrait">Portrait (Tegak)</option>
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 ${
                  isFormatLockedUi ? 'bg-slate-100 cursor-not-allowed' : 'bg-slate-50 cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={isFormatLockedUi}
                  checked={draft.lockReportFormat ?? true}
                  onChange={(e) =>
                    setDraft({ ...draft, lockReportFormat: e.target.checked })
                  }
                  className="rounded border-slate-300 text-indigo-600 mt-0.5 disabled:cursor-not-allowed"
                />
                <span className="text-xs leading-snug text-slate-800">
                  <strong className="block">Kunci Format Sekolah</strong>
                  <span className="text-[11px] text-slate-500">
                    Akun lain tidak bisa mengubah font, kertas &amp; kop surat
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
            <span>
              Standar Aktif:{' '}
              <strong className="text-slate-900">
                {draft.reportFontFamily || 'Times New Roman'}
              </strong>{' '}
              · Kertas{' '}
              <strong className="text-slate-900">
                {getPaperSizeMeta(draft.reportPaperSize).shortLabel}
              </strong>{' '}
              ·{' '}
              <strong className="text-slate-900">
                {(draft.reportOrientation || 'landscape') === 'landscape'
                  ? 'Landscape'
                  : 'Portrait'}
              </strong>
              {' · '}
              {draft.lockReportFormat ?? true
                ? 'Terkunci untuk Semua Akun'
                : 'Dapat Disesuaikan per Sesi Cetak'}
            </span>
            <label
              className={`inline-flex items-center gap-2 text-xs font-semibold text-slate-700 ${
                isFormatLockedUi ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                disabled={isFormatLockedUi}
                checked={syncKopFontWithStandard}
                onChange={(e) => setSyncKopFontWithStandard(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span>Sekaligus samakan font Kop Surat ke {draft.reportFontFamily || 'Times New Roman'}</span>
            </label>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. PENGATURAN KOP SURAT STANDAR DINAS (6 BARIS + 2 LOGO + LIVE PREVIEW) */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">Pengaturan Kop Surat Standar Dinas</h3>
              <span
                className={`inline-flex items-center gap-1 text-xs font-bold ${
                  isKopLockedUi
                    ? 'text-emerald-700'
                    : isKopDirty
                      ? 'text-amber-700'
                      : 'text-indigo-700'
                }`}
              >
                {isKopLockedUi ? (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Tersimpan &amp; Terkunci</span>
                  </>
                ) : isKopDirty ? (
                  <span>· Mode Edit (Belum Disimpan)</span>
                ) : (
                  <span>· Mode Edit Terbuka</span>
                )}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Klik Buka Kunci untuk mengedit 6 baris teks &amp; logo kop surat, lalu klik Simpan &amp; Kunci Kop Surat agar terkunci permanen
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isKopLockedUi ? (
              <button
                type="button"
                onClick={() => setIsKopLockedUi(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Unlock className="w-3.5 h-3.5 text-indigo-600" />
                <span>Buka Kunci / Edit Kop</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleResetKopDraft}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Batal</span>
                </button>
                <button
                  type="button"
                  disabled={isSavingKop}
                  onClick={handleSaveKopSurat}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shadow-sm"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isSavingKop ? 'Menyimpan...' : 'Simpan & Kunci Kop Surat'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          <fieldset disabled={isKopLockedUi} className="space-y-6 disabled:opacity-80">
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
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 disabled:cursor-not-allowed font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
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
                  min={24}
                  max={160}
                  step={2}
                  value={normalizeKopSurat(draft.kopSurat).leftLogoSize}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      kopSurat: {
                        ...prev.kopSurat,
                        leftLogoSize: Number(e.target.value),
                      },
                    }))
                  }
                  className="flex-1 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed"
                />
                <input
                  type="number"
                  min={24}
                  max={160}
                  value={normalizeKopSurat(draft.kopSurat).leftLogoSize}
                  onChange={(e) => {
                    const val = Math.max(24, Math.min(160, Number(e.target.value) || 64));
                    setDraft((prev) => ({
                      ...prev,
                      kopSurat: {
                        ...prev.kopSurat,
                        leftLogoSize: val,
                      },
                    }));
                  }}
                  className="w-16 px-2 py-1 text-xs font-mono text-center rounded-md border border-slate-300 bg-white disabled:bg-slate-100 tabular-nums"
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
                  min={24}
                  max={160}
                  step={2}
                  value={normalizeKopSurat(draft.kopSurat).rightLogoSize}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      kopSurat: {
                        ...prev.kopSurat,
                        rightLogoSize: Number(e.target.value),
                      },
                    }))
                  }
                  className="flex-1 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed"
                />
                <input
                  type="number"
                  min={24}
                  max={160}
                  value={normalizeKopSurat(draft.kopSurat).rightLogoSize}
                  onChange={(e) => {
                    const val = Math.max(24, Math.min(160, Number(e.target.value) || 64));
                    setDraft((prev) => ({
                      ...prev,
                      kopSurat: {
                        ...prev.kopSurat,
                        rightLogoSize: val,
                      },
                    }));
                  }}
                  className="w-16 px-2 py-1 text-xs font-mono text-center rounded-md border border-slate-300 bg-white disabled:bg-slate-100 tabular-nums"
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
                            className={`px-2 py-0.5 text-xs font-bold cursor-pointer transition-colors disabled:cursor-not-allowed ${
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
                            className={`px-2 py-0.5 text-xs border-l border-slate-200 cursor-pointer transition-colors disabled:cursor-not-allowed ${
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
                            className={`px-2 py-0.5 text-xs border-l border-slate-200 cursor-pointer transition-colors disabled:cursor-not-allowed ${
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
                          className="w-14 px-1.5 py-0.5 text-xs font-mono text-center rounded border border-slate-300 bg-white disabled:bg-slate-100 tabular-nums"
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
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                );
              })}
            </div>

            {/* Unggah & Atur Ukuran Logo Kiri & Logo Kanan */}
            <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center gap-4">
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
                      <label
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-semibold ${
                          isKopLockedUi
                            ? 'opacity-50 cursor-not-allowed pointer-events-none'
                            : 'hover:bg-indigo-700 cursor-pointer'
                        }`}
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                        <span>Unggah Logo</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={isKopLockedUi}
                          onChange={(e) => handleLogoUpload('left', e.target.files?.[0])}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            kopSurat: {
                              ...prev.kopSurat,
                              leftLogoDataUrl: DEFAULT_LEFT_LOGO,
                              leftLogoSize: 64,
                            },
                          }))
                        }
                        className="px-2 py-1.5 rounded-md border border-slate-300 bg-white text-xs text-slate-600 hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed"
                      >
                        Default
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200/80">
                  <span className="text-[11px] font-semibold text-slate-600 shrink-0">
                    Ukuran ({normalizeKopSurat(draft.kopSurat).leftLogoSize}px)
                  </span>
                  <input
                    type="range"
                    min={24}
                    max={160}
                    step={2}
                    value={normalizeKopSurat(draft.kopSurat).leftLogoSize}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        kopSurat: {
                          ...prev.kopSurat,
                          leftLogoSize: Number(e.target.value),
                        },
                      }))
                    }
                    className="flex-1 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center gap-4">
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
                      <label
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-semibold ${
                          isKopLockedUi
                            ? 'opacity-50 cursor-not-allowed pointer-events-none'
                            : 'hover:bg-indigo-700 cursor-pointer'
                        }`}
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                        <span>Unggah Logo</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={isKopLockedUi}
                          onChange={(e) => handleLogoUpload('right', e.target.files?.[0])}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            kopSurat: {
                              ...prev.kopSurat,
                              rightLogoDataUrl: DEFAULT_RIGHT_LOGO,
                              rightLogoSize: 64,
                            },
                          }))
                        }
                        className="px-2 py-1.5 rounded-md border border-slate-300 bg-white text-xs text-slate-600 hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed"
                      >
                        Default
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200/80">
                  <span className="text-[11px] font-semibold text-slate-600 shrink-0">
                    Ukuran ({normalizeKopSurat(draft.kopSurat).rightLogoSize}px)
                  </span>
                  <input
                    type="range"
                    min={24}
                    max={160}
                    step={2}
                    value={normalizeKopSurat(draft.kopSurat).rightLogoSize}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        kopSurat: {
                          ...prev.kopSurat,
                          rightLogoSize: Number(e.target.value),
                        },
                      }))
                    }
                    className="flex-1 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </div>
          </fieldset>

          {/* Kotak Pratinjau Langsung (Live Preview) Kop Surat Bergaris Ganda */}
          {(() => {
            const normKop = normalizeKopSurat(draft.kopSurat);
            const logoSlotSize = Math.max(normKop.leftLogoSize, normKop.rightLogoSize);
            return (
              <div className="eguru-paper-preview p-5 rounded-xl border border-slate-300 bg-white">
                <p className="text-xs font-semibold text-slate-500 mb-3">
                  Pratinjau Langsung Kop Surat Bergaris Ganda ({normKop.fontFamily} · Logo Kiri {normKop.leftLogoSize}px · Logo Kanan {normKop.rightLogoSize}px):
                </p>
                <div className="eguru-paper-preview border border-slate-200 p-5 rounded-lg bg-white overflow-x-auto">
                  <div className="pb-2 border-b-[3px] border-double border-slate-900">
                    <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-900">
                      <div
                        style={{ width: logoSlotSize, minHeight: normKop.leftLogoSize }}
                        className="shrink-0 flex items-center justify-center"
                      >
                        {normKop.leftLogoDataUrl && (
                          <img
                            src={normKop.leftLogoDataUrl}
                            alt="Live Preview Logo Kiri"
                            style={{ width: normKop.leftLogoSize, height: normKop.leftLogoSize }}
                            className="object-contain"
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
                        style={{ width: logoSlotSize, minHeight: normKop.rightLogoSize }}
                        className="shrink-0 flex items-center justify-center"
                      >
                        {normKop.rightLogoDataUrl && (
                          <img
                            src={normKop.rightLogoDataUrl}
                            alt="Live Preview Logo Kanan"
                            style={{ width: normKop.rightLogoSize, height: normKop.rightLogoSize }}
                            className="object-contain"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <span className="text-xs text-slate-500">
              {isKopLockedUi
                ? 'Kop Surat sedang terkunci permanen dan siap digunakan untuk seluruh akun saat cetak/PDF.'
                : isKopDirty
                  ? 'Terdapat perubahan Kop Surat yang belum disimpan.'
                  : 'Mode edit terbuka. Klik Simpan & Kunci Kop Surat setelah selesai mengubah.'}
            </span>
            <div className="flex items-center gap-2">
              {isKopLockedUi ? (
                <button
                  type="button"
                  onClick={() => setIsKopLockedUi(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Buka Kunci / Edit Kop</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleResetKopDraft}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Batal</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSavingKop}
                    onClick={handleSaveKopSurat}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer shadow-sm"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{isSavingKop ? 'Menyimpan...' : 'Simpan & Kunci Kop Surat'}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2B. TANDA TANGAN DIGITAL, STEMPEL SEKOLAH & FONT LAPORAN DEFAULT */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Tanda Tangan Digital, Stempel Sekolah &amp; Font Laporan Default
            </h3>
            <p className="text-xs text-slate-500">
              Unggah/tempel tautan TTD Kepala Sekolah, TTD Guru Mapel, dan Stempel Instansi serta atur jenis huruf standar untuk cetak &amp; unduh PDF
            </p>
          </div>
        </div>

        {(() => {
          const sigStamp = normalizeSignatureStamp(draft);
          const updateSigStamp = (patch: Partial<typeof sigStamp>) => {
            const nextSigStamp = { ...sigStamp, ...patch };
            setDraft((prev) => ({
              ...prev,
              signatureStamp: nextSigStamp,
            }));
            onUpdateSettings({
              ...settings,
              signatureStamp: nextSigStamp,
            });
          };

          const handleAssetFile = (
            field: 'principalSignatureDataUrl' | 'teacherSignatureDataUrl' | 'stampDataUrl',
            file?: File
          ) => {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                updateSigStamp({ [field]: reader.result });
                onNotify('Gambar tanda tangan/stempel berhasil diunggah.');
              }
            };
            reader.readAsDataURL(file);
          };

          const startSigDrag = (
            target: 'principalSig' | 'teacherSig' | 'stamp' | 'principalBlock' | 'teacherBlock',
            e: React.PointerEvent<HTMLElement>
          ) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            const initOffX =
              target === 'principalSig'
                ? sigStamp.principalSigOffsetX
                : target === 'teacherSig'
                  ? sigStamp.teacherSigOffsetX
                  : target === 'stamp'
                    ? sigStamp.stampOffsetX
                    : target === 'principalBlock'
                      ? sigStamp.principalBlockOffsetX
                      : sigStamp.teacherBlockOffsetX;
            const initOffY =
              target === 'principalSig'
                ? sigStamp.principalSigOffsetY
                : target === 'teacherSig'
                  ? sigStamp.teacherSigOffsetY
                  : target === 'stamp'
                    ? sigStamp.stampOffsetY
                    : target === 'principalBlock'
                      ? sigStamp.principalBlockOffsetY
                      : sigStamp.teacherBlockOffsetY;
            dragOriginRef.current = {
              target,
              startX: e.clientX,
              startY: e.clientY,
              initOffX,
              initOffY,
            };
            setDragTarget(target);
          };

          const handleSigPointerMove = (e: React.PointerEvent<HTMLElement>) => {
            const origin = dragOriginRef.current;
            if (!origin) return;
            const dx = Math.round(e.clientX - origin.startX);
            const dy = Math.round(e.clientY - origin.startY);
            const isBlock = origin.target === 'principalBlock' || origin.target === 'teacherBlock';
            const minX = isBlock ? -320 : -120;
            const maxX = isBlock ? 320 : 120;
            const minY = isBlock ? -80 : -60;
            const maxY = isBlock ? 120 : 60;
            const nextX = Math.max(minX, Math.min(maxX, origin.initOffX + dx));
            const nextY = Math.max(minY, Math.min(maxY, origin.initOffY + dy));

            if (origin.target === 'principalSig') {
              updateSigStamp({ principalSigOffsetX: nextX, principalSigOffsetY: nextY });
            } else if (origin.target === 'teacherSig') {
              updateSigStamp({ teacherSigOffsetX: nextX, teacherSigOffsetY: nextY });
            } else if (origin.target === 'stamp') {
              updateSigStamp({ stampOffsetX: nextX, stampOffsetY: nextY });
            } else if (origin.target === 'principalBlock') {
              updateSigStamp({ principalBlockOffsetX: nextX, principalBlockOffsetY: nextY });
            } else {
              updateSigStamp({ teacherBlockOffsetX: nextX, teacherBlockOffsetY: nextY });
            }
          };

          const stopSigDrag = () => {
            dragOriginRef.current = null;
            setDragTarget(null);
          };

          const activeFont: PrintFontFamily =
            draft.reportFontFamily || normalizeKopSurat(draft.kopSurat).fontFamily || 'Times New Roman';

          return (
            <div className="p-6 space-y-6">
              {/* Ringkasan Font, Ukuran, Penempatan Stempel & Saklar */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Font &amp; Kertas Standar
                  </label>
                  <div className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white font-semibold text-slate-700">
                    {activeFont} · {getPaperSizeMeta(draft.reportPaperSize).id}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Diatur pada panel Standar Format Dokumen di atas
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Tinggi TTD ({sigStamp.signatureSize} px)
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="range"
                      min={28}
                      max={200}
                      step={2}
                      value={sigStamp.signatureSize}
                      onChange={(e) => updateSigStamp({ signatureSize: Number(e.target.value) })}
                      className="flex-1 accent-indigo-600 cursor-pointer"
                    />
                    <input
                      type="number"
                      min={28}
                      max={200}
                      value={sigStamp.signatureSize}
                      onChange={(e) =>
                        updateSigStamp({
                          signatureSize: Math.max(28, Math.min(200, Number(e.target.value) || 54)),
                        })
                      }
                      className="w-14 px-1.5 py-1 text-xs font-mono text-center rounded-md border border-slate-300 bg-white tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Ukuran Stempel ({sigStamp.stampSize} px)
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="range"
                      min={32}
                      max={220}
                      step={2}
                      value={sigStamp.stampSize}
                      onChange={(e) => updateSigStamp({ stampSize: Number(e.target.value) })}
                      className="flex-1 accent-indigo-600 cursor-pointer"
                    />
                    <input
                      type="number"
                      min={32}
                      max={220}
                      value={sigStamp.stampSize}
                      onChange={(e) =>
                        updateSigStamp({
                          stampSize: Math.max(32, Math.min(220, Number(e.target.value) || 74)),
                        })
                      }
                      className="w-14 px-1.5 py-1 text-xs font-mono text-center rounded-md border border-slate-300 bg-white tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Area Penempatan Stempel
                  </label>
                  <select
                    value={sigStamp.stampTarget}
                    onChange={(e) =>
                      updateSigStamp({ stampTarget: e.target.value as 'principal' | 'teacher' })
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  >
                    <option value="principal">Kepala Sekolah (Kiri)</option>
                    <option value="teacher">Guru Mapel (Kanan)</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <label className="inline-flex items-start gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sigStamp.showStampDefault}
                      onChange={(e) => updateSigStamp({ showStampDefault: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600 mt-0.5"
                    />
                    <span>Tampilkan Stempel default saat cetak/PDF</span>
                  </label>
                </div>
              </div>

              {/* 3 Kartu Upload/Link + Slider Posisi X/Y */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {(
                  [
                    {
                      field: 'principalSignatureDataUrl' as const,
                      title: 'TTD Kepala Sekolah',
                      subtitle: draft.principalName,
                      defaultUrl: DEFAULT_PRINCIPAL_TTD,
                      defaultLabel: 'Contoh TTD',
                      val: sigStamp.principalSignatureDataUrl,
                      offXKey: 'principalSigOffsetX' as const,
                      offYKey: 'principalSigOffsetY' as const,
                      offX: sigStamp.principalSigOffsetX,
                      offY: sigStamp.principalSigOffsetY,
                    },
                    {
                      field: 'teacherSignatureDataUrl' as const,
                      title: 'TTD Guru Mapel',
                      subtitle: draft.teacherProfile.name,
                      defaultUrl: DEFAULT_TEACHER_TTD,
                      defaultLabel: 'Contoh TTD',
                      val: sigStamp.teacherSignatureDataUrl,
                      offXKey: 'teacherSigOffsetX' as const,
                      offYKey: 'teacherSigOffsetY' as const,
                      offX: sigStamp.teacherSigOffsetX,
                      offY: sigStamp.teacherSigOffsetY,
                    },
                    {
                      field: 'stampDataUrl' as const,
                      title: 'Stempel Sekolah / Dinas',
                      subtitle: 'Disarankan PNG transparan',
                      defaultUrl: DEFAULT_SCHOOL_STAMP,
                      defaultLabel: 'Stempel Default',
                      val: sigStamp.stampDataUrl,
                      offXKey: 'stampOffsetX' as const,
                      offYKey: 'stampOffsetY' as const,
                      offX: sigStamp.stampOffsetX,
                      offY: sigStamp.stampOffsetY,
                    },
                  ]
                ).map((box) => (
                  <div
                    key={box.field}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3 flex flex-col justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-16 rounded-lg bg-white border border-slate-200 flex items-center justify-center p-1.5 shrink-0 overflow-hidden">
                        {box.val ? (
                          <img
                            src={box.val}
                            alt={box.title}
                            className="max-w-full max-h-full object-contain"
                          />
                        ) : (
                          <span className="text-[11px] text-slate-400">Kosong</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{box.title}</p>
                        <p className="text-[11px] text-slate-500 truncate">{box.subtitle}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap">
                            <ImagePlus className="w-3 h-3" />
                            <span>Unggah</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleAssetFile(box.field, e.target.files?.[0])}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => updateSigStamp({ [box.field]: box.defaultUrl })}
                            className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 cursor-pointer whitespace-nowrap"
                          >
                            {box.defaultLabel}
                          </button>
                          {box.val && (
                            <button
                              type="button"
                              onClick={() => updateSigStamp({ [box.field]: '' })}
                              className="px-2 py-1 rounded border border-rose-200 bg-white hover:bg-rose-50 text-[11px] font-medium text-rose-700 cursor-pointer whitespace-nowrap"
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="url"
                        value={box.val.startsWith('data:') ? '' : box.val}
                        onChange={(e) => updateSigStamp({ [box.field]: e.target.value })}
                        placeholder="Atau tempel link URL gambar (https://...)"
                        className="w-full px-2.5 py-1.5 text-[11px] rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />

                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/80">
                        <div>
                          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                            <span>Geser X</span>
                            <span className="font-mono tabular-nums">{box.offX}px</span>
                          </div>
                          <input
                            type="range"
                            min={-120}
                            max={120}
                            value={box.offX}
                            onChange={(e) => updateSigStamp({ [box.offXKey]: Number(e.target.value) })}
                            className="w-full accent-indigo-600 cursor-pointer"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                            <span>Geser Y</span>
                            <span className="font-mono tabular-nums">{box.offY}px</span>
                          </div>
                          <input
                            type="range"
                            min={-60}
                            max={60}
                            value={box.offY}
                            onChange={(e) => updateSigStamp({ [box.offYKey]: Number(e.target.value) })}
                            className="w-full accent-indigo-600 cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pengaturan Geser Bebas Blok Pengesahan (Kiri/Kanan/Atas/Bawah) */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      Posisi Blok Pengesahan (Nama, Jabatan, TTD &amp; Stempel)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Geser bebas posisi seluruh blok Kepala Sekolah atau Guru Mapel via slider atau seret langsung kotak pengesahan pada pratinjau di bawah
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        updateSigStamp({
                          principalBlockOffsetX: 0,
                          principalBlockOffsetY: 0,
                          teacherBlockOffsetX: 0,
                          teacherBlockOffsetY: 0,
                        });
                        onNotify('Blok pengesahan dikembalikan ke sejajar kiri-kanan default.');
                      }}
                      className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                    >
                      Sejajar Default
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateSigStamp({
                          principalBlockOffsetX: 290,
                          principalBlockOffsetY: 0,
                          teacherBlockOffsetX: -290,
                          teacherBlockOffsetY: 0,
                        });
                        onNotify('Posisi blok pengesahan Kepala Sekolah & Guru ditukar sisi.');
                      }}
                      className="px-2.5 py-1 rounded-md border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-[11px] font-semibold text-indigo-700 cursor-pointer whitespace-nowrap"
                    >
                      Tukar Kiri ↔ Kanan
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-white border border-slate-200 grid grid-cols-2 gap-3">
                    <div className="col-span-2 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-800">
                        Blok Pengesahan Kepala Sekolah
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        ({sigStamp.principalBlockOffsetX}, {sigStamp.principalBlockOffsetY}) px
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                        <span>Geser Horizontal (X)</span>
                        <span className="font-mono tabular-nums">{sigStamp.principalBlockOffsetX}px</span>
                      </div>
                      <input
                        type="range"
                        min={-320}
                        max={320}
                        value={sigStamp.principalBlockOffsetX}
                        onChange={(e) =>
                          updateSigStamp({ principalBlockOffsetX: Number(e.target.value) })
                        }
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                        <span>Geser Vertikal (Y)</span>
                        <span className="font-mono tabular-nums">{sigStamp.principalBlockOffsetY}px</span>
                      </div>
                      <input
                        type="range"
                        min={-80}
                        max={120}
                        value={sigStamp.principalBlockOffsetY}
                        onChange={(e) =>
                          updateSigStamp({ principalBlockOffsetY: Number(e.target.value) })
                        }
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-slate-200 grid grid-cols-2 gap-3">
                    <div className="col-span-2 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-800">
                        Blok Pengesahan Guru Mapel
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        ({sigStamp.teacherBlockOffsetX}, {sigStamp.teacherBlockOffsetY}) px
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                        <span>Geser Horizontal (X)</span>
                        <span className="font-mono tabular-nums">{sigStamp.teacherBlockOffsetX}px</span>
                      </div>
                      <input
                        type="range"
                        min={-320}
                        max={320}
                        value={sigStamp.teacherBlockOffsetX}
                        onChange={(e) =>
                          updateSigStamp({ teacherBlockOffsetX: Number(e.target.value) })
                        }
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                        <span>Geser Vertikal (Y)</span>
                        <span className="font-mono tabular-nums">{sigStamp.teacherBlockOffsetY}px</span>
                      </div>
                      <input
                        type="range"
                        min={-80}
                        max={120}
                        value={sigStamp.teacherBlockOffsetY}
                        onChange={(e) =>
                          updateSigStamp({ teacherBlockOffsetY: Number(e.target.value) })
                        }
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Pratinjau Interaktif Drag-to-Position Tanda Tangan, Stempel & Blok Pengesahan */}
              <div className="eguru-paper-preview p-4 rounded-xl border border-slate-300 bg-white space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <Move className="w-3.5 h-3.5 text-indigo-600" />
                    <span>
                      Pratinjau Pengesahan Interaktif — Seret kotak pengesahan untuk menggeser seluruh blok, atau seret TTD/Stempel untuk posisi detail (Font {activeFont})
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      updateSigStamp({
                        principalSigOffsetX: 0,
                        principalSigOffsetY: 0,
                        teacherSigOffsetX: 0,
                        teacherSigOffsetY: 0,
                        stampOffsetX: 0,
                        stampOffsetY: 0,
                        principalBlockOffsetX: 0,
                        principalBlockOffsetY: 0,
                        teacherBlockOffsetX: 0,
                        teacherBlockOffsetY: 0,
                      });
                      onNotify('Semua posisi blok pengesahan, TTD & stempel dikembalikan ke default (0, 0).');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Semua Posisi</span>
                  </button>
                </div>

                <div
                  style={{
                    fontFamily: getPrintFontCss(activeFont),
                    paddingTop:
                      34 +
                      Math.max(0, -Math.min(sigStamp.principalBlockOffsetY, sigStamp.teacherBlockOffsetY)),
                    paddingBottom:
                      34 + Math.max(0, sigStamp.principalBlockOffsetY, sigStamp.teacherBlockOffsetY),
                  }}
                  className="eguru-paper-preview grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs text-slate-950 px-6 rounded-lg border border-slate-200 bg-white select-none overflow-visible"
                >
                  {/* Area Kepala Sekolah */}
                  <div className="pl-2 overflow-visible">
                    <div
                      onPointerDown={(e) => startSigDrag('principalBlock', e)}
                      onPointerMove={handleSigPointerMove}
                      onPointerUp={stopSigDrag}
                      onPointerCancel={stopSigDrag}
                      title="Seret untuk menggeser seluruh blok pengesahan Kepala Sekolah"
                      style={{
                        transform: `translate(${sigStamp.principalBlockOffsetX}px, ${sigStamp.principalBlockOffsetY}px)`,
                      }}
                      className={`relative p-2.5 -m-2.5 rounded-lg border border-dashed cursor-grab active:cursor-grabbing touch-none transition-colors ${
                        dragTarget === 'principalBlock'
                          ? 'z-30 border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-500/30'
                          : 'z-10 border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <p>Mengetahui,</p>
                      <p>{draft.principalTitle}</p>
                      <div className="relative h-[86px] w-full overflow-visible">
                        {sigStamp.stampDataUrl && sigStamp.showStampDefault && sigStamp.stampTarget === 'principal' && (
                          <img
                            src={sigStamp.stampDataUrl}
                            alt="Stempel Sekolah (Seret untuk geser)"
                            title="Seret untuk mengatur posisi stempel"
                            referrerPolicy="no-referrer"
                            draggable={false}
                            onPointerDown={(e) => startSigDrag('stamp', e)}
                            onPointerMove={handleSigPointerMove}
                            onPointerUp={stopSigDrag}
                            onPointerCancel={stopSigDrag}
                            style={{
                              left: '34px',
                              top: '50%',
                              width: sigStamp.stampSize,
                              height: sigStamp.stampSize,
                              maxWidth: 'none',
                              transform: `translate(calc(-50% + ${sigStamp.stampOffsetX}px), calc(-50% + ${sigStamp.stampOffsetY}px))`,
                            }}
                            className={`absolute z-10 object-contain opacity-85 mix-blend-multiply cursor-grab active:cursor-grabbing touch-none transition-shadow ${
                              dragTarget === 'stamp' ? 'ring-2 ring-indigo-500 rounded-md' : 'hover:ring-1 hover:ring-indigo-300 rounded-md'
                            }`}
                          />
                        )}
                        {sigStamp.principalSignatureDataUrl && (
                          <img
                            src={sigStamp.principalSignatureDataUrl}
                            alt="TTD Kepala Sekolah (Seret untuk geser)"
                            title="Seret untuk mengatur posisi TTD Kepala Sekolah"
                            referrerPolicy="no-referrer"
                            draggable={false}
                            onPointerDown={(e) => startSigDrag('principalSig', e)}
                            onPointerMove={handleSigPointerMove}
                            onPointerUp={stopSigDrag}
                            onPointerCancel={stopSigDrag}
                            style={{
                              left: '78px',
                              top: '50%',
                              height: sigStamp.signatureSize,
                              width: 'auto',
                              maxWidth: 'none',
                              transform: `translate(calc(-50% + ${sigStamp.principalSigOffsetX}px), calc(-50% + ${sigStamp.principalSigOffsetY}px))`,
                            }}
                            className={`absolute z-20 object-contain cursor-grab active:cursor-grabbing touch-none ${
                              dragTarget === 'principalSig'
                                ? 'ring-2 ring-indigo-500 rounded-md'
                                : 'hover:ring-1 hover:ring-indigo-300 rounded-md'
                            }`}
                          />
                        )}
                      </div>
                      <p className="font-bold underline">{draft.principalName}</p>
                      <p>NIP. {draft.principalNip}</p>
                    </div>
                  </div>

                  {/* Area Guru Mapel */}
                  <div className="pl-4 overflow-visible">
                    <div
                      onPointerDown={(e) => startSigDrag('teacherBlock', e)}
                      onPointerMove={handleSigPointerMove}
                      onPointerUp={stopSigDrag}
                      onPointerCancel={stopSigDrag}
                      title="Seret untuk menggeser seluruh blok pengesahan Guru Mapel"
                      style={{
                        transform: `translate(${sigStamp.teacherBlockOffsetX}px, ${sigStamp.teacherBlockOffsetY}px)`,
                      }}
                      className={`relative p-2.5 -m-2.5 rounded-lg border border-dashed cursor-grab active:cursor-grabbing touch-none transition-colors ${
                        dragTarget === 'teacherBlock'
                          ? 'z-30 border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-500/30'
                          : 'z-10 border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <p>{draft.signatureCity}, Tanggal Cetak</p>
                      <p>Guru Mata Pelajaran,</p>
                      <div className="relative h-[86px] w-full overflow-visible">
                        {sigStamp.stampDataUrl && sigStamp.showStampDefault && sigStamp.stampTarget === 'teacher' && (
                          <img
                            src={sigStamp.stampDataUrl}
                            alt="Stempel Sekolah (Seret untuk geser)"
                            title="Seret untuk mengatur posisi stempel"
                            referrerPolicy="no-referrer"
                            draggable={false}
                            onPointerDown={(e) => startSigDrag('stamp', e)}
                            onPointerMove={handleSigPointerMove}
                            onPointerUp={stopSigDrag}
                            onPointerCancel={stopSigDrag}
                            style={{
                              left: '34px',
                              top: '50%',
                              width: sigStamp.stampSize,
                              height: sigStamp.stampSize,
                              maxWidth: 'none',
                              transform: `translate(calc(-50% + ${sigStamp.stampOffsetX}px), calc(-50% + ${sigStamp.stampOffsetY}px))`,
                            }}
                            className={`absolute z-10 object-contain opacity-85 mix-blend-multiply cursor-grab active:cursor-grabbing touch-none ${
                              dragTarget === 'stamp' ? 'ring-2 ring-indigo-500 rounded-md' : 'hover:ring-1 hover:ring-indigo-300 rounded-md'
                            }`}
                          />
                        )}
                        {sigStamp.teacherSignatureDataUrl && (
                          <img
                            src={sigStamp.teacherSignatureDataUrl}
                            alt="TTD Guru Mapel (Seret untuk geser)"
                            title="Seret untuk mengatur posisi TTD Guru Mapel"
                            referrerPolicy="no-referrer"
                            draggable={false}
                            onPointerDown={(e) => startSigDrag('teacherSig', e)}
                            onPointerMove={handleSigPointerMove}
                            onPointerUp={stopSigDrag}
                            onPointerCancel={stopSigDrag}
                            style={{
                              left: '78px',
                              top: '50%',
                              height: sigStamp.signatureSize,
                              width: 'auto',
                              maxWidth: 'none',
                              transform: `translate(calc(-50% + ${sigStamp.teacherSigOffsetX}px), calc(-50% + ${sigStamp.teacherSigOffsetY}px))`,
                            }}
                            className={`absolute z-20 object-contain cursor-grab active:cursor-grabbing touch-none ${
                              dragTarget === 'teacherSig'
                                ? 'ring-2 ring-indigo-500 rounded-md'
                                : 'hover:ring-1 hover:ring-indigo-300 rounded-md'
                            }`}
                          />
                        )}
                      </div>
                      <p className="font-bold underline">{draft.teacherProfile.name}</p>
                      <p>NIP. {draft.teacherProfile.nip}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
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
      {/* 3B. PENGATURAN BOBOT PENILAIAN (%) */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Bobot Penilaian per Jenis Ujian (%)
            </h3>
            <p className="text-xs text-slate-500">
              Tentukan persentase bobot masing-masing ujian untuk menghitung Nilai Akhir otomatis pada Matriks & Cetak Rapor
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(draft.useWeightedAverage)}
                onChange={(e) => {
                  const next: SystemSettings = {
                    ...draft,
                    useWeightedAverage: e.target.checked,
                  };
                  setDraft(next);
                  onUpdateSettings(next);
                }}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span>Aktifkan Rata-Rata Berbobot</span>
            </label>
            <button
              type="button"
              onClick={() => {
                if (draft.examTypes.length === 0) return;
                const count = draft.examTypes.length;
                const base = Math.floor(100 / count);
                const rem = 100 - base * count;
                const nextWeights: Record<string, number> = {};
                draft.examTypes.forEach((ex, idx) => {
                  nextWeights[ex] = base + (idx < rem ? 1 : 0);
                });
                const next: SystemSettings = {
                  ...draft,
                  examWeights: nextWeights,
                };
                setDraft(next);
                onUpdateSettings(next);
                onNotify('Bobot penilaian dibagi rata menjadi total 100%.');
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
            >
              Bagi Rata 100%
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {(() => {
            const totalWeight = draft.examTypes.reduce(
              (acc, ex) => acc + Number(draft.examWeights?.[ex] ?? 0),
              0
            );
            return (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {draft.examTypes.map((ex) => {
                    const weightVal = draft.examWeights?.[ex] ?? 0;
                    return (
                      <div
                        key={ex}
                        className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5"
                      >
                        <label className="block text-xs font-bold text-slate-800 truncate" title={ex}>
                          {ex}
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={weightVal}
                            disabled={!draft.useWeightedAverage}
                            onChange={(e) => {
                              const raw = Number(e.target.value);
                              const clamped = Number.isNaN(raw) ? 0 : Math.max(0, Math.min(100, raw));
                              const nextWeights = {
                                ...(draft.examWeights || {}),
                                [ex]: clamped,
                              };
                              const next: SystemSettings = {
                                ...draft,
                                examWeights: nextWeights,
                              };
                              setDraft(next);
                              onUpdateSettings(next);
                            }}
                            className="w-full px-2.5 py-1.5 text-sm font-bold tabular-nums rounded-md border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                          />
                          <span className="text-xs font-bold text-slate-500">%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-600">
                    {draft.useWeightedAverage
                      ? 'Perhitungan aktif: nilai ujian yang sudah terisi dinormalisasi secara proporsional sesuai bobot.'
                      : 'Saat nonaktif, sistem menggunakan rata-rata hitung biasa (bobot sama).'}
                  </span>
                  <span
                    className={`font-bold tabular-nums ${
                      !draft.useWeightedAverage
                        ? 'text-slate-500'
                        : totalWeight === 100
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                    }`}
                  >
                    Total Bobot: {totalWeight}%{' '}
                    {draft.useWeightedAverage && totalWeight !== 100 ? '(Disarankan 100%)' : ''}
                  </span>
                </div>
              </>
            );
          })()}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 4. CADANGAN & UPGRADE AMAN (BACKUP & RESTORE JSON DATABASE) */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <DatabaseBackup className="w-4 h-4 text-indigo-600" />
              <span>Cadangan Data &amp; Upgrade Aman (JSON Backup / Restore)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Migrasi otomatis menjaga pengaturan kop surat, tema, tanda tangan, pengguna, dan data lama tetap aman saat pembaruan versi aplikasi
            </p>
          </div>
          <span className="text-[11px] font-mono font-semibold text-slate-600">
            Skema Versi: {database?.version || '10.3.0'}
          </span>
        </div>

        <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">
              Ekspor seluruh data portal ke berkas JSON terenkapsulasi atau pulihkan dari cadangan sebelumnya.
            </p>
            <p>
              Proses pemulihan menjalankan migrasi skema aman (<span className="font-mono">migrateDatabase</span>) sehingga pengaturan versi sebelumnya tetap kompatibel.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (!database) {
                  onNotify('Database belum siap untuk dicadangkan.');
                  return;
                }
                const payload: PortalDatabase = {
                  ...database,
                  settings: draft,
                  lastSyncedAt: new Date().toISOString(),
                };
                const blob = new Blob([JSON.stringify(payload, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                const dateStamp = new Date().toISOString().slice(0, 10);
                link.href = url;
                link.download = `Portal_EGuru_Backup_${dateStamp}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                onNotify('Cadangan database JSON berhasil diunduh.');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <HardDriveDownload className="w-3.5 h-3.5 text-indigo-600" />
              <span>Unduh Cadangan JSON</span>
            </button>

            <input
              ref={backupFileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    const parsed = JSON.parse(String(reader.result || '{}')) as Partial<PortalDatabase>;
                    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.students)) {
                      onNotify('Berkas JSON tidak valid atau bukan cadangan Portal E-Guru.');
                      return;
                    }
                    const migrated = migrateDatabase(parsed);
                    if (!migrated) {
                      onNotify('Struktur cadangan JSON tidak dapat dimigrasi.');
                      return;
                    }
                    setDraft(migrated.settings);
                    onRestoreDatabase?.(migrated);
                    onNotify(
                      `Berhasil memulihkan ${migrated.students.length} siswa, ${migrated.journals.length} jurnal, dan ${migrated.grades.length} nilai dengan aman.`
                    );
                  } catch {
                    onNotify('Gagal membaca berkas JSON cadangan.');
                  }
                };
                reader.readAsText(file);
              }}
            />

            <button
              type="button"
              onClick={() => backupFileRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-300" />
              <span>Pulihkan dari JSON</span>
            </button>
          </div>
        </div>
      </section>
    </form>
  );
};
