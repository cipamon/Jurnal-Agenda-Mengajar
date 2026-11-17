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

export interface Student {
  id: string;
  nis: string;
  name: string;
  gender: 'L' | 'P';
  className: string;
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
  updatedAt: string;
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
}

export interface TeacherProfile {
  name: string;
  nip: string;
  school: string;
  email: string;
  password: string;
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
  kopSurat: KopSuratConfig;
  teacherProfile: TeacherProfile;
  classes: string[];
  subjects: string[];
  examTypes: string[];
  academicYears: string[];
}

export interface PortalDatabase {
  version: string;
  lastSyncedAt: string | null;
  students: Student[];
  journals: JournalEntry[];
  grades: GradeRecord[];
  settings: SystemSettings;
}

export interface SessionState {
  isAuthenticated: boolean;
  email: string;
  loggedInAt: string;
}
