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
  const currentThemeId: ThemeId = settings.themeId || 'indigo';
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
    <header className="no-print sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          aria-label="Buka menu navigasi"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
            {MENU_TITLES[activeMenu]}
          </h1>
          <p className="hidden sm:block text-xs text-slate-500 truncate">
            TA {settings.academicYear} · Semester {settings.semester} · KKM {settings.kkm}
            {periodScope === 'all' ? ' · Menampilkan Semua Periode (Arsip)' : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {onChangeTheme && (
          <div className="relative" ref={themePopRef}>
            <button
              type="button"
              onClick={() => setThemeMenuOpen((v) => !v)}
              title="Ubah Tema Tampilan Aplikasi"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span
                className="w-3 h-3 rounded-full shrink-0 border border-black/15"
                style={{ backgroundColor: currentTheme.primaryHex }}
              />
              <Palette className="w-3.5 h-3.5 text-indigo-600 hidden sm:inline" />
              <span className="hidden sm:inline">{currentTheme.name}</span>
            </button>

            {themeMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white shadow-xl p-2 z-40 space-y-1">
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
                      className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 font-bold'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-4 h-4 rounded-md shrink-0 border border-black/15"
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
            className={`hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              periodScope === 'all'
                ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5 text-indigo-600" />
            <span>{periodScope === 'all' ? 'Semua Periode (Arsip)' : 'Periode Aktif'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onManualSync}
          disabled={isSyncing}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{isSyncing ? 'Menyimpan...' : 'Simpan & Cadangkan'}</span>
        </button>
      </div>
    </header>
  );
};
