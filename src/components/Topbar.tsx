import React from 'react';
import { CalendarClock, CloudUpload, Menu } from 'lucide-react';
import { MenuId, SystemSettings } from '../types';

interface TopbarProps {
  activeMenu: MenuId;
  settings: SystemSettings;
  periodScope?: 'active' | 'all';
  onTogglePeriodScope?: () => void;
  onOpenMobileMenu: () => void;
  onManualSync: () => void;
  isSyncing: boolean;
}

const MENU_TITLES: Record<MenuId, string> = {
  dashboard: 'Dashboard Analitik',
  jurnal: 'Jurnal & Absensi',
  nilai: 'Input & Matriks Riwayat Nilai',
  siswa: 'Data Siswa',
  laporan: 'Cetak Laporan Resmi',
  pengaturan: 'Pengaturan Sistem',
};

export const Topbar: React.FC<TopbarProps> = ({
  activeMenu,
  settings,
  periodScope = 'active',
  onTogglePeriodScope,
  onOpenMobileMenu,
  onManualSync,
  isSyncing,
}) => {
  return (
    <header className="no-print sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
          <CloudUpload className="w-3.5 h-3.5" />
          <span>{isSyncing ? 'Menyinkronkan...' : 'Simpan & Sinkron'}</span>
        </button>
      </div>
    </header>
  );
};
