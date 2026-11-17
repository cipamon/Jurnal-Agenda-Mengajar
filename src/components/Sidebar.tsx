import React from 'react';
import {
  BarChart3,
  BookOpenCheck,
  ClipboardCheck,
  FileSpreadsheet,
  LogOut,
  Printer,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { MenuId, TeacherProfile } from '../types';

interface SidebarProps {
  activeMenu: MenuId;
  onSelectMenu: (menu: MenuId) => void;
  teacherProfile: TeacherProfile;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const MENU_ITEMS: { id: MenuId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard Analitik', icon: BarChart3 },
  { id: 'jurnal', label: 'Jurnal & Absensi', icon: ClipboardCheck },
  { id: 'nilai', label: 'Input & Matriks Nilai', icon: FileSpreadsheet },
  { id: 'siswa', label: 'Data Siswa', icon: Users },
  { id: 'laporan', label: 'Cetak Laporan Resmi', icon: Printer },
  { id: 'pengaturan', label: 'Pengaturan Sistem', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeMenu,
  onSelectMenu,
  teacherProfile,
  onLogout,
  mobileOpen,
  onCloseMobile,
}) => {
  const handlePick = (id: MenuId) => {
    onSelectMenu(id);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 select-none">
      {/* Brand Header */}
      <div className="px-5 py-5 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <BookOpenCheck className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">Portal E-Guru v10.2</p>
            <p className="text-xs text-slate-400 truncate">{teacherProfile.school}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
          aria-label="Tutup menu navigasi"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeMenu === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handlePick(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer text-left ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Teacher Account Footer */}
      <div className="p-4 border-t border-slate-800 space-y-3">
        <div className="px-2">
          <p className="text-xs font-semibold text-white truncate">{teacherProfile.name}</p>
          <p className="text-xs text-slate-400 font-mono truncate mt-0.5">NIP. {teacherProfile.nip}</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Keluar Sesi</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="no-print hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col border-r border-slate-800">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Drawer with Backdrop */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full shadow-2xl">{sidebarContent}</aside>
        </div>
      )}
    </>
  );
};
