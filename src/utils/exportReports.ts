import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import {
  AppUser,
  AttendanceStatus,
  GradeRecord,
  JournalEntry,
  KopSuratConfig,
  KopSuratLineSizes,
  KopSuratTextStyle,
  PaperOrientation,
  PaperSize,
  PrintFontFamily,
  ReportPageLayoutConfig,
  ReportType,
  SignatureExtraRow,
  SingleReportType,
  Student,
  SystemSettings,
} from '../types';
import { getStudentPhotoUrl } from './defaultAvatars';
import { dataUrlToPngBase64 } from './defaultLogos';
import {
  ATTENDANCE_META,
  computeWeightedAverage,
  formatTanggalID,
  formatTanggalShort,
  getPaperDimensionsMm,
  getPaperSizeMeta,
  getPrintFontCss,
  getTodayIso,
  normalizeKopSurat,
  normalizeSignatureStamp,
  PX_TO_MM,
  ROW_MARKER_META,
  USER_ROLE_LABELS,
} from './helpers';

export interface TeacherSignatureOverride {
  dataUrl: string;
  size?: number;
  offsetX?: number;
  offsetY?: number;
  teacherName?: string;
  teacherNip?: string;
}

export interface ImportedReportData {
  title: string;
  fileName: string;
  headers: string[];
  rows: string[][];
}

export interface ReportFilterOptions {
  reportType?: ReportType;
  reportTypes?: SingleReportType[];
  selectedClasses: string[];
  selectedSubject: string; // 'ALL' or subject name
  selectedTeacherId?: string; // 'ALL', user.id, or 'name:<teacherName>'
  users?: AppUser[];
  startDate: string;
  endDate: string;
  showKopSurat: boolean;
  showPrincipalSig: boolean;
  showTeacherSig: boolean;
  showStamp?: boolean;
  showPrincipalSigImg?: boolean;
  showTeacherSigImg?: boolean;
  showStampImg?: boolean;
  showExtraSigRows?: boolean;
  extraSigRowsOverride?: SignatureExtraRow[];
  teacherSignatureOverride?: TeacherSignatureOverride;
  documentNumber?: string;
  showQrVerification?: boolean;
  paperSize?: PaperSize;
  orientation: PaperOrientation;
  pageLayouts?: Partial<Record<string, Partial<ReportPageLayoutConfig>>>;
  fontFamily: PrintFontFamily;
}

export function resolveSelectedReportTypes(
  opts: ReportFilterOptions,
  includeActivityInSemua = false
): SingleReportType[] {
  if (Array.isArray(opts.reportTypes)) {
    return Array.from(new Set(opts.reportTypes));
  }
  if (opts.reportType === 'semua') {
    return includeActivityInSemua
      ? ['jurnal', 'aktivitas_guru', 'kehadiran', 'nilai']
      : ['jurnal', 'kehadiran', 'nilai'];
  }
  if (opts.reportType) {
    return [opts.reportType];
  }
  return [];
}

function buildReportFileTag(selected: SingleReportType[]): string {
  if (selected.length === 0) return 'KOSONG';
  if (selected.length === 1) return selected[0].toUpperCase();
  if (selected.length >= 9) return 'LENGKAP_9JENIS';
  return `GABUNGAN_${selected.length}JENIS`;
}

function appendUniqueSheet(wb: XLSX.WorkBook, ws: XLSX.WorkSheet, rawName: string) {
  const cleaned = rawName.replace(/[:\\/?*[\]]/g, '').trim() || 'Sheet';
  let candidate = cleaned.slice(0, 31);
  let counter = 2;
  while (wb.SheetNames.includes(candidate)) {
    const suffix = ` ${counter}`;
    candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
    counter += 1;
  }
  XLSX.utils.book_append_sheet(wb, ws, candidate);
}

export interface ComputedClassAttendanceMatrix {
  className: string;
  students: Student[];
  journals: JournalEntry[]; // chronologically sorted
}

export interface ComputedClassGradeMatrix {
  className: string;
  subject: string;
  students: Student[];
  examTypes: string[];
  scoreMap: Record<string, Record<string, number | null>>; // studentId -> examType -> score
  avgMap: Record<string, number | null>;
}

export interface ComputedTeacherActivityRow {
  teacherKey: string;
  teacherName: string;
  roleLabel: string;
  journalCount: number;
  gradeCount: number;
  classesHandled: string[];
  subjectsHandled: string[];
  lastActivityDate: string;
}

export function matchesTeacherFilter(
  rec: { teacherId?: string; teacherName?: string },
  teacherFilter?: string,
  users?: AppUser[]
): boolean {
  if (!teacherFilter || teacherFilter === 'ALL') return true;
  if (teacherFilter.startsWith('name:')) {
    const targetName = teacherFilter.slice(5).trim().toLowerCase();
    return (rec.teacherName || '').trim().toLowerCase() === targetName;
  }
  if (rec.teacherId && rec.teacherId === teacherFilter) return true;
  const matchedUser = users?.find((u) => u.id === teacherFilter);
  if (matchedUser && rec.teacherName) {
    return rec.teacherName.trim().toLowerCase() === matchedUser.name.trim().toLowerCase();
  }
  return false;
}

export function filterJournalsForReport(
  journals: JournalEntry[],
  opts: ReportFilterOptions
): JournalEntry[] {
  return journals
    .filter((j) => {
      if (opts.selectedClasses.length > 0 && !opts.selectedClasses.includes(j.className)) {
        return false;
      }
      if (opts.selectedSubject !== 'ALL' && j.subject !== opts.selectedSubject) {
        return false;
      }
      if (!matchesTeacherFilter(j, opts.selectedTeacherId, opts.users)) {
        return false;
      }
      if (opts.startDate && j.date < opts.startDate) {
        return false;
      }
      if (opts.endDate && j.date > opts.endDate) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function filterGradesForReport(
  grades: GradeRecord[],
  opts: ReportFilterOptions
): GradeRecord[] {
  return grades
    .filter((g) => {
      if (g.score === null) return false;
      if (opts.selectedClasses.length > 0 && !opts.selectedClasses.includes(g.className)) {
        return false;
      }
      if (opts.selectedSubject !== 'ALL' && g.subject !== opts.selectedSubject) {
        return false;
      }
      if (!matchesTeacherFilter(g, opts.selectedTeacherId, opts.users)) {
        return false;
      }
      if (opts.startDate && g.updatedAt.slice(0, 10) < opts.startDate) {
        return false;
      }
      if (opts.endDate && g.updatedAt.slice(0, 10) > opts.endDate) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function buildTeacherActivitySummary(
  filteredJournals: JournalEntry[],
  filteredGrades: GradeRecord[],
  users: AppUser[] = []
): ComputedTeacherActivityRow[] {
  const map = new Map<
    string,
    {
      teacherKey: string;
      teacherName: string;
      roleLabel: string;
      journalCount: number;
      gradeCount: number;
      classes: Set<string>;
      subjects: Set<string>;
      lastDate: string;
    }
  >();

  const resolveIdentity = (teacherId?: string, teacherName?: string) => {
    const matched =
      (teacherId ? users.find((u) => u.id === teacherId) : undefined) ||
      (teacherName
        ? users.find((u) => u.name.trim().toLowerCase() === teacherName.trim().toLowerCase())
        : undefined);
    const key = matched?.id || teacherId || `name:${(teacherName || 'Guru Mapel').trim()}`;
    const displayName = matched?.name || teacherName || 'Guru Mata Pelajaran';
    const roleLabel = matched ? USER_ROLE_LABELS[matched.role] : 'Guru Mapel';
    return { key, displayName, roleLabel };
  };

  filteredJournals.forEach((j) => {
    const { key, displayName, roleLabel } = resolveIdentity(j.teacherId, j.teacherName);
    const cur = map.get(key) || {
      teacherKey: key,
      teacherName: displayName,
      roleLabel,
      journalCount: 0,
      gradeCount: 0,
      classes: new Set<string>(),
      subjects: new Set<string>(),
      lastDate: '',
    };
    cur.journalCount += 1;
    if (j.className) cur.classes.add(j.className);
    if (j.subject) cur.subjects.add(j.subject);
    if (!cur.lastDate || j.date > cur.lastDate) cur.lastDate = j.date;
    map.set(key, cur);
  });

  filteredGrades.forEach((g) => {
    const { key, displayName, roleLabel } = resolveIdentity(g.teacherId, g.teacherName);
    const cur = map.get(key) || {
      teacherKey: key,
      teacherName: displayName,
      roleLabel,
      journalCount: 0,
      gradeCount: 0,
      classes: new Set<string>(),
      subjects: new Set<string>(),
      lastDate: '',
    };
    cur.gradeCount += 1;
    if (g.className) cur.classes.add(g.className);
    if (g.subject) cur.subjects.add(g.subject);
    const gDate = g.updatedAt.slice(0, 10);
    if (!cur.lastDate || gDate > cur.lastDate) cur.lastDate = gDate;
    map.set(key, cur);
  });

  return Array.from(map.values())
    .map((v) => ({
      teacherKey: v.teacherKey,
      teacherName: v.teacherName,
      roleLabel: v.roleLabel,
      journalCount: v.journalCount,
      gradeCount: v.gradeCount,
      classesHandled: Array.from(v.classes).sort(),
      subjectsHandled: Array.from(v.subjects).sort(),
      lastActivityDate: v.lastDate,
    }))
    .sort((a, b) => b.journalCount + b.gradeCount - (a.journalCount + a.gradeCount));
}

export function buildAttendanceMatrices(
  students: Student[],
  filteredJournals: JournalEntry[],
  selectedClasses: string[]
): ComputedClassAttendanceMatrix[] {
  const classesToBuild =
    selectedClasses.length > 0
      ? selectedClasses
      : Array.from(new Set(students.map((s) => s.className))).sort();

  return classesToBuild
    .map((cls) => {
      const clsStudents = students
        .filter((s) => s.className === cls)
        .sort((a, b) => a.name.localeCompare(b.name));
      const clsJournals = filteredJournals
        .filter((j) => j.className === cls)
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        className: cls,
        students: clsStudents,
        journals: clsJournals,
      };
    })
    .filter((m) => m.students.length > 0);
}

export function buildGradeMatrices(
  students: Student[],
  grades: GradeRecord[],
  settings: SystemSettings,
  opts: ReportFilterOptions
): ComputedClassGradeMatrix[] {
  const classesToBuild =
    opts.selectedClasses.length > 0 ? opts.selectedClasses : settings.classes;

  const teacherGrades = grades.filter((g) =>
    matchesTeacherFilter(g, opts.selectedTeacherId, opts.users)
  );

  const matrices: ComputedClassGradeMatrix[] = [];

  classesToBuild.forEach((cls) => {
    const clsStudents = students
      .filter((s) => s.className === cls)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (clsStudents.length === 0) return;

    const subjectsForClass =
      opts.selectedSubject !== 'ALL'
        ? [opts.selectedSubject]
        : Array.from(
            new Set(
              teacherGrades
                .filter((g) => g.className === cls && g.score !== null)
                .map((g) => g.subject)
            )
          );

    if (subjectsForClass.length === 0 && opts.selectedSubject === 'ALL') {
      return;
    }

    subjectsForClass.forEach((subj) => {
      const scoreMap: Record<string, Record<string, number | null>> = {};
      const avgMap: Record<string, number | null> = {};

      clsStudents.forEach((st) => {
        scoreMap[st.id] = {};
        settings.examTypes.forEach((ex) => {
          const rec = teacherGrades.find(
            (g) =>
              g.studentId === st.id &&
              g.className === cls &&
              g.subject === subj &&
              g.examType === ex
          );
          const val = rec && rec.score !== null ? rec.score : null;
          scoreMap[st.id][ex] = val;
        });
        avgMap[st.id] = computeWeightedAverage(
          scoreMap[st.id],
          settings.examTypes,
          settings.examWeights,
          settings.useWeightedAverage
        ).avg;
      });

      matrices.push({
        className: cls,
        subject: subj,
        students: clsStudents,
        examTypes: settings.examTypes,
        scoreMap,
        avgMap,
      });
    });
  });

  return matrices;
}

export function summarizeStudentAttendance(
  studentId: string,
  journals: JournalEntry[]
): { H: number; S: number; I: number; A: number; D: number; pct: number } {
  let H = 0;
  let S = 0;
  let I = 0;
  let A = 0;
  let D = 0;
  journals.forEach((j) => {
    const st: AttendanceStatus = j.attendance[studentId]?.status ?? 'H';
    if (st === 'H') H++;
    else if (st === 'S') S++;
    else if (st === 'I') I++;
    else if (st === 'A') A++;
    else if (st === 'D') D++;
  });
  const total = journals.length;
  const pct = total > 0 ? Math.round(((H + D) / total) * 100) : 0;
  return { H, S, I, A, D, pct };
}

export interface ComputedClassAttendanceRecap {
  className: string;
  totalMeetings: number;
  avgPresencePct: number;
  totals: { H: number; S: number; I: number; A: number; D: number };
  attentionCount: number;
  rows: {
    student: Student;
    totalMeetings: number;
    H: number;
    S: number;
    I: number;
    A: number;
    D: number;
    pct: number;
    statusLabel: 'Baik' | 'Perlu Pembinaan' | 'Belum Ada Pertemuan';
  }[];
}

export function buildAttendanceRecapByClass(
  students: Student[],
  filteredJournals: JournalEntry[],
  selectedClasses: string[]
): ComputedClassAttendanceRecap[] {
  const classesToBuild =
    selectedClasses.length > 0
      ? selectedClasses
      : Array.from(new Set(students.map((s) => s.className))).sort();

  return classesToBuild
    .map((cls) => {
      const clsStudents = students
        .filter((s) => s.className === cls)
        .sort((a, b) => a.name.localeCompare(b.name));
      const clsJournals = filteredJournals.filter((j) => j.className === cls);
      const totalMeetings = clsJournals.length;
      const totals = { H: 0, S: 0, I: 0, A: 0, D: 0 };
      let pctSum = 0;
      let attentionCount = 0;

      const rows = clsStudents.map((student) => {
        const sum = summarizeStudentAttendance(student.id, clsJournals);
        totals.H += sum.H;
        totals.S += sum.S;
        totals.I += sum.I;
        totals.A += sum.A;
        totals.D += sum.D;
        pctSum += sum.pct;

        const needsAttention = totalMeetings > 0 && (sum.A >= 3 || sum.pct < 75);
        if (needsAttention) attentionCount += 1;

        const statusLabel: 'Baik' | 'Perlu Pembinaan' | 'Belum Ada Pertemuan' =
          totalMeetings === 0
            ? 'Belum Ada Pertemuan'
            : needsAttention
              ? 'Perlu Pembinaan'
              : 'Baik';

        return {
          student,
          totalMeetings,
          H: sum.H,
          S: sum.S,
          I: sum.I,
          A: sum.A,
          D: sum.D,
          pct: sum.pct,
          statusLabel,
        };
      });

      const avgPresencePct =
        clsStudents.length > 0 && totalMeetings > 0
          ? Math.round(pctSum / clsStudents.length)
          : 0;

      return {
        className: cls,
        totalMeetings,
        avgPresencePct,
        totals,
        attentionCount,
        rows,
      };
    })
    .filter((c) => c.rows.length > 0);
}

export interface ComputedAbsenceLogItem {
  id: string;
  date: string;
  period: string;
  className: string;
  subject: string;
  teacherName: string;
  studentId: string;
  studentNis: string;
  studentName: string;
  gender: 'L' | 'P';
  status: Exclude<AttendanceStatus, 'H'>;
  statusLabel: string;
  note: string;
}

export interface ComputedAbsenceSummaryRow {
  studentId: string;
  nis: string;
  name: string;
  className: string;
  gender: 'L' | 'P';
  S: number;
  I: number;
  A: number;
  D: number;
  total: number;
}

export function buildAbsenceLog(
  students: Student[],
  filteredJournals: JournalEntry[]
): {
  logs: ComputedAbsenceLogItem[];
  summary: ComputedAbsenceSummaryRow[];
  counts: { S: number; I: number; A: number; D: number };
} {
  const studentsByClass = new Map<string, Student[]>();
  students.forEach((st) => {
    const list = studentsByClass.get(st.className) || [];
    list.push(st);
    studentsByClass.set(st.className, list);
  });

  const logs: ComputedAbsenceLogItem[] = [];
  const summaryMap = new Map<string, ComputedAbsenceSummaryRow>();
  const counts = { S: 0, I: 0, A: 0, D: 0 };

  filteredJournals.forEach((j) => {
    const clsStudents = studentsByClass.get(j.className) || [];
    clsStudents.forEach((st) => {
      const att = j.attendance[st.id];
      if (!att || att.status === 'H') return;
      const status = att.status as Exclude<AttendanceStatus, 'H'>;
      counts[status] = (counts[status] || 0) + 1;

      logs.push({
        id: `${j.id}_${st.id}`,
        date: j.date,
        period: j.period,
        className: j.className,
        subject: j.subject,
        teacherName: j.teacherName || '-',
        studentId: st.id,
        studentNis: st.nis,
        studentName: st.name,
        gender: st.gender,
        status,
        statusLabel: ATTENDANCE_META[status]?.label || status,
        note: att.note || '-',
      });

      const cur = summaryMap.get(st.id) || {
        studentId: st.id,
        nis: st.nis,
        name: st.name,
        className: st.className,
        gender: st.gender,
        S: 0,
        I: 0,
        A: 0,
        D: 0,
        total: 0,
      };
      cur[status] += 1;
      cur.total += 1;
      summaryMap.set(st.id, cur);
    });
  });

  const summary = Array.from(summaryMap.values()).sort(
    (a, b) => b.A - a.A || b.total - a.total || a.name.localeCompare(b.name)
  );

  return { logs, summary, counts };
}

export interface ComputedRemedialStudentRow {
  student: Student;
  avgScore: number;
  deficit: number;
  belowExamDetails: string;
  actionNote: string;
}

export interface ComputedRemedialSubjectBlock {
  className: string;
  subject: string;
  totalStudents: number;
  assessedCount: number;
  tuntasCount: number;
  remedialCount: number;
  passRatePct: number;
  classAvg: number | null;
  highest: number | null;
  lowest: number | null;
  remedialStudents: ComputedRemedialStudentRow[];
}

export function buildRemedialAnalysis(
  students: Student[],
  grades: GradeRecord[],
  settings: SystemSettings,
  opts: ReportFilterOptions
): ComputedRemedialSubjectBlock[] {
  const matrices = buildGradeMatrices(students, grades, settings, opts);
  return matrices.map((m) => {
    let assessedCount = 0;
    let tuntasCount = 0;
    let remedialCount = 0;
    let scoreSum = 0;
    let highest: number | null = null;
    let lowest: number | null = null;
    const remedialStudents: ComputedRemedialStudentRow[] = [];

    m.students.forEach((st) => {
      const avg = m.avgMap[st.id];
      if (avg === null || avg === undefined) return;
      assessedCount += 1;
      scoreSum += avg;
      if (highest === null || avg > highest) highest = avg;
      if (lowest === null || avg < lowest) lowest = avg;

      if (avg >= settings.kkm) {
        tuntasCount += 1;
      } else {
        remedialCount += 1;
        const weakParts = m.examTypes
          .map((ex) => {
            const val = m.scoreMap[st.id]?.[ex];
            return val !== null && val !== undefined && val < settings.kkm
              ? `${ex}: ${val}`
              : null;
          })
          .filter(Boolean) as string[];

        remedialStudents.push({
          student: st,
          avgScore: avg,
          deficit: Math.round((settings.kkm - avg) * 10) / 10,
          belowExamDetails: weakParts.length > 0 ? weakParts.join(', ') : 'Rata-rata di bawah KKM',
          actionNote:
            avg < settings.kkm - 15
              ? 'Remedial Terbimbing & Tugas Ulang'
              : 'Remedial Test / Perbaikan Nilai',
        });
      }
    });

    remedialStudents.sort((a, b) => a.avgScore - b.avgScore);

    return {
      className: m.className,
      subject: m.subject,
      totalStudents: m.students.length,
      assessedCount,
      tuntasCount,
      remedialCount,
      passRatePct: assessedCount > 0 ? Math.round((tuntasCount / assessedCount) * 100) : 0,
      classAvg: assessedCount > 0 ? Math.round((scoreSum / assessedCount) * 10) / 10 : null,
      highest,
      lowest,
      remedialStudents,
    };
  });
}

export interface ComputedClassLedger {
  className: string;
  subjects: string[];
  rows: {
    student: Student;
    subjectAvgMap: Record<string, number | null>;
    totalScore: number | null;
    subjectCount: number;
    overallAvg: number | null;
    belowKkmCount: number;
    rank: number | null;
    statusLabel: string;
  }[];
}

export function buildClassMultiSubjectLedger(
  students: Student[],
  grades: GradeRecord[],
  settings: SystemSettings,
  opts: ReportFilterOptions
): ComputedClassLedger[] {
  const classesToBuild =
    opts.selectedClasses.length > 0 ? opts.selectedClasses : settings.classes;

  const teacherGrades = grades.filter((g) =>
    matchesTeacherFilter(g, opts.selectedTeacherId, opts.users)
  );

  return classesToBuild
    .map((cls) => {
      const clsStudents = students
        .filter((s) => s.className === cls)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (clsStudents.length === 0) return null;

      const subjectsWithGrades = new Set(
        teacherGrades
          .filter((g) => g.className === cls && g.score !== null)
          .map((g) => g.subject)
      );

      const orderedSubjects =
        opts.selectedSubject !== 'ALL'
          ? [opts.selectedSubject]
          : settings.subjects.filter((s) => subjectsWithGrades.has(s));

      const extraSubjects =
        opts.selectedSubject !== 'ALL'
          ? []
          : Array.from(subjectsWithGrades).filter((s) => !orderedSubjects.includes(s));

      const subjects =
        orderedSubjects.length + extraSubjects.length > 0
          ? [...orderedSubjects, ...extraSubjects]
          : settings.subjects.slice(0, 6);

      const rawRows = clsStudents.map((st) => {
        const subjectAvgMap: Record<string, number | null> = {};
        let total = 0;
        let subjCount = 0;
        let belowKkmCount = 0;

        subjects.forEach((subj) => {
          const examMap: Record<string, number | null> = {};
          settings.examTypes.forEach((ex) => {
            const rec = teacherGrades.find(
              (g) =>
                g.studentId === st.id &&
                g.className === cls &&
                g.subject === subj &&
                g.examType === ex
            );
            examMap[ex] = rec && rec.score !== null ? rec.score : null;
          });
          const avg = computeWeightedAverage(
            examMap,
            settings.examTypes,
            settings.examWeights,
            settings.useWeightedAverage
          ).avg;
          subjectAvgMap[subj] = avg;
          if (avg !== null) {
            total += avg;
            subjCount += 1;
            if (avg < settings.kkm) belowKkmCount += 1;
          }
        });

        const totalScore = subjCount > 0 ? Math.round(total * 10) / 10 : null;
        const overallAvg = subjCount > 0 ? Math.round((total / subjCount) * 10) / 10 : null;
        const statusLabel =
          subjCount === 0
            ? 'Belum Dinilai'
            : belowKkmCount === 0
              ? 'Tuntas Semua'
              : `${belowKkmCount} Mapel < KKM`;

        return {
          student: st,
          subjectAvgMap,
          totalScore,
          subjectCount: subjCount,
          overallAvg,
          belowKkmCount,
          rank: null as number | null,
          statusLabel,
        };
      });

      const rankedAvgs = rawRows
        .map((r) => r.overallAvg)
        .filter((v): v is number => v !== null)
        .sort((a, b) => b - a);

      rawRows.forEach((r) => {
        if (r.overallAvg !== null) {
          r.rank = rankedAvgs.indexOf(r.overallAvg) + 1;
        }
      });

      return {
        className: cls,
        subjects,
        rows: rawRows,
      };
    })
    .filter((item): item is ComputedClassLedger => item !== null);
}

export interface ComputedStudentRosterBlock {
  className: string;
  maleCount: number;
  femaleCount: number;
  totalCount: number;
  homeroomTeacher: string;
  students: {
    student: Student;
    ttlDisplay: string;
    statusText: string;
  }[];
}

export function buildStudentRosterByClass(
  students: Student[],
  selectedClasses: string[]
): ComputedStudentRosterBlock[] {
  const classesToBuild =
    selectedClasses.length > 0
      ? selectedClasses
      : Array.from(new Set(students.map((s) => s.className))).sort();

  return classesToBuild
    .map((cls) => {
      const clsStudents = students
        .filter((s) => s.className === cls)
        .sort((a, b) => {
          const absA = parseInt(a.absenNo || '9999', 10);
          const absB = parseInt(b.absenNo || '9999', 10);
          if (!Number.isNaN(absA) && !Number.isNaN(absB) && absA !== absB) {
            return absA - absB;
          }
          return a.name.localeCompare(b.name);
        });

      const maleCount = clsStudents.filter((s) => s.gender === 'L').length;
      const femaleCount = clsStudents.filter((s) => s.gender === 'P').length;
      const homeroomTeacher =
        clsStudents.find((s) => s.homeroomTeacher?.trim())?.homeroomTeacher || '-';

      return {
        className: cls,
        maleCount,
        femaleCount,
        totalCount: clsStudents.length,
        homeroomTeacher,
        students: clsStudents.map((student) => {
          const ttlDisplay =
            [student.birthPlace?.trim(), student.birthDate?.trim()].filter(Boolean).join(', ') ||
            student.ttl ||
            '-';
          const statusText =
            student.status === 'lulus'
              ? 'Lulus'
              : student.status === 'pindah'
                ? 'Pindah'
                : student.status === 'keluar'
                  ? 'Keluar'
                  : 'Aktif';
          return { student, ttlDisplay, statusText };
        }),
      };
    })
    .filter((b) => b.totalCount > 0);
}

// =========================================================================
// EXCEL EXPORT (.XLSX and .XLS)
// =========================================================================
export function exportReportToSpreadsheet(
  format: 'xlsx' | 'xls',
  students: Student[],
  journals: JournalEntry[],
  grades: GradeRecord[],
  settings: SystemSettings,
  opts: ReportFilterOptions
) {
  const wb = XLSX.utils.book_new();
  const filteredJournals = filterJournalsForReport(journals, opts);
  const filteredGrades = filterGradesForReport(grades, opts);
  const selectedReports = resolveSelectedReportTypes(opts, true);
  const hasReport = (id: SingleReportType) => selectedReports.includes(id);

  if (hasReport('jurnal')) {
    const rows = filteredJournals.map((j, idx) => {
      const counts = { H: 0, S: 0, I: 0, A: 0, D: 0 };
      Object.values(j.attendance).forEach((item) => {
        counts[item.status] = (counts[item.status] || 0) + 1;
      });
      return {
        No: idx + 1,
        Tanggal: formatTanggalID(j.date),
        'Jam Ke-': j.period,
        'Guru Pengajar': j.teacherName || settings.teacherProfile.name,
        Kelas: j.className,
        'Mata Pelajaran': j.subject,
        'Materi Pokok': j.topic,
        'Kegiatan Pembelajaran': j.activities,
        Hadir: counts.H,
        Sakit: counts.S,
        Izin: counts.I,
        Alpha: counts.A,
        Dispen: counts.D,
      };
    });
    const ws = XLSX.utils.json_to_sheet(
      rows.length > 0
        ? rows
        : [{ Keterangan: 'Tidak ada data jurnal pada filter yang dipilih.' }]
    );
    appendUniqueSheet(wb, ws, 'Jurnal Mengajar');
  }

  if (hasReport('aktivitas_guru')) {
    const summaryRows = buildTeacherActivitySummary(filteredJournals, filteredGrades, opts.users).map(
      (row, idx) => ({
        No: idx + 1,
        'Nama Guru': row.teacherName,
        Peran: row.roleLabel,
        'Jumlah Jurnal Mengajar': row.journalCount,
        'Jumlah Nilai Diinput': row.gradeCount,
        'Kelas Diampu': row.classesHandled.join(', ') || '-',
        'Mata Pelajaran': row.subjectsHandled.join(', ') || '-',
        'Aktivitas Terakhir': row.lastActivityDate ? formatTanggalID(row.lastActivityDate) : '-',
      })
    );
    const wsSummary = XLSX.utils.json_to_sheet(
      summaryRows.length > 0
        ? summaryRows
        : [{ Keterangan: 'Belum ada aktivitas mengajar atau penilaian guru pada filter ini.' }]
    );
    appendUniqueSheet(wb, wsSummary, 'Ringkasan Guru');

    const activityJournalRows = filteredJournals.map((j, idx) => {
      const c = { H: 0, S: 0, I: 0, A: 0, D: 0 };
      Object.values(j.attendance).forEach((item) => {
        c[item.status] = (c[item.status] || 0) + 1;
      });
      return {
        No: idx + 1,
        'Guru Pengajar': j.teacherName || settings.teacherProfile.name,
        Tanggal: formatTanggalID(j.date),
        'Jam Ke-': j.period,
        Kelas: j.className,
        'Mata Pelajaran': j.subject,
        'Materi Pokok': j.topic,
        'Kegiatan Pembelajaran': j.activities,
        'Ringkasan Presensi': `H:${c.H} S:${c.S} I:${c.I} A:${c.A} D:${c.D}`,
      };
    });
    const wsJrn = XLSX.utils.json_to_sheet(
      activityJournalRows.length > 0
        ? activityJournalRows
        : [{ Keterangan: 'Belum ada riwayat jurnal mengajar guru.' }]
    );
    appendUniqueSheet(wb, wsJrn, 'Aktivitas Mengajar');

    const studentMap = new Map(students.map((s) => [s.id, s]));
    const activityGradeRows = filteredGrades.map((g, idx) => {
      const st = studentMap.get(g.studentId);
      return {
        No: idx + 1,
        'Guru Penilai': g.teacherName || settings.teacherProfile.name,
        Tanggal: formatTanggalID(g.updatedAt.slice(0, 10)),
        Kelas: g.className,
        'Mata Pelajaran': g.subject,
        'Jenis Ujian': g.examType,
        NIS: st?.nis || '-',
        'Nama Siswa': st?.name || g.studentId,
        Nilai: g.score ?? '-',
        'Status KKM':
          g.score !== null ? (g.score >= settings.kkm ? 'Tuntas' : 'Remedial') : '-',
        Catatan: g.note || '-',
      };
    });
    const wsGrd = XLSX.utils.json_to_sheet(
      activityGradeRows.length > 0
        ? activityGradeRows
        : [{ Keterangan: 'Belum ada riwayat penilaian guru.' }]
    );
    appendUniqueSheet(wb, wsGrd, 'Riwayat Penilaian Guru');
  }

  if (hasReport('kehadiran')) {
    const matrices = buildAttendanceMatrices(students, filteredJournals, opts.selectedClasses);
    if (matrices.length === 0) {
      const ws = XLSX.utils.json_to_sheet([{ Keterangan: 'Belum ada data kehadiran.' }]);
      appendUniqueSheet(wb, ws, 'Kehadiran');
    } else {
      matrices.forEach((m) => {
        const rows = m.students.map((st, idx) => {
          const row: Record<string, string | number> = {
            No: idx + 1,
            NIS: st.nis,
            'Nama Siswa': st.name,
            'L/P': st.gender,
          };
          m.journals.forEach((j, jIdx) => {
            const colKey = `${formatTanggalShort(j.date)} (#${jIdx + 1})`;
            row[colKey] = j.attendance[st.id]?.status || '-';
          });
          const sum = summarizeStudentAttendance(st.id, m.journals);
          row['H'] = sum.H;
          row['S'] = sum.S;
          row['I'] = sum.I;
          row['A'] = sum.A;
          row['D'] = sum.D;
          row['% Hadir'] = `${sum.pct}%`;
          return row;
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        appendUniqueSheet(wb, ws, `Absen ${m.className}`);
      });
    }
  }

  if (hasReport('nilai')) {
    const matrices = buildGradeMatrices(students, grades, settings, opts);
    if (matrices.length === 0) {
      const ws = XLSX.utils.json_to_sheet([{ Keterangan: 'Belum ada data nilai pada filter ini.' }]);
      appendUniqueSheet(wb, ws, 'Rekap Nilai');
    } else {
      matrices.forEach((m) => {
        const rows = m.students.map((st, idx) => {
          const row: Record<string, string | number> = {
            No: idx + 1,
            NIS: st.nis,
            'Nama Siswa': st.name,
            'L/P': st.gender,
          };
          m.examTypes.forEach((ex) => {
            const val = m.scoreMap[st.id]?.[ex];
            row[ex] = val !== null && val !== undefined ? val : '-';
          });
          const avg = m.avgMap[st.id];
          row['Rata-Rata'] = avg !== null ? avg : '-';
          row['Status KKM'] =
            avg !== null ? (avg >= settings.kkm ? 'Tuntas' : 'Remedial') : '-';
          return row;
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        appendUniqueSheet(wb, ws, `Nilai ${m.className} ${m.subject}`);
      });
    }
  }

  if (hasReport('rekap_presensi')) {
    const recaps = buildAttendanceRecapByClass(students, filteredJournals, opts.selectedClasses);
    if (recaps.length === 0) {
      const ws = XLSX.utils.json_to_sheet([{ Keterangan: 'Belum ada data siswa/presensi.' }]);
      appendUniqueSheet(wb, ws, 'Rekap Presensi');
    } else {
      recaps.forEach((recap) => {
        const rows = recap.rows.map((r, idx) => ({
          No: idx + 1,
          NIS: r.student.nis,
          'Nama Siswa': r.student.name,
          'L/P': r.student.gender,
          Pertemuan: r.totalMeetings,
          Hadir: r.H,
          Sakit: r.S,
          Izin: r.I,
          Alpha: r.A,
          Dispen: r.D,
          '% Kehadiran': `${r.pct}%`,
          Status: r.statusLabel,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        appendUniqueSheet(wb, ws, `Rekap ${recap.className}`);
      });
    }
  }

  if (hasReport('ketidakhadiran')) {
    const abs = buildAbsenceLog(students, filteredJournals);
    const sumRows = abs.summary.map((s, idx) => ({
      No: idx + 1,
      NIS: s.nis,
      'Nama Siswa': s.name,
      Kelas: s.className,
      'L/P': s.gender,
      Sakit: s.S,
      Izin: s.I,
      Alpha: s.A,
      Dispen: s.D,
      'Total Tidak Hadir': s.total,
    }));
    appendUniqueSheet(
      wb,
      XLSX.utils.json_to_sheet(
        sumRows.length > 0 ? sumRows : [{ Keterangan: 'Semua siswa tercatat hadir pada filter ini.' }]
      ),
      'Rekap Ketidakhadiran'
    );

    const logRows = abs.logs.map((l, idx) => ({
      No: idx + 1,
      Tanggal: formatTanggalID(l.date),
      Jam: l.period,
      Kelas: l.className,
      'Mata Pelajaran': l.subject,
      'Guru Pengajar': l.teacherName,
      NIS: l.studentNis,
      'Nama Siswa': l.studentName,
      Status: `${l.status} (${l.statusLabel})`,
      Catatan: l.note,
    }));
    appendUniqueSheet(
      wb,
      XLSX.utils.json_to_sheet(
        logRows.length > 0 ? logRows : [{ Keterangan: 'Belum ada catatan ketidakhadiran.' }]
      ),
      'Log Ketidakhadiran'
    );
  }

  if (hasReport('remedial')) {
    const blocks = buildRemedialAnalysis(students, grades, settings, opts);
    const summaryRows = blocks.map((b, idx) => ({
      No: idx + 1,
      Kelas: b.className,
      'Mata Pelajaran': b.subject,
      'Jumlah Siswa': b.totalStudents,
      Dinilai: b.assessedCount,
      Tuntas: b.tuntasCount,
      Remedial: b.remedialCount,
      'Daya Serap': `${b.passRatePct}%`,
      'Rata-Rata': b.classAvg ?? '-',
      Tertinggi: b.highest ?? '-',
      Terendah: b.lowest ?? '-',
    }));
    appendUniqueSheet(
      wb,
      XLSX.utils.json_to_sheet(
        summaryRows.length > 0 ? summaryRows : [{ Keterangan: 'Belum ada data nilai untuk dianalisis.' }]
      ),
      'Analisis Ketuntasan'
    );

    const remedialList = blocks.flatMap((b) =>
      b.remedialStudents.map((r) => ({
        Kelas: b.className,
        'Mata Pelajaran': b.subject,
        NIS: r.student.nis,
        'Nama Siswa': r.student.name,
        'Nilai Akhir': r.avgScore,
        KKM: settings.kkm,
        'Selisih KKM': -r.deficit,
        'Komponen < KKM': r.belowExamDetails,
        'Tindak Lanjut': r.actionNote,
      }))
    );
    appendUniqueSheet(
      wb,
      XLSX.utils.json_to_sheet(
        remedialList.length > 0
          ? remedialList
          : [{ Keterangan: 'Tidak ada siswa remedial pada filter ini.' }]
      ),
      'Daftar Siswa Remedial'
    );
  }

  if (hasReport('leger_kelas')) {
    const ledgers = buildClassMultiSubjectLedger(students, grades, settings, opts);
    if (ledgers.length === 0) {
      appendUniqueSheet(
        wb,
        XLSX.utils.json_to_sheet([{ Keterangan: 'Belum ada data leger nilai kelas.' }]),
        'Leger Nilai'
      );
    } else {
      ledgers.forEach((l) => {
        const rows = l.rows.map((r, idx) => {
          const row: Record<string, string | number> = {
            No: idx + 1,
            NIS: r.student.nis,
            'Nama Siswa': r.student.name,
            'L/P': r.student.gender,
          };
          l.subjects.forEach((subj) => {
            const v = r.subjectAvgMap[subj];
            row[subj] = v !== null && v !== undefined ? v : '-';
          });
          row['Jumlah'] = r.totalScore ?? '-';
          row['Rata-Rata'] = r.overallAvg ?? '-';
          row['Peringkat'] = r.rank ?? '-';
          row['Keterangan'] = r.statusLabel;
          return row;
        });
        appendUniqueSheet(wb, XLSX.utils.json_to_sheet(rows), `Leger ${l.className}`);
      });
    }
  }

  if (hasReport('daftar_siswa')) {
    const blocks = buildStudentRosterByClass(students, opts.selectedClasses);
    if (blocks.length === 0) {
      appendUniqueSheet(
        wb,
        XLSX.utils.json_to_sheet([{ Keterangan: 'Belum ada data siswa pada kelas terpilih.' }]),
        'Daftar Siswa'
      );
    } else {
      blocks.forEach((b) => {
        const rows = b.students.map((item, idx) => ({
          No: idx + 1,
          'No. Absen': item.student.absenNo || '-',
          NIS: item.student.nis,
          NISN: item.student.nisn || '-',
          'Nama Lengkap': item.student.name,
          'L/P': item.student.gender,
          'Tempat, Tgl Lahir': item.ttlDisplay,
          Kelas: item.student.className,
          'Wali Kelas': item.student.homeroomTeacher || '-',
          Status: item.statusText,
        }));
        appendUniqueSheet(wb, XLSX.utils.json_to_sheet(rows), `Siswa ${b.className}`);
      });
    }
  }

  if (wb.SheetNames.length === 0) {
    appendUniqueSheet(
      wb,
      XLSX.utils.json_to_sheet([{ Keterangan: 'Pilih minimal satu jenis laporan terlebih dahulu.' }]),
      'Info Laporan'
    );
  }

  const stamp = getTodayIso();
  const fileName = `Laporan_${buildReportFileTag(selectedReports)}_${settings.semester}_${stamp}.${format}`;

  if (format === 'xls') {
    XLSX.writeFile(wb, fileName, { bookType: 'biff8' });
  } else {
    XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
  }
}

// =========================================================================
// VECTOR PDF EXPORT (jsPDF + jsPDF-AutoTable)
// =========================================================================
function mapPrintFontToJsPdf(fontFamily: PrintFontFamily): 'times' | 'helvetica' {
  if (fontFamily === 'Times New Roman' || fontFamily === 'Georgia') {
    return 'times';
  }
  return 'helvetica';
}

const pxToMm = (px: number): number => Math.round(px * PX_TO_MM * 100) / 100;

function computeAutoTableFontSize(colCount: number, printableWidthMm: number): number {
  if (colCount <= 10) return 8;
  const approxMmPerCol = printableWidthMm / Math.max(1, colCount);
  if (approxMmPerCol >= 16) return 7.6;
  if (approxMmPerCol >= 12) return 7.0;
  if (approxMmPerCol >= 9) return 6.3;
  if (approxMmPerCol >= 7) return 5.8;
  return 5.2;
}

async function getPngAspectRatio(pngDataUrl: string | null): Promise<number> {
  if (!pngDataUrl) return 2.2;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(img.naturalWidth / img.naturalHeight);
      } else {
        resolve(2.2);
      }
    };
    img.onerror = () => resolve(2.2);
    img.src = pngDataUrl;
  });
}

async function createVerificationQrPng(payloadText: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(payloadText, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
  } catch {
    return null;
  }
}

function resolveExportPageLayout(
  settings: SystemSettings,
  opts: ReportFilterOptions,
  reportType: SingleReportType,
  pageKey?: string
): { paperSize: PaperSize; orientation: PaperOrientation } {
  const baseSize: PaperSize = opts.paperSize || settings.reportPaperSize || 'A4';
  const baseOrient: PaperOrientation =
    opts.orientation || (settings.reportOrientation === 'portrait' ? 'portrait' : 'landscape');

  const exactPage = pageKey ? opts.pageLayouts?.[pageKey] : undefined;
  const sessionType = opts.pageLayouts?.[reportType];
  const savedType = settings.reportPageLayouts?.[reportType];

  return {
    paperSize:
      exactPage?.paperSize || sessionType?.paperSize || savedType?.paperSize || baseSize,
    orientation:
      exactPage?.orientation || sessionType?.orientation || savedType?.orientation || baseOrient,
  };
}

interface PreparedExtraRow {
  id: string;
  signers: Array<{
    topLabel: string;
    title: string;
    name: string;
    nipLabel: string;
    nip: string;
    sigPng: string | null;
    sigAspect: number;
    sigHeightMm: number;
  }>;
}

async function prepareExtraSignatureRows(
  rows: SignatureExtraRow[]
): Promise<PreparedExtraRow[]> {
  return Promise.all(
    rows
      .filter((r) => r.signers && r.signers.length > 0)
      .map(async (r) => ({
        id: r.id,
        signers: await Promise.all(
          r.signers.slice(0, 3).map(async (s) => {
            const sigPng = s.signatureDataUrl
              ? await dataUrlToPngBase64(s.signatureDataUrl, 480)
              : null;
            const sigAspect = await getPngAspectRatio(sigPng);
            return {
              topLabel: (s.topLabel || '').trim(),
              title: (s.title || '').trim(),
              name: (s.name || '').trim(),
              nipLabel: s.nipLabel !== undefined ? s.nipLabel.trim() : 'NIP.',
              nip: (s.nip || '').trim(),
              sigPng,
              sigAspect,
              sigHeightMm: pxToMm(Math.max(36, Math.min(200, Number(s.signatureSize ?? 52)))),
            };
          })
        ),
      }))
  );
}

function drawExtraSignatureRowsPdf(
  doc: jsPDF,
  preparedRows: PreparedExtraRow[],
  startY: number,
  marginX: number,
  pageWidth: number,
  pageHeight: number,
  pdfFont: 'times' | 'helvetica',
  pageFormat: 'a4' | 'letter' | 'legal' | [number, number],
  pageOrient: PaperOrientation
) {
  if (preparedRows.length === 0) return;
  let y = startY;
  const printableW = pageWidth - marginX * 2;

  for (const row of preparedRows) {
    if (y + 34 > pageHeight - 10) {
      doc.addPage(pageFormat, pageOrient);
      y = 16;
    }

    const count = row.signers.length;
    const colW = count === 1 ? Math.min(82, printableW) : printableW / count;

    row.signers.forEach((s, idx) => {
      const colLeft =
        count === 1
          ? pageWidth / 2 - colW / 2
          : marginX + idx * colW + (count === 2 ? 8 : 4);
      const centerText = count === 1;
      const textX = centerText ? pageWidth / 2 : colLeft;
      const alignOpt = centerText ? ({ align: 'center' as const } as const) : undefined;

      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9.5);
      if (s.topLabel) {
        doc.text(s.topLabel, textX, y, alignOpt);
      }
      if (s.title) {
        doc.text(s.title, textX, y + 4.8, alignOpt);
      }

      if (s.sigPng) {
        const sigH = Math.min(18, s.sigHeightMm);
        const sigW = Math.round(sigH * s.sigAspect * 100) / 100;
        const imgX = centerText ? pageWidth / 2 - sigW / 2 : colLeft + 2;
        const imgY = y + 7.2 + Math.max(0, (15 - sigH) / 2);
        doc.addImage(s.sigPng, 'PNG', imgX, imgY, sigW, sigH);
      }

      const nameY = y + 24;
      doc.setFont(pdfFont, 'bold');
      const displayName = s.name || 'Nama Penandatangan';
      doc.text(displayName, textX, nameY, alignOpt);
      const nameW = doc.getTextWidth(displayName);
      doc.setLineWidth(0.25);
      if (centerText) {
        doc.line(textX - nameW / 2, nameY + 0.7, textX + nameW / 2, nameY + 0.7);
      } else {
        doc.line(textX, nameY + 0.7, textX + nameW, nameY + 0.7);
      }

      if (s.nip) {
        doc.setFont(pdfFont, 'normal');
        const nipLine = s.nipLabel ? `${s.nipLabel} ${s.nip}` : s.nip;
        doc.text(nipLine, textX, nameY + 4.6, alignOpt);
      }
    });

    y += 35;
  }
}

function drawPdfKopSurat(params: {
  doc: jsPDF;
  kopSurat: KopSuratConfig;
  leftPng: string | null;
  rightPng: string | null;
  leftAspect?: number;
  rightAspect?: number;
  marginX: number;
  pageWidth: number;
  topY?: number;
  bodyFont: 'times' | 'helvetica';
}): number {
  const {
    doc,
    kopSurat,
    leftPng,
    rightPng,
    leftAspect = 1,
    rightAspect = 1,
    marginX,
    pageWidth,
    topY = 12,
    bodyFont,
  } = params;

  const normKop = normalizeKopSurat(kopSurat);
  const kopFont = mapPrintFontToJsPdf(normKop.fontFamily);
  const printableWidth = pageWidth - marginX * 2;
  const centerX = pageWidth / 2;

  const logoPxToMm = (px: number) => Math.round((px / 64) * 19.2 * 10) / 10;
  const leftBoxMm = leftPng ? Math.max(7, Math.min(48, logoPxToMm(normKop.leftLogoSize))) : 0;
  const rightBoxMm = rightPng ? Math.max(7, Math.min(48, logoPxToMm(normKop.rightLogoSize))) : 0;
  const maxLogoSlotMm = Math.max(leftBoxMm, rightBoxMm);

  const fitLogo = (boxMm: number, aspect: number) => {
    if (boxMm <= 0) return { w: 0, h: 0 };
    const safeAspect = aspect > 0.1 && aspect < 10 ? aspect : 1;
    if (safeAspect >= 1) {
      return { w: boxMm, h: Math.round((boxMm / safeAspect) * 100) / 100 };
    }
    return { w: Math.round(boxMm * safeAspect * 100) / 100, h: boxMm };
  };

  const leftDim = fitLogo(leftBoxMm, leftAspect);
  const rightDim = fitLogo(rightBoxMm, rightAspect);

  const sideReserveMm = maxLogoSlotMm > 0 ? maxLogoSlotMm + 6 : 2;
  const maxCenteredTextW = Math.max(68, printableWidth - sideReserveMm * 2);

  const pxToPt = (px: number) => Math.round(px * 0.78 * 10) / 10;
  const ptToMm = (pt: number) => pt * 0.352778;
  const toJsPdfStyle = (st: KopSuratTextStyle) =>
    st.bold && st.italic ? 'bolditalic' : st.bold ? 'bold' : st.italic ? 'italic' : 'normal';

  const rawLines: Array<{
    key: keyof KopSuratLineSizes;
    text: string;
  }> = (
    [
      { key: 'line1', text: (normKop.line1 || '').trim() },
      { key: 'line2', text: (normKop.line2 || '').trim() },
      { key: 'line3', text: (normKop.line3 || '').trim() },
      { key: 'line4', text: (normKop.line4 || '').trim() },
      { key: 'line5', text: (normKop.line5 || '').trim() },
      { key: 'line6', text: (normKop.line6 || '').trim() },
    ] as Array<{ key: keyof KopSuratLineSizes; text: string }>
  ).filter((ln) => ln.text.length > 0);

  interface LaidOutSubLine {
    text: string;
    fontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic';
    pt: number;
    underline: boolean;
    boxTopOffsetMm: number;
    baselineOffsetMm: number;
  }

  const laidOutLines: LaidOutSubLine[] = [];
  let textCursorMm = 0;

  rawLines.forEach((ln) => {
    const basePt = pxToPt(normKop.lineSizes[ln.key]);
    const st = normKop.lineStyles[ln.key];
    const fontStyle = toJsPdfStyle(st);

    doc.setFont(kopFont, fontStyle);
    doc.setFontSize(basePt);
    const naturalW = doc.getTextWidth(ln.text);

    let effectivePt = basePt;
    let wrappedParts: string[] = [ln.text];

    if (naturalW > maxCenteredTextW) {
      const ratio = maxCenteredTextW / naturalW;
      if (ratio >= 0.84) {
        effectivePt = Math.max(6.2, Math.floor(basePt * ratio * 10) / 10);
      } else {
        doc.setFontSize(basePt);
        const split = doc.splitTextToSize(ln.text, maxCenteredTextW) as string[];
        wrappedParts = split.length > 0 ? split : [ln.text];
      }
    }

    const emMm = ptToMm(effectivePt);
    const subBoxHeightMm = Math.max(3.5, emMm * 1.38);
    const baselineInBoxMm = emMm * 0.96;

    wrappedParts.forEach((partText) => {
      laidOutLines.push({
        text: partText,
        fontStyle,
        pt: effectivePt,
        underline: st.underline,
        boxTopOffsetMm: textCursorMm,
        baselineOffsetMm: baselineInBoxMm,
      });
      textCursorMm += subBoxHeightMm;
    });
  });

  const totalTextHeightMm = textCursorMm;
  const blockHeightMm = Math.max(totalTextHeightMm, leftDim.h, rightDim.h, 16);
  const textStartY = topY + (blockHeightMm - totalTextHeightMm) / 2;

  if (leftPng && leftDim.w > 0 && leftDim.h > 0) {
    const leftX = marginX + 2 + (maxLogoSlotMm - leftDim.w) / 2;
    const leftY = topY + (blockHeightMm - leftDim.h) / 2;
    doc.addImage(leftPng, 'PNG', leftX, leftY, leftDim.w, leftDim.h);
  }
  if (rightPng && rightDim.w > 0 && rightDim.h > 0) {
    const rightSlotLeft = pageWidth - marginX - 2 - maxLogoSlotMm;
    const rightX = rightSlotLeft + (maxLogoSlotMm - rightDim.w) / 2;
    const rightY = topY + (blockHeightMm - rightDim.h) / 2;
    doc.addImage(rightPng, 'PNG', rightX, rightY, rightDim.w, rightDim.h);
  }

  doc.setTextColor(15, 23, 42);
  for (const sub of laidOutLines) {
    const baselineY = textStartY + sub.boxTopOffsetMm + sub.baselineOffsetMm;
    doc.setFont(kopFont, sub.fontStyle);
    doc.setFontSize(sub.pt);
    doc.text(sub.text, centerX, baselineY, { align: 'center' });
    if (sub.underline) {
      const w = doc.getTextWidth(sub.text);
      doc.setLineWidth(0.25);
      doc.setDrawColor(15, 23, 42);
      doc.line(centerX - w / 2, baselineY + 0.75, centerX + w / 2, baselineY + 0.75);
    }
  }

  const ruleY = topY + blockHeightMm + 2.4;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.8);
  doc.line(marginX, ruleY, pageWidth - marginX, ruleY);
  doc.setLineWidth(0.25);
  doc.line(marginX, ruleY + 1.15, pageWidth - marginX, ruleY + 1.15);

  doc.setFont(bodyFont, 'normal');
  return ruleY + 6.2;
}

export async function exportReportToPdf(
  students: Student[],
  journals: JournalEntry[],
  grades: GradeRecord[],
  settings: SystemSettings,
  opts: ReportFilterOptions
) {
  const pdfFont = mapPrintFontToJsPdf(opts.fontFamily);
  const marginX = 12;

  const sigStamp = normalizeSignatureStamp(settings);
  const showPrincipalImg = opts.showPrincipalSigImg ?? sigStamp.showPrincipalSigImgDefault !== false;
  const showTeacherImg = opts.showTeacherSigImg ?? sigStamp.showTeacherSigImgDefault !== false;
  const showStampImg = opts.showStampImg ?? opts.showStamp ?? sigStamp.showStampDefault;
  const showExtraSigRows = opts.showExtraSigRows ?? true;
  const effectiveExtraRows = showExtraSigRows
    ? opts.extraSigRowsOverride ?? sigStamp.extraRows
    : [];

  const effectiveTeacherSigUrl =
    opts.teacherSignatureOverride?.dataUrl || sigStamp.teacherSignatureDataUrl;
  const effectiveTeacherSigPx = Math.max(
    40,
    Math.min(280, opts.teacherSignatureOverride?.size ?? sigStamp.signatureSize)
  );
  const effectiveTeacherOffX = opts.teacherSignatureOverride?.offsetX ?? sigStamp.teacherSigOffsetX;
  const effectiveTeacherOffY = opts.teacherSignatureOverride?.offsetY ?? sigStamp.teacherSigOffsetY;
  const effectiveTeacherName =
    opts.teacherSignatureOverride?.teacherName || settings.teacherProfile.name;
  const effectiveTeacherNip =
    opts.teacherSignatureOverride?.teacherNip || settings.teacherProfile.nip;

  const [leftPng, rightPng, principalSigPng, teacherSigPng, stampPng, preparedExtraRows] =
    await Promise.all([
      opts.showKopSurat ? dataUrlToPngBase64(settings.kopSurat.leftLogoDataUrl) : Promise.resolve(null),
      opts.showKopSurat ? dataUrlToPngBase64(settings.kopSurat.rightLogoDataUrl) : Promise.resolve(null),
      opts.showPrincipalSig && showPrincipalImg && sigStamp.principalSignatureDataUrl
        ? dataUrlToPngBase64(sigStamp.principalSignatureDataUrl, 480)
        : Promise.resolve(null),
      opts.showTeacherSig && showTeacherImg && effectiveTeacherSigUrl
        ? dataUrlToPngBase64(effectiveTeacherSigUrl, 480)
        : Promise.resolve(null),
      showStampImg && sigStamp.stampDataUrl
        ? dataUrlToPngBase64(sigStamp.stampDataUrl, 480)
        : Promise.resolve(null),
      prepareExtraSignatureRows(effectiveExtraRows),
    ]);

  const [principalAspect, teacherAspect, leftLogoAspect, rightLogoAspect] = await Promise.all([
    getPngAspectRatio(principalSigPng),
    getPngAspectRatio(teacherSigPng),
    getPngAspectRatio(leftPng),
    getPngAspectRatio(rightPng),
  ]);

  const docNumberClean = (opts.documentNumber || '').trim();
  const qrPayload = [
    settings.kopSurat.line4 || settings.teacherProfile.school || 'Portal E-Guru',
    docNumberClean ? `No: ${docNumberClean}` : 'Dokumen Resmi Portal E-Guru',
    `TA ${settings.academicYear} (${settings.semester})`,
    `Tanggal Cetak: ${formatTanggalID(getTodayIso())}`,
    `Penandatangan: ${effectiveTeacherName}`,
  ].join(' | ');
  const qrPng = opts.showQrVerification ? await createVerificationQrPng(qrPayload) : null;

  let doc: jsPDF | null = null;
  let pageWidth = 297;
  let pageHeight = 210;
  let printableWidth = pageWidth - marginX * 2;
  let currentFormat: 'a4' | 'letter' | 'legal' | [number, number] = 'a4';
  let currentOrientation: PaperOrientation = opts.orientation || 'landscape';

  const drawHeader = (): number => {
    if (!doc) return 12;
    let cursorY = 12;
    if (opts.showKopSurat) {
      cursorY = drawPdfKopSurat({
        doc,
        kopSurat: settings.kopSurat,
        leftPng,
        rightPng,
        leftAspect: leftLogoAspect,
        rightAspect: rightLogoAspect,
        marginX,
        pageWidth,
        topY: 12,
        bodyFont: pdfFont,
      });
    }
    if (docNumberClean) {
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(8.5);
      doc.text(`Nomor Dokumen: ${docNumberClean}`, marginX, cursorY);
      cursorY += 4.5;
    }
    return cursorY;
  };

  const drawSignatures = (startY: number) => {
    if (!doc) return;
    if (!opts.showPrincipalSig && !opts.showTeacherSig && !qrPng && preparedExtraRows.length === 0) {
      return;
    }
    let y = startY + 8;

    if (opts.showPrincipalSig || opts.showTeacherSig || qrPng) {
      const maxBlockDownMm = Math.max(
        0,
        pxToMm(sigStamp.principalBlockOffsetY),
        pxToMm(sigStamp.teacherBlockOffsetY)
      );
      if (y + 38 + maxBlockDownMm > pageHeight - 10) {
        doc.addPage(currentFormat, currentOrientation);
        y = 16;
      }

      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9.5);

      const todayStr = formatTanggalID(getTodayIso());
      const pSigMm = pxToMm(sigStamp.signatureSize);
      const pSigW = Math.round(pSigMm * principalAspect * 100) / 100;
      const tSigMm = pxToMm(effectiveTeacherSigPx);
      const tSigW = Math.round(tSigMm * teacherAspect * 100) / 100;
      const stampMm = pxToMm(sigStamp.stampSize);

      const stampOnTeacher =
        (sigStamp.stampTarget === 'teacher' && opts.showTeacherSig) || !opts.showPrincipalSig;

      const clampBlockX = (xVal: number) => Math.max(6, Math.min(pageWidth - 48, xVal));
      const clampBlockY = (yVal: number) => Math.max(12, Math.min(pageHeight - 34, yVal));

      let row1MaxBottomY = y + 32;

      if (opts.showPrincipalSig) {
        const leftX = clampBlockX(marginX + 8 + pxToMm(sigStamp.principalBlockOffsetX));
        const pY = clampBlockY(y + pxToMm(sigStamp.principalBlockOffsetY));
        const pStageCenterY = pY + 14.5;
        doc.text('Mengetahui,', leftX, pY);
        doc.text(settings.principalTitle, leftX, pY + 4.8);
        if (stampPng && !stampOnTeacher) {
          const stampCx = leftX + 2 + pxToMm(sigStamp.stampOffsetX);
          const stampCy = pStageCenterY + pxToMm(sigStamp.stampOffsetY);
          doc.addImage(
            stampPng,
            'PNG',
            stampCx - stampMm / 2,
            stampCy - stampMm / 2,
            stampMm,
            stampMm
          );
        }
        if (principalSigPng) {
          const sigCx = leftX + 17 + pxToMm(sigStamp.principalSigOffsetX);
          const sigCy = pStageCenterY + pxToMm(sigStamp.principalSigOffsetY);
          doc.addImage(
            principalSigPng,
            'PNG',
            sigCx - pSigW / 2,
            sigCy - pSigMm / 2,
            pSigW,
            pSigMm
          );
        }
        doc.setFont(pdfFont, 'bold');
        doc.text(settings.principalName, leftX, pY + 24);
        const pNameW = doc.getTextWidth(settings.principalName);
        doc.setLineWidth(0.25);
        doc.line(leftX, pY + 24.7, leftX + pNameW, pY + 24.7);
        doc.setFont(pdfFont, 'normal');
        doc.text(`NIP. ${settings.principalNip}`, leftX, pY + 28.6);
        row1MaxBottomY = Math.max(row1MaxBottomY, pY + 32);
      }

      if (opts.showTeacherSig) {
        const rightX = clampBlockX(pageWidth - marginX - 68 + pxToMm(sigStamp.teacherBlockOffsetX));
        const tY = clampBlockY(y + pxToMm(sigStamp.teacherBlockOffsetY));
        const tStageCenterY = tY + 14.5;
        doc.text(`${settings.signatureCity}, ${todayStr}`, rightX, tY);
        doc.text('Guru Mata Pelajaran,', rightX, tY + 4.8);
        if (stampPng && stampOnTeacher) {
          const stampCx = rightX + pxToMm(sigStamp.stampOffsetX);
          const stampCy = tStageCenterY + pxToMm(sigStamp.stampOffsetY);
          doc.addImage(
            stampPng,
            'PNG',
            stampCx - stampMm / 2,
            stampCy - stampMm / 2,
            stampMm,
            stampMm
          );
        }
        if (teacherSigPng) {
          const sigCx = rightX + 17 + pxToMm(effectiveTeacherOffX);
          const sigCy = tStageCenterY + pxToMm(effectiveTeacherOffY);
          doc.addImage(
            teacherSigPng,
            'PNG',
            sigCx - tSigW / 2,
            sigCy - tSigMm / 2,
            tSigW,
            tSigMm
          );
        }
        doc.setFont(pdfFont, 'bold');
        doc.text(effectiveTeacherName, rightX, tY + 24);
        const tNameW = doc.getTextWidth(effectiveTeacherName);
        doc.setLineWidth(0.25);
        doc.line(rightX, tY + 24.7, rightX + tNameW, tY + 24.7);
        doc.setFont(pdfFont, 'normal');
        doc.text(`NIP. ${effectiveTeacherNip}`, rightX, tY + 28.6);
        row1MaxBottomY = Math.max(row1MaxBottomY, tY + 32);
      }

      if (qrPng) {
        const qrSizeMm = 17;
        const qrX = pageWidth / 2 - qrSizeMm / 2;
        const qrY = Math.min(pageHeight - qrSizeMm - 8, y + 6);
        doc.addImage(qrPng, 'PNG', qrX, qrY, qrSizeMm, qrSizeMm);
        doc.setFont(pdfFont, 'normal');
        doc.setFontSize(6.5);
        doc.text('Verifikasi Digital', pageWidth / 2, qrY + qrSizeMm + 3, { align: 'center' });
        row1MaxBottomY = Math.max(row1MaxBottomY, qrY + qrSizeMm + 6);
      }

      y = row1MaxBottomY + 5;
    }

    if (preparedExtraRows.length > 0) {
      drawExtraSignatureRowsPdf(
        doc,
        preparedExtraRows,
        y,
        marginX,
        pageWidth,
        pageHeight,
        pdfFont,
        currentFormat,
        currentOrientation
      );
    }
  };

  let y = 12;
  let isFirstSection = true;

  const ensureNewSectionPage = (reportType: SingleReportType, pageKey?: string): jsPDF => {
    const layout = resolveExportPageLayout(settings, opts, reportType, pageKey);
    const meta = getPaperSizeMeta(layout.paperSize);
    currentFormat = meta.jsPdfFormat;
    currentOrientation = layout.orientation;

    if (!doc) {
      doc = new jsPDF({
        orientation: currentOrientation,
        unit: 'mm',
        format: currentFormat,
      });
    } else {
      doc.addPage(currentFormat, currentOrientation);
    }

    doc.setFont(pdfFont, 'normal');
    pageWidth = doc.internal.pageSize.getWidth();
    pageHeight = doc.internal.pageSize.getHeight();
    printableWidth = pageWidth - marginX * 2;
    isFirstSection = false;
    y = drawHeader();
    return doc;
  };

  const filteredJournals = filterJournalsForReport(journals, opts);
  const filteredGrades = filterGradesForReport(grades, opts);
  const selectedReports = resolveSelectedReportTypes(opts, false);
  const hasReport = (id: SingleReportType) => selectedReports.includes(id);

  // 1. RIWAYAT AKTIVITAS MENGAJAR & PENILAIAN GURU (URUTAN SAMA PERSIS DENGAN PRATINJAU)
  if (hasReport('aktivitas_guru')) {
    const activeDoc = ensureNewSectionPage('aktivitas_guru', 'aktivitas_guru');
    activeDoc.setFont(pdfFont, 'bold');
    activeDoc.setFontSize(11.5);
    activeDoc.text('RIWAYAT JURNAL AKTIVITAS MENGAJAR & PENILAIAN GURU', pageWidth / 2, y, {
      align: 'center',
    });
    activeDoc.setFont(pdfFont, 'normal');
    activeDoc.setFontSize(9);
    const teacherFilterText =
      opts.selectedTeacherId && opts.selectedTeacherId !== 'ALL'
        ? ` · Filter: ${
            opts.selectedTeacherId.startsWith('name:')
              ? opts.selectedTeacherId.slice(5)
              : opts.users?.find((u) => u.id === opts.selectedTeacherId)?.name ||
                opts.selectedTeacherId
          }`
        : ' · Semua Guru Pengajar';
    activeDoc.text(
      `Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester}${teacherFilterText}`,
      pageWidth / 2,
      y + 4.8,
      { align: 'center' }
    );
    y += 10;

    const summary = buildTeacherActivitySummary(filteredJournals, filteredGrades, opts.users);
    activeDoc.setFont(pdfFont, 'bold');
    activeDoc.setFontSize(9.5);
    activeDoc.text(`A. Ringkasan Aktivitas per Guru (${summary.length} Guru)`, marginX, y);
    y += 2.5;

    autoTable(activeDoc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['No', 'Nama Guru', 'Jabatan', 'Jurnal Mengajar', 'Entri Nilai', 'Kelas Diampu', 'Mata Pelajaran', 'Aktivitas Terakhir']],
      body:
        summary.length > 0
          ? summary.map((row, idx) => [
              String(idx + 1),
              row.teacherName,
              row.roleLabel,
              `${row.journalCount} Sesi`,
              `${row.gradeCount} Nilai`,
              row.classesHandled.join(', ') || '-',
              row.subjectsHandled.join(', ') || '-',
              row.lastActivityDate ? formatTanggalID(row.lastActivityDate) : '-',
            ])
          : [['-', 'Belum ada catatan aktivitas mengajar maupun penilaian pada filter ini.', '-', '-', '-', '-', '-', '-']],
      styles: {
        font: pdfFont,
        fontSize: 7.5,
        cellPadding: 1.8,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
      },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    });

    let nextY =
      ((activeDoc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20) + 7;
    if (nextY > pageHeight - 35) {
      activeDoc.addPage(currentFormat, currentOrientation);
      nextY = drawHeader();
    }

    activeDoc.setFont(pdfFont, 'bold');
    activeDoc.setFontSize(9.5);
    activeDoc.text(`B. Rincian Jurnal Aktivitas Mengajar Guru (${filteredJournals.length} Sesi)`, marginX, nextY);
    nextY += 2.5;

    autoTable(activeDoc, {
      startY: nextY,
      margin: { left: marginX, right: marginX },
      head: [['No', 'Tanggal', 'Jam', 'Guru Pengajar', 'Kelas', 'Mapel', 'Materi & Kegiatan', 'Presensi']],
      body:
        filteredJournals.length > 0
          ? filteredJournals.map((j, idx) => {
              const c = { H: 0, S: 0, I: 0, A: 0, D: 0 };
              Object.values(j.attendance).forEach((it) => {
                c[it.status] = (c[it.status] || 0) + 1;
              });
              return [
                String(idx + 1),
                formatTanggalID(j.date),
                j.period,
                j.teacherName || settings.teacherProfile.name,
                j.className,
                j.subject,
                `${j.topic}${j.activities ? `\n${j.activities}` : ''}`,
                `H:${c.H} S:${c.S} I:${c.I} A:${c.A} D:${c.D}`,
              ];
            })
          : [['-', '-', '-', '-', '-', '-', 'Belum ada riwayat jurnal mengajar pada filter yang dipilih.', '-']],
      styles: {
        font: pdfFont,
        fontSize: 7.5,
        cellPadding: 1.8,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
      },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    });

    let afterJrnY =
      ((activeDoc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 20) + 7;
    if (afterJrnY > pageHeight - 35) {
      activeDoc.addPage(currentFormat, currentOrientation);
      afterJrnY = drawHeader();
    }

    const studentMap = new Map(students.map((s) => [s.id, s]));
    activeDoc.setFont(pdfFont, 'bold');
    activeDoc.setFontSize(9.5);
    activeDoc.text(`C. Rincian Riwayat Penilaian Guru (${filteredGrades.length} Entri)`, marginX, afterJrnY);
    afterJrnY += 2.5;

    autoTable(activeDoc, {
      startY: afterJrnY,
      margin: { left: marginX, right: marginX },
      head: [['No', 'Guru Penilai', 'Kelas', 'Mapel', 'Jenis Ujian', 'Nama Siswa', 'Nilai', 'Status KKM']],
      body:
        filteredGrades.length > 0
          ? filteredGrades.slice(0, 120).map((g, idx) => {
              const st = studentMap.get(g.studentId);
              const ket = g.score !== null ? (g.score >= settings.kkm ? 'Tuntas' : 'Remedial') : '-';
              return [
                String(idx + 1),
                g.teacherName || settings.teacherProfile.name,
                g.className,
                g.subject,
                g.examType,
                st?.name || g.studentId,
                String(g.score ?? '-'),
                ket,
              ];
            })
          : [['-', '-', '-', '-', '-', 'Belum ada riwayat penilaian guru pada filter yang dipilih.', '-', '-']],
      styles: {
        font: pdfFont,
        fontSize: 7.5,
        cellPadding: 1.8,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
      },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    });

    const finalActY =
      (activeDoc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? afterJrnY + 20;
    drawSignatures(finalActY);
  }

  // 2. JURNAL MENGAJAR
  if (hasReport('jurnal')) {
    const activeDoc = ensureNewSectionPage('jurnal', 'jurnal');
    activeDoc.setFont(pdfFont, 'bold');
    activeDoc.setFontSize(11.5);
    activeDoc.text('LAPORAN JURNAL KEGIATAN MENGAJAR GURU', pageWidth / 2, y, { align: 'center' });
    activeDoc.setFont(pdfFont, 'normal');
    activeDoc.setFontSize(9);
    const periodText =
      opts.startDate || opts.endDate
        ? ` · Periode ${opts.startDate ? formatTanggalID(opts.startDate) : 'Awal'} s.d. ${
            opts.endDate ? formatTanggalID(opts.endDate) : 'Akhir'
          }`
        : '';
    activeDoc.text(
      `Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester}${periodText}`,
      pageWidth / 2,
      y + 4.8,
      { align: 'center' }
    );
    y += 9;

    const bodyRows = filteredJournals.map((j, idx) => {
      const c = { H: 0, S: 0, I: 0, A: 0, D: 0 };
      Object.values(j.attendance).forEach((item) => {
        c[item.status] = (c[item.status] || 0) + 1;
      });
      return [
        String(idx + 1),
        formatTanggalID(j.date),
        j.period,
        j.teacherName || settings.teacherProfile.name,
        j.className,
        j.subject,
        j.topic,
        j.activities,
        `H:${c.H} S:${c.S} I:${c.I} A:${c.A} D:${c.D}`,
      ];
    });

    autoTable(activeDoc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [
        ['No', 'Tanggal', 'Jam', 'Guru Pengajar', 'Kelas', 'Mata Pelajaran', 'Materi Pokok', 'Kegiatan Pembelajaran', 'Presensi'],
      ],
      body:
        bodyRows.length > 0
          ? bodyRows
          : [['-', '-', '-', '-', '-', '-', 'Tidak ada data jurnal pada filter yang dipilih.', '-', '-']],
      styles: {
        font: pdfFont,
        fontSize: 7.5,
        cellPadding: 1.8,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        2: { halign: 'center', cellWidth: 12 },
        4: { cellWidth: 16 },
      },
    });

    const finalY = (activeDoc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
    drawSignatures(finalY);
  }

  // 3. KEHADIRAN MENDATAR
  if (hasReport('kehadiran')) {
    const matrices = buildAttendanceMatrices(students, filteredJournals, opts.selectedClasses);
    matrices.forEach((m) => {
      const activeDoc = ensureNewSectionPage('kehadiran', `kehadiran:${m.className}`);
      activeDoc.setFont(pdfFont, 'bold');
      activeDoc.setFontSize(11.5);
      activeDoc.text(`LEGER KEHADIRAN SISWA MENDATAR — KELAS ${m.className}`, pageWidth / 2, y, {
        align: 'center',
      });
      activeDoc.setFont(pdfFont, 'normal');
      activeDoc.setFontSize(9);
      activeDoc.text(
        `Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester} · Jumlah Pertemuan: ${m.journals.length}`,
        pageWidth / 2,
        y + 4.8,
        { align: 'center' }
      );
      y += 9;

      const dateHeaders = m.journals.map((j) => formatTanggalShort(j.date));
      const head = [['No', 'NIS', 'Nama Siswa', 'L/P', ...dateHeaders, 'H', 'S', 'I', 'A', 'D', '%']];

      const body = m.students.map((st, idx) => {
        const statuses = m.journals.map((j) => j.attendance[st.id]?.status || '-');
        const sum = summarizeStudentAttendance(st.id, m.journals);
        return [
          String(idx + 1),
          st.nis,
          st.name,
          st.gender,
          ...statuses,
          String(sum.H),
          String(sum.S),
          String(sum.I),
          String(sum.A),
          String(sum.D),
          `${sum.pct}%`,
        ];
      });

      const autoKehadiranFont = computeAutoTableFontSize(head[0].length, printableWidth);
      autoTable(activeDoc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head,
        body,
        styles: {
          font: pdfFont,
          fontSize: autoKehadiranFont,
          cellPadding: autoKehadiranFont < 6.5 ? 0.9 : 1.4,
          halign: 'center',
          textColor: [15, 23, 42],
          lineColor: [203, 213, 225],
          lineWidth: 0.15,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        columnStyles: {
          2: { halign: 'left', cellWidth: head[0].length > 18 ? 30 : 40 },
        },
      });

      const finalY = (activeDoc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
      drawSignatures(finalY);
    });
  }

  // 4. REKAP NILAI
  if (hasReport('nilai')) {
    const matrices = buildGradeMatrices(students, grades, settings, opts);
    matrices.forEach((m) => {
      const activeDoc = ensureNewSectionPage('nilai', `nilai:${m.className}:${m.subject}`);
      activeDoc.setFont(pdfFont, 'bold');
      activeDoc.setFontSize(11.5);
      activeDoc.text(`REKAPITULASI NILAI HASIL BELAJAR — KELAS ${m.className}`, pageWidth / 2, y, {
        align: 'center',
      });
      activeDoc.setFont(pdfFont, 'normal');
      activeDoc.setFontSize(9);
      activeDoc.text(
        `Mata Pelajaran: ${m.subject} · KKM: ${settings.kkm} · TA ${settings.academicYear} (${settings.semester})`,
        pageWidth / 2,
        y + 4.8,
        { align: 'center' }
      );
      y += 9;

      const avgLabel = settings.useWeightedAverage ? 'Nilai Akhir' : 'Rata-Rata';
      const head = [
        [
          'No',
          'NIS',
          'Nama Siswa',
          'L/P',
          ...m.examTypes.map((ex) => {
            const w = settings.examWeights?.[ex];
            return settings.useWeightedAverage && w !== undefined ? `${ex} (${w}%)` : ex;
          }),
          avgLabel,
          'Keterangan',
        ],
      ];
      const body = m.students.map((st, idx) => {
        const scores = m.examTypes.map((ex) => {
          const v = m.scoreMap[st.id]?.[ex];
          return v !== null && v !== undefined ? String(v) : '-';
        });
        const avg = m.avgMap[st.id];
        const statusStr = avg !== null ? (avg >= settings.kkm ? 'Tuntas' : 'Remedial') : '-';
        return [
          String(idx + 1),
          st.nis,
          st.name,
          st.gender,
          ...scores,
          avg !== null ? String(avg) : '-',
          statusStr,
        ];
      });

      autoTable(activeDoc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head,
        body,
        styles: {
          font: pdfFont,
          fontSize: 8,
          cellPadding: 1.8,
          halign: 'center',
          textColor: [15, 23, 42],
          lineColor: [203, 213, 225],
          lineWidth: 0.15,
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        columnStyles: {
          2: { halign: 'left', cellWidth: 46 },
        },
      });

      const finalY = (activeDoc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
      drawSignatures(finalY);
    });
  }

  // 5. REKAP PRESENSI RINGKAS PER SISWA & KELAS
  if (hasReport('rekap_presensi')) {
    const recaps = buildAttendanceRecapByClass(students, filteredJournals, opts.selectedClasses);
    if (recaps.length === 0) {
      const activeDoc = ensureNewSectionPage('rekap_presensi', 'rekap_presensi');
      activeDoc.setFont(pdfFont, 'bold');
      activeDoc.setFontSize(11.5);
      activeDoc.text('REKAPITULASI PRESENSI SISWA', pageWidth / 2, y, { align: 'center' });
      activeDoc.setFont(pdfFont, 'normal');
      activeDoc.setFontSize(9.5);
      activeDoc.text('Belum ada data siswa maupun catatan presensi pada kelas yang dipilih.', pageWidth / 2, y + 10, {
        align: 'center',
      });
    } else {
      recaps.forEach((recap) => {
        const activeDoc = ensureNewSectionPage('rekap_presensi', `rekap_presensi:${recap.className}`);
        activeDoc.setFont(pdfFont, 'bold');
        activeDoc.setFontSize(11.5);
        activeDoc.text(`REKAPITULASI PRESENSI SISWA — KELAS ${recap.className}`, pageWidth / 2, y, {
          align: 'center',
        });
        activeDoc.setFont(pdfFont, 'normal');
        activeDoc.setFontSize(9);
        activeDoc.text(
          `Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester} · Pertemuan: ${recap.totalMeetings} · Rata-rata Kehadiran: ${recap.avgPresencePct}% · Perlu Pembinaan: ${recap.attentionCount} siswa`,
          pageWidth / 2,
          y + 4.8,
          { align: 'center' }
        );
        y += 9;

        autoTable(activeDoc, {
          startY: y,
          margin: { left: marginX, right: marginX },
          head: [['No', 'NIS', 'Nama Siswa', 'L/P', 'Pertemuan', 'H', 'S', 'I', 'A', 'D', '% Hadir', 'Keterangan']],
          body: recap.rows.map((r, idx) => [
            String(idx + 1),
            r.student.nis,
            r.student.name,
            r.student.gender,
            String(r.totalMeetings),
            String(r.H),
            String(r.S),
            String(r.I),
            String(r.A),
            String(r.D),
            `${r.pct}%`,
            r.statusLabel,
          ]),
          styles: {
            font: pdfFont,
            fontSize: 8,
            cellPadding: 1.7,
            halign: 'center',
            textColor: [15, 23, 42],
            lineColor: [203, 213, 225],
            lineWidth: 0.15,
          },
          headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
          columnStyles: {
            2: { halign: 'left', cellWidth: 46 },
            11: { halign: 'left', cellWidth: 28 },
          },
        });

        const finalY =
          (activeDoc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
        drawSignatures(finalY);
      });
    }
  }

  // 6. MONITORING KETIDAKHADIRAN (S / I / A / D)
  if (hasReport('ketidakhadiran')) {
    const activeDoc = ensureNewSectionPage('ketidakhadiran', 'ketidakhadiran');
    const abs = buildAbsenceLog(students, filteredJournals);
    activeDoc.setFont(pdfFont, 'bold');
    activeDoc.setFontSize(11.5);
    activeDoc.text('LAPORAN MONITORING & TINDAK LANJUT KETIDAKHADIRAN SISWA', pageWidth / 2, y, {
      align: 'center',
    });
    activeDoc.setFont(pdfFont, 'normal');
    activeDoc.setFontSize(9);
    activeDoc.text(
      `Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester} · Sakit: ${abs.counts.S} · Izin: ${abs.counts.I} · Alpha: ${abs.counts.A} · Dispen: ${abs.counts.D}`,
      pageWidth / 2,
      y + 4.8,
      { align: 'center' }
    );
    y += 10;

    activeDoc.setFont(pdfFont, 'bold');
    activeDoc.setFontSize(9.5);
    activeDoc.text(`A. Rekap Akumulasi Siswa Tidak Hadir (${abs.summary.length} Siswa)`, marginX, y);
    y += 2.5;

    autoTable(activeDoc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['No', 'NIS', 'Nama Siswa', 'Kelas', 'L/P', 'Sakit (S)', 'Izin (I)', 'Alpha (A)', 'Dispen (D)', 'Total']],
      body:
        abs.summary.length > 0
          ? abs.summary.map((s, idx) => [
              String(idx + 1),
              s.nis,
              s.name,
              s.className,
              s.gender,
              String(s.S),
              String(s.I),
              String(s.A),
              String(s.D),
              String(s.total),
            ])
          : [['-', '-', 'Tidak ada siswa yang tercatat tidak hadir pada filter tanggal/kelas terpilih.', '-', '-', '0', '0', '0', '0', '0']],
      styles: {
        font: pdfFont,
        fontSize: 8,
        cellPadding: 1.7,
        halign: 'center',
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
      },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'left', cellWidth: 46 } },
    });

    let nextY =
      ((activeDoc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20) + 7;
    if (nextY > pageHeight - 35) {
      activeDoc.addPage(currentFormat, currentOrientation);
      nextY = drawHeader();
    }

    activeDoc.setFont(pdfFont, 'bold');
    activeDoc.setFontSize(9.5);
    activeDoc.text(`B. Rincian Kronologis Ketidakhadiran (${abs.logs.length} Catatan)`, marginX, nextY);
    nextY += 2.5;

    autoTable(activeDoc, {
      startY: nextY,
      margin: { left: marginX, right: marginX },
      head: [['No', 'Tanggal', 'Jam', 'Kelas', 'Mapel', 'Nama Siswa', 'Status', 'Catatan Guru']],
      body:
        abs.logs.length > 0
          ? abs.logs.slice(0, 150).map((l, idx) => [
              String(idx + 1),
              formatTanggalID(l.date),
              l.period,
              l.className,
              l.subject,
              l.studentName,
              `${l.status} (${l.statusLabel})`,
              l.note,
            ])
          : [['-', '-', '-', '-', '-', 'Belum ada rincian ketidakhadiran pada filter ini.', '-', '-']],
      styles: {
        font: pdfFont,
        fontSize: 7.5,
        cellPadding: 1.6,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
      },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    });

    const finalY =
      (activeDoc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 20;
    drawSignatures(finalY);
  }

  // 7. ANALISIS KETUNTASAN & DAFTAR REMEDIAL
  if (hasReport('remedial')) {
    const activeDoc = ensureNewSectionPage('remedial', 'remedial');
    const blocks = buildRemedialAnalysis(students, grades, settings, opts);
    activeDoc.setFont(pdfFont, 'bold');
    activeDoc.setFontSize(11.5);
    activeDoc.text('LAPORAN ANALISIS KETUNTASAN BELAJAR & PROGRAM REMEDIAL', pageWidth / 2, y, {
      align: 'center',
    });
    activeDoc.setFont(pdfFont, 'normal');
    activeDoc.setFontSize(9);
    activeDoc.text(
      `KKM Sekolah: ${settings.kkm} · Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester}`,
      pageWidth / 2,
      y + 4.8,
      { align: 'center' }
    );
    y += 10;

    activeDoc.setFont(pdfFont, 'bold');
    activeDoc.setFontSize(9.5);
    activeDoc.text(`A. Ringkasan Daya Serap & Ketuntasan Klasikal (${blocks.length} Kelompok)`, marginX, y);
    y += 2.5;

    autoTable(activeDoc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['No', 'Kelas', 'Mata Pelajaran', 'Siswa', 'Dinilai', 'Tuntas', 'Remedial', 'Daya Serap', 'Rata-rata', 'Min / Maks']],
      body:
        blocks.length > 0
          ? blocks.map((b, idx) => [
              String(idx + 1),
              b.className,
              b.subject,
              String(b.totalStudents),
              String(b.assessedCount),
              String(b.tuntasCount),
              String(b.remedialCount),
              `${b.passRatePct}%`,
              b.classAvg !== null ? String(b.classAvg) : '-',
              b.lowest !== null && b.highest !== null ? `${b.lowest} / ${b.highest}` : '-',
            ])
          : [['-', '-', 'Belum ada data nilai untuk dianalisis pada filter yang dipilih.', '-', '-', '-', '-', '-', '-', '-']],
      styles: {
        font: pdfFont,
        fontSize: 8,
        cellPadding: 1.7,
        halign: 'center',
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
      },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'left', cellWidth: 42 } },
    });

    let nextY =
      ((activeDoc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20) + 7;
    if (nextY > pageHeight - 35) {
      activeDoc.addPage(currentFormat, currentOrientation);
      nextY = drawHeader();
    }

    const remedialRows = blocks.flatMap((b) =>
      b.remedialStudents.map((r) => ({ block: b, row: r }))
    );

    activeDoc.setFont(pdfFont, 'bold');
    activeDoc.setFontSize(9.5);
    activeDoc.text(`B. Daftar Siswa Wajib Remedial (< KKM ${settings.kkm}) — ${remedialRows.length} Entri`, marginX, nextY);
    nextY += 2.5;

    autoTable(activeDoc, {
      startY: nextY,
      margin: { left: marginX, right: marginX },
      head: [['No', 'Kelas', 'Mata Pelajaran', 'NIS', 'Nama Siswa', 'Nilai', 'Kurang', 'Komponen < KKM', 'Rekomendasi Tindak Lanjut']],
      body:
        remedialRows.length > 0
          ? remedialRows.map((item, idx) => [
              String(idx + 1),
              item.block.className,
              item.block.subject,
              item.row.student.nis,
              item.row.student.name,
              String(item.row.avgScore),
              `-${item.row.deficit}`,
              item.row.belowExamDetails,
              item.row.actionNote,
            ])
          : [['-', '-', '-', '-', `Seluruh siswa yang sudah dinilai memenuhi KKM (${settings.kkm}).`, '-', '-', '-', '-']],
      styles: {
        font: pdfFont,
        fontSize: 7.5,
        cellPadding: 1.6,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
      },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    });

    const finalY =
      (activeDoc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 20;
    drawSignatures(finalY);
  }

  // 8. LEGER NILAI GABUNGAN SEMUA MAPEL PER KELAS
  if (hasReport('leger_kelas')) {
    const ledgers = buildClassMultiSubjectLedger(students, grades, settings, opts);
    ledgers.forEach((l) => {
      const activeDoc = ensureNewSectionPage('leger_kelas', `leger_kelas:${l.className}`);
      activeDoc.setFont(pdfFont, 'bold');
      activeDoc.setFontSize(11.5);
      activeDoc.text(`LEGER NILAI GABUNGAN MATA PELAJARAN — KELAS ${l.className}`, pageWidth / 2, y, {
        align: 'center',
      });
      activeDoc.setFont(pdfFont, 'normal');
      activeDoc.setFontSize(9);
      activeDoc.text(
        `KKM: ${settings.kkm} · Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester}`,
        pageWidth / 2,
        y + 4.8,
        { align: 'center' }
      );
      y += 9;

      const head = [['No', 'NIS', 'Nama Siswa', 'L/P', ...l.subjects, 'Jumlah', 'Rata-rata', 'Rank', 'Status KKM']];
      const body = l.rows.map((r, idx) => [
        String(idx + 1),
        r.student.nis,
        r.student.name,
        r.student.gender,
        ...l.subjects.map((s) => {
          const v = r.subjectAvgMap[s];
          return v !== null && v !== undefined ? String(v) : '-';
        }),
        r.totalScore !== null ? String(r.totalScore) : '-',
        r.overallAvg !== null ? String(r.overallAvg) : '-',
        r.rank !== null ? String(r.rank) : '-',
        r.statusLabel,
      ]);

      const autoLegerFont = computeAutoTableFontSize(head[0].length, printableWidth);
      autoTable(activeDoc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head,
        body,
        styles: {
          font: pdfFont,
          fontSize: Math.min(7.5, autoLegerFont),
          cellPadding: autoLegerFont < 6.5 ? 0.9 : 1.4,
          halign: 'center',
          textColor: [15, 23, 42],
          lineColor: [203, 213, 225],
          lineWidth: 0.15,
          overflow: 'linebreak',
        },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: { 2: { halign: 'left', cellWidth: head[0].length > 14 ? 30 : 38 } },
      });

      const finalY =
        (activeDoc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
      drawSignatures(finalY);
    });
  }

  // 9. DAFTAR INDUK & PROFIL SISWA PER KELAS
  if (hasReport('daftar_siswa')) {
    const blocks = buildStudentRosterByClass(students, opts.selectedClasses);
    blocks.forEach((b) => {
      const activeDoc = ensureNewSectionPage('daftar_siswa', `daftar_siswa:${b.className}`);
      activeDoc.setFont(pdfFont, 'bold');
      activeDoc.setFontSize(11.5);
      activeDoc.text(`DAFTAR INDUK PESERTA DIDIK — KELAS ${b.className}`, pageWidth / 2, y, {
        align: 'center',
      });
      activeDoc.setFont(pdfFont, 'normal');
      activeDoc.setFontSize(9);
      activeDoc.text(
        `Wali Kelas: ${b.homeroomTeacher} · Laki-laki: ${b.maleCount} · Perempuan: ${b.femaleCount} · Total: ${b.totalCount} Siswa · TA ${settings.academicYear}`,
        pageWidth / 2,
        y + 4.8,
        { align: 'center' }
      );
      y += 9;

      autoTable(activeDoc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['No', 'Absen', 'NIS', 'NISN', 'Nama Lengkap', 'L/P', 'Tempat, Tanggal Lahir', 'Wali Kelas', 'Status']],
        body: b.students.map((item, idx) => [
          String(idx + 1),
          item.student.absenNo || '-',
          item.student.nis,
          item.student.nisn || '-',
          item.student.name,
          item.student.gender,
          item.ttlDisplay,
          item.student.homeroomTeacher || '-',
          item.statusText,
        ]),
        styles: {
          font: pdfFont,
          fontSize: 7.8,
          cellPadding: 1.6,
          textColor: [15, 23, 42],
          lineColor: [203, 213, 225],
          lineWidth: 0.15,
        },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 8 },
          1: { halign: 'center', cellWidth: 11 },
          5: { halign: 'center', cellWidth: 9 },
        },
      });

      const finalY =
        (activeDoc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
      drawSignatures(finalY);
    });
  }

  if (isFirstSection || !doc) {
    const fallbackSize = opts.paperSize || settings.reportPaperSize || 'A4';
    const fallbackMeta = getPaperSizeMeta(fallbackSize);
    doc = new jsPDF({
      orientation: opts.orientation,
      unit: 'mm',
      format: fallbackMeta.jsPdfFormat,
    });
    doc.setFont(pdfFont, 'normal');
    pageWidth = doc.internal.pageSize.getWidth();
    y = drawHeader();
    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(11);
    doc.text('LAPORAN RESMI PORTAL E-GURU', pageWidth / 2, y + 6, { align: 'center' });
    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(9.5);
    doc.text(
      'Tidak ada data yang tersedia untuk kombinasi jenis laporan dan filter yang dipilih.',
      pageWidth / 2,
      y + 14,
      { align: 'center' }
    );
  }

  doc.save(`Laporan_Resmi_${buildReportFileTag(selectedReports)}_${getTodayIso()}.pdf`);
}

// =========================================================================
// INDIVIDUAL STUDENT REPORT PDF
// =========================================================================
export async function exportStudentIndividualPdf(
  student: Student,
  journals: JournalEntry[],
  grades: GradeRecord[],
  settings: SystemSettings,
  opts?: {
    showPrincipalSig?: boolean;
    showTeacherSig?: boolean;
    showStamp?: boolean;
    showPrincipalSigImg?: boolean;
    showTeacherSigImg?: boolean;
    showStampImg?: boolean;
    teacherSignatureOverride?: TeacherSignatureOverride;
    documentNumber?: string;
    showQrVerification?: boolean;
    fontFamily?: PrintFontFamily;
    paperSize?: PaperSize;
  }
) {
  const paperMeta = getPaperSizeMeta(opts?.paperSize || settings.reportPaperSize);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: paperMeta.jsPdfFormat,
  });

  const normKop = normalizeKopSurat(settings.kopSurat);
  const sigStamp = normalizeSignatureStamp(settings);
  const activeReportFont = opts?.fontFamily || settings.reportFontFamily || normKop.fontFamily;
  const bodyFont = mapPrintFontToJsPdf(activeReportFont);
  const kopFont = mapPrintFontToJsPdf(normKop.fontFamily);
  const showPrincipalSig = opts?.showPrincipalSig ?? false;
  const showTeacherSig = opts?.showTeacherSig ?? true;
  const showStamp = opts?.showStampImg ?? opts?.showStamp ?? sigStamp.showStampDefault;
  const showPrincipalImg = opts?.showPrincipalSigImg ?? sigStamp.showPrincipalSigImgDefault !== false;
  const showTeacherImg = opts?.showTeacherSigImg ?? sigStamp.showTeacherSigImgDefault !== false;

  const effectiveTeacherSigUrl =
    opts?.teacherSignatureOverride?.dataUrl || sigStamp.teacherSignatureDataUrl;
  const effectiveTeacherSigPx = Math.max(
    40,
    Math.min(280, opts?.teacherSignatureOverride?.size ?? sigStamp.signatureSize)
  );
  const effectiveTeacherOffX = opts?.teacherSignatureOverride?.offsetX ?? sigStamp.teacherSigOffsetX;
  const effectiveTeacherOffY = opts?.teacherSignatureOverride?.offsetY ?? sigStamp.teacherSigOffsetY;
  const effectiveTeacherName =
    opts?.teacherSignatureOverride?.teacherName || settings.teacherProfile.name;
  const effectiveTeacherNip =
    opts?.teacherSignatureOverride?.teacherNip || settings.teacherProfile.nip;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;

  const [leftPng, rightPng, principalSigPng, teacherSigPng, stampPng, preparedExtraRows] =
    await Promise.all([
      dataUrlToPngBase64(normKop.leftLogoDataUrl),
      dataUrlToPngBase64(normKop.rightLogoDataUrl),
      showPrincipalSig && showPrincipalImg && sigStamp.principalSignatureDataUrl
        ? dataUrlToPngBase64(sigStamp.principalSignatureDataUrl, 480)
        : Promise.resolve(null),
      showTeacherSig && showTeacherImg && effectiveTeacherSigUrl
        ? dataUrlToPngBase64(effectiveTeacherSigUrl, 480)
        : Promise.resolve(null),
      showStamp && sigStamp.stampDataUrl
        ? dataUrlToPngBase64(sigStamp.stampDataUrl, 480)
        : Promise.resolve(null),
      prepareExtraSignatureRows(sigStamp.extraRows),
    ]);
  const [principalAspect, teacherAspect, leftLogoAspect, rightLogoAspect] = await Promise.all([
    getPngAspectRatio(principalSigPng),
    getPngAspectRatio(teacherSigPng),
    getPngAspectRatio(leftPng),
    getPngAspectRatio(rightPng),
  ]);
  const qrPng = opts?.showQrVerification
    ? await createVerificationQrPng(
        `Profil Siswa: ${student.name} (${student.nis}) | Kelas ${student.className} | ${formatTanggalID(getTodayIso())}`
      )
    : null;
  let photoPng = await dataUrlToPngBase64(getStudentPhotoUrl(student), 240);
  if (!photoPng && student.photoDataUrl) {
    photoPng = await dataUrlToPngBase64(
      getStudentPhotoUrl({ photoDataUrl: '', gender: student.gender }),
      240
    );
  }

  const centerX = pageWidth / 2;
  let y = drawPdfKopSurat({
    doc,
    kopSurat: settings.kopSurat,
    leftPng,
    rightPng,
    leftAspect: leftLogoAspect,
    rightAspect: rightLogoAspect,
    marginX,
    pageWidth,
    topY: 12,
    bodyFont,
  }) + 1;

  doc.setFont(bodyFont, 'bold');
  doc.setFontSize(11.5);
  doc.text('PROFIL & LAPORAN AKTIVITAS INDIVIDU SISWA', centerX, y, { align: 'center' });
  doc.setFont(bodyFont, 'normal');
  doc.setFontSize(9);
  doc.text(
    `Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester}`,
    centerX,
    y + 4.8,
    { align: 'center' }
  );
  y += 10;

  if (photoPng) {
    doc.setDrawColor(203, 213, 225);
    doc.rect(marginX, y, 28, 36);
    doc.addImage(photoPng, 'PNG', marginX + 1, y + 1, 26, 34);
  }

  const infoX = marginX + 33;
  const displayTtl =
    [student.birthPlace?.trim(), student.birthDate?.trim()].filter(Boolean).join(', ') ||
    student.ttl ||
    '-';
  const statusLabel =
    student.status === 'lulus'
      ? 'Lulus / Alumni'
      : student.status === 'pindah'
        ? 'Pindah'
        : student.status === 'keluar'
          ? 'Keluar'
          : 'Aktif';
  const infoRows: [string, string][] = [
    ['Nama Lengkap', student.name],
    ['NIS / NISN', `${student.nis}  /  ${student.nisn || '-'}`],
    ['Kelas / No. Absen', `${student.className}  /  No. ${student.absenNo || '-'}`],
    ['JK / Status', `${student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}  (${statusLabel})`],
    ['Tempat, Tgl Lahir', displayTtl],
    ['No. HP / Email', `${student.phone || '-'}  |  ${student.email || '-'}`],
    ['Wali Kelas / BK', `${student.homeroomTeacher || '-'}  |  BK: ${student.counselor || '-'}`],
    ['Alamat', student.address || '-'],
  ];

  doc.setFontSize(8.5);
  infoRows.forEach(([lbl, val], idx) => {
    const rowY = y + 3.2 + idx * 4.7;
    doc.setFont(bodyFont, 'bold');
    doc.text(lbl, infoX, rowY);
    doc.setFont(bodyFont, 'normal');
    doc.text(`: ${val}`, infoX + 33, rowY, { maxWidth: pageWidth - marginX - (infoX + 33) });
  });

  y += 46;

  const studentJournals = journals
    .filter((j) => j.className === student.className)
    .sort((a, b) => b.date.localeCompare(a.date));

  const studentGrades = grades
    .filter((g) => g.studentId === student.id && g.score !== null)
    .sort((a, b) => a.subject.localeCompare(b.subject));

  doc.setFont(bodyFont, 'bold');
  doc.setFontSize(10);
  doc.text(`A. Riwayat Aktivitas & Kehadiran di Kelas (${studentJournals.length} Sesi)`, marginX, y);
  y += 2.5;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['No', 'Tanggal', 'Jam', 'Mata Pelajaran', 'Materi & Kegiatan', 'Status', 'Catatan']],
    body:
      studentJournals.length > 0
        ? studentJournals.map((j, idx) => {
            const att = j.attendance[student.id] ?? { status: 'H', note: '' };
            const meta = ATTENDANCE_META[att.status];
            return [
              String(idx + 1),
              formatTanggalID(j.date),
              j.period,
              j.subject,
              `${j.topic}\n${j.activities}`,
              `${meta.shortLabel} (${meta.label})`,
              att.note || '-',
            ];
          })
        : [['-', '-', '-', '-', 'Belum ada catatan pertemuan kelas', '-', '-']],
    styles: {
      font: bodyFont,
      fontSize: 8,
      cellPadding: 1.8,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
    },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
  });

  const afterActY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
  y = afterActY + 8;
  if (y > pageHeight - 40) {
    doc.addPage(paperMeta.jsPdfFormat, 'portrait');
    y = 18;
  }

  doc.setFont(bodyFont, 'bold');
  doc.setFontSize(10);
  doc.text(`B. Riwayat Penilaian & Evaluasi (KKM ${settings.kkm})`, marginX, y);
  y += 2.5;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['No', 'Mata Pelajaran', 'Jenis Ujian', 'Nilai', 'Status', 'Catatan Guru']],
    body:
      studentGrades.length > 0
        ? studentGrades.map((g, idx) => {
            const mk = ROW_MARKER_META[g.marker || 'neutral'];
            return [
              String(idx + 1),
              g.subject,
              g.examType,
              String(g.score ?? '-'),
              mk.label,
              g.note || '-',
            ];
          })
        : [['-', '-', '-', '-', 'Belum ada nilai tercatat', '-']],
    styles: {
      font: bodyFont,
      fontSize: 8,
      cellPadding: 1.8,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
    },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
  });

  const afterGradeY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
  if (showPrincipalSig || showTeacherSig || qrPng || preparedExtraRows.length > 0) {
    let nextSigY = afterGradeY + 10;
    if (showPrincipalSig || showTeacherSig || qrPng) {
      const maxBlockDownMm = Math.max(
        0,
        pxToMm(sigStamp.principalBlockOffsetY),
        pxToMm(sigStamp.teacherBlockOffsetY)
      );
      if (nextSigY + 36 + maxBlockDownMm > pageHeight - 10) {
        doc.addPage(paperMeta.jsPdfFormat, 'portrait');
        nextSigY = 20;
      }

      doc.setFont(bodyFont, 'normal');
      doc.setFontSize(9.5);
      const pSigMm = pxToMm(sigStamp.signatureSize);
      const pSigW = Math.round(pSigMm * principalAspect * 100) / 100;
      const tSigMm = pxToMm(effectiveTeacherSigPx);
      const tSigW = Math.round(tSigMm * teacherAspect * 100) / 100;
      const stampMm = pxToMm(sigStamp.stampSize);
      const stampOnTeacher =
        (sigStamp.stampTarget === 'teacher' && showTeacherSig) || !showPrincipalSig;

      const clampBlockX = (xVal: number) => Math.max(6, Math.min(pageWidth - 48, xVal));
      const clampBlockY = (yVal: number) => Math.max(12, Math.min(pageHeight - 34, yVal));

      let row1MaxBottomY = nextSigY + 32;

      if (showPrincipalSig) {
        const leftX = clampBlockX(marginX + 8 + pxToMm(sigStamp.principalBlockOffsetX));
        const pY = clampBlockY(nextSigY + pxToMm(sigStamp.principalBlockOffsetY));
        const pStageCenterY = pY + 14.5;
        doc.text('Mengetahui,', leftX, pY);
        doc.text(settings.principalTitle, leftX, pY + 4.8);
        if (stampPng && !stampOnTeacher) {
          const stampCx = leftX + 2 + pxToMm(sigStamp.stampOffsetX);
          const stampCy = pStageCenterY + pxToMm(sigStamp.stampOffsetY);
          doc.addImage(
            stampPng,
            'PNG',
            stampCx - stampMm / 2,
            stampCy - stampMm / 2,
            stampMm,
            stampMm
          );
        }
        if (principalSigPng) {
          const sigCx = leftX + 17 + pxToMm(sigStamp.principalSigOffsetX);
          const sigCy = pStageCenterY + pxToMm(sigStamp.principalSigOffsetY);
          doc.addImage(
            principalSigPng,
            'PNG',
            sigCx - pSigW / 2,
            sigCy - pSigMm / 2,
            pSigW,
            pSigMm
          );
        }
        doc.setFont(bodyFont, 'bold');
        doc.text(settings.principalName, leftX, pY + 24);
        doc.setLineWidth(0.25);
        doc.line(leftX, pY + 24.7, leftX + doc.getTextWidth(settings.principalName), pY + 24.7);
        doc.setFont(bodyFont, 'normal');
        doc.text(`NIP. ${settings.principalNip}`, leftX, pY + 28.6);
        row1MaxBottomY = Math.max(row1MaxBottomY, pY + 32);
      }

      if (showTeacherSig) {
        const rightX = clampBlockX(pageWidth - marginX - 68 + pxToMm(sigStamp.teacherBlockOffsetX));
        const tY = clampBlockY(nextSigY + pxToMm(sigStamp.teacherBlockOffsetY));
        const tStageCenterY = tY + 14.5;
        doc.text(`${settings.signatureCity}, ${formatTanggalID(getTodayIso())}`, rightX, tY);
        doc.text('Guru Mata Pelajaran,', rightX, tY + 4.8);
        if (stampPng && stampOnTeacher) {
          const stampCx = rightX + pxToMm(sigStamp.stampOffsetX);
          const stampCy = tStageCenterY + pxToMm(sigStamp.stampOffsetY);
          doc.addImage(
            stampPng,
            'PNG',
            stampCx - stampMm / 2,
            stampCy - stampMm / 2,
            stampMm,
            stampMm
          );
        }
        if (teacherSigPng) {
          const sigCx = rightX + 17 + pxToMm(effectiveTeacherOffX);
          const sigCy = tStageCenterY + pxToMm(effectiveTeacherOffY);
          doc.addImage(
            teacherSigPng,
            'PNG',
            sigCx - tSigW / 2,
            sigCy - tSigMm / 2,
            tSigW,
            tSigMm
          );
        }
        doc.setFont(bodyFont, 'bold');
        doc.text(effectiveTeacherName, rightX, tY + 24);
        doc.setLineWidth(0.25);
        doc.line(rightX, tY + 24.7, rightX + doc.getTextWidth(effectiveTeacherName), tY + 24.7);
        doc.setFont(bodyFont, 'normal');
        doc.text(`NIP. ${effectiveTeacherNip}`, rightX, tY + 28.6);
        row1MaxBottomY = Math.max(row1MaxBottomY, tY + 32);
      }

      if (qrPng) {
        const qrSizeMm = 17;
        const qrX = pageWidth / 2 - qrSizeMm / 2;
        const qrY = Math.min(pageHeight - qrSizeMm - 8, nextSigY + 6);
        doc.addImage(qrPng, 'PNG', qrX, qrY, qrSizeMm, qrSizeMm);
        row1MaxBottomY = Math.max(row1MaxBottomY, qrY + qrSizeMm + 4);
      }

      nextSigY = row1MaxBottomY + 5;
    }

    if (preparedExtraRows.length > 0) {
      drawExtraSignatureRowsPdf(
        doc,
        preparedExtraRows,
        nextSigY,
        marginX,
        pageWidth,
        pageHeight,
        bodyFont,
        paperMeta.jsPdfFormat,
        'portrait'
      );
    }
  }

  const safeName = student.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Profil_Siswa_${safeName}_${getTodayIso()}.pdf`);
}

// =========================================================================
// CUSTOM IMPORTED EXCEL/CSV -> OFFICIAL PDF WITH KOP & SIGNATURES
// =========================================================================
export async function exportCustomImportedReportToPdf(
  imported: ImportedReportData,
  settings: SystemSettings,
  opts: ReportFilterOptions
) {
  const importedLayout = opts.pageLayouts?.imported;
  const effSize = importedLayout?.paperSize || opts.paperSize || settings.reportPaperSize;
  const effOrient = importedLayout?.orientation || opts.orientation;
  const paperMeta = getPaperSizeMeta(effSize);
  const doc = new jsPDF({
    orientation: effOrient,
    unit: 'mm',
    format: paperMeta.jsPdfFormat,
  });

  const pdfFont = mapPrintFontToJsPdf(opts.fontFamily);
  doc.setFont(pdfFont, 'normal');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const printableWidth = pageWidth - marginX * 2;
  const sigStamp = normalizeSignatureStamp(settings);

  const showPrincipalImg = opts.showPrincipalSigImg ?? sigStamp.showPrincipalSigImgDefault !== false;
  const showTeacherImg = opts.showTeacherSigImg ?? sigStamp.showTeacherSigImgDefault !== false;
  const showStampImg = opts.showStampImg ?? opts.showStamp ?? sigStamp.showStampDefault;
  const showExtraSigRows = opts.showExtraSigRows ?? true;
  const effectiveExtraRows = showExtraSigRows
    ? opts.extraSigRowsOverride ?? sigStamp.extraRows
    : [];

  const effectiveTeacherSigUrl =
    opts.teacherSignatureOverride?.dataUrl || sigStamp.teacherSignatureDataUrl;
  const effectiveTeacherSigPx = Math.max(
    40,
    Math.min(280, opts.teacherSignatureOverride?.size ?? sigStamp.signatureSize)
  );
  const effectiveTeacherOffX = opts.teacherSignatureOverride?.offsetX ?? sigStamp.teacherSigOffsetX;
  const effectiveTeacherOffY = opts.teacherSignatureOverride?.offsetY ?? sigStamp.teacherSigOffsetY;
  const effectiveTeacherName =
    opts.teacherSignatureOverride?.teacherName || settings.teacherProfile.name;
  const effectiveTeacherNip =
    opts.teacherSignatureOverride?.teacherNip || settings.teacherProfile.nip;

  const [leftPng, rightPng, principalSigPng, teacherSigPng, stampPng, preparedExtraRows] =
    await Promise.all([
      opts.showKopSurat ? dataUrlToPngBase64(settings.kopSurat.leftLogoDataUrl) : Promise.resolve(null),
      opts.showKopSurat ? dataUrlToPngBase64(settings.kopSurat.rightLogoDataUrl) : Promise.resolve(null),
      opts.showPrincipalSig && showPrincipalImg && sigStamp.principalSignatureDataUrl
        ? dataUrlToPngBase64(sigStamp.principalSignatureDataUrl, 480)
        : Promise.resolve(null),
      opts.showTeacherSig && showTeacherImg && effectiveTeacherSigUrl
        ? dataUrlToPngBase64(effectiveTeacherSigUrl, 480)
        : Promise.resolve(null),
      showStampImg && sigStamp.stampDataUrl
        ? dataUrlToPngBase64(sigStamp.stampDataUrl, 480)
        : Promise.resolve(null),
      prepareExtraSignatureRows(effectiveExtraRows),
    ]);

  const [principalAspect, teacherAspect, leftLogoAspect, rightLogoAspect] = await Promise.all([
    getPngAspectRatio(principalSigPng),
    getPngAspectRatio(teacherSigPng),
    getPngAspectRatio(leftPng),
    getPngAspectRatio(rightPng),
  ]);

  let y = 12;
  if (opts.showKopSurat) {
    y = drawPdfKopSurat({
      doc,
      kopSurat: settings.kopSurat,
      leftPng,
      rightPng,
      leftAspect: leftLogoAspect,
      rightAspect: rightLogoAspect,
      marginX,
      pageWidth,
      topY: 12,
      bodyFont: pdfFont,
    });
  }

  doc.setFont(pdfFont, 'normal');
  const docNumberClean = (opts.documentNumber || '').trim();
  if (docNumberClean) {
    doc.setFontSize(8.5);
    doc.text(`Nomor Dokumen: ${docNumberClean}`, marginX, y);
    y += 4.5;
  }

  doc.setFont(pdfFont, 'bold');
  doc.setFontSize(11.5);
  doc.text(imported.title.toUpperCase(), pageWidth / 2, y, { align: 'center' });
  doc.setFont(pdfFont, 'normal');
  doc.setFontSize(9);
  doc.text(
    `Sumber Berkas: ${imported.fileName} · Tahun Ajaran ${settings.academicYear} (${settings.semester})`,
    pageWidth / 2,
    y + 4.8,
    { align: 'center' }
  );
  y += 9;

  const autoFont = computeAutoTableFontSize(imported.headers.length, printableWidth);
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [imported.headers],
    body: imported.rows.length > 0 ? imported.rows : [imported.headers.map(() => '-')],
    styles: {
      font: pdfFont,
      fontSize: autoFont,
      cellPadding: autoFont < 6.5 ? 1.0 : 1.6,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
      overflow: 'linebreak',
    },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 24;
  let sigY = finalY + 8;

  const qrPng = opts.showQrVerification
    ? await createVerificationQrPng(`${imported.title} | ${docNumberClean || imported.fileName} | ${formatTanggalID(getTodayIso())}`)
    : null;

  if (opts.showPrincipalSig || opts.showTeacherSig || qrPng) {
    if (sigY + 38 > pageHeight - 10) {
      doc.addPage(paperMeta.jsPdfFormat, effOrient);
      sigY = 18;
    }

    const pSigMm = pxToMm(sigStamp.signatureSize);
    const pSigW = Math.round(pSigMm * principalAspect * 100) / 100;
    const tSigMm = pxToMm(effectiveTeacherSigPx);
    const tSigW = Math.round(tSigMm * teacherAspect * 100) / 100;
    const stampMm = pxToMm(sigStamp.stampSize);
    const stampOnTeacher =
      (sigStamp.stampTarget === 'teacher' && opts.showTeacherSig) || !opts.showPrincipalSig;

    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(9.5);
    let row1Bottom = sigY + 32;

    if (opts.showPrincipalSig) {
      const leftX = Math.max(6, Math.min(pageWidth - 48, marginX + 8 + pxToMm(sigStamp.principalBlockOffsetX)));
      const pY = Math.max(12, Math.min(pageHeight - 34, sigY + pxToMm(sigStamp.principalBlockOffsetY)));
      const centerY = pY + 14.5;
      doc.text('Mengetahui,', leftX, pY);
      doc.text(settings.principalTitle, leftX, pY + 4.8);
      if (stampPng && !stampOnTeacher) {
        doc.addImage(
          stampPng,
          'PNG',
          leftX + 2 + pxToMm(sigStamp.stampOffsetX) - stampMm / 2,
          centerY + pxToMm(sigStamp.stampOffsetY) - stampMm / 2,
          stampMm,
          stampMm
        );
      }
      if (principalSigPng) {
        doc.addImage(
          principalSigPng,
          'PNG',
          leftX + 17 + pxToMm(sigStamp.principalSigOffsetX) - pSigW / 2,
          centerY + pxToMm(sigStamp.principalSigOffsetY) - pSigMm / 2,
          pSigW,
          pSigMm
        );
      }
      doc.setFont(pdfFont, 'bold');
      doc.text(settings.principalName, leftX, pY + 24);
      doc.setLineWidth(0.25);
      doc.line(leftX, pY + 24.7, leftX + doc.getTextWidth(settings.principalName), pY + 24.7);
      doc.setFont(pdfFont, 'normal');
      doc.text(`NIP. ${settings.principalNip}`, leftX, pY + 28.6);
      row1Bottom = Math.max(row1Bottom, pY + 32);
    }

    if (opts.showTeacherSig) {
      const rightX = Math.max(6, Math.min(pageWidth - 48, pageWidth - marginX - 68 + pxToMm(sigStamp.teacherBlockOffsetX)));
      const tY = Math.max(12, Math.min(pageHeight - 34, sigY + pxToMm(sigStamp.teacherBlockOffsetY)));
      const centerY = tY + 14.5;
      doc.text(`${settings.signatureCity}, ${formatTanggalID(getTodayIso())}`, rightX, tY);
      doc.text('Guru Mata Pelajaran,', rightX, tY + 4.8);
      if (stampPng && stampOnTeacher) {
        doc.addImage(
          stampPng,
          'PNG',
          rightX + pxToMm(sigStamp.stampOffsetX) - stampMm / 2,
          centerY + pxToMm(sigStamp.stampOffsetY) - stampMm / 2,
          stampMm,
          stampMm
        );
      }
      if (teacherSigPng) {
        doc.addImage(
          teacherSigPng,
          'PNG',
          rightX + 17 + pxToMm(effectiveTeacherOffX) - tSigW / 2,
          centerY + pxToMm(effectiveTeacherOffY) - tSigMm / 2,
          tSigW,
          tSigMm
        );
      }
      doc.setFont(pdfFont, 'bold');
      doc.text(effectiveTeacherName, rightX, tY + 24);
      doc.setLineWidth(0.25);
      doc.line(rightX, tY + 24.7, rightX + doc.getTextWidth(effectiveTeacherName), tY + 24.7);
      doc.setFont(pdfFont, 'normal');
      doc.text(`NIP. ${effectiveTeacherNip}`, rightX, tY + 28.6);
      row1Bottom = Math.max(row1Bottom, tY + 32);
    }

    if (qrPng) {
      const qrSizeMm = 17;
      doc.addImage(qrPng, 'PNG', pageWidth / 2 - qrSizeMm / 2, Math.min(pageHeight - 25, sigY + 6), qrSizeMm, qrSizeMm);
    }

    sigY = row1Bottom + 5;
  }

  if (preparedExtraRows.length > 0) {
    drawExtraSignatureRowsPdf(
      doc,
      preparedExtraRows,
      sigY,
      marginX,
      pageWidth,
      pageHeight,
      pdfFont,
      paperMeta.jsPdfFormat,
      effOrient
    );
  }

  const slug = imported.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'Dokumen_Impor';
  doc.save(`Laporan_Resmi_${slug}_${getTodayIso()}.pdf`);
}

// =========================================================================
// WORD (.DOC) EXPORT — SAFE HTML ESCAPING + 1:1 PARITY PER-PAGE ORIENTATION
// =========================================================================
function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function exportReportToWord(
  students: Student[],
  journals: JournalEntry[],
  grades: GradeRecord[],
  settings: SystemSettings,
  opts: ReportFilterOptions,
  importedReport?: ImportedReportData | null
) {
  const normKop = normalizeKopSurat(settings.kopSurat);
  const sigStamp = normalizeSignatureStamp(settings);
  const showPrincipalImg = opts.showPrincipalSigImg ?? sigStamp.showPrincipalSigImgDefault !== false;
  const showTeacherImg = opts.showTeacherSigImg ?? sigStamp.showTeacherSigImgDefault !== false;
  const showStampImg = opts.showStampImg ?? opts.showStamp ?? sigStamp.showStampDefault;
  const showExtraSigRows = opts.showExtraSigRows ?? true;
  const effectiveExtraRows = showExtraSigRows
    ? opts.extraSigRowsOverride ?? sigStamp.extraRows
    : [];

  const effectiveTeacherSigUrl =
    opts.teacherSignatureOverride?.dataUrl || sigStamp.teacherSignatureDataUrl;
  const effectiveTeacherName =
    opts.teacherSignatureOverride?.teacherName || settings.teacherProfile.name;
  const effectiveTeacherNip =
    opts.teacherSignatureOverride?.teacherNip || settings.teacherProfile.nip;
  const docNumberClean = (opts.documentNumber || '').trim();

  const qrPayload = [
    settings.kopSurat.line4 || settings.teacherProfile.school || 'Portal E-Guru',
    docNumberClean ? `No: ${docNumberClean}` : 'Dokumen Resmi Portal E-Guru',
    `TA ${settings.academicYear} (${settings.semester})`,
    `Tanggal Cetak: ${formatTanggalID(getTodayIso())}`,
    `Penandatangan: ${effectiveTeacherName}`,
  ].join(' | ');

  const [leftPng, rightPng, principalSigPng, teacherSigPng, stampPng, qrPng, preparedExtraRows] =
    await Promise.all([
      opts.showKopSurat ? dataUrlToPngBase64(normKop.leftLogoDataUrl) : Promise.resolve(null),
      opts.showKopSurat ? dataUrlToPngBase64(normKop.rightLogoDataUrl) : Promise.resolve(null),
      opts.showPrincipalSig && showPrincipalImg && sigStamp.principalSignatureDataUrl
        ? dataUrlToPngBase64(sigStamp.principalSignatureDataUrl, 480)
        : Promise.resolve(null),
      opts.showTeacherSig && showTeacherImg && effectiveTeacherSigUrl
        ? dataUrlToPngBase64(effectiveTeacherSigUrl, 480)
        : Promise.resolve(null),
      showStampImg && sigStamp.stampDataUrl
        ? dataUrlToPngBase64(sigStamp.stampDataUrl, 480)
        : Promise.resolve(null),
      opts.showQrVerification ? createVerificationQrPng(qrPayload) : Promise.resolve(null),
      prepareExtraSignatureRows(effectiveExtraRows),
    ]);

  const kopFontCss = getPrintFontCss(normKop.fontFamily);
  const bodyFontCss = getPrintFontCss(opts.fontFamily || settings.reportFontFamily);

  const formatKopLineHtml = (
    text: string,
    sizePx: number,
    style: KopSuratTextStyle
  ) => {
    const cleaned = (text || '').trim();
    if (!cleaned) return '';
    const weight = style.bold ? 'font-weight:bold;' : 'font-weight:normal;';
    const italic = style.italic ? 'font-style:italic;' : '';
    const underline = style.underline ? 'text-decoration:underline;' : '';
    return `<div style="font-size:${sizePx}px;line-height:1.38;margin:0;padding:0;${weight}${italic}${underline}">${escapeHtml(cleaned)}</div>`;
  };

  const wordKopSlotPx = Math.max(normKop.leftLogoSize, normKop.rightLogoSize) + 12;
  const kopHtml = opts.showKopSurat
    ? `
      <table style="width:100%;border-collapse:collapse;border:none;margin-bottom:10px;font-family:${escapeHtml(kopFontCss)};">
        <tr>
          <td style="width:${wordKopSlotPx}px;vertical-align:middle;text-align:center;border:none;border-bottom:3px solid #0f172a;padding:2px 2px 8px 2px;">
            ${leftPng ? `<img src="${leftPng}" width="${normKop.leftLogoSize}" height="${normKop.leftLogoSize}" style="object-fit:contain;" />` : ''}
          </td>
          <td style="text-align:center;vertical-align:middle;border:none;border-bottom:3px solid #0f172a;padding:2px 8px 8px 8px;">
            ${formatKopLineHtml(normKop.line1, normKop.lineSizes.line1, normKop.lineStyles.line1)}
            ${formatKopLineHtml(normKop.line2, normKop.lineSizes.line2, normKop.lineStyles.line2)}
            ${formatKopLineHtml(normKop.line3, normKop.lineSizes.line3, normKop.lineStyles.line3)}
            ${formatKopLineHtml(normKop.line4, normKop.lineSizes.line4, normKop.lineStyles.line4)}
            ${formatKopLineHtml(normKop.line5, normKop.lineSizes.line5, normKop.lineStyles.line5)}
            ${formatKopLineHtml(normKop.line6, normKop.lineSizes.line6, normKop.lineStyles.line6)}
          </td>
          <td style="width:${wordKopSlotPx}px;vertical-align:middle;text-align:center;border:none;border-bottom:3px solid #0f172a;padding:2px 2px 8px 2px;">
            ${rightPng ? `<img src="${rightPng}" width="${normKop.rightLogoSize}" height="${normKop.rightLogoSize}" style="object-fit:contain;" />` : ''}
          </td>
        </tr>
        <tr>
          <td colspan="3" style="height:3px;font-size:1px;line-height:1px;padding:0;border:none;border-bottom:1px solid #0f172a;">&nbsp;</td>
        </tr>
      </table>`
    : '';

  const docNumHtml = docNumberClean
    ? `<p style="font-size:9pt;margin:0 0 8px 0;">Nomor Dokumen: <strong>${escapeHtml(docNumberClean)}</strong></p>`
    : '';

  const pSigPx = Math.min(82, Math.max(40, sigStamp.signatureSize));
  const tSigPx = Math.min(82, Math.max(40, opts.teacherSignatureOverride?.size ?? sigStamp.signatureSize));
  const stampPx = Math.min(72, Math.max(40, sigStamp.stampSize));

  const extraRowsWordHtml =
    preparedExtraRows.length > 0
      ? preparedExtraRows
          .map((row) => {
            const pct = Math.floor(100 / Math.max(1, row.signers.length));
            const single = row.signers.length === 1;
            return `<table style="width:100%;margin-top:20px;border:none;font-size:9.5pt;">
              <tr>
                ${row.signers
                  .map(
                    (s) => `
                  <td style="width:${pct}%;vertical-align:top;border:none;${single ? 'text-align:center;' : 'padding-left:18px;'}">
                    ${s.topLabel ? `${escapeHtml(s.topLabel)}<br/>` : '<br/>'}
                    ${escapeHtml(s.title)}<br/>
                    <div style="min-height:54px;padding:4px 0;">
                      ${s.sigPng ? `<img src="${s.sigPng}" height="${Math.round(s.sigHeightMm / PX_TO_MM)}" style="object-fit:contain;" />` : '<br/><br/>'}
                    </div>
                    <u><strong>${escapeHtml(s.name || 'Nama Penandatangan')}</strong></u>
                    ${s.nip ? `<br/>${s.nipLabel ? `${escapeHtml(s.nipLabel)} ` : ''}${escapeHtml(s.nip)}` : ''}
                  </td>`
                  )
                  .join('')}
              </tr>
            </table>`;
          })
          .join('')
      : '';

  const sigHtml =
    opts.showPrincipalSig || opts.showTeacherSig || qrPng || extraRowsWordHtml
      ? `
      ${
        opts.showPrincipalSig || opts.showTeacherSig || qrPng
          ? `<table style="width:100%;margin-top:22px;border:none;font-size:9.5pt;">
              <tr>
                <td style="width:40%;vertical-align:top;padding-left:18px;border:none;">
                  ${
                    opts.showPrincipalSig
                      ? `Mengetahui,<br/>${escapeHtml(settings.principalTitle)}<br/>
                        <div style="min-height:58px;padding:4px 0;">
                          ${stampPng && sigStamp.stampTarget !== 'teacher' ? `<img src="${stampPng}" height="${stampPx}" style="opacity:0.85;margin-right:4px;vertical-align:middle;" />` : ''}
                          ${principalSigPng ? `<img src="${principalSigPng}" height="${pSigPx}" style="vertical-align:middle;" />` : (!stampPng || sigStamp.stampTarget === 'teacher' ? '<br/><br/><br/>' : '')}
                        </div>
                        <u><strong>${escapeHtml(settings.principalName)}</strong></u><br/>NIP. ${escapeHtml(settings.principalNip)}`
                      : ''
                  }
                </td>
                <td style="width:20%;vertical-align:middle;text-align:center;border:none;">
                  ${qrPng ? `<img src="${qrPng}" width="64" height="64" /><br/><span style="font-size:7pt;color:#475569;">Verifikasi Digital</span>` : ''}
                </td>
                <td style="width:40%;vertical-align:top;padding-left:24px;border:none;">
                  ${
                    opts.showTeacherSig
                      ? `${escapeHtml(settings.signatureCity)}, ${escapeHtml(formatTanggalID(getTodayIso()))}<br/>Guru Mata Pelajaran,<br/>
                        <div style="min-height:58px;padding:4px 0;">
                          ${stampPng && sigStamp.stampTarget === 'teacher' ? `<img src="${stampPng}" height="${stampPx}" style="opacity:0.85;margin-right:4px;vertical-align:middle;" />` : ''}
                          ${teacherSigPng ? `<img src="${teacherSigPng}" height="${tSigPx}" style="vertical-align:middle;" />` : (!stampPng || sigStamp.stampTarget !== 'teacher' ? '<br/><br/><br/>' : '')}
                        </div>
                        <u><strong>${escapeHtml(effectiveTeacherName)}</strong></u><br/>NIP. ${escapeHtml(effectiveTeacherNip)}`
                      : ''
                  }
                </td>
              </tr>
            </table>`
          : ''
      }
      ${extraRowsWordHtml}`
      : '';

  const renderTableBlock = (
    headers: string[],
    rows: (string | number)[][],
    subHeading?: string
  ) => `
    <div style="margin-bottom:14px;">
      ${subHeading ? `<h4 style="margin:10px 0 4px 0;font-size:9.5pt;text-transform:uppercase;">${escapeHtml(subHeading)}</h4>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:8.5pt;">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;">
            ${headers.map((h) => `<th style="border:1px solid #334155;padding:5px 6px;text-align:center;color:#ffffff;background:#0f172a;font-weight:bold;">${escapeHtml(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${
            rows.length === 0
              ? `<tr><td colspan="${headers.length}" style="border:1px solid #0f172a;padding:10px;text-align:center;color:#64748b;">Tidak ada data pada filter yang dipilih.</td></tr>`
              : rows
                  .map(
                    (row) =>
                      `<tr>${row
                        .map((cell) => `<td style="border:1px solid #0f172a;padding:4px 6px;">${escapeHtml(cell)}</td>`)
                        .join('')}</tr>`
                  )
                  .join('')
          }
        </tbody>
      </table>
    </div>
  `;

  interface WordSectionPage {
    paperSize: PaperSize;
    orientation: PaperOrientation;
    bodyHtml: string;
  }

  const wordPages: WordSectionPage[] = [];

  const pushWordPage = (
    reportType: SingleReportType | 'imported',
    pageKey: string | undefined,
    title: string,
    subtitle: string,
    tablesHtml: string
  ) => {
    const layout =
      reportType === 'imported'
        ? {
            paperSize:
              opts.pageLayouts?.imported?.paperSize ||
              opts.paperSize ||
              settings.reportPaperSize ||
              'A4',
            orientation: opts.pageLayouts?.imported?.orientation || opts.orientation || 'landscape',
          }
        : resolveExportPageLayout(settings, opts, reportType, pageKey);

    wordPages.push({
      paperSize: layout.paperSize,
      orientation: layout.orientation,
      bodyHtml: `
        ${kopHtml}
        ${docNumHtml}
        <h3 style="text-align:center;margin:6px 0 2px 0;font-size:11.5pt;text-transform:uppercase;">${escapeHtml(title)}</h3>
        <p style="text-align:center;margin:0 0 10px 0;font-size:9pt;color:#334155;">${escapeHtml(subtitle)}</p>
        ${tablesHtml}
        ${sigHtml}
      `,
    });
  };

  if (importedReport) {
    pushWordPage(
      'imported',
      'imported',
      importedReport.title,
      `Sumber Berkas: ${importedReport.fileName} · Tahun Ajaran ${settings.academicYear} (${settings.semester})`,
      renderTableBlock(importedReport.headers, importedReport.rows)
    );
  } else {
    const filteredJournals = filterJournalsForReport(journals, opts);
    const filteredGrades = filterGradesForReport(grades, opts);
    const selectedReports = resolveSelectedReportTypes(opts, true);
    const hasReport = (id: SingleReportType) => selectedReports.includes(id);

    if (hasReport('aktivitas_guru')) {
      const summary = buildTeacherActivitySummary(filteredJournals, filteredGrades, opts.users);
      const studentMap = new Map(students.map((s) => [s.id, s]));
      const teacherFilterText =
        opts.selectedTeacherId && opts.selectedTeacherId !== 'ALL'
          ? ` · Filter: ${
              opts.selectedTeacherId.startsWith('name:')
                ? opts.selectedTeacherId.slice(5)
                : opts.users?.find((u) => u.id === opts.selectedTeacherId)?.name ||
                  opts.selectedTeacherId
            }`
          : ' · Semua Guru Pengajar';

      const tblA = renderTableBlock(
        ['No', 'Nama Guru', 'Jabatan', 'Jurnal Mengajar', 'Entri Nilai', 'Kelas Diampu', 'Mata Pelajaran', 'Aktivitas Terakhir'],
        summary.map((row, idx) => [
          idx + 1,
          row.teacherName,
          row.roleLabel,
          `${row.journalCount} Sesi`,
          `${row.gradeCount} Nilai`,
          row.classesHandled.join(', ') || '-',
          row.subjectsHandled.join(', ') || '-',
          row.lastActivityDate ? formatTanggalID(row.lastActivityDate) : '-',
        ]),
        `A. Ringkasan Aktivitas per Guru (${summary.length} Guru)`
      );
      const tblB = renderTableBlock(
        ['No', 'Tanggal', 'Jam', 'Guru Pengajar', 'Kelas', 'Mapel', 'Materi & Kegiatan', 'Presensi'],
        filteredJournals.map((j, idx) => {
          const c = { H: 0, S: 0, I: 0, A: 0, D: 0 };
          Object.values(j.attendance).forEach((it) => {
            c[it.status] = (c[it.status] || 0) + 1;
          });
          return [
            idx + 1,
            formatTanggalID(j.date),
            j.period,
            j.teacherName || effectiveTeacherName,
            j.className,
            j.subject,
            `${j.topic}${j.activities ? ` — ${j.activities}` : ''}`,
            `H:${c.H} S:${c.S} I:${c.I} A:${c.A} D:${c.D}`,
          ];
        }),
        `B. Rincian Jurnal Aktivitas Mengajar Guru (${filteredJournals.length} Sesi)`
      );
      const tblC = renderTableBlock(
        ['No', 'Guru Penilai', 'Kelas', 'Mapel', 'Jenis Ujian', 'Nama Siswa', 'Nilai', 'Status KKM'],
        filteredGrades.slice(0, 120).map((g, idx) => {
          const st = studentMap.get(g.studentId);
          const ket = g.score !== null ? (g.score >= settings.kkm ? 'Tuntas' : 'Remedial') : '-';
          return [
            idx + 1,
            g.teacherName || effectiveTeacherName,
            g.className,
            g.subject,
            g.examType,
            st?.name || g.studentId,
            g.score ?? '-',
            ket,
          ];
        }),
        `C. Rincian Riwayat Penilaian Guru (${filteredGrades.length} Entri)`
      );

      pushWordPage(
        'aktivitas_guru',
        'aktivitas_guru',
        'RIWAYAT JURNAL AKTIVITAS MENGAJAR & PENILAIAN GURU',
        `Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester}${teacherFilterText}`,
        tblA + tblB + tblC
      );
    }

    if (hasReport('jurnal')) {
      const periodText =
        opts.startDate || opts.endDate
          ? ` · Periode ${opts.startDate ? formatTanggalID(opts.startDate) : 'Awal'} s.d. ${
              opts.endDate ? formatTanggalID(opts.endDate) : 'Akhir'
            }`
          : '';
      pushWordPage(
        'jurnal',
        'jurnal',
        'LAPORAN JURNAL KEGIATAN MENGAJAR GURU',
        `Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester}${periodText}`,
        renderTableBlock(
          ['No', 'Tanggal', 'Jam', 'Guru Pengajar', 'Kelas', 'Mata Pelajaran', 'Materi Pokok', 'Kegiatan Pembelajaran', 'Presensi'],
          filteredJournals.map((j, idx) => {
            const c = { H: 0, S: 0, I: 0, A: 0, D: 0 };
            Object.values(j.attendance).forEach((it) => {
              c[it.status] = (c[it.status] || 0) + 1;
            });
            return [
              idx + 1,
              formatTanggalID(j.date),
              j.period,
              j.teacherName || effectiveTeacherName,
              j.className,
              j.subject,
              j.topic,
              j.activities,
              `H:${c.H} S:${c.S} I:${c.I} A:${c.A} D:${c.D}`,
            ];
          })
        )
      );
    }

    if (hasReport('kehadiran')) {
      const matrices = buildAttendanceMatrices(students, filteredJournals, opts.selectedClasses);
      matrices.forEach((m) => {
        pushWordPage(
          'kehadiran',
          `kehadiran:${m.className}`,
          `LEGER KEHADIRAN SISWA MENDATAR — KELAS ${m.className}`,
          `Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester} · Jumlah Pertemuan: ${m.journals.length}`,
          renderTableBlock(
            ['No', 'NIS', 'Nama Siswa', 'L/P', ...m.journals.map((j) => formatTanggalShort(j.date)), 'H', 'S', 'I', 'A', 'D', '%'],
            m.students.map((st, idx) => {
              const sum = summarizeStudentAttendance(st.id, m.journals);
              return [
                idx + 1,
                st.nis,
                st.name,
                st.gender,
                ...m.journals.map((j) => j.attendance[st.id]?.status || '-'),
                sum.H,
                sum.S,
                sum.I,
                sum.A,
                sum.D,
                `${sum.pct}%`,
              ];
            })
          )
        );
      });
    }

    if (hasReport('nilai')) {
      const matrices = buildGradeMatrices(students, grades, settings, opts);
      matrices.forEach((m) => {
        const avgLabel = settings.useWeightedAverage ? 'Nilai Akhir' : 'Rata-Rata';
        pushWordPage(
          'nilai',
          `nilai:${m.className}:${m.subject}`,
          `REKAPITULASI NILAI HASIL BELAJAR — KELAS ${m.className}`,
          `Mata Pelajaran: ${m.subject} · KKM: ${settings.kkm} · TA ${settings.academicYear} (${settings.semester})`,
          renderTableBlock(
            [
              'No',
              'NIS',
              'Nama Siswa',
              'L/P',
              ...m.examTypes.map((ex) => {
                const w = settings.examWeights?.[ex];
                return settings.useWeightedAverage && w !== undefined ? `${ex} (${w}%)` : ex;
              }),
              avgLabel,
              'Keterangan',
            ],
            m.students.map((st, idx) => {
              const avg = m.avgMap[st.id];
              return [
                idx + 1,
                st.nis,
                st.name,
                st.gender,
                ...m.examTypes.map((ex) => m.scoreMap[st.id]?.[ex] ?? '-'),
                avg ?? '-',
                avg !== null ? (avg >= settings.kkm ? 'Tuntas' : 'Remedial') : '-',
              ];
            })
          )
        );
      });
    }

    if (hasReport('rekap_presensi')) {
      const recaps = buildAttendanceRecapByClass(students, filteredJournals, opts.selectedClasses);
      recaps.forEach((r) => {
        pushWordPage(
          'rekap_presensi',
          `rekap_presensi:${r.className}`,
          `REKAPITULASI PRESENSI SISWA — KELAS ${r.className}`,
          `Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester} · Pertemuan: ${r.totalMeetings} · Rata-rata Kehadiran: ${r.avgPresencePct}% · Perlu Pembinaan: ${r.attentionCount} siswa`,
          renderTableBlock(
            ['No', 'NIS', 'Nama Siswa', 'L/P', 'Pertemuan', 'H', 'S', 'I', 'A', 'D', '% Hadir', 'Keterangan'],
            r.rows.map((item, idx) => [
              idx + 1,
              item.student.nis,
              item.student.name,
              item.student.gender,
              item.totalMeetings,
              item.H,
              item.S,
              item.I,
              item.A,
              item.D,
              `${item.pct}%`,
              item.statusLabel,
            ])
          )
        );
      });
    }

    if (hasReport('ketidakhadiran')) {
      const abs = buildAbsenceLog(students, filteredJournals);
      const tblA = renderTableBlock(
        ['No', 'NIS', 'Nama Siswa', 'Kelas', 'L/P', 'Sakit (S)', 'Izin (I)', 'Alpha (A)', 'Dispen (D)', 'Total'],
        abs.summary.map((s, idx) => [idx + 1, s.nis, s.name, s.className, s.gender, s.S, s.I, s.A, s.D, s.total]),
        `A. Rekap Akumulasi Siswa Tidak Hadir (${abs.summary.length} Siswa)`
      );
      const tblB = renderTableBlock(
        ['No', 'Tanggal', 'Jam', 'Kelas', 'Mapel', 'Nama Siswa', 'Status', 'Catatan Guru'],
        abs.logs.slice(0, 150).map((l, idx) => [
          idx + 1,
          formatTanggalID(l.date),
          l.period,
          l.className,
          l.subject,
          l.studentName,
          `${l.status} (${l.statusLabel})`,
          l.note,
        ]),
        `B. Rincian Kronologis Ketidakhadiran (${abs.logs.length} Catatan)`
      );
      pushWordPage(
        'ketidakhadiran',
        'ketidakhadiran',
        'LAPORAN MONITORING & TINDAK LANJUT KETIDAKHADIRAN SISWA',
        `Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester} · Sakit: ${abs.counts.S} · Izin: ${abs.counts.I} · Alpha: ${abs.counts.A} · Dispen: ${abs.counts.D}`,
        tblA + tblB
      );
    }

    if (hasReport('remedial')) {
      const blocks = buildRemedialAnalysis(students, grades, settings, opts);
      const allRemedials = blocks.flatMap((b) =>
        b.remedialStudents.map((r) => ({ block: b, row: r }))
      );
      const tblA = renderTableBlock(
        ['No', 'Kelas', 'Mata Pelajaran', 'Siswa', 'Dinilai', 'Tuntas', 'Remedial', 'Daya Serap', 'Rata-rata', 'Min / Maks'],
        blocks.map((b, idx) => [
          idx + 1,
          b.className,
          b.subject,
          b.totalStudents,
          b.assessedCount,
          b.tuntasCount,
          b.remedialCount,
          `${b.passRatePct}%`,
          b.classAvg ?? '-',
          b.lowest !== null && b.highest !== null ? `${b.lowest} / ${b.highest}` : '-',
        ]),
        `A. Ringkasan Daya Serap & Ketuntasan Klasikal (${blocks.length} Kelompok)`
      );
      const tblB = renderTableBlock(
        ['No', 'Kelas', 'Mata Pelajaran', 'NIS', 'Nama Siswa', 'Nilai', 'Kurang', 'Komponen < KKM', 'Rekomendasi Tindak Lanjut'],
        allRemedials.map((item, idx) => [
          idx + 1,
          item.block.className,
          item.block.subject,
          item.row.student.nis,
          item.row.student.name,
          item.row.avgScore,
          `-${item.row.deficit}`,
          item.row.belowExamDetails,
          item.row.actionNote,
        ]),
        `B. Daftar Siswa Wajib Remedial (< KKM ${settings.kkm}) — ${allRemedials.length} Entri`
      );
      pushWordPage(
        'remedial',
        'remedial',
        'LAPORAN ANALISIS KETUNTASAN BELAJAR & PROGRAM REMEDIAL',
        `KKM Sekolah: ${settings.kkm} · Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester}`,
        tblA + tblB
      );
    }

    if (hasReport('leger_kelas')) {
      const ledgers = buildClassMultiSubjectLedger(students, grades, settings, opts);
      ledgers.forEach((l) => {
        pushWordPage(
          'leger_kelas',
          `leger_kelas:${l.className}`,
          `LEGER NILAI GABUNGAN MATA PELAJARAN — KELAS ${l.className}`,
          `KKM: ${settings.kkm} · Tahun Ajaran ${settings.academicYear} · Semester ${settings.semester}`,
          renderTableBlock(
            ['No', 'NIS', 'Nama Siswa', 'L/P', ...l.subjects, 'Jumlah', 'Rata-rata', 'Rank', 'Status KKM'],
            l.rows.map((r, idx) => [
              idx + 1,
              r.student.nis,
              r.student.name,
              r.student.gender,
              ...l.subjects.map((s) => r.subjectAvgMap[s] ?? '-'),
              r.totalScore ?? '-',
              r.overallAvg ?? '-',
              r.rank ?? '-',
              r.statusLabel,
            ])
          )
        );
      });
    }

    if (hasReport('daftar_siswa')) {
      const blocks = buildStudentRosterByClass(students, opts.selectedClasses);
      blocks.forEach((b) => {
        pushWordPage(
          'daftar_siswa',
          `daftar_siswa:${b.className}`,
          `DAFTAR INDUK PESERTA DIDIK — KELAS ${b.className}`,
          `Wali Kelas: ${b.homeroomTeacher} · Laki-laki: ${b.maleCount} · Perempuan: ${b.femaleCount} · Total: ${b.totalCount} Siswa · TA ${settings.academicYear}`,
          renderTableBlock(
            ['No', 'Absen', 'NIS', 'NISN', 'Nama Lengkap', 'L/P', 'Tempat, Tanggal Lahir', 'Wali Kelas', 'Status'],
            b.students.map((item, idx) => [
              idx + 1,
              item.student.absenNo || '-',
              item.student.nis,
              item.student.nisn || '-',
              item.student.name,
              item.student.gender,
              item.ttlDisplay,
              item.student.homeroomTeacher || '-',
              item.statusText,
            ])
          )
        );
      });
    }
  }

  if (wordPages.length === 0) {
    wordPages.push({
      paperSize: opts.paperSize || settings.reportPaperSize || 'A4',
      orientation: opts.orientation || 'landscape',
      bodyHtml: `${kopHtml}${docNumHtml}<p style="text-align:center;padding:30px;">Tidak ada konten laporan pada filter terpilih.</p>`,
    });
  }

  const pageCssBlocks = wordPages
    .map((p, idx) => {
      const dims = getPaperDimensionsMm(p.paperSize, p.orientation);
      return `@page WordSection${idx} { size: ${dims.widthMm}mm ${dims.heightMm}mm; mso-page-orientation: ${p.orientation}; margin: 12mm; }
      div.WordSection${idx} { page: WordSection${idx}; }`;
    })
    .join('\n');

  const bodySectionsHtml = wordPages
    .map((p, idx) => {
      const breakHtml =
        idx > 0
          ? '<br clear="all" style="page-break-before:always;mso-break-type:section-break;" />'
          : '';
      return `${breakHtml}<div class="WordSection${idx}">${p.bodyHtml}</div>`;
    })
    .join('\n');

  const htmlDoc = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>Laporan Resmi Portal E-Guru</title>
<style>
${pageCssBlocks}
body { font-family: ${escapeHtml(bodyFontCss)}; color: #0f172a; }
</style>
</head>
<body style="font-family:${escapeHtml(bodyFontCss)};color:#0f172a;">
${bodySectionsHtml}
</body>
</html>`;

  const blob = new Blob(['\ufeff', htmlDoc], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = importedReport
    ? `Laporan_Resmi_${importedReport.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${getTodayIso()}.doc`
    : `Laporan_Resmi_EGuru_${getTodayIso()}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
