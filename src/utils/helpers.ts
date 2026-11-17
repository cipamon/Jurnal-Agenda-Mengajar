import {
  AppUser,
  AttendanceStatus,
  GradeRecord,
  JournalEntry,
  KopSuratConfig,
  KopSuratLineSizes,
  KopSuratLineStyles,
  PortalDatabase,
  PrintFontFamily,
  RowMarkerColor,
  Student,
  SystemSettings,
  UserRole,
  WebBrandConfig,
} from '../types';
import { DEFAULT_WEB_LOGO } from './defaultAvatars';

export const PRINT_FONT_OPTIONS: PrintFontFamily[] = [
  'Times New Roman',
  'Tahoma',
  'Arial',
  'Verdana',
  'Calibri',
  'Georgia',
];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin Sistem',
  guru: 'Guru Mapel',
  wali_kelas: 'Wali Kelas',
  kepala_sekolah: 'Kepala Sekolah',
  karyawan: 'Karyawan / Staff',
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

export function normalizeWebBrand(settings: SystemSettings): WebBrandConfig {
  return {
    appName: settings.webBrand?.appName || 'Portal E-Guru v10.2',
    tabTitle:
      settings.webBrand?.tabTitle ||
      'Portal E-Guru v10.2 — Sistem Jurnal Mengajar, Presensi & Penilaian Guru Terpadu',
    webLogoDataUrl: settings.webBrand?.webLogoDataUrl || DEFAULT_WEB_LOGO,
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

export interface ScopedPortalData {
  isScoped: boolean;
  hasClassRestriction: boolean;
  hasSubjectRestriction: boolean;
  allowedClasses: string[];
  allowedSubjects: string[];
  scopedSettings: SystemSettings;
  scopedStudents: Student[];
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

export function getScopedPortalData(
  db: PortalDatabase,
  activeUser?: AppUser,
  role?: UserRole
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

  const scopedJournals = isScoped
    ? db.journals.filter(
        (j) =>
          (!hasClassRestriction || classSet.has(j.className)) &&
          (!hasSubjectRestriction || subjectSet.has(j.subject))
      )
    : db.journals;

  const scopedGrades = isScoped
    ? db.grades.filter(
        (g) =>
          (!hasClassRestriction || classSet.has(g.className)) &&
          (!hasSubjectRestriction || subjectSet.has(g.subject))
      )
    : db.grades;

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
    scopedJournals,
    scopedGrades,
    scopeSummaryText,
  };
}

