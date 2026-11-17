export type MenuId =
  | 'dashboard'
  | 'jurnal'
  | 'nilai'
  | 'siswa'
  | 'laporan'
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

export type ReportType = 'jurnal' | 'kehadiran' | 'nilai' | 'semua';

export type PaperOrientation = 'portrait' | 'landscape';

export type UserRole = 'admin' | 'guru' | 'wali_kelas' | 'kepala_sekolah' | 'karyawan';

export interface AppUser {
  id: string;
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
  absenNo?: string;
  name: string;
  gender: 'L' | 'P';
  className: string;
  status?: StudentStatus;
  enrollmentYear?: string;
  photoDataUrl?: string;
  email?: string;
  ttl?: string;
  address?: string;
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
  leftLogoSize?: number; // px (36 - 120)
  rightLogoSize?: number; // px (36 - 120)
  fontFamily?: PrintFontFamily;
  lineSizes?: KopSuratLineSizes;
  lineStyles?: KopSuratLineStyles;
}

export interface WebBrandConfig {
  appName: string;
  tabTitle: string;
  webLogoDataUrl: string;
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
  signatureSize?: number; // px height (36 - 96)
  stampSize?: number; // px square (48 - 110)
  showStampDefault?: boolean;
}

export interface SystemSettings {
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  kkm: number;
  signatureCity: string;
  principalTitle: string;
  principalName: string;
  principalNip: string;
  sheetsWebAppUrl: string;
  reportFontFamily?: PrintFontFamily;
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
  userId?: string;
  role?: UserRole;
  loggedInAt: string;
}
