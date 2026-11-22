import React, { useEffect, useRef, useState } from 'react';
import { CalendarClock, Check, Menu, Palette, Save } from 'lucide-react';
import { MenuId, SystemSettings, ThemeId } from '../types';
import { THEME_PRESETS } from '../utils/helpers';

interface TopbarProps {
  activeMenu: MenuId;
  settings: SystemSettings;
  periodScope?: 'active' | 'all';
  onTogglePeriodScope?: () => void;
  onChangeTheme?: (themeId: ThemeId) => void;
  onOpenMobileMenu: () => void;
  onManualSync: () => void;
  isSyncing: boolean;
}

const MENU_TITLES: Record<MenuId, string> = {
  dashboard: 'Dashboard Analitik',
  pegawai: 'Data Guru & Karyawan',
  jurnal: 'Jurnal & Absensi',
  nilai: 'Input & Matriks Riwayat Nilai',
  siswa: 'Data Siswa',
  laporan: 'Cetak Laporan Resmi',
  profil: 'Profil Guru Mapel & Akun Login',
  pengguna: 'Pengaturan Admin & Manajemen Pengguna',
  pengaturan: 'Pengaturan Sistem',
};

export const Topbar: React.FC<TopbarProps> = ({
  activeMenu,
  settings,
  periodScope = 'active',
  onTogglePeriodScope,
  onChangeTheme,
  onOpenMobileMenu,
  onManualSync,
  isSyncing,
}) => {
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themePopRef = useRef<HTMLDivElement | null>(null);
  const currentThemeId: ThemeId = settings.themeId || 'neomorphic';
  const currentTheme = THEME_PRESETS.find((t) => t.id === currentThemeId) || THEME_PRESETS[0];

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (themePopRef.current && !themePopRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <header className="no-print eguru-topbar-surface sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-slate-200/80 px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden min-w-[44px] min-h-[44px] inline-flex items-center justify-center -ml-1 rounded-2xl bg-white/80 text-slate-600 hover:text-slate-900 border border-slate-200/80 cursor-pointer shrink-0"
          aria-label="Buka menu navigasi"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-sm sm:text-lg font-bold text-slate-900 truncate leading-tight">
            {MENU_TITLES[activeMenu]}
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-500 truncate">
            <span className="sm:hidden">
              TA {settings.academicYear} · {settings.semester}
              {periodScope === 'all' ? ' · Arsip' : ''}
            </span>
            <span className="hidden sm:inline">
              TA {settings.academicYear} · Semester {settings.semester} · KKM {settings.kkm}
              {periodScope === 'all' ? ' · Menampilkan Semua Periode (Arsip)' : ''}
            </span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {onChangeTheme && (
          <div className="relative" ref={themePopRef}>
            <button
              type="button"
              onClick={() => setThemeMenuOpen((v) => !v)}
              title="Ubah Tema Tampilan Aplikasi"
              aria-label="Ubah Tema Tampilan"
              className="inline-flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] px-2.5 sm:px-3.5 py-2 rounded-2xl border border-slate-300/80 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <span
                className="w-3.5 h-3.5 sm:w-3 sm:h-3 rounded-full shrink-0 border border-white/60 shadow-sm"
                style={{ backgroundColor: currentTheme.primaryHex }}
              />
              <Palette className="w-3.5 h-3.5 text-indigo-600 hidden sm:inline" />
              <span className="hidden sm:inline">{currentTheme.name}</span>
            </button>

            {themeMenuOpen && (
              <div className="absolute right-0 mt-2 w-68 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-xl p-2.5 z-40 space-y-1">
                <p className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Pilih Tema Tampilan
                </p>
                {THEME_PRESETS.map((preset) => {
                  const isActive = preset.id === currentThemeId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        onChangeTheme(preset.id);
                        setThemeMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 font-bold ring-1 ring-blue-500/25'
                          : 'text-slate-700 hover:bg-slate-100/80'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-4 h-4 rounded-lg shrink-0 border border-white/40 shadow-sm"
                          style={{
                            backgroundImage: `linear-gradient(135deg, ${preset.primaryHex}, ${preset.sidebarHex})`,
                          }}
                        />
                        <span className="truncate">{preset.name}</span>
                      </span>
                      {isActive && <Check className="w-3.5 h-3.5 shrink-0 text-indigo-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {onTogglePeriodScope && (
          <button
            type="button"
            onClick={onTogglePeriodScope}
            title="Klik untuk beralih antara data periode aktif dan seluruh arsip semester"
            className={`hidden sm:inline-flex items-center gap-1.5 min-h-[40px] px-2.5 md:px-3.5 py-2 rounded-2xl border text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              periodScope === 'all'
                ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                : 'border-slate-300/80 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="hidden md:inline">
              {periodScope === 'all' ? 'Semua Periode (Arsip)' : 'Periode Aktif'}
            </span>
            <span className="md:hidden">{periodScope === 'all' ? 'Arsip' : 'Aktif'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onManualSync}
          disabled={isSyncing}
          className="flex items-center justify-center gap-1.5 sm:gap-2 min-h-[40px] px-3.5 sm:px-4 py-2 rounded-full sm:rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0"
        >
          <Save className="w-3.5 h-3.5 shrink-0" />
          <span className="sm:hidden">{isSyncing ? 'Simpan...' : 'Simpan'}</span>
          <span className="hidden sm:inline">{isSyncing ? 'Menyimpan...' : 'Simpan & Cadangkan'}</span>
        </button>
      </div>
    </header>
  );
};
