import React from 'react';
import {
  BarChart3,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  FileSpreadsheet,
  LogOut,
  Printer,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { MenuId, TeacherProfile, UserRole, WebBrandConfig } from '../types';
import { getUserPhotoUrl } from '../utils/defaultAvatars';
import { ROLE_PERMISSIONS, USER_ROLE_LABELS } from '../utils/helpers';

interface SidebarProps {
  activeMenu: MenuId;
  onSelectMenu: (menu: MenuId) => void;
  teacherProfile: TeacherProfile;
  webBrand: WebBrandConfig;
  currentUserName: string;
  currentUserNip: string;
  currentUserRole: UserRole;
  currentUserGender: 'L' | 'P';
  currentUserPhoto?: string;
  periodScope?: 'active' | 'all';
  onTogglePeriodScope?: () => void;
  onOpenProfileModal?: () => void;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const MENU_ITEMS: { id: MenuId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard Analitik', icon: BarChart3 },
  { id: 'pegawai', label: 'Data Guru & Karyawan', icon: Briefcase },
  { id: 'jurnal', label: 'Jurnal & Absensi', icon: ClipboardCheck },
  { id: 'nilai', label: 'Input & Matriks Nilai', icon: FileSpreadsheet },
  { id: 'siswa', label: 'Data Siswa', icon: Users },
  { id: 'laporan', label: 'Cetak Laporan Resmi', icon: Printer },
  { id: 'profil', label: 'Profil & Akun Login', icon: UserCheck },
  { id: 'pengguna', label: 'Admin & Pengguna', icon: ShieldCheck },
  { id: 'pengaturan', label: 'Pengaturan Sistem', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeMenu,
  onSelectMenu,
  teacherProfile,
  webBrand,
  currentUserName,
  currentUserNip,
  currentUserRole,
  currentUserGender,
  currentUserPhoto,
  periodScope = 'active',
  onTogglePeriodScope,
  onOpenProfileModal,
  onLogout,
  mobileOpen,
  onCloseMobile,
}) => {
  const rolePerms = ROLE_PERMISSIONS[currentUserRole];
  const visibleMenuItems = rolePerms.allowedMenus
    .map((id) => MENU_ITEMS.find((m) => m.id === id))
    .filter((m): m is (typeof MENU_ITEMS)[number] => Boolean(m));

  const userAvatarSrc = getUserPhotoUrl({
    photoDataUrl: currentUserPhoto,
    role: currentUserRole,
    gender: currentUserGender,
  });
  const fallbackUserAvatarSrc = getUserPhotoUrl({
    photoDataUrl: '',
    role: currentUserRole,
    gender: currentUserGender,
  });
  const handlePick = (id: MenuId) => {
    onSelectMenu(id);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="eguru-sidebar-surface flex flex-col h-full bg-slate-900 text-slate-100 select-none lg:rounded-r-3xl overflow-hidden">
      {/* Brand Header */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            style={{
              width: webBrand.webLogoSize ?? 38,
              height: webBrand.webLogoSize ?? 38,
            }}
            className="rounded-2xl bg-gradient-to-br from-white to-slate-100 p-1.5 flex items-center justify-center shrink-0 overflow-hidden shadow-[0_8px_18px_rgba(2,6,23,0.45),inset_0_1px_1px_rgba(255,255,255,0.95)] border border-white/60"
          >
            <img
              src={webBrand.webLogoDataUrl}
              alt={webBrand.appName}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate tracking-tight">{webBrand.appName}</p>
            <p className="text-xs text-slate-300/80 truncate">{teacherProfile.school}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2 rounded-2xl text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
          aria-label="Tutup menu navigasi"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links (Differentiated by Role) */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto eguru-scroll">
        <p className="px-3.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400/90">
          Menu {USER_ROLE_LABELS[currentUserRole]}
        </p>
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeMenu === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handlePick(item.id)}
              className={`w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all cursor-pointer text-left ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-[0_10px_22px_-6px_var(--eguru-glow)]'
                  : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Account Footer */}
      <div className="p-4 border-t border-white/10 space-y-2.5">
        {onTogglePeriodScope && (
          <button
            type="button"
            onClick={onTogglePeriodScope}
            className={`sm:hidden w-full min-h-[42px] flex items-center justify-between gap-2 px-3.5 py-2 rounded-2xl border text-xs font-semibold transition-all cursor-pointer ${
              periodScope === 'all'
                ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                : 'border-white/10 bg-white/[0.06] text-slate-200 hover:bg-white/[0.1]'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <CalendarClock className="w-3.5 h-3.5 shrink-0 text-sky-300" />
              <span className="truncate">
                {periodScope === 'all' ? 'Semua Periode (Arsip)' : 'Periode Aktif'}
              </span>
            </span>
            <span className="text-[10px] uppercase tracking-wider opacity-80 shrink-0">Ubah</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            onOpenProfileModal?.();
            onCloseMobile();
          }}
          className="w-full min-h-[52px] flex items-center gap-3 px-2.5 py-2 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 transition-all text-left cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          title="Klik untuk buka Pop-up Profil & Sinkronisasi"
        >
          <img
            src={userAvatarSrc}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = fallbackUserAvatarSrc;
            }}
            alt={currentUserName}
            className="w-10 h-10 rounded-full object-cover object-top border-2 border-sky-300/40 bg-white shrink-0 shadow-sm"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-sky-300 uppercase tracking-wider truncate">
              {USER_ROLE_LABELS[currentUserRole]}
            </p>
            <p className="text-xs font-semibold text-white truncate">{currentUserName}</p>
            <p className="text-[11px] text-slate-400 font-mono truncate">NIP. {currentUserNip}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="w-full min-h-[42px] flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-xs font-semibold text-slate-200 bg-white/[0.07] border border-white/10 hover:bg-rose-600 hover:border-rose-500 hover:text-white transition-all cursor-pointer whitespace-nowrap"
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
      <aside className="no-print hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Drawer with Backdrop */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full shadow-2xl">{sidebarContent}</aside>
        </div>
      )}
    </>
  );
};
