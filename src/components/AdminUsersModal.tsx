import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Download,
  FileEdit,
  FileSpreadsheet,
  GraduationCap,
  ImagePlus,
  KeyRound,
  Link2,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { AppUser, UserRole } from '../types';
import { getUserPhotoUrl } from '../utils/defaultAvatars';
import { generateId, USER_ROLE_LABELS } from '../utils/helpers';

interface AdminUsersModalProps {
  isOpen: boolean;
  variant?: 'modal' | 'page';
  isCloudMode?: boolean;
  isServerMode?: boolean;
  users: AppUser[];
  allClasses: string[];
  allSubjects: string[];
  defaultSchool: string;
  currentUserRole: UserRole;
  currentUserEmail: string;
  onUpdateUsers: (nextUsers: AppUser[]) => void;
  onSwitchUserSession?: (user: AppUser) => void;
  onServerUnlockAdmin?: (identifier: string, password: string) => Promise<string | null>;
  onNotify: (msg: string) => void;
  onClose?: () => void;
}

export const AdminUsersModal: React.FC<AdminUsersModalProps> = ({
  isOpen,
  variant = 'modal',
  isCloudMode = false,
  isServerMode = false,
  users,
  allClasses,
  allSubjects,
  defaultSchool,
  currentUserRole,
  currentUserEmail,
  onUpdateUsers,
  onSwitchUserSession,
  onServerUnlockAdmin,
  onNotify,
  onClose,
}) => {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userUsername, setUserUsername] = useState('');
  const [userName, setUserName] = useState('');
  const [userNip, setUserNip] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('guru');
  const [userGender, setUserGender] = useState<'L' | 'P'>('L');
  const [userSchool, setUserSchool] = useState(defaultSchool);
  const [userPhotoDataUrl, setUserPhotoDataUrl] = useState('');
  const [userAssignedClasses, setUserAssignedClasses] = useState<string[]>([]);
  const [userAssignedSubjects, setUserAssignedSubjects] = useState<string[]>([]);
  const [userActive, setUserActive] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [showUserImport, setShowUserImport] = useState(false);
  const [userPasteText, setUserPasteText] = useState('');
  const userFileRef = useRef<HTMLInputElement | null>(null);

  const [adminUnlockEmail, setAdminUnlockEmail] = useState('admin');
  const [adminUnlockPass, setAdminUnlockPass] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setUserSchool(defaultSchool);
    if (variant !== 'modal' || !onClose) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, variant, defaultSchool, onClose]);

  if (!isOpen) return null;

  const handleUserPhotoUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) setUserPhotoDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const resetUserForm = () => {
    setEditingUserId(null);
    setUserUsername('');
    setUserName('');
    setUserNip('');
    setUserEmail('');
    setUserPassword('');
    setUserRole('guru');
    setUserGender('L');
    setUserSchool(defaultSchool);
    setUserPhotoDataUrl('');
    setUserAssignedClasses([]);
    setUserAssignedSubjects([]);
    setUserActive(true);
  };

  const toggleUserClass = (cls: string) => {
    setUserAssignedClasses((prev) =>
      prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]
    );
  };

  const toggleUserSubject = (subj: string) => {
    setUserAssignedSubjects((prev) =>
      prev.includes(subj) ? prev.filter((s) => s !== subj) : [...prev, subj]
    );
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = userName.trim();
    const trimmedEmail = userEmail.trim();
    const trimmedPass = userPassword.trim();
    const derivedUsername =
      userUsername.trim().toLowerCase().replace(/[^a-z0-9._@-]/g, '') ||
      trimmedEmail.split('@')[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, '') ||
      '';

    if (!trimmedName || !trimmedEmail) {
      onNotify(
        isCloudMode
          ? 'Nama lengkap dan email Google pengguna wajib diisi.'
          : 'Nama lengkap dan email pengguna wajib diisi.'
      );
      return;
    }

    if (!editingUserId && isServerMode && trimmedPass.length < 6) {
      onNotify('Password akun baru di server minimal 6 karakter.');
      return;
    }

    if (trimmedPass.length > 0 && trimmedPass.length < 6) {
      onNotify('Password minimal 6 karakter (atau kosongkan jika tidak ingin mengubah password).');
      return;
    }

    const duplicate = users.find(
      (u) => u.email.toLowerCase() === trimmedEmail.toLowerCase() && u.id !== editingUserId
    );
    if (duplicate) {
      onNotify('Email tersebut sudah digunakan oleh akun lain.');
      return;
    }

    const isTeachingRole = userRole === 'guru' || userRole === 'wali_kelas';
    const cleanAssignedClasses = isTeachingRole
      ? allClasses.filter((c) => userAssignedClasses.includes(c))
      : [];
    const cleanAssignedSubjects = isTeachingRole
      ? allSubjects.filter((s) => userAssignedSubjects.includes(s))
      : [];

    if (editingUserId) {
      const next = users.map((u) =>
        u.id === editingUserId
          ? {
              ...u,
              username: derivedUsername || u.username,
              name: trimmedName,
              nip: userNip.trim() || '-',
              email: trimmedEmail,
              password: trimmedPass,
              role: userRole,
              gender: userGender,
              school: userSchool.trim() || defaultSchool,
              photoDataUrl: userPhotoDataUrl.trim(),
              assignedClasses: cleanAssignedClasses,
              assignedSubjects: cleanAssignedSubjects,
              active: userActive,
            }
          : u
      );
      onUpdateUsers(next);
      onNotify(`Pengguna ${trimmedName} (${USER_ROLE_LABELS[userRole]}) berhasil diperbarui.`);
    } else {
      const created: AppUser = {
        id: generateId('usr'),
        username: derivedUsername,
        name: trimmedName,
        nip: userNip.trim() || '-',
        email: trimmedEmail,
        password: trimmedPass,
        role: userRole,
        gender: userGender,
        school: userSchool.trim() || defaultSchool,
        photoDataUrl: userPhotoDataUrl.trim(),
        assignedClasses: cleanAssignedClasses,
        assignedSubjects: cleanAssignedSubjects,
        active: userActive,
        createdAt: new Date().toISOString(),
      };
      onUpdateUsers([...users, created]);
      onNotify(`Pengguna baru ${created.name} (${USER_ROLE_LABELS[created.role]}) ditambahkan.`);
    }
    resetUserForm();
  };

  const handleEditUserClick = (u: AppUser) => {
    setEditingUserId(u.id);
    setUserUsername(u.username || '');
    setUserName(u.name);
    setUserNip(u.nip);
    setUserEmail(u.email);
    setUserPassword('');
    setUserRole(u.role);
    setUserGender(u.gender);
    setUserSchool(u.school);
    setUserPhotoDataUrl(u.photoDataUrl || '');
    setUserAssignedClasses(u.assignedClasses ? [...u.assignedClasses] : []);
    setUserAssignedSubjects(u.assignedSubjects ? [...u.assignedSubjects] : []);
    setUserActive(u.active);
  };

  const handleToggleUserActive = (u: AppUser) => {
    const activeAdmins = users.filter((usr) => usr.role === 'admin' && usr.active);
    if (u.role === 'admin' && u.active && activeAdmins.length <= 1) {
      onNotify('Minimal harus ada 1 akun Admin Sistem yang tetap aktif.');
      return;
    }
    onUpdateUsers(users.map((usr) => (usr.id === u.id ? { ...usr, active: !usr.active } : usr)));
  };

  const handleDeleteUser = (u: AppUser) => {
    const admins = users.filter((usr) => usr.role === 'admin');
    if (u.role === 'admin' && admins.length <= 1) {
      onNotify('Tidak dapat menghapus akun Admin Sistem terakhir.');
      return;
    }
    if (u.email.toLowerCase() === currentUserEmail.toLowerCase()) {
      onNotify('Tidak dapat menghapus akun yang sedang digunakan saat ini.');
      return;
    }
    onUpdateUsers(users.filter((usr) => usr.id !== u.id));
    setSelectedUserIds((prev) => prev.filter((id) => id !== u.id));
    if (editingUserId === u.id) resetUserForm();
    onNotify(`Akun ${u.name} dihapus.`);
  };

  const toggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllUsers = () => {
    const allIds = users.map((u) => u.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedUserIds.includes(id));
    setSelectedUserIds(allSelected ? [] : allIds);
  };

  const handleBulkDeleteUsers = () => {
    if (selectedUserIds.length === 0) return;
    const totalAdmins = users.filter((u) => u.role === 'admin').length;
    let remainingAdmins = totalAdmins;
    const deletedIds: string[] = [];

    selectedUserIds.forEach((id) => {
      const target = users.find((u) => u.id === id);
      if (!target) return;
      if (target.email.toLowerCase() === currentUserEmail.toLowerCase()) return;
      if (target.role === 'admin') {
        if (remainingAdmins <= 1) return;
        remainingAdmins--;
      }
      deletedIds.push(id);
    });

    if (deletedIds.length === 0) {
      onNotify('Akun yang sedang aktif atau Admin Sistem terakhir tidak dapat dihapus.');
      return;
    }

    onUpdateUsers(users.filter((u) => !deletedIds.includes(u.id)));
    setSelectedUserIds([]);
    if (editingUserId && deletedIds.includes(editingUserId)) resetUserForm();
    onNotify(`${deletedIds.length} akun pengguna berhasil dihapus.`);
  };

  const handleDownloadUserTemplate = () => {
    const rows = [
      {
        'Nama Lengkap': 'Contoh Guru Mapel',
        NIP: '19880412 201501 1 002',
        'Email Login': 'guru3@sman1nusantara.sch.id',
        Password: '',
        Role: 'guru',
        'L/P': 'L',
        'Unit Sekolah': defaultSchool,
        'Kelas Diampu': allClasses.slice(0, 2).join(', '),
        'Mapel Diampu': allSubjects.slice(0, 1).join(', '),
        'Foto URL': '',
      },
      {
        'Nama Lengkap': 'Contoh Staff Tata Usaha',
        NIP: '19930510 201902 2 004',
        'Email Login': 'staff2@sman1nusantara.sch.id',
        Password: '',
        Role: 'karyawan',
        'L/P': 'P',
        'Unit Sekolah': defaultSchool,
        'Kelas Diampu': '',
        'Mapel Diampu': '',
        'Foto URL': '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Pengguna');
    XLSX.writeFile(wb, 'Template_Impor_Pengguna_EGuru.xlsx');
    onNotify('Template Excel (.xlsx) Pengguna berhasil diunduh.');
  };

  const handleExportUsers = () => {
    const targetList =
      selectedUserIds.length > 0 ? users.filter((u) => selectedUserIds.includes(u.id)) : users;
    const rows = targetList.map((u, idx) => ({
      No: idx + 1,
      Username: u.username || u.email.split('@')[0] || '-',
      'Nama Lengkap': u.name,
      NIP: u.nip,
      'Email Login': u.email,
      Role: u.role,
      'Label Role': USER_ROLE_LABELS[u.role],
      'L/P': u.gender,
      'Unit Sekolah': u.school,
      'Kelas Diampu': (u.assignedClasses || []).join(', '),
      'Mapel Diampu': (u.assignedSubjects || []).join(', '),
      Status: u.active ? 'Aktif' : 'Nonaktif',
      'Foto URL': u.photoDataUrl && !u.photoDataUrl.startsWith('data:') ? u.photoDataUrl : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daftar Pengguna');
    XLSX.writeFile(wb, 'Daftar_Pengguna_Portal_EGuru.xlsx');
    onNotify(
      `Berhasil mengekspor ${rows.length} akun pengguna${selectedUserIds.length > 0 ? ' terpilih' : ''} ke Excel.`
    );
  };

  const normalizeImportedRole = (raw: string): UserRole => {
    const low = raw.trim().toLowerCase();
    if (low.includes('admin')) return 'admin';
    if (low.includes('wali')) return 'wali_kelas';
    if (low.includes('kepala')) return 'kepala_sekolah';
    if (low.includes('karyawan') || low.includes('staff') || low.includes('tu')) return 'karyawan';
    return 'guru';
  };

  const splitMultiList = (raw?: string): string[] =>
    String(raw || '')
      .split(/[,;|]/)
      .map((x) => x.trim())
      .filter(Boolean);

  const applyImportedUsers = (
    rawRows: Array<{
      name: string;
      nip: string;
      email: string;
      password: string;
      role: string;
      gender: string;
      school: string;
      assignedClasses?: string;
      assignedSubjects?: string;
      photoDataUrl?: string;
    }>
  ) => {
    const existingEmails = new Set(users.map((u) => u.email.toLowerCase()));
    const added: AppUser[] = [];
    const nowIso = new Date().toISOString();

    rawRows.forEach((r) => {
      const cleanName = String(r.name || '').trim();
      const cleanEmail = String(r.email || '').trim();
      if (!cleanName || !cleanEmail || cleanEmail.toLowerCase().includes('email login')) return;
      if (existingEmails.has(cleanEmail.toLowerCase())) return;
      existingEmails.add(cleanEmail.toLowerCase());
      const parsedRole = normalizeImportedRole(r.role || 'guru');
      added.push({
        id: generateId('usr'),
        username: cleanEmail.split('@')[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, ''),
        name: cleanName,
        nip: String(r.nip || '-').trim() || '-',
        email: cleanEmail,
        password: String(r.password || '').trim(),
        role: parsedRole,
        gender: String(r.gender || 'L').trim().toUpperCase().startsWith('P') ? 'P' : 'L',
        school: String(r.school || defaultSchool).trim() || defaultSchool,
        photoDataUrl: String(r.photoDataUrl || '').trim(),
        assignedClasses: splitMultiList(r.assignedClasses),
        assignedSubjects: splitMultiList(r.assignedSubjects),
        active: true,
        createdAt: nowIso,
      });
    });

    if (added.length === 0) {
      onNotify('Tidak ada akun pengguna baru yang valid atau email sudah terdaftar.');
      return;
    }

    onUpdateUsers([...users, ...added]);
    setUserPasteText('');
    setShowUserImport(false);
    onNotify(`Berhasil mengimpor ${added.length} akun pengguna baru.`);
  };

  const handleImportUsersPaste = () => {
    const lines = userPasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed = lines.map((line) => {
      const delim = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
      const cols = line.split(delim).map((c) => c.trim());
      return {
        name: cols[0] || '',
        nip: cols[1] || '-',
        email: cols[2] || '',
        password: cols[3] || '',
        role: cols[4] || 'guru',
        gender: cols[5] || 'L',
        school: cols[6] || defaultSchool,
        photoDataUrl: cols[7] || '',
        assignedClasses: cols[8] || '',
        assignedSubjects: cols[9] || '',
      };
    });
    applyImportedUsers(parsed);
  };

  const handleUserFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const mapped = rows.map((row) => ({
        name: String(row['Nama Lengkap'] ?? row['Nama'] ?? ''),
        nip: String(row['NIP'] ?? row['ID Pegawai'] ?? '-'),
        email: String(row['Email Login'] ?? row['Email'] ?? ''),
        password: String(row['Password'] ?? row['Kata Sandi'] ?? ''),
        role: String(row['Role'] ?? row['Hak Akses'] ?? 'guru'),
        gender: String(row['L/P'] ?? row['Jenis Kelamin'] ?? 'L'),
        school: String(row['Unit Sekolah'] ?? row['Sekolah'] ?? defaultSchool),
        assignedClasses: String(row['Kelas Diampu'] ?? row['Kelas'] ?? ''),
        assignedSubjects: String(row['Mapel Diampu'] ?? row['Mata Pelajaran'] ?? ''),
        photoDataUrl: String(row['Foto URL'] ?? row['Link Foto'] ?? ''),
      }));
      applyImportedUsers(mapped);
    } catch {
      onNotify('Gagal membaca file Excel/CSV pengguna.');
    } finally {
      if (userFileRef.current) userFileRef.current.value = '';
    }
  };

  const handleVerifyAdminUnlock = async () => {
    if (!onServerUnlockAdmin) {
      onNotify('Untuk akses Admin di mode Firebase Cloud, masuk menggunakan akun Google Admin.');
      return;
    }
    if (!adminUnlockEmail.trim() || !adminUnlockPass) {
      onNotify('Username/Email dan Password Admin wajib diisi.');
      return;
    }
    setUnlockLoading(true);
    try {
      const err = await onServerUnlockAdmin(adminUnlockEmail.trim(), adminUnlockPass);
      if (err) {
        onNotify(err);
        return;
      }
      setAdminUnlockPass('');
    } finally {
      setUnlockLoading(false);
    }
  };

  const isPage = variant === 'page';

  const contentCard = (
    <div
      className={
        isPage
          ? 'w-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col'
          : 'w-full max-w-5xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]'
      }
      onClick={isPage ? undefined : (e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-indigo-300" />
          </div>
          <div className="min-w-0">
            <h2 id="admin-users-modal-title" className="text-base font-bold text-white truncate">
              Pengaturan Admin & Manajemen Pengguna (Multi-Role)
            </h2>
            <p className="text-xs text-slate-300 truncate">
              Sesi Aktif: <strong className="text-white">{USER_ROLE_LABELS[currentUserRole]}</strong> ·{' '}
              Kelola akun Admin, Guru Mapel, Wali Kelas, Kepala Sekolah & Karyawan/Staff
            </p>
          </div>
        </div>
        {!isPage && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label="Tutup pop-up admin dan pengguna"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className={isPage ? 'p-6 space-y-6' : 'p-6 space-y-6 overflow-y-auto eguru-scroll'}>
          {currentUserRole !== 'admin' ? (
            <div className="p-5 rounded-xl border border-amber-200 bg-amber-50 space-y-4">
              <div className="flex items-start gap-3">
                <KeyRound className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-900">
                    Panel Pengaturan Admin Terkunci untuk Role {USER_ROLE_LABELS[currentUserRole]}
                  </p>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {onServerUnlockAdmin ? (
                      <>
                        Pembuatan dan pengelolaan akun pengguna hanya dapat dilakukan oleh{' '}
                        <strong>Admin Sistem</strong>. Masukkan kredensial Admin Server untuk beralih ke mode Admin.
                      </>
                    ) : (
                      <>
                        Pembuatan dan pengelolaan akun pengguna hanya dapat dilakukan oleh{' '}
                        <strong>Admin Sistem</strong> yang masuk dengan akun Google Admin.
                      </>
                    )}
                  </p>
                </div>
              </div>

              {onServerUnlockAdmin && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Username atau Email Admin
                    </label>
                    <input
                      type="text"
                      value={adminUnlockEmail}
                      onChange={(e) => setAdminUnlockEmail(e.target.value)}
                      placeholder="admin"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Password Admin
                    </label>
                    <input
                      type="password"
                      value={adminUnlockPass}
                      onChange={(e) => setAdminUnlockPass(e.target.value)}
                      placeholder="Masukkan password admin"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                  <div>
                    <button
                      type="button"
                      disabled={unlockLoading}
                      onClick={handleVerifyAdminUnlock}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      <UserCheck className="w-4 h-4 text-indigo-300" />
                      <span>{unlockLoading ? 'Memverifikasi...' : 'Aktifkan Mode Admin'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Form Tambah / Edit User */}
              <form
                onSubmit={handleSaveUser}
                className="p-5 rounded-xl border border-slate-200 bg-slate-50 space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>
                      {editingUserId ? 'Edit Pengguna Terpilih' : 'Buat Akun Pengguna Baru'}
                    </span>
                  </h3>
                  {editingUserId && (
                    <button
                      type="button"
                      onClick={resetUserForm}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Batal Edit</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Lengkap
                    </label>
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Nama & Gelar"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      NIP / ID Pegawai
                    </label>
                    <input
                      type="text"
                      value={userNip}
                      onChange={(e) => setUserNip(e.target.value)}
                      placeholder="19900101 201502 1 002"
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Username (Opsional)
                    </label>
                    <input
                      type="text"
                      value={userUsername}
                      onChange={(e) => setUserUsername(e.target.value)}
                      placeholder="Otomatis dari email"
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Email Login
                    </label>
                    <input
                      type="email"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder="user@sman1nusantara.sch.id"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {editingUserId
                        ? 'Password Baru (Opsional)'
                        : isCloudMode
                          ? 'Password Server (Opsional)'
                          : 'Password Login (min. 6)'}
                    </label>
                    <input
                      type="password"
                      value={userPassword}
                      onChange={(e) => setUserPassword(e.target.value)}
                      placeholder={
                        editingUserId
                          ? 'Kosongkan jika tetap'
                          : isCloudMode
                            ? 'Opsional untuk Google'
                            : 'Minimal 6 karakter'
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                  <div className="lg:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Role / Hak Akses
                    </label>
                    <select
                      value={userRole}
                      onChange={(e) => setUserRole(e.target.value as UserRole)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    >
                      <option value="admin">Admin Sistem</option>
                      <option value="guru">Guru Mapel</option>
                      <option value="wali_kelas">Wali Kelas</option>
                      <option value="kepala_sekolah">Kepala Sekolah</option>
                      <option value="karyawan">Karyawan / Staff</option>
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Jenis Kelamin
                    </label>
                    <select
                      value={userGender}
                      onChange={(e) => setUserGender(e.target.value as 'L' | 'P')}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    >
                      <option value="L">L (Laki-laki)</option>
                      <option value="P">P (Perempuan)</option>
                    </select>
                  </div>

                  <div className="lg:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Unit Sekolah
                    </label>
                    <input
                      type="text"
                      value={userSchool}
                      onChange={(e) => setUserSchool(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>

                  <div className="lg:col-span-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Foto Pengguna (Unggah atau Link URL)
                    </label>
                    <div className="flex items-center gap-2">
                      <img
                        src={getUserPhotoUrl({
                          photoDataUrl: userPhotoDataUrl,
                          role: userRole,
                          gender: userGender,
                        })}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = getUserPhotoUrl({
                            photoDataUrl: '',
                            role: userRole,
                            gender: userGender,
                          });
                        }}
                        alt="Preview User"
                        className="w-9 h-9 rounded-lg object-cover object-top border border-slate-300 bg-white shrink-0"
                      />
                      <div className="relative flex-1 min-w-[110px]">
                        <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="url"
                          value={userPhotoDataUrl.startsWith('data:') ? '' : userPhotoDataUrl}
                          onChange={(e) => setUserPhotoDataUrl(e.target.value)}
                          placeholder="https://.../foto.jpg"
                          className="w-full pl-8 pr-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        />
                      </div>
                      <label className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap shrink-0">
                        <ImagePlus className="w-3.5 h-3.5 text-indigo-600" />
                        <span>File</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleUserPhotoUpload(e.target.files?.[0])}
                          className="hidden"
                        />
                      </label>
                      {userPhotoDataUrl && (
                        <button
                          type="button"
                          onClick={() => setUserPhotoDataUrl('')}
                          className="px-2 py-2 rounded-lg border border-rose-200 bg-white text-xs text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0"
                          title="Kembali ke foto dummy"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-6 flex items-center pt-1">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userActive}
                        onChange={(e) => setUserActive(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>Akun Aktif</span>
                    </label>
                  </div>

                  {(userRole === 'guru' || userRole === 'wali_kelas') && (
                    <div className="lg:col-span-12 p-4 rounded-xl border border-indigo-200 bg-white space-y-3">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          Pembagian Tugas Mengajar & Tanggung Jawab Kelas ({USER_ROLE_LABELS[userRole]})
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Centang kelas dan mata pelajaran yang menjadi tanggung jawab guru ini. Saat login, hanya data kelas & mapel terpilih yang ditampilkan (kosongkan centang untuk akses seluruh data).
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-800 inline-flex items-center gap-1.5">
                              <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Kelas Diampu ({userAssignedClasses.length}/{allClasses.length})</span>
                            </span>
                            <div className="flex items-center gap-2 text-[11px]">
                              <button
                                type="button"
                                onClick={() => setUserAssignedClasses([...allClasses])}
                                className="font-semibold text-indigo-600 hover:underline cursor-pointer"
                              >
                                Semua
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => setUserAssignedClasses([])}
                                className="font-semibold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                              >
                                Kosongkan
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto eguru-scroll">
                            {allClasses.map((cls) => {
                              const checked = userAssignedClasses.includes(cls);
                              return (
                                <label
                                  key={cls}
                                  className={`flex items-center gap-2 px-2 py-1 rounded border text-xs cursor-pointer ${
                                    checked
                                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold'
                                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleUserClass(cls)}
                                    className="rounded border-slate-300 text-indigo-600"
                                  />
                                  <span className="truncate">{cls}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-800 inline-flex items-center gap-1.5">
                              <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Mapel Diampu ({userAssignedSubjects.length}/{allSubjects.length})</span>
                            </span>
                            <div className="flex items-center gap-2 text-[11px]">
                              <button
                                type="button"
                                onClick={() => setUserAssignedSubjects([...allSubjects])}
                                className="font-semibold text-indigo-600 hover:underline cursor-pointer"
                              >
                                Semua
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => setUserAssignedSubjects([])}
                                className="font-semibold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                              >
                                Kosongkan
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-1.5 max-h-32 overflow-y-auto eguru-scroll">
                            {allSubjects.map((subj) => {
                              const checked = userAssignedSubjects.includes(subj);
                              return (
                                <label
                                  key={subj}
                                  className={`flex items-center gap-2 px-2 py-1 rounded border text-xs cursor-pointer ${
                                    checked
                                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold'
                                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleUserSubject(subj)}
                                    className="rounded border-slate-300 text-indigo-600"
                                  />
                                  <span className="truncate">{subj}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="lg:col-span-6 lg:col-start-7 flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{editingUserId ? 'Simpan Perubahan Akun' : 'Tambah Akun User'}</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* Toolbar Template / Impor / Ekspor / Hapus Terpilih Pengguna */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-600">
                  Total <span className="font-bold text-slate-900 tabular-nums">{users.length}</span>{' '}
                  akun terdaftar
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadUserTemplate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Template</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUserImport((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-300" />
                    <span>{showUserImport ? 'Tutup Impor' : 'Impor'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportUsers}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>
                      {selectedUserIds.length > 0
                        ? `Ekspor (${selectedUserIds.length})`
                        : 'Ekspor Excel'}
                    </span>
                  </button>
                  {selectedUserIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleBulkDeleteUsers}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Terpilih ({selectedUserIds.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {showUserImport && (
                <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Kotak Impor Akun Pengguna</h4>
                      <p className="text-[11px] text-slate-600">
                        Urutan:{' '}
                        <span className="font-mono font-semibold">
                          Nama [Tab] NIP [Tab] Email [Tab] Password [Tab] Role [Tab] L/P [Tab] Sekolah [Tab] Foto URL [Tab] Kelas Diampu [Tab] Mapel Diampu
                        </span>
                      </p>
                    </div>
                    <div>
                      <input
                        ref={userFileRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleUserFileUpload}
                        className="hidden"
                        id="modal-upload-users-excel"
                      />
                      <label
                        htmlFor="modal-upload-users-excel"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Pilih File Excel / CSV</span>
                      </label>
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    value={userPasteText}
                    onChange={(e) => setUserPasteText(e.target.value)}
                    placeholder={`Dewi Anggraini\t19920101 201903 2 001\tdewi@sman1nusantara.sch.id\tMinimal6Karakter\tguru\tP\t${defaultSchool}`}
                    className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowUserImport(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleImportUsersPaste}
                      disabled={!userPasteText.trim()}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                    >
                      Proses Impor Pengguna
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Tabel Daftar Pengguna & Role */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="max-h-[340px] overflow-auto eguru-scroll">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-900 text-white text-xs">
                  <tr>
                    {currentUserRole === 'admin' && (
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={users.length > 0 && users.every((u) => selectedUserIds.includes(u.id))}
                          onChange={toggleSelectAllUsers}
                          aria-label="Pilih semua pengguna"
                          className="rounded border-slate-400 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="py-2.5 px-4 font-semibold">Nama Pengguna</th>
                    <th className="py-2.5 px-3 font-semibold">Email Login</th>
                    <th className="py-2.5 px-3 font-semibold">Role</th>
                    <th className="py-2.5 px-3 font-semibold min-w-[200px]">Tanggung Jawab (Kelas & Mapel)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                    {currentUserRole === 'admin' && (
                      <th className="py-2.5 px-4 font-semibold text-right">Aksi</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {users.map((u) => {
                    const isCurrent = u.email.toLowerCase() === currentUserEmail.toLowerCase();
                    const isTeaching = u.role === 'guru' || u.role === 'wali_kelas';
                    const clsList = u.assignedClasses || [];
                    const subjList = u.assignedSubjects || [];
                    return (
                      <tr key={u.id} className="hover:bg-slate-50">
                        {currentUserRole === 'admin' && (
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedUserIds.includes(u.id)}
                              onChange={() => toggleSelectUser(u.id)}
                              aria-label={`Pilih pengguna ${u.name}`}
                              className="rounded border-slate-300 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={getUserPhotoUrl(u)}
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = getUserPhotoUrl({
                                  photoDataUrl: '',
                                  role: u.role,
                                  gender: u.gender,
                                });
                              }}
                              alt={u.name}
                              className="w-9 h-9 rounded-full object-cover object-top border border-slate-200 bg-white shrink-0"
                            />
                            <div>
                              <div className="font-semibold text-slate-900">
                                {u.name}{' '}
                                {isCurrent && (
                                  <span className="text-[11px] font-medium text-indigo-600">(Anda)</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                                NIP. {u.nip} · {u.gender === 'L' ? 'L' : 'P'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">
                          <div>{u.email}</div>
                          {u.username && (
                            <div className="text-[11px] text-slate-400">@{u.username}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-indigo-700 whitespace-nowrap">
                          {USER_ROLE_LABELS[u.role]}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-600">
                          {isTeaching ? (
                            <div className="space-y-0.5">
                              <div>
                                <span className="font-semibold text-slate-800">Kelas:</span>{' '}
                                {clsList.length > 0 ? clsList.join(', ') : 'Semua Kelas'}
                              </div>
                              <div>
                                <span className="font-semibold text-slate-800">Mapel:</span>{' '}
                                {subjList.length > 0 ? subjList.join(', ') : 'Semua Mapel'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">Seluruh Data Sekolah</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {currentUserRole === 'admin' ? (
                            <button
                              type="button"
                              onClick={() => handleToggleUserActive(u)}
                              className={`px-2 py-0.5 rounded border text-[11px] font-semibold cursor-pointer ${
                                u.active
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}
                            >
                              {u.active ? 'Aktif' : 'Nonaktif'}
                            </button>
                          ) : (
                            <span className={u.active ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                              {u.active ? 'Aktif' : 'Nonaktif'}
                            </span>
                          )}
                        </td>
                        {currentUserRole === 'admin' && (
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEditUserClick(u)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer"
                              >
                                <FileEdit className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-50 cursor-pointer"
                                aria-label={`Hapus pengguna ${u.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Perubahan daftar akun pengguna tersimpan otomatis secara persisten
          </p>
          {!isPage && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Tutup
            </button>
          )}
        </div>
      </div>
  );

  if (isPage) {
    return contentCard;
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-users-modal-title"
    >
      {contentCard}
    </div>
  );
};
