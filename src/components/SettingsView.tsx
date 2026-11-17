import React, { useState } from 'react';
import {
  Check,
  Database,
  FileEdit,
  ImagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { SystemSettings } from '../types';
import { DEFAULT_LEFT_LOGO, DEFAULT_RIGHT_LOGO } from '../utils/defaultLogos';

interface SettingsViewProps {
  settings: SystemSettings;
  onUpdateSettings: (next: SystemSettings) => void;
  onSyncGoogleSheets: () => void;
  onResetDemoData: () => void;
  onNotify: (msg: string) => void;
}

interface MasterListCardProps {
  title: string;
  subtitle: string;
  items: string[];
  placeholder: string;
  onChange: (nextItems: string[]) => void;
}

const MasterListCard: React.FC<MasterListCardProps> = ({
  title,
  subtitle,
  items,
  placeholder,
  onChange,
}) => {
  const [newVal, setNewVal] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

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
    const next = [...items];
    next[idx] = trimmed;
    onChange(next);
    setEditingIndex(null);
  };

  const handleDelete = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between gap-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>

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
                  <span className="font-medium text-slate-800 truncate">{item}</span>
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
  onUpdateSettings,
  onSyncGoogleSheets,
  onResetDemoData,
  onNotify,
}) => {
  const [draft, setDraft] = useState<SystemSettings>(settings);

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(draft);
    onNotify('Pengaturan sistem, Kop Surat, dan profil guru berhasil disimpan.');
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 6 Baris Teks Kop */}
            <div className="lg:col-span-7 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Baris 1 (Instansi Pemerintah / Yayasan)
                </label>
                <input
                  type="text"
                  value={draft.kopSurat.line1}
                  onChange={(e) =>
                    setDraft({ ...draft, kopSurat: { ...draft.kopSurat, line1: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Baris 2 (Dinas Pendidikan)
                </label>
                <input
                  type="text"
                  value={draft.kopSurat.line2}
                  onChange={(e) =>
                    setDraft({ ...draft, kopSurat: { ...draft.kopSurat, line2: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Baris 3 (Cabang Dinas / Wilayah)
                </label>
                <input
                  type="text"
                  value={draft.kopSurat.line3}
                  onChange={(e) =>
                    setDraft({ ...draft, kopSurat: { ...draft.kopSurat, line3: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Baris 4 (Nama Unit Sekolah — Tebal Utama)
                </label>
                <input
                  type="text"
                  value={draft.kopSurat.line4}
                  onChange={(e) =>
                    setDraft({ ...draft, kopSurat: { ...draft.kopSurat, line4: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Baris 5 (Alamat Jalan & Telepon)
                </label>
                <input
                  type="text"
                  value={draft.kopSurat.line5}
                  onChange={(e) =>
                    setDraft({ ...draft, kopSurat: { ...draft.kopSurat, line5: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Baris 6 (Website, Email, NPSN)
                </label>
                <input
                  type="text"
                  value={draft.kopSurat.line6}
                  onChange={(e) =>
                    setDraft({ ...draft, kopSurat: { ...draft.kopSurat, line6: e.target.value } })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
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
          <div className="p-5 rounded-xl border border-slate-300 bg-white">
            <p className="text-xs font-semibold text-slate-500 mb-3">
              Pratinjau Langsung Kop Surat Bergaris Ganda:
            </p>
            <div className="border border-slate-200 p-5 rounded-lg bg-white">
              <div className="pb-2 border-b-[3px] border-double border-slate-900">
                <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-900">
                  <div className="w-16 h-16 shrink-0 flex items-center justify-center">
                    {draft.kopSurat.leftLogoDataUrl && (
                      <img
                        src={draft.kopSurat.leftLogoDataUrl}
                        alt="Live Preview Logo Kiri"
                        className="max-w-full max-h-full object-contain"
                      />
                    )}
                  </div>
                  <div className="flex-1 text-center leading-snug text-slate-950 font-serif">
                    <p className="text-xs font-bold uppercase">{draft.kopSurat.line1}</p>
                    <p className="text-sm font-bold uppercase">{draft.kopSurat.line2}</p>
                    <p className="text-xs font-medium">{draft.kopSurat.line3}</p>
                    <p className="text-base font-extrabold uppercase mt-0.5">{draft.kopSurat.line4}</p>
                    <p className="text-[11px]">{draft.kopSurat.line5}</p>
                    <p className="text-[11px]">{draft.kopSurat.line6}</p>
                  </div>
                  <div className="w-16 h-16 shrink-0 flex items-center justify-center">
                    {draft.kopSurat.rightLogoDataUrl && (
                      <img
                        src={draft.kopSurat.rightLogoDataUrl}
                        alt="Live Preview Logo Kanan"
                        className="max-w-full max-h-full object-contain"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 3. 4 KARTU MASTER DATA */}
      {/* ===================================================================== */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <MasterListCard
          title="Master Daftar Kelas"
          subtitle="Rombongan belajar yang diampu"
          items={draft.classes}
          placeholder="Contoh: XI IPA 2"
          onChange={(classes) => {
            const next = { ...draft, classes };
            setDraft(next);
            onUpdateSettings(next);
          }}
        />
        <MasterListCard
          title="Master Mata Pelajaran"
          subtitle="Daftar mapel pada dropdown jurnal & nilai"
          items={draft.subjects}
          placeholder="Contoh: Matematika Lanjut"
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
      {/* 4. KARTU PROFIL GURU MAPEL, AKUN LOGIN & SINKRONISASI */}
      {/* ===================================================================== */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Profil Guru Mapel, Akun Login & Sinkronisasi
            </h3>
            <p className="text-xs text-slate-500">
              Identitas guru pada kop tanda tangan, kredensial masuk, serta integrasi opsional Google Sheets
            </p>
          </div>
          <button
            type="button"
            onClick={onResetDemoData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset ke Data Demo Awal</span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nama Lengkap & Gelar</label>
              <input
                type="text"
                value={draft.teacherProfile.name}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    teacherProfile: { ...draft.teacherProfile, name: e.target.value },
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">NIP Guru</label>
              <input
                type="text"
                value={draft.teacherProfile.nip}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    teacherProfile: { ...draft.teacherProfile, nip: e.target.value },
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Unit Sekolah</label>
              <input
                type="text"
                value={draft.teacherProfile.school}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    teacherProfile: { ...draft.teacherProfile, school: e.target.value },
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Akun Login</label>
              <input
                type="email"
                value={draft.teacherProfile.email}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    teacherProfile: { ...draft.teacherProfile, email: e.target.value },
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password Login</label>
              <input
                type="text"
                value={draft.teacherProfile.password}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    teacherProfile: { ...draft.teacherProfile, password: e.target.value },
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Google Sheets Web App URL (Opsional)
              </label>
              <div className="relative">
                <Database className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={draft.sheetsWebAppUrl}
                  onChange={(e) => setDraft({ ...draft, sheetsWebAppUrl: e.target.value })}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-end gap-3">
            {draft.sheetsWebAppUrl.trim() && (
              <button
                type="button"
                onClick={() => {
                  onUpdateSettings(draft);
                  onSyncGoogleSheets();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Kirim Sinkronisasi ke Google Sheets</span>
              </button>
            )}

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Profil & Pengaturan</span>
            </button>
          </div>
        </div>
      </section>
    </form>
  );
};
