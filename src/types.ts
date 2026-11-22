export type MenuId =
  | 'dashboard'
  | 'pegawai'
  | 'jurnal'
  | 'nilai'
  | 'siswa'
  | 'laporan'
  | 'profil'
  | 'pengguna'
  | 'pengaturan';

export type AttendanceStatus = 'H' | 'S' | 'I' | 'A' | 'D';

export type RowMarkerColor = 'neutral' | 'green' | 'yellow' | 'red' | 'blue';

export type PrintFontFamily =
  | 'Times New Roman'
  | 'Tahoma'
  | 'Arial'
  | 'Verdana'
  | 'Calibri'
  | 'Georgia';

export type ThemeId =
  | 'neomorphic'
  | 'neomorphic_dark'
  | 'indigo'
  | 'emerald'
  | 'teal'
  | 'amber'
  | 'rose'
  | 'slate'
  | 'midnight';

export type ReportType =
  | 'jurnal'
  | 'kehadiran'
  | 'rekap_presensi'
  | 'ketidakhadiran'
  | 'nilai'
  | 'remedial'
  | 'leger_kelas'
  | 'daftar_siswa'
  | 'aktivitas_guru'
  | 'semua';

export type SingleReportType = Exclude<ReportType, 'semua'>;

export type PaperSize = 'A4' | 'F4' | 'Letter' | 'Legal';

export type PaperOrientation = 'portrait' | 'landscape';

export type UserRole = 'admin' | 'guru' | 'wali_kelas' | 'kepala_sekolah' | 'karyawan';

export interface AppUser {
  id: string;
  username?: string;
  name: string;
  nip: string;
  email: string;
  password: string;
  role: UserRole;
  school: string;
  gender: 'L' | 'P';
  photoDataUrl?: string;
  assignedClasses?: string[];
  assignedSubjects?: string[];
  active: boolean;
  createdAt: string;
}

export type StudentStatus = 'aktif' | 'lulus' | 'pindah' | 'keluar';

export interface Student {
  id: string;
  nis: string;
  nisn?: string;
  absenNo?: string;
  name: string;
  gender: 'L' | 'P';
  className: string;
  status?: StudentStatus;
  enrollmentYear?: string;
  photoDataUrl?: string;
  email?: string;
  birthPlace?: string;
  birthDate?: string;
  ttl?: string;
  address?: string;
  phone?: string;
  homeroomTeacher?: string;
  counselor?: string;
}

export interface StudentAttendanceItem {
  status: AttendanceStatus;
  note: string;
}

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  period: string; // e.g., "1 - 2"
  className: string;
  subject: string;
  topic: string;
  activities: string;
  attendance: Record<string, StudentAttendanceItem>; // keyed by student.id
  teacherId?: string;
  teacherName?: string;
  academicYear?: string;
  semester?: 'Ganjil' | 'Genap';
  createdAt: string;
  updatedAt: string;
}

export interface GradeRecord {
  id: string;
  studentId: string;
  className: string;
  subject: string;
  examType: string;
  score: number | null;
  note: string;
  marker: RowMarkerColor;
  teacherId?: string;
  teacherName?: string;
  academicYear?: string;
  semester?: 'Ganjil' | 'Genap';
  updatedAt: string;
}

export interface KopSuratLineSizes {
  line1: number;
  line2: number;
  line3: number;
  line4: number;
  line5: number;
  line6: number;
}

export interface KopSuratTextStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface KopSuratLineStyles {
  line1: KopSuratTextStyle;
  line2: KopSuratTextStyle;
  line3: KopSuratTextStyle;
  line4: KopSuratTextStyle;
  line5: KopSuratTextStyle;
  line6: KopSuratTextStyle;
}

export interface KopSuratConfig {
  line1: string;
  line2: string;
  line3: string;
  line4: string;
  line5: string;
  line6: string;
  leftLogoDataUrl: string;
  rightLogoDataUrl: string;
  leftLogoSize?: number; // px (24 - 160)
  rightLogoSize?: number; // px (24 - 160)
  fontFamily?: PrintFontFamily;
  lineSizes?: KopSuratLineSizes;
  lineStyles?: KopSuratLineStyles;
}

export interface WebBrandConfig {
  appName: string;
  tabTitle: string;
  webLogoDataUrl: string;
  webLogoSize?: number; // px (24 - 80)
}

export interface TeacherProfile {
  name: string;
  nip: string;
  school: string;
  email: string;
  password: string;
  gender?: 'L' | 'P';
  photoDataUrl?: string;
  assignedClasses?: string[];
  assignedSubjects?: string[];
}

export interface SignatureStampConfig {
  principalSignatureDataUrl?: string;
  teacherSignatureDataUrl?: string;
  stampDataUrl?: string;
  signatureSize?: number; // px height (28 - 200)
  stampSize?: number; // px square (32 - 220)
  showStampDefault?: boolean;
  principalSigOffsetX?: number; // px (-100 to 100)
  principalSigOffsetY?: number; // px (-50 to 50)
  teacherSigOffsetX?: number; // px (-100 to 100)
  teacherSigOffsetY?: number; // px (-50 to 50)
  stampOffsetX?: number; // px (-150 to 150)
  stampOffsetY?: number; // px (-60 to 60)
  principalBlockOffsetX?: number; // px (-320 to 320)
  principalBlockOffsetY?: number; // px (-80 to 120)
  teacherBlockOffsetX?: number; // px (-320 to 320)
  teacherBlockOffsetY?: number; // px (-80 to 120)
  stampTarget?: 'principal' | 'teacher';
}

export interface SystemSettings {
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  kkm: number;
  signatureCity: string;
  principalTitle: string;
  principalName: string;
  principalNip: string;
  themeId?: ThemeId;
  reportFontFamily?: PrintFontFamily;
  reportPaperSize?: PaperSize;
  reportOrientation?: PaperOrientation;
  lockReportFormat?: boolean;
  signatureStamp?: SignatureStampConfig;
  webBrand?: WebBrandConfig;
  kopSurat: KopSuratConfig;
  teacherProfile: TeacherProfile;
  classes: string[];
  subjects: string[];
  examTypes: string[];
  examWeights?: Record<string, number>;
  useWeightedAverage?: boolean;
  academicYears: string[];
}

export interface PortalDatabase {
  version: string;
  lastSyncedAt: string | null;
  students: Student[];
  journals: JournalEntry[];
  grades: GradeRecord[];
  users?: AppUser[];
  settings: SystemSettings;
}

export interface SessionState {
  isAuthenticated: boolean;
  email: string;
  username?: string;
  userId?: string;
  role?: UserRole;
  authProvider?: 'google' | 'server' | 'local';
  loggedInAt: string;
}
