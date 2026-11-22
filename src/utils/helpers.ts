import {
  AppUser,
  AttendanceStatus,
  GradeRecord,
  JournalEntry,
  KopSuratConfig,
  KopSuratLineSizes,
  KopSuratLineStyles,
  MenuId,
  PaperOrientation,
  PaperSize,
  PortalDatabase,
  PrintFontFamily,
  RowMarkerColor,
  SignatureStampConfig,
  Student,
  StudentStatus,
  SystemSettings,
  ThemeId,
  UserRole,
  WebBrandConfig,
} from '../types';
import { DEFAULT_WEB_LOGO } from './defaultAvatars';
import { DEFAULT_SCHOOL_STAMP } from './defaultLogos';

export interface ThemePresetMeta {
  id: ThemeId;
  name: string;
  description: string;
  primaryHex: string;
  secondaryHex: string;
  sidebarHex: string;
  isDark?: boolean;
}

export const THEME_PRESETS: ThemePresetMeta[] = [
  {
    id: 'neomorphic',
    name: 'Neo Blue 3D (Futuristik)',
    description: 'Permukaan 3D lembut, bayangan elegan & pendar biru futuristik',
    primaryHex: '#2563eb',
    secondaryHex: '#4f46e5',
    sidebarHex: '#0b1630',
  },
  {
    id: 'neomorphic_dark',
    name: 'Neo Blue 3D Gelap',
    description: 'Neomorfik gelap safir dengan kilau tepi & aksen pendar biru',
    primaryHex: '#3b82f6',
    secondaryHex: '#2563eb',
    sidebarHex: '#050c1d',
    isDark: true,
  },
  {
    id: 'indigo',
    name: 'Royal Indigo 3D',
    description: 'Tema akademik bernuansa biru nila dengan permukaan neomorfik',
    primaryHex: '#4f46e5',
    secondaryHex: '#6d28d9',
    sidebarHex: '#0f172a',
  },
  {
    id: 'emerald',
    name: 'Zamrud Nusantara',
    description: 'Hijau zamrud segar khas pendidikan dan kedinasan',
    primaryHex: '#059669',
    secondaryHex: '#047857',
    sidebarHex: '#064e3b',
  },
  {
    id: 'teal',
    name: 'Samudra Teal',
    description: 'Nuansa biru kehijauan tenang dan modern',
    primaryHex: '#0d9488',
    secondaryHex: '#0284c7',
    sidebarHex: '#0f293a',
  },
  {
    id: 'amber',
    name: 'Amber Klasik',
    description: 'Hangat berwibawa dengan aksen emas dan cokelat tua',
    primaryHex: '#d97706',
    secondaryHex: '#b45309',
    sidebarHex: '#271a0c',
  },
  {
    id: 'rose',
    name: 'Crimson Akademik',
    description: 'Tegas dan elegan dengan aksen merah marun',
    primaryHex: '#e11d48',
    secondaryHex: '#be123c',
    sidebarHex: '#2d0c18',
  },
  {
    id: 'slate',
    name: 'Grafit Monokrom',
    description: 'Minimalis abu-hitam netral bergaya dokumen resmi',
    primaryHex: '#334155',
    secondaryHex: '#0f172a',
    sidebarHex: '#0f172a',
  },
  {
    id: 'midnight',
    name: 'Mode Gelap (Midnight)',
    description: 'Tampilan malam gelap yang nyaman untuk kerja lama',
    primaryHex: '#6366f1',
    secondaryHex: '#4338ca',
    sidebarHex: '#020617',
    isDark: true,
  },
];

export const PRINT_FONT_OPTIONS: PrintFontFamily[] = [
  'Times New Roman',
  'Tahoma',
  'Arial',
  'Verdana',
  'Calibri',
  'Georgia',
];

export interface PaperSizeMeta {
  id: PaperSize;
  label: string;
  shortLabel: string;
  dimensionsLabel: string;
  cssPageSize: string;
  jsPdfFormat: 'a4' | 'letter' | 'legal' | [number, number];
  defaultOrientation?: PaperOrientation;
}

export const PAPER_SIZE_OPTIONS: PaperSizeMeta[] = [
  {
    id: 'A4',
    label: 'A4 Standar Internasional (210 × 297 mm)',
    shortLabel: 'A4 (210 × 297 mm)',
    dimensionsLabel: '210 × 297 mm',
    cssPageSize: 'A4',
    jsPdfFormat: 'a4',
  },
  {
    id: 'F4',
    label: 'F4 / Folio Dinas (215 × 330 mm)',
    shortLabel: 'F4 / Folio (215 × 330 mm)',
    dimensionsLabel: '215 × 330 mm',
    cssPageSize: '215mm 330mm',
    jsPdfFormat: [215, 330],
  },
  {
    id: 'Letter',
    label: 'Letter / Kuarto (215.9 × 279.4 mm)',
    shortLabel: 'Letter (216 × 279 mm)',
    dimensionsLabel: '215.9 × 279.4 mm',
    cssPageSize: 'letter',
    jsPdfFormat: 'letter',
  },
  {
    id: 'Legal',
    label: 'Legal (215.9 × 355.6 mm)',
    shortLabel: 'Legal (216 × 356 mm)',
    dimensionsLabel: '215.9 × 355.6 mm',
    cssPageSize: 'legal',
    jsPdfFormat: 'legal',
  },
];

export function getPaperSizeMeta(size?: PaperSize): PaperSizeMeta {
  return PAPER_SIZE_OPTIONS.find((p) => p.id === size) || PAPER_SIZE_OPTIONS[0];
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin Sistem',
  guru: 'Guru Mapel',
  wali_kelas: 'Wali Kelas',
  kepala_sekolah: 'Kepala Sekolah',
  karyawan: 'Karyawan / Staff',
};

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  aktif: 'Aktif',
  lulus: 'Lulus / Alumni',
  pindah: 'Pindah Sekolah',
  keluar: 'Keluar / Nonaktif',
};

export interface RolePermissionConfig {
  label: string;
  description: string;
  allowedMenus: MenuId[];
  canAccessSettings: boolean;
  canManageStudents: boolean;
  canPromoteStudents: boolean;
  canManageJournals: boolean;
  canManageGrades: boolean;
  canConfigureReports: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissionConfig> = {
  admin: {
    label: 'Admin Sistem',
    description:
      'Akses penuh ke seluruh modul, Data Guru & Karyawan, Master Data, Identitas Web, Manajemen Akun Multi-Role, Stempel & Pengaturan Sistem.',
    allowedMenus: [
      'dashboard',
      'pegawai',
      'jurnal',
      'nilai',
      'siswa',
      'laporan',
      'profil',
      'pengguna',
      'pengaturan',
    ],
    canAccessSettings: true,
    canManageStudents: true,
    canPromoteStudents: true,
    canManageJournals: true,
    canManageGrades: true,
    canConfigureReports: true,
  },
  guru: {
    label: 'Guru Mapel',
    description:
      'Kelola Jurnal Mengajar, Presensi, Input & Leger Nilai, serta cetak laporan pada kelas dan mata pelajaran ampuannya.',
    allowedMenus: ['dashboard', 'jurnal', 'nilai', 'siswa', 'laporan', 'profil'],
    canAccessSettings: false,
    canManageStudents: true,
    canPromoteStudents: false,
    canManageJournals: true,
    canManageGrades: true,
    canConfigureReports: true,
  },
  wali_kelas: {
    label: 'Wali Kelas',
    description:
      'Kelola peserta didik dan kenaikan kelas pada rombongan belajar binaan, serta pantau kehadiran dan nilai kelas.',
    allowedMenus: ['dashboard', 'siswa', 'jurnal', 'nilai', 'laporan', 'profil'],
    canAccessSettings: false,
    canManageStudents: true,
    canPromoteStudents: true,
    canManageJournals: true,
    canManageGrades: true,
    canConfigureReports: true,
  },
  kepala_sekolah: {
    label: 'Kepala Sekolah',
    description:
      'Mode Pemantauan Eksekutif: memantau grafik, jurnal guru, rekap nilai seluruh kelas, dan mencetak laporan resmi.',
    allowedMenus: ['dashboard', 'laporan', 'jurnal', 'nilai', 'siswa', 'profil'],
    canAccessSettings: false,
    canManageStudents: false,
    canPromoteStudents: false,
    canManageJournals: false,
    canManageGrades: false,
    canConfigureReports: true,
  },
  karyawan: {
    label: 'Karyawan / Staff',
    description:
      'Staf Tata Usaha: fokus pengelolaan Data Siswa, Impor/Ekspor Excel, Mutasi/Kenaikan Kelas, serta cetak laporan resmi.',
    allowedMenus: ['dashboard', 'siswa', 'laporan', 'profil'],
    canAccessSettings: false,
    canManageStudents: true,
    canPromoteStudents: true,
    canManageJournals: false,
    canManageGrades: false,
    canConfigureReports: true,
  },
};

export const DEFAULT_KOP_LINE_SIZES: KopSuratLineSizes = {
  line1: 12,
  line2: 14,
  line3: 12,
  line4: 16,
  line5: 11,
  line6: 11,
};

export const DEFAULT_KOP_LINE_STYLES: KopSuratLineStyles = {
  line1: { bold: true, italic: false, underline: false },
  line2: { bold: true, italic: false, underline: false },
  line3: { bold: false, italic: false, underline: false },
  line4: { bold: true, italic: false, underline: false },
  line5: { bold: false, italic: false, underline: false },
  line6: { bold: false, italic: false, underline: false },
};

export function getPrintFontCss(fontFamily?: PrintFontFamily): string {
  const f = fontFamily || 'Times New Roman';
  if (f === 'Calibri') return 'Calibri, "Segoe UI", Arial, sans-serif';
  if (f === 'Times New Roman') return '"Times New Roman", Times, serif';
  if (f === 'Georgia') return 'Georgia, "Times New Roman", serif';
  return `"${f}", Arial, sans-serif`;
}

export function normalizeKopSurat(kop: KopSuratConfig): Required<KopSuratConfig> {
  return {
    ...kop,
    leftLogoSize: kop.leftLogoSize ?? 64,
    rightLogoSize: kop.rightLogoSize ?? 64,
    fontFamily: kop.fontFamily ?? 'Times New Roman',
    lineSizes: {
      ...DEFAULT_KOP_LINE_SIZES,
      ...(kop.lineSizes || {}),
    },
    lineStyles: {
      ...DEFAULT_KOP_LINE_STYLES,
      ...(kop.lineStyles || {}),
    },
  };
}

export function normalizeWebBrand(settings: SystemSettings): Required<WebBrandConfig> {
  return {
    appName: settings.webBrand?.appName || 'Portal E-Guru v10.2',
    tabTitle:
      settings.webBrand?.tabTitle ||
      'Portal E-Guru v10.2 — Sistem Jurnal Mengajar, Presensi & Penilaian Guru Terpadu',
    webLogoDataUrl: settings.webBrand?.webLogoDataUrl || DEFAULT_WEB_LOGO,
    webLogoSize: settings.webBrand?.webLogoSize ?? 36,
  };
}

export function normalizeSignatureStamp(
  settings: SystemSettings
): Required<SignatureStampConfig> {
  const cfg = settings.signatureStamp;
  return {
    principalSignatureDataUrl: cfg?.principalSignatureDataUrl ?? '',
    teacherSignatureDataUrl: cfg?.teacherSignatureDataUrl ?? '',
    stampDataUrl: cfg === undefined ? DEFAULT_SCHOOL_STAMP : cfg.stampDataUrl ?? '',
    signatureSize: cfg?.signatureSize ?? 54,
    stampSize: cfg?.stampSize ?? 74,
    showStampDefault: cfg?.showStampDefault ?? true,
    principalSigOffsetX: Number(cfg?.principalSigOffsetX ?? 0),
    principalSigOffsetY: Number(cfg?.principalSigOffsetY ?? 0),
    teacherSigOffsetX: Number(cfg?.teacherSigOffsetX ?? 0),
    teacherSigOffsetY: Number(cfg?.teacherSigOffsetY ?? 0),
    stampOffsetX: Number(cfg?.stampOffsetX ?? 0),
    stampOffsetY: Number(cfg?.stampOffsetY ?? 0),
    principalBlockOffsetX: Number(cfg?.principalBlockOffsetX ?? 0),
    principalBlockOffsetY: Number(cfg?.principalBlockOffsetY ?? 0),
    teacherBlockOffsetX: Number(cfg?.teacherBlockOffsetX ?? 0),
    teacherBlockOffsetY: Number(cfg?.teacherBlockOffsetY ?? 0),
    stampTarget: cfg?.stampTarget === 'teacher' ? 'teacher' : 'principal',
  };
}

export function generateId(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const BULAN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function formatTanggalID(isoDate: string): string {
  if (!isoDate) return '-';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  const monthIdx = Number(m) - 1;
  return `${Number(d)} ${BULAN_ID[monthIdx] || m} ${y}`;
}

export function formatTanggalShort(isoDate: string): string {
  if (!isoDate) return '-';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [, m, d] = parts;
  return `${d}/${m}`;
}

export function formatTanggalMedium(isoDate: string): string {
  if (!isoDate) return '-';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  const monthIdx = Number(m) - 1;
  return `${Number(d)} ${BULAN_SHORT[monthIdx] || m} ${y}`;
}

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMonthRange(offsetMonths = 0): { start: string; end: string } {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0);
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return { start: fmt(target), end: fmt(lastDay) };
}

export const ATTENDANCE_META: Record<
  AttendanceStatus,
  { label: string; shortLabel: string; textClass: string; bgClass: string; borderClass: string }
> = {
  H: {
    label: 'Hadir',
    shortLabel: 'H',
    textClass: 'text-emerald-700',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-300',
  },
  S: {
    label: 'Sakit',
    shortLabel: 'S',
    textClass: 'text-amber-700',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-300',
  },
  I: {
    label: 'Izin',
    shortLabel: 'I',
    textClass: 'text-blue-700',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-300',
  },
  A: {
    label: 'Alpha',
    shortLabel: 'A',
    textClass: 'text-rose-700',
    bgClass: 'bg-rose-50',
    borderClass: 'border-rose-300',
  },
  D: {
    label: 'Dispen',
    shortLabel: 'D',
    textClass: 'text-violet-700',
    bgClass: 'bg-violet-50',
    borderClass: 'border-violet-300',
  },
};

export const ROW_MARKER_META: Record<
  RowMarkerColor,
  { label: string; dotClass: string; rowBgClass: string; textClass: string }
> = {
  neutral: {
    label: 'Netral',
    dotClass: 'bg-slate-400',
    rowBgClass: 'bg-white',
    textClass: 'text-slate-600',
  },
  green: {
    label: 'Tuntas',
    dotClass: 'bg-emerald-500',
    rowBgClass: 'bg-emerald-50/70',
    textClass: 'text-emerald-700',
  },
  yellow: {
    label: 'Remedial',
    dotClass: 'bg-amber-400',
    rowBgClass: 'bg-amber-50/70',
    textClass: 'text-amber-800',
  },
  red: {
    label: 'Perhatian',
    dotClass: 'bg-rose-500',
    rowBgClass: 'bg-rose-50/70',
    textClass: 'text-rose-700',
  },
  blue: {
    label: 'Pengayaan',
    dotClass: 'bg-blue-500',
    rowBgClass: 'bg-blue-50/70',
    textClass: 'text-blue-700',
  },
};

export function computeWeightedAverage(
  scoreByExam: Record<string, number | null | undefined>,
  examTypes: string[],
  examWeights?: Record<string, number>,
  useWeightedAverage?: boolean
): { avg: number | null; isWeighted: boolean } {
  const scoredExams = examTypes.filter((ex) => {
    const val = scoreByExam[ex];
    return val !== null && val !== undefined && !Number.isNaN(val);
  });

  if (scoredExams.length === 0) {
    return { avg: null, isWeighted: Boolean(useWeightedAverage) };
  }

  if (useWeightedAverage && examWeights) {
    let weightedSum = 0;
    let totalWeight = 0;
    scoredExams.forEach((ex) => {
      const w = Number(examWeights[ex] ?? 0);
      const val = Number(scoreByExam[ex]);
      if (w > 0) {
        weightedSum += val * w;
        totalWeight += w;
      }
    });
    if (totalWeight > 0) {
      return {
        avg: Math.round((weightedSum / totalWeight) * 10) / 10,
        isWeighted: true,
      };
    }
  }

  const sum = scoredExams.reduce((acc, ex) => acc + Number(scoreByExam[ex]), 0);
  return {
    avg: Math.round((sum / scoredExams.length) * 10) / 10,
    isWeighted: false,
  };
}

export interface ScopedPortalData {
  isScoped: boolean;
  hasClassRestriction: boolean;
  hasSubjectRestriction: boolean;
  allowedClasses: string[];
  allowedSubjects: string[];
  scopedSettings: SystemSettings;
  scopedStudents: Student[]; // all students in allowed classes (including alumni/moved for StudentsView)
  scopedActiveStudents: Student[]; // only active students in allowed classes (for journals, grades, dashboard, reports)
  scopedJournals: JournalEntry[];
  scopedGrades: GradeRecord[];
  scopeSummaryText: string | null;
}

export function formatAssignmentSummary(
  assignedClasses?: string[],
  assignedSubjects?: string[]
): string {
  const clsPart =
    assignedClasses && assignedClasses.length > 0
      ? `Kelas: ${assignedClasses.join(', ')}`
      : 'Kelas: Semua';
  const subjPart =
    assignedSubjects && assignedSubjects.length > 0
      ? `Mapel: ${assignedSubjects.join(', ')}`
      : 'Mapel: Semua';
  return `${clsPart} · ${subjPart}`;
}

export function matchesActivePeriod(
  record: { academicYear?: string; semester?: 'Ganjil' | 'Genap' },
  settings: SystemSettings,
  periodScope: 'active' | 'all' = 'active'
): boolean {
  if (periodScope === 'all') return true;
  const yrMatch = !record.academicYear || record.academicYear === settings.academicYear;
  const semMatch = !record.semester || record.semester === settings.semester;
  return yrMatch && semMatch;
}

export function getScopedPortalData(
  db: PortalDatabase,
  activeUser?: AppUser,
  role?: UserRole,
  periodScope: 'active' | 'all' = 'active'
): ScopedPortalData {
  const effectiveRole: UserRole = activeUser?.role || role || 'guru';
  const canBeScoped = effectiveRole === 'guru' || effectiveRole === 'wali_kelas';

  const rawAssignedClasses = canBeScoped
    ? activeUser
      ? activeUser.assignedClasses || []
      : db.settings.teacherProfile.assignedClasses || []
    : [];

  const rawAssignedSubjects = canBeScoped
    ? activeUser
      ? activeUser.assignedSubjects || []
      : db.settings.teacherProfile.assignedSubjects || []
    : [];

  const hasClassRestriction = canBeScoped && rawAssignedClasses.length > 0;
  const hasSubjectRestriction = canBeScoped && rawAssignedSubjects.length > 0;
  const isScoped = hasClassRestriction || hasSubjectRestriction;

  const allowedClasses = hasClassRestriction
    ? db.settings.classes.filter((c) => rawAssignedClasses.includes(c))
    : db.settings.classes;

  const allowedSubjects = hasSubjectRestriction
    ? db.settings.subjects.filter((s) => rawAssignedSubjects.includes(s))
    : db.settings.subjects;

  const classSet = new Set(allowedClasses);
  const subjectSet = new Set(allowedSubjects);

  const scopedStudents = hasClassRestriction
    ? db.students.filter((s) => classSet.has(s.className))
    : db.students;

  const scopedActiveStudents = scopedStudents.filter((s) => !s.status || s.status === 'aktif');

  const scopedJournals = db.journals.filter(
    (j) =>
      (!hasClassRestriction || classSet.has(j.className)) &&
      (!hasSubjectRestriction || subjectSet.has(j.subject)) &&
      matchesActivePeriod(j, db.settings, periodScope)
  );

  const scopedGrades = db.grades.filter(
    (g) =>
      (!hasClassRestriction || classSet.has(g.className)) &&
      (!hasSubjectRestriction || subjectSet.has(g.subject)) &&
      matchesActivePeriod(g, db.settings, periodScope)
  );

  const scopedSettings: SystemSettings = {
    ...db.settings,
    classes: allowedClasses,
    subjects: allowedSubjects,
  };

  const scopeSummaryText = isScoped
    ? formatAssignmentSummary(
        hasClassRestriction ? allowedClasses : [],
        hasSubjectRestriction ? allowedSubjects : []
      )
    : null;

  return {
    isScoped,
    hasClassRestriction,
    hasSubjectRestriction,
    allowedClasses,
    allowedSubjects,
    scopedSettings,
    scopedStudents,
    scopedActiveStudents,
    scopedJournals,
    scopedGrades,
    scopeSummaryText,
  };
}

export function parseTtlFields(ttl?: string): { birthPlace: string; birthDate: string } {
  const clean = (ttl || '').trim();
  if (!clean) return { birthPlace: '', birthDate: '' };
  const commaIdx = clean.indexOf(',');
  if (commaIdx >= 0) {
    return {
      birthPlace: clean.slice(0, commaIdx).trim(),
      birthDate: clean.slice(commaIdx + 1).trim(),
    };
  }
  return { birthPlace: clean, birthDate: '' };
}

export function formatStudentTtl(
  st: Pick<Student, 'birthPlace' | 'birthDate' | 'ttl'>
): string {
  const bp = (st.birthPlace || '').trim();
  const bd = (st.birthDate || '').trim();
  if (bp || bd) {
    return [bp, bd].filter(Boolean).join(', ');
  }
  return (st.ttl || '').trim();
}

