import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  Check,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileEdit,
  FileSpreadsheet,
  GraduationCap,
  ImagePlus,
  KeyRound,
  Link2,
  Plus,
  Printer,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { AppUser, GradeRecord, JournalEntry, UserRole } from '../types';
import { getUserPhotoUrl, hasRealPhoto } from '../utils/defaultAvatars';
import { generateId, USER_ROLE_LABELS } from '../utils/helpers';

function generateStaffPassword(length = 10): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%';
  const all = upper + lower + digits + symbols;
  const pick = (pool: string) => {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return pool[arr[0] % pool.length];
  };
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

interface StaffTeachersViewProps {
  users: AppUser[];
  journals: JournalEntry[];
  grades: GradeRecord[];
  allClasses: string[];
  allSubjects: string[];
  defaultSchool: string;
  currentUserEmail: string;
  isCloudMode?: boolean;
  isServerMode?: boolean;
  onUpdateUsers: (nextUsers: AppUser[]) => void;
  onPrintTeacherHistory: (teacherId: string) => void;
  onNotify: (msg: string) => void;
}

export const StaffTeachersView: React.FC<StaffTeachersViewProps> = ({
  users,
  journals,
  grades,
  allClasses,
  allSubjects,
  defaultSchool,
  currentUserEmail,
  isCloudMode = false,
  isServerMode = false,
  onUpdateUsers,
  onPrintTeacherHistory,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'aktif' | 'nonaktif'>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Import panel
  const [showImport, setShowImport] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Form Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [nip, setNip] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [role, setRole] = useState<UserRole>('guru');
  const [gender, setGender] = useState<'L' | 'P'>('L');
  const [school, setSchool] = useState(defaultSchool);
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [assignedSubjects, setAssignedSubjects] = useState<string[]>([]);
  const [active, setActive] = useState(true);

  const [bulkStaffPass, setBulkStaffPass] = useState('');
  const [showBulkStaffPass, setShowBulkStaffPass] = useState(true);

  const activityStatsByUser = useMemo(() => {
    const map = new Map<string, { journalCount: number; gradeCount: number }>();
    users.forEach((u) => {
      const lowerName = u.name.trim().toLowerCase();
      const jCount = journals.filter(
        (j) =>
          j.teacherId === u.id ||
          (!j.teacherId && j.teacherName?.trim().toLowerCase() === lowerName)
      ).length;
      const gCount = grades.filter(
        (g) =>
          g.score !== null &&
          (g.teacherId === u.id ||
            (!g.teacherId && g.teacherName?.trim().toLowerCase() === lowerName))
      ).length;
      map.set(u.id, { journalCount: jCount, gradeCount: gCount });
    });
    return map;
  }, [users, journals, grades]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users
      .filter((u) => {
        if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
        if (statusFilter === 'aktif' && !u.active) return false;
        if (statusFilter === 'nonaktif' && u.active) return false;
        if (q) {
          return (
            u.name.toLowerCase().includes(q) ||
            u.nip.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            USER_ROLE_LABELS[u.role].toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, searchQuery, roleFilter, statusFilter]);

  const kpi = useMemo(() => {
    const teachers = users.filter((u) => u.role === 'guru' || u.role === 'wali_kelas').length;
    const staffAndExec = users.filter(
      (u) => u.role === 'karyawan' || u.role === 'kepala_sekolah' || u.role === 'admin'
    ).length;
    const activeCount = users.filter((u) => u.active).length;
    return { total: users.length, teachers, staffAndExec, activeCount };
  }, [users]);

  const openCreateModal = () => {
    setEditingId(null);
    setUsername('');
    setName('');
    setNip('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setCopiedCreds(false);
    setRole('guru');
    setGender('L');
    setSchool(defaultSchool);
    setPhotoDataUrl('');
    setAssignedClasses([]);
    setAssignedSubjects([]);
    setActive(true);
    setFormOpen(true);
  };

  const openEditModal = (u: AppUser) => {
    setEditingId(u.id);
    setUsername(u.username || '');
    setName(u.name);
    setNip(u.nip);
    setEmail(u.email);
    setPassword('');
    setShowPassword(false);
    setCopiedCreds(false);
    setRole(u.role);
    setGender(u.gender);
    setSchool(u.school);
    setPhotoDataUrl(u.photoDataUrl || '');
    setAssignedClasses(u.assignedClasses ? [...u.assignedClasses] : []);
    setAssignedSubjects(u.assignedSubjects ? [...u.assignedSubjects] : []);
    setActive(u.active);
    setFormOpen(true);
  };

  const unconfiguredUsers = isServerMode ? users.filter((u) => u.hasPassword === false) : [];

  const handleCopyModalCredentials = async () => {
    const loginId =
      username.trim().toLowerCase() || email.trim().split('@')[0]?.toLowerCase() || email.trim();
    if (!loginId || !password.trim()) return;
    const text = `Portal E-Guru (${USER_ROLE_LABELS[role]})\nNama: ${name.trim() || '-'}\nUsername: ${loginId}\nEmail: ${email.trim() || '-'}\nPassword: ${password.trim()}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCreds(true);
      window.setTimeout(() => setCopiedCreds(false), 2500);
      onNotify('Kredensial akun disalin ke clipboard.');
    } catch {
      onNotify('Tidak dapat menyalin ke clipboard.');
    }
  };

  const handleApplyBulkStaffPassword = () => {
    const cleanPass = bulkStaffPass.trim();
    if (cleanPass.length < 6) {
      onNotify('Password awal minimal 6 karakter.');
      return;
    }
    if (unconfiguredUsers.length === 0) return;
    const targetIds = new Set(unconfiguredUsers.map((u) => u.id));
    onUpdateUsers(users.map((u) => (targetIds.has(u.id) ? { ...u, password: cleanPass } : u)));
    const summary = unconfiguredUsers
      .map(
        (u, idx) =>
          `${idx + 1}. ${u.username || u.email.split('@')[0]} (${USER_ROLE_LABELS[u.role]}) | ${u.email} | Password: ${cleanPass}`
      )
      .join('\n');
    try {
      void navigator.clipboard.writeText(`=== KREDENSIAL AKUN PORTAL E-GURU ===\n${summary}`);
    } catch {
      // ignore clipboard errors
    }
    onNotify(
      `${unconfiguredUsers.length} akun berhasil diaktifkan dengan password baru (daftar kredensial disalin).`
    );
    setBulkStaffPass('');
  };

  const handlePhotoUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPass = password.trim();
    const derivedUsername =
      username.trim().toLowerCase().replace(/[^a-z0-9._@-]/g, '') ||
      trimmedEmail.split('@')[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, '') ||
      '';

    if (!trimmedName || !trimmedEmail) {
      onNotify('Nama lengkap dan email login wajib diisi.');
      return;
    }

    if (!editingId && isServerMode && trimmedPass.length < 6) {
      onNotify('Password akun baru di server minimal 6 karakter.');
      return;
    }

    if (trimmedPass.length > 0 && trimmedPass.length < 6) {
      onNotify('Password minimal 6 karakter (atau kosongkan jika tidak ingin mengubah password).');
      return;
    }

    const dup = users.find(
      (u) => u.email.toLowerCase() === trimmedEmail.toLowerCase() && u.id !== editingId
    );
    if (dup) {
      onNotify('Email tersebut sudah terdaftar pada pegawai/akun lain.');
      return;
    }

    const isTeachingRole = role === 'guru' || role === 'wali_kelas';
    const cleanClasses = isTeachingRole
      ? allClasses.filter((c) => assignedClasses.includes(c))
      : [];
    const cleanSubjects = isTeachingRole
      ? allSubjects.filter((s) => assignedSubjects.includes(s))
      : [];

    if (editingId) {
      const next = users.map((u) =>
        u.id === editingId
          ? {
              ...u,
              username: derivedUsername || u.username,
              name: trimmedName,
              nip: nip.trim() || '-',
              email: trimmedEmail,
              password: trimmedPass,
              role,
              gender,
              school: school.trim() || defaultSchool,
              photoDataUrl: photoDataUrl.trim(),
              assignedClasses: cleanClasses,
              assignedSubjects: cleanSubjects,
              active,
            }
          : u
      );
      onUpdateUsers(next);
      onNotify(`Data ${trimmedName} (${USER_ROLE_LABELS[role]}) berhasil diperbarui.`);
    } else {
      const created: AppUser = {
        id: generateId('usr'),
        username: derivedUsername,
        name: trimmedName,
        nip: nip.trim() || '-',
        email: trimmedEmail,
        password: trimmedPass,
        role,
        gender,
        school: school.trim() || defaultSchool,
        photoDataUrl: photoDataUrl.trim(),
        assignedClasses: cleanClasses,
        assignedSubjects: cleanSubjects,
        active,
        createdAt: new Date().toISOString(),
      };
      onUpdateUsers([...users, created]);
      onNotify(`${created.name} (${USER_ROLE_LABELS[created.role]}) berhasil ditambahkan.`);
    }
    setFormOpen(false);
  };

  const handleToggleActive = (u: AppUser) => {
    const activeAdmins = users.filter((usr) => usr.role === 'admin' && usr.active);
    if (u.role === 'admin' && u.active && activeAdmins.length <= 1) {
      onNotify('Minimal harus ada 1 akun Admin Sistem yang tetap aktif.');
      return;
    }
    onUpdateUsers(users.map((usr) => (usr.id === u.id ? { ...usr, active: !usr.active } : usr)));
  };

  const handleDeleteOne = (u: AppUser) => {
    const admins = users.filter((usr) => usr.role === 'admin');
    if (u.role === 'admin' && admins.length <= 1) {
      onNotify('Tidak dapat menghapus Admin Sistem terakhir.');
      return;
    }
    if (u.email.toLowerCase() === currentUserEmail.toLowerCase()) {
      onNotify('Tidak dapat menghapus akun yang sedang aktif login saat ini.');
      return;
    }
    onUpdateUsers(users.filter((usr) => usr.id !== u.id));
    setSelectedIds((prev) => prev.filter((id) => id !== u.id));
    onNotify(`Data ${u.name} dihapus.`);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredUsers.map((u) => u.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : visibleIds);
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    let remainingAdmins = users.filter((u) => u.role === 'admin').length;
    const deleted: string[] = [];
    selectedIds.forEach((id) => {
      const target = users.find((u) => u.id === id);
      if (!target) return;
      if (target.email.toLowerCase() === currentUserEmail.toLowerCase()) return;
      if (target.role === 'admin') {
        if (remainingAdmins <= 1) return;
        remainingAdmins--;
      }
      deleted.push(id);
    });
    if (deleted.length === 0) {
      onNotify('Akun yang sedang aktif login atau Admin terakhir tidak bisa dihapus.');
      return;
    }
    onUpdateUsers(users.filter((u) => !deleted.includes(u.id)));
    setSelectedIds([]);
    onNotify(`${deleted.length} data guru/karyawan berhasil dihapus.`);
  };

  const handleDownloadTemplate = () => {
    const rows = [
      {
        'Nama Lengkap': 'Contoh Guru Mapel, S.Pd.',
        NIP: '19880412 201501 1 002',
        'Email Login': 'guru.baru@sman1nusantara.sch.id',
        Password: '',
        Role: 'guru',
        'L/P': 'L',
        'Unit Sekolah': defaultSchool,
        'Kelas Diampu': allClasses.slice(0, 2).join(', '),
        'Mapel Diampu': allSubjects.slice(0, 1).join(', '),
        'Foto URL': '',
      },
      {
        'Nama Lengkap': 'Contoh Karyawan TU',
        NIP: '19930510 201902 2 004',
        'Email Login': 'staff.baru@sman1nusantara.sch.id',
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
    XLSX.utils.book_append_sheet(wb, ws, 'Template Guru Karyawan');
    XLSX.writeFile(wb, 'Template_Guru_Karyawan_EGuru.xlsx');
    onNotify('Template Excel Data Guru & Karyawan berhasil diunduh.');
  };

  const handleExport = () => {
    const targetList =
      selectedIds.length > 0 ? users.filter((u) => selectedIds.includes(u.id)) : filteredUsers;
    const rows = targetList.map((u, idx) => {
      const stats = activityStatsByUser.get(u.id) || { journalCount: 0, gradeCount: 0 };
      return {
        No: idx + 1,
        'Nama Lengkap': u.name,
        NIP: u.nip,
        'Email Login': u.email,
        Role: USER_ROLE_LABELS[u.role],
        'L/P': u.gender,
        'Unit Sekolah': u.school,
        'Kelas Diampu': (u.assignedClasses || []).join(', ') || '-',
        'Mapel Diampu': (u.assignedSubjects || []).join(', ') || '-',
        'Jurnal Mengajar': stats.journalCount,
        'Nilai Diinput': stats.gradeCount,
        Status: u.active ? 'Aktif' : 'Nonaktif',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Guru & Karyawan');
    XLSX.writeFile(wb, 'Data_Guru_Karyawan_EGuru.xlsx');
    onNotify(`Berhasil mengekspor ${rows.length} data guru & karyawan ke Excel.`);
  };

  const normalizeImportedRole = (raw: string): UserRole => {
    const low = raw.trim().toLowerCase();
    if (low.includes('admin')) return 'admin';
    if (low.includes('wali')) return 'wali_kelas';
    if (low.includes('kepala')) return 'kepala_sekolah';
    if (low.includes('karyawan') || low.includes('staff') || low.includes('tu')) return 'karyawan';
    return 'guru';
  };

  const splitList = (raw?: string): string[] =>
    String(raw || '')
      .split(/[,;|]/)
      .map((x) => x.trim())
      .filter(Boolean);

  const applyImportedRows = (
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
    const existing = new Set(users.map((u) => u.email.toLowerCase()));
    const added: AppUser[] = [];
    let skippedShortPass = 0;
    const nowIso = new Date().toISOString();

    rawRows.forEach((r) => {
      const cleanName = String(r.name || '').trim();
      const cleanEmail = String(r.email || '').trim();
      if (!cleanName || !cleanEmail || cleanEmail.toLowerCase().includes('email login')) return;
      if (existing.has(cleanEmail.toLowerCase())) return;
      const cleanPass = String(r.password || '').trim();
      if (cleanPass.length > 0 && cleanPass.length < 6) {
        skippedShortPass++;
        return;
      }
      existing.add(cleanEmail.toLowerCase());
      const parsedRole = normalizeImportedRole(r.role || 'guru');
      const isTeaching = parsedRole === 'guru' || parsedRole === 'wali_kelas';
      added.push({
        id: generateId('usr'),
        username: cleanEmail.split('@')[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, ''),
        name: cleanName,
        nip: String(r.nip || '-').trim() || '-',
        email: cleanEmail,
        password: cleanPass,
        role: parsedRole,
        gender: String(r.gender || 'L').trim().toUpperCase().startsWith('P') ? 'P' : 'L',
        school: String(r.school || defaultSchool).trim() || defaultSchool,
        photoDataUrl: String(r.photoDataUrl || '').trim(),
        assignedClasses: isTeaching ? splitList(r.assignedClasses) : [],
        assignedSubjects: isTeaching ? splitList(r.assignedSubjects) : [],
        active: true,
        createdAt: nowIso,
      });
    });

    if (added.length === 0) {
      onNotify(
        skippedShortPass > 0
          ? `${skippedShortPass} baris dilewati karena password kurang dari 6 karakter.`
          : 'Tidak ada data baru yang valid atau email sudah terdaftar.'
      );
      return;
    }

    onUpdateUsers([...users, ...added]);
    setPasteText('');
    setShowImport(false);
    const noPassCount = added.filter((a) => !a.password).length;
    onNotify(
      `Berhasil mengimpor ${added.length} data guru & karyawan.${
        skippedShortPass > 0 ? ` (${skippedShortPass} baris password < 6 karakter dilewati).` : ''
      }${
        isServerMode && noPassCount > 0
          ? ` ${noPassCount} akun belum memiliki password — tetapkan password di banner/edit.`
          : ''
      }`
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        role: String(row['Role'] ?? row['Jabatan'] ?? 'guru'),
        gender: String(row['L/P'] ?? row['Jenis Kelamin'] ?? 'L'),
        school: String(row['Unit Sekolah'] ?? row['Sekolah'] ?? defaultSchool),
        assignedClasses: String(row['Kelas Diampu'] ?? row['Kelas'] ?? ''),
        assignedSubjects: String(row['Mapel Diampu'] ?? row['Mata Pelajaran'] ?? ''),
        photoDataUrl: String(row['Foto URL'] ?? row['Link Foto'] ?? ''),
      }));
      applyImportedRows(mapped);
    } catch {
      onNotify('Gagal membaca file Excel/CSV pegawai.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePasteImport = () => {
    const lines = pasteText
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
        assignedClasses: cols[7] || '',
        assignedSubjects: cols[8] || '',
      };
    });
    applyImportedRows(parsed);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* KPI Summary */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-medium text-slate-500">Total Guru &amp; Karyawan</p>
            <p className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">{kpi.total}</p>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-medium text-slate-500">Guru &amp; Wali Kelas</p>
            <p className="mt-1 text-xl sm:text-2xl font-bold text-indigo-700 tabular-nums">{kpi.teachers}</p>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-medium text-slate-500">Karyawan, Kepsek &amp; Admin</p>
            <p className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">{kpi.staffAndExec}</p>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Briefcase className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-medium text-slate-500">Status Akun Aktif</p>
            <p className="mt-1 text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums">{kpi.activeCount}</p>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </section>

      {/* Main Directory Table */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 bg-slate-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold">Direktori Khusus Data Guru &amp; Karyawan</h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Kelola biodata pendidik, tenaga kependidikan, pembagian kelas/mapel, serta cetak riwayat mengajar &amp; penilaian tiap guru
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
              <span>Template Excel</span>
            </button>
            <button
              type="button"
              onClick={() => setShowImport((v) => !v)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
              <span>{showImport ? 'Tutup Impor' : 'Impor Excel'}</span>
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span>{selectedIds.length > 0 ? `Ekspor (${selectedIds.length})` : 'Ekspor Excel'}</span>
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Tambah Pegawai</span>
            </button>
          </div>
        </div>

        {isServerMode && unconfiguredUsers.length > 0 && (
          <div className="p-4 sm:p-5 bg-amber-50/90 border-b border-amber-200 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5 text-xs">
                <p className="font-bold text-slate-900">
                  {unconfiguredUsers.length} Akun Belum Memiliki Password Login Server
                </p>
                <p className="text-slate-600">
                  Akun:{' '}
                  <span className="font-mono font-semibold text-slate-800">
                    {unconfiguredUsers.map((u) => u.username || u.email.split('@')[0]).join(', ')}
                  </span>
                  . Tetapkan password awal sekarang agar seluruh akun dapat login ke server.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1 flex items-center rounded-lg border border-amber-300 bg-white overflow-hidden">
                <input
                  type={showBulkStaffPass ? 'text' : 'password'}
                  value={bulkStaffPass}
                  onChange={(e) => setBulkStaffPass(e.target.value)}
                  placeholder="Password awal (min. 6 karakter)"
                  className="w-full px-3 py-2 text-xs font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowBulkStaffPass((v) => !v)}
                  className="px-2 text-slate-500 hover:text-slate-800 cursor-pointer"
                  aria-label="Tampilkan atau sembunyikan password"
                >
                  {showBulkStaffPass ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBulkStaffPass(generateStaffPassword(10));
                  setShowBulkStaffPass(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-xs font-semibold text-amber-900 cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Buat Otomatis</span>
              </button>
              <button
                type="button"
                onClick={handleApplyBulkStaffPassword}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Aktifkan ({unconfiguredUsers.length} Akun)</span>
              </button>
            </div>
          </div>
        )}

        {/* Import Panel */}
        {showImport && (
          <div className="p-4 sm:p-5 bg-indigo-50/40 border-b border-indigo-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-900">Impor Massal Data Guru &amp; Karyawan</p>
                <p className="text-[11px] text-slate-600">
                  Unggah file .XLSX/.CSV sesuai template atau tempel data: Nama, NIP, Email, Password, Role, L/P, Sekolah, Kelas, Mapel.
                </p>
              </div>
              <label className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg border border-indigo-300 bg-white text-indigo-700 text-xs font-semibold cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Pilih File Excel / CSV</span>
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
              rows={3}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Budi Santoso, S.Pd.&#9;19870101 201201 1 001&#9;budi@sekolah.sch.id&#9;Minimal6Karakter&#9;guru&#9;L"
              className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handlePasteImport}
                disabled={!pasteText.trim()}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                Impor Teks
              </button>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 flex-1">
            <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, NIP, atau email..."
                className="w-full min-h-[40px] pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as 'ALL' | UserRole)}
                className="w-full sm:w-auto min-h-[40px] px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="ALL">Semua Jabatan / Role</option>
                <option value="guru">Guru Mapel</option>
                <option value="wali_kelas">Wali Kelas</option>
                <option value="kepala_sekolah">Kepala Sekolah</option>
                <option value="karyawan">Karyawan / Staff</option>
                <option value="admin">Admin Sistem</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'aktif' | 'nonaktif')}
                className="w-full sm:w-auto min-h-[40px] px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="ALL">Semua Status</option>
                <option value="aktif">Aktif</option>
                <option value="nonaktif">Nonaktif</option>
              </select>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={handleBulkDelete}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Terpilih ({selectedIds.length})</span>
            </button>
          )}
        </div>

        {/* Mobile & Tablet Card List View */}
        <div className="lg:hidden">
          {filteredUsers.length > 0 && (
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer min-h-[36px]">
                <input
                  type="checkbox"
                  checked={
                    filteredUsers.length > 0 &&
                    filteredUsers.every((u) => selectedIds.includes(u.id))
                  }
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-slate-300 cursor-pointer"
                />
                <span>Pilih Semua ({filteredUsers.length})</span>
              </label>
              {selectedIds.length > 0 && (
                <span className="text-[11px] font-semibold text-indigo-700 tabular-nums">
                  {selectedIds.length} terpilih
                </span>
              )}
            </div>
          )}

          <div className="divide-y divide-slate-200">
            {filteredUsers.length === 0 ? (
              <div className="py-10 px-4 text-center text-slate-500 text-xs">
                Tidak ada data guru atau karyawan yang sesuai dengan filter.
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isCurrent = u.email.toLowerCase() === currentUserEmail.toLowerCase();
                const isTeaching = u.role === 'guru' || u.role === 'wali_kelas';
                const stats = activityStatsByUser.get(u.id) || { journalCount: 0, gradeCount: 0 };
                const checked = selectedIds.includes(u.id);
                return (
                  <div
                    key={u.id}
                    className={`p-4 space-y-3 ${checked ? 'bg-indigo-50/40' : 'bg-white'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(u.id)}
                        aria-label={`Pilih ${u.name}`}
                        className="mt-2 w-4 h-4 rounded border-slate-300 cursor-pointer shrink-0"
                      />
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
                        className="w-11 h-11 rounded-xl object-cover object-top border border-slate-200 bg-white shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-slate-900 truncate">
                              {u.name}{' '}
                              {isCurrent && (
                                <span className="text-[11px] font-semibold text-indigo-600">(Anda)</span>
                              )}
                            </p>
                            <p className="text-[11px] font-mono text-slate-500 truncate">
                              NIP. {u.nip} · {u.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u)}
                            className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer shrink-0 ${
                              u.active
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                          >
                            {u.active ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-indigo-700">
                            {USER_ROLE_LABELS[u.role]}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono text-slate-600 truncate">{u.email}</span>
                          {isServerMode && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                u.hasPassword === false
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-sky-50 text-sky-700 border-sky-200'
                              }`}
                            >
                              {u.hasPassword === false ? 'Sandi Belum Diatur' : 'Sandi Aktif'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pl-7 space-y-1 text-xs text-slate-600">
                      {isTeaching ? (
                        <>
                          <div>
                            <span className="font-semibold text-slate-800">Kelas:</span>{' '}
                            {u.assignedClasses && u.assignedClasses.length > 0
                              ? u.assignedClasses.join(', ')
                              : 'Semua Kelas'}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-800">Mapel:</span>{' '}
                            {u.assignedSubjects && u.assignedSubjects.length > 0
                              ? u.assignedSubjects.join(', ')
                              : 'Semua Mapel'}
                          </div>
                        </>
                      ) : (
                        <div className="text-slate-400">Seluruh Unit Sekolah</div>
                      )}
                      <div className="flex items-center gap-3 pt-0.5 text-[11px] text-slate-500 tabular-nums">
                        <span className="font-semibold text-slate-700">
                          {stats.journalCount} Jurnal
                        </span>
                        <span>·</span>
                        <span>{stats.gradeCount} Nilai Terinput</span>
                      </div>
                    </div>

                    <div className="pl-7 flex flex-wrap items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => onPrintTeacherHistory(u.id)}
                        className="flex-1 min-w-[90px] min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Riwayat</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(u)}
                        className="flex-1 min-w-[80px] min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOne(u)}
                        className="min-h-[38px] min-w-[40px] inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer"
                        aria-label={`Hapus ${u.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto eguru-scroll">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-900 text-white text-xs">
              <tr>
                <th className="py-3 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredUsers.length > 0 &&
                      filteredUsers.every((u) => selectedIds.includes(u.id))
                    }
                    onChange={toggleSelectAll}
                    aria-label="Pilih semua guru dan karyawan"
                    className="rounded border-slate-400 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4 font-semibold">Pegawai / Pendidik</th>
                <th className="py-3 px-3 font-semibold">Jabatan (Role)</th>
                <th className="py-3 px-3 font-semibold">Email Login</th>
                <th className="py-3 px-3 font-semibold min-w-[200px]">Tanggung Jawab (Kelas &amp; Mapel)</th>
                <th className="py-3 px-3 font-semibold text-center">Aktivitas KBM</th>
                <th className="py-3 px-3 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    Tidak ada data guru atau karyawan yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrent = u.email.toLowerCase() === currentUserEmail.toLowerCase();
                  const isTeaching = u.role === 'guru' || u.role === 'wali_kelas';
                  const stats = activityStatsByUser.get(u.id) || { journalCount: 0, gradeCount: 0 };
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(u.id)}
                          onChange={() => toggleSelect(u.id)}
                          aria-label={`Pilih ${u.name}`}
                          className="rounded border-slate-300 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4">
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
                            className="w-10 h-10 rounded-lg object-cover object-top border border-slate-200 bg-white shrink-0"
                          />
                          <div>
                            <div className="font-bold text-slate-900">
                              {u.name}{' '}
                              {isCurrent && (
                                <span className="text-[11px] font-semibold text-indigo-600">(Anda)</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                              NIP. {u.nip} · {u.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-indigo-700 whitespace-nowrap">
                        {USER_ROLE_LABELS[u.role]}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700">{u.email}</td>
                      <td className="py-3 px-3 text-[11px] text-slate-600">
                        {isTeaching ? (
                          <div className="space-y-0.5">
                            <div>
                              <span className="font-semibold text-slate-800">Kelas:</span>{' '}
                              {u.assignedClasses && u.assignedClasses.length > 0
                                ? u.assignedClasses.join(', ')
                                : 'Semua Kelas'}
                            </div>
                            <div>
                              <span className="font-semibold text-slate-800">Mapel:</span>{' '}
                              {u.assignedSubjects && u.assignedSubjects.length > 0
                                ? u.assignedSubjects.join(', ')
                                : 'Semua Mapel'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">Seluruh Unit Sekolah</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex flex-col items-center gap-0.5 text-[11px] tabular-nums">
                          <span className="font-semibold text-slate-800 inline-flex items-center gap-1">
                            <ClipboardCheck className="w-3 h-3 text-indigo-600" />
                            <span>{stats.journalCount} Jurnal</span>
                          </span>
                          <span className="text-slate-500">{stats.gradeCount} Nilai</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u)}
                            className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer ${
                              u.active
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                          >
                            {u.active ? 'Aktif' : 'Nonaktif'}
                          </button>
                          {isServerMode && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                u.hasPassword === false
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-sky-50 text-sky-700 border-sky-200'
                              }`}
                            >
                              {u.hasPassword === false ? 'Belum Diatur' : 'Sandi Aktif'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onPrintTeacherHistory(u.id)}
                            title="Cetak Riwayat Aktivitas Mengajar & Penilaian Guru Ini"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Riwayat</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                          >
                            <FileEdit className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOne(u)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer"
                            aria-label={`Hapus ${u.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* Pop-up Form Tambah / Edit Guru & Karyawan */}
      {formOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/60 backdrop-blur-[1px]"
          onClick={() => setFormOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-3xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
              <h3 className="text-sm sm:text-base font-bold truncate">
                {editingId ? 'Edit Data Guru / Karyawan' : 'Tambah Data Guru / Karyawan Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center -mr-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
                aria-label="Tutup form pegawai"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-4 sm:p-6 space-y-5 overflow-y-auto eguru-scroll">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img
                    src={getUserPhotoUrl({ photoDataUrl, role, gender })}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      if (!hasRealPhoto(photoDataUrl)) {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = getUserPhotoUrl({ photoDataUrl: '', role, gender });
                      }
                    }}
                    alt={name || 'Preview Foto'}
                    className="w-16 h-16 rounded-xl object-cover object-top border border-slate-300 bg-white shrink-0"
                  />
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-slate-900">
                      Foto Profil{' '}
                      {hasRealPhoto(photoDataUrl) ? (
                        <span className="text-emerald-700">(Foto Asli Aktif)</span>
                      ) : (
                        <span className="text-slate-500">(Dummy {USER_ROLE_LABELS[role]})</span>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer">
                        <ImagePlus className="w-3.5 h-3.5" />
                        <span>{hasRealPhoto(photoDataUrl) ? 'Ganti File Foto' : 'Unggah Foto'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
                          className="hidden"
                        />
                      </label>
                      {hasRealPhoto(photoDataUrl) && (
                        <button
                          type="button"
                          onClick={() => setPhotoDataUrl('')}
                          className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white text-xs font-medium text-rose-700 hover:bg-rose-50 cursor-pointer"
                        >
                          Hapus Foto Asli
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="w-full sm:w-72">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Atau Tempel Link / URL Foto
                  </label>
                  <div className="relative">
                    <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="url"
                      value={photoDataUrl.startsWith('data:') ? '' : photoDataUrl}
                      onChange={(e) => setPhotoDataUrl(e.target.value)}
                      placeholder="https://contoh.com/foto.jpg"
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap &amp; Gelar</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Ahmad Hidayat, S.Pd."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">NIP / ID Pegawai</label>
                  <input
                    type="text"
                    value={nip}
                    onChange={(e) => setNip(e.target.value)}
                    placeholder="19900101 201501 1 001"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Login</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@sekolah.sch.id"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Username Login (Opsional)
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Otomatis dari email jika kosong"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      {editingId
                        ? 'Password Baru (Opsional)'
                        : isCloudMode
                          ? 'Password Server (Opsional)'
                          : 'Password Login (min. 6)'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setPassword(generateStaffPassword(10));
                        setShowPassword(true);
                        setCopiedCreds(false);
                      }}
                      className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Buat Otomatis</span>
                    </button>
                  </div>
                  <div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-indigo-600 overflow-hidden">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setCopiedCreds(false);
                      }}
                      placeholder={
                        editingId
                          ? 'Kosongkan jika tidak mengubah'
                          : isCloudMode
                            ? 'Kosongkan untuk login Google'
                            : 'Minimal 6 karakter'
                      }
                      className="w-full px-3 py-2 text-xs font-mono focus:outline-none"
                    />
                    {password.trim() && (
                      <button
                        type="button"
                        onClick={handleCopyModalCredentials}
                        className="px-2 text-slate-500 hover:text-indigo-600 cursor-pointer"
                        title="Salin kredensial"
                        aria-label="Salin kredensial"
                      >
                        {copiedCreds ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="px-2 text-slate-500 hover:text-slate-800 cursor-pointer"
                      aria-label="Tampilkan atau sembunyikan password"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jabatan / Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  >
                    <option value="guru">Guru Mapel</option>
                    <option value="wali_kelas">Wali Kelas</option>
                    <option value="kepala_sekolah">Kepala Sekolah</option>
                    <option value="karyawan">Karyawan / Staff</option>
                    <option value="admin">Admin Sistem</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Kelamin</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as 'L' | 'P')}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    >
                      <option value="L">Laki-laki</option>
                      <option value="P">Perempuan</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                    <select
                      value={active ? 'aktif' : 'nonaktif'}
                      onChange={(e) => setActive(e.target.value === 'aktif')}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    >
                      <option value="aktif">Aktif</option>
                      <option value="nonaktif">Nonaktif</option>
                    </select>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Sekolah</label>
                  <input
                    type="text"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
              </div>

              {(role === 'guru' || role === 'wali_kelas') && (
                <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 inline-flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Kelas Diampu</span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAssignedClasses(
                            assignedClasses.length === allClasses.length ? [] : [...allClasses]
                          )
                        }
                        className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                      >
                        {assignedClasses.length === allClasses.length ? 'Kosongkan' : 'Pilih Semua'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto eguru-scroll">
                      {allClasses.map((cls) => {
                        const checked = assignedClasses.includes(cls);
                        return (
                          <label
                            key={cls}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs cursor-pointer ${
                              checked
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setAssignedClasses((prev) =>
                                  prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]
                                )
                              }
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            <span className="truncate">{cls}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 inline-flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Mapel Diampu</span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAssignedSubjects(
                            assignedSubjects.length === allSubjects.length ? [] : [...allSubjects]
                          )
                        }
                        className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                      >
                        {assignedSubjects.length === allSubjects.length ? 'Kosongkan' : 'Pilih Semua'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 max-h-32 overflow-y-auto eguru-scroll">
                      {allSubjects.map((subj) => {
                        const checked = assignedSubjects.includes(subj);
                        return (
                          <label
                            key={subj}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs cursor-pointer ${
                              checked
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setAssignedSubjects((prev) =>
                                  prev.includes(subj) ? prev.filter((s) => s !== subj) : [...prev, subj]
                                )
                              }
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            <span className="truncate">{subj}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto min-h-[42px] px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  {editingId ? 'Simpan Perubahan' : 'Tambahkan Pegawai'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
