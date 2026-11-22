import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  AppUser,
  AttendanceStatus,
  GradeRecord,
  JournalEntry,
  KopSuratTextStyle,
  PaperOrientation,
  PaperSize,
  PrintFontFamily,
  ReportType,
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
  getPaperSizeMeta,
  getTodayIso,
  normalizeKopSurat,
  normalizeSignatureStamp,
  ROW_MARKER_META,
  USER_ROLE_LABELS,
} from './helpers';

export interface ReportFilterOptions {
  reportType: ReportType;
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
  paperSize?: PaperSize;
  orientation: PaperOrientation;
  fontFamily: PrintFontFamily;
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

  if (opts.reportType === 'jurnal' || opts.reportType === 'semua') {
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
    XLSX.utils.book_append_sheet(wb, ws, 'Jurnal Mengajar');
  }

  if (opts.reportType === 'aktivitas_guru' || opts.reportType === 'semua') {
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
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Guru');

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
    XLSX.utils.book_append_sheet(wb, wsJrn, 'Aktivitas Mengajar');

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
    XLSX.utils.book_append_sheet(wb, wsGrd, 'Riwayat Penilaian Guru');
  }

  if (opts.reportType === 'kehadiran' || opts.reportType === 'semua') {
    const matrices = buildAttendanceMatrices(students, filteredJournals, opts.selectedClasses);
    if (matrices.length === 0) {
      const ws = XLSX.utils.json_to_sheet([{ Keterangan: 'Belum ada data kehadiran.' }]);
      XLSX.utils.book_append_sheet(wb, ws, 'Kehadiran');
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
        const sheetName = `Absen ${m.className}`.slice(0, 31);
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });
    }
  }

  if (opts.reportType === 'nilai' || opts.reportType === 'semua') {
    const matrices = buildGradeMatrices(students, grades, settings, opts);
    if (matrices.length === 0) {
      const ws = XLSX.utils.json_to_sheet([{ Keterangan: 'Belum ada data nilai pada filter ini.' }]);
      XLSX.utils.book_append_sheet(wb, ws, 'Rekap Nilai');
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
        const rawTitle = `Nilai ${m.className} ${m.subject}`.replace(/[:\\/?*[\]]/g, '');
        const sheetName = rawTitle.slice(0, 31);
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });
    }
  }

  if (opts.reportType === 'rekap_presensi') {
    const recaps = buildAttendanceRecapByClass(students, filteredJournals, opts.selectedClasses);
    if (recaps.length === 0) {
      const ws = XLSX.utils.json_to_sheet([{ Keterangan: 'Belum ada data siswa/presensi.' }]);
      XLSX.utils.book_append_sheet(wb, ws, 'Rekap Presensi');
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
        XLSX.utils.book_append_sheet(wb, ws, `Rekap ${recap.className}`.slice(0, 31));
      });
    }
  }

  if (opts.reportType === 'ketidakhadiran') {
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
    XLSX.utils.book_append_sheet(
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
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        logRows.length > 0 ? logRows : [{ Keterangan: 'Belum ada catatan ketidakhadiran.' }]
      ),
      'Log Ketidakhadiran'
    );
  }

  if (opts.reportType === 'remedial') {
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
    XLSX.utils.book_append_sheet(
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
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        remedialList.length > 0
          ? remedialList
          : [{ Keterangan: 'Tidak ada siswa remedial pada filter ini.' }]
      ),
      'Daftar Siswa Remedial'
    );
  }

  if (opts.reportType === 'leger_kelas') {
    const ledgers = buildClassMultiSubjectLedger(students, grades, settings, opts);
    if (ledgers.length === 0) {
      XLSX.utils.book_append_sheet(
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
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(rows),
          `Leger ${l.className}`.slice(0, 31)
        );
      });
    }
  }

  if (opts.reportType === 'daftar_siswa') {
    const blocks = buildStudentRosterByClass(students, opts.selectedClasses);
    if (blocks.length === 0) {
      XLSX.utils.book_append_sheet(
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
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(rows),
          `Siswa ${b.className}`.slice(0, 31)
        );
      });
    }
  }

  const stamp = getTodayIso();
  const fileName = `Laporan_${opts.reportType.toUpperCase()}_${settings.semester}_${stamp}.${format}`;

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

const pxToMm = (px: number): number => Math.round(px * 0.2645 * 10) / 10;

export async function exportReportToPdf(
  students: Student[],
  journals: JournalEntry[],
  grades: GradeRecord[],
  settings: SystemSettings,
  opts: ReportFilterOptions
) {
  const paperMeta = getPaperSizeMeta(opts.paperSize || settings.reportPaperSize);
  const doc = new jsPDF({
    orientation: opts.orientation,
    unit: 'mm',
    format: paperMeta.jsPdfFormat,
  });

  const pdfFont = mapPrintFontToJsPdf(opts.fontFamily);
  doc.setFont(pdfFont, 'normal');

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  const sigStamp = normalizeSignatureStamp(settings);
  const leftPng = opts.showKopSurat
    ? await dataUrlToPngBase64(settings.kopSurat.leftLogoDataUrl)
    : null;
  const rightPng = opts.showKopSurat
    ? await dataUrlToPngBase64(settings.kopSurat.rightLogoDataUrl)
    : null;
  const principalSigPng =
    opts.showPrincipalSig && sigStamp.principalSignatureDataUrl
      ? await dataUrlToPngBase64(sigStamp.principalSignatureDataUrl, 480)
      : null;
  const teacherSigPng =
    opts.showTeacherSig && sigStamp.teacherSignatureDataUrl
      ? await dataUrlToPngBase64(sigStamp.teacherSignatureDataUrl, 480)
      : null;
  const stampPng =
    opts.showStamp && sigStamp.stampDataUrl
      ? await dataUrlToPngBase64(sigStamp.stampDataUrl, 480)
      : null;

  const drawHeader = (): number => {
    let cursorY = 12;
    if (opts.showKopSurat) {
      const normKop = normalizeKopSurat(settings.kopSurat);
      const kopFont = mapPrintFontToJsPdf(normKop.fontFamily);

      const leftLogoMm = Math.round((normKop.leftLogoSize / 64) * 20 * 10) / 10;
      const rightLogoMm = Math.round((normKop.rightLogoSize / 64) * 20 * 10) / 10;
      const maxLogoMm = Math.max(leftLogoMm, rightLogoMm, 20);

      if (leftPng) {
        doc.addImage(leftPng, 'PNG', marginX + 2, cursorY, leftLogoMm, leftLogoMm);
      }
      if (rightPng) {
        doc.addImage(
          rightPng,
          'PNG',
          pageWidth - marginX - rightLogoMm - 2,
          cursorY,
          rightLogoMm,
          rightLogoMm
        );
      }

      const pxToPt = (px: number) => Math.round(px * 0.85 * 10) / 10;
      const toJsPdfStyle = (st: KopSuratTextStyle) =>
        st.bold && st.italic ? 'bolditalic' : st.bold ? 'bold' : st.italic ? 'italic' : 'normal';

      const centerX = pageWidth / 2;
      const drawStyledCenteredLine = (
        text: string,
        yPos: number,
        fontSizePx: number,
        st: KopSuratTextStyle
      ) => {
        if (!text) return;
        const pt = pxToPt(fontSizePx);
        doc.setFont(kopFont, toJsPdfStyle(st));
        doc.setFontSize(pt);
        doc.text(text, centerX, yPos, { align: 'center' });
        if (st.underline) {
          const w = doc.getTextWidth(text);
          doc.setLineWidth(0.25);
          doc.line(centerX - w / 2, yPos + 0.7, centerX + w / 2, yPos + 0.7);
        }
      };

      drawStyledCenteredLine(normKop.line1, cursorY + 3, normKop.lineSizes.line1, normKop.lineStyles.line1);
      drawStyledCenteredLine(normKop.line2, cursorY + 7.8, normKop.lineSizes.line2, normKop.lineStyles.line2);
      drawStyledCenteredLine(normKop.line3, cursorY + 12.2, normKop.lineSizes.line3, normKop.lineStyles.line3);
      drawStyledCenteredLine(normKop.line4, cursorY + 17.2, normKop.lineSizes.line4, normKop.lineStyles.line4);
      drawStyledCenteredLine(normKop.line5, cursorY + 21.4, normKop.lineSizes.line5, normKop.lineStyles.line5);
      drawStyledCenteredLine(normKop.line6, cursorY + 25.0, normKop.lineSizes.line6, normKop.lineStyles.line6);

      const headerHeight = Math.max(27.5, maxLogoMm + 3);
      cursorY += headerHeight;
      doc.setLineWidth(0.8);
      doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
      doc.setLineWidth(0.25);
      doc.line(marginX, cursorY + 1.1, pageWidth - marginX, cursorY + 1.1);
      cursorY += 6;
      doc.setFont(pdfFont, 'normal');
    }
    return cursorY;
  };

  const drawSignatures = (startY: number) => {
    if (!opts.showPrincipalSig && !opts.showTeacherSig) return;
    const maxBlockDownMm = Math.max(
      0,
      pxToMm(sigStamp.principalBlockOffsetY),
      pxToMm(sigStamp.teacherBlockOffsetY)
    );
    let y = startY + 8;
    if (y + 38 + maxBlockDownMm > pageHeight - 10) {
      doc.addPage();
      y = 18;
    }

    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(9.5);

    const todayStr = formatTanggalID(getTodayIso());
    const sigMm = Math.round((sigStamp.signatureSize / 54) * 14 * 10) / 10;
    const sigW = Math.round(sigMm * 2.2 * 10) / 10;
    const stampMm = Math.round((sigStamp.stampSize / 74) * 20 * 10) / 10;

    const stampOnTeacher =
      (sigStamp.stampTarget === 'teacher' && opts.showTeacherSig) || !opts.showPrincipalSig;

    const clampBlockX = (xVal: number) => Math.max(6, Math.min(pageWidth - 48, xVal));
    const clampBlockY = (yVal: number) => Math.max(12, Math.min(pageHeight - 34, yVal));

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
          sigCx - sigW / 2,
          sigCy - sigMm / 2,
          sigW,
          sigMm
        );
      }
      doc.setFont(pdfFont, 'bold');
      doc.text(settings.principalName, leftX, pY + 24);
      doc.setFont(pdfFont, 'normal');
      doc.text(`NIP. ${settings.principalNip}`, leftX, pY + 28.6);
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
        const sigCx = rightX + 17 + pxToMm(sigStamp.teacherSigOffsetX);
        const sigCy = tStageCenterY + pxToMm(sigStamp.teacherSigOffsetY);
        doc.addImage(
          teacherSigPng,
          'PNG',
          sigCx - sigW / 2,
          sigCy - sigMm / 2,
          sigW,
          sigMm
        );
      }
      doc.setFont(pdfFont, 'bold');
      doc.text(settings.teacherProfile.name, rightX, tY + 24);
      doc.setFont(pdfFont, 'normal');
      doc.text(`NIP. ${settings.teacherProfile.nip}`, rightX, tY + 28.6);
    }
  };

  const filteredJournals = filterJournalsForReport(journals, opts);
  const filteredGrades = filterGradesForReport(grades, opts);
  let y = drawHeader();
  let isFirstSection = true;

  const ensureNewSectionPage = () => {
    if (!isFirstSection) {
      doc.addPage();
      y = drawHeader();
    }
    isFirstSection = false;
  };

  // 1. JURNAL MENGAJAR
  if (opts.reportType === 'jurnal' || opts.reportType === 'semua') {
    ensureNewSectionPage();
    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(11.5);
    doc.text('LAPORAN JURNAL KEGIATAN MENGAJAR GURU', pageWidth / 2, y, { align: 'center' });
    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(9);
    doc.text(
      `Tahun Ajaran ${settings.academicYear}  |  Semester ${settings.semester}  |  Font: ${opts.fontFamily}`,
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

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [
        ['No', 'Tanggal', 'Jam', 'Guru Pengajar', 'Kelas', 'Mata Pelajaran', 'Materi Pokok', 'Kegiatan', 'Presensi'],
      ],
      body:
        bodyRows.length > 0
          ? bodyRows
          : [['-', '-', '-', '-', '-', '-', 'Belum ada data jurnal untuk filter ini', '-', '-']],
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

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
    drawSignatures(finalY);
  }

  // 1B. RIWAYAT AKTIVITAS MENGAJAR & PENILAIAN GURU (KHUSUS ADMIN / PIMPINAN)
  if (opts.reportType === 'aktivitas_guru') {
    ensureNewSectionPage();
    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(11.5);
    doc.text('RIWAYAT JURNAL AKTIVITAS MENGAJAR & PENILAIAN GURU', pageWidth / 2, y, {
      align: 'center',
    });
    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(9);
    doc.text(
      `Tahun Ajaran ${settings.academicYear}  |  Semester ${settings.semester}  |  Font: ${opts.fontFamily}`,
      pageWidth / 2,
      y + 4.8,
      { align: 'center' }
    );
    y += 10;

    const summary = buildTeacherActivitySummary(filteredJournals, filteredGrades, opts.users);
    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(9.5);
    doc.text('A. Ringkasan Aktivitas per Guru Pengajar', marginX, y);
    y += 2.5;

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['No', 'Nama Guru', 'Peran', 'Jurnal', 'Nilai', 'Kelas Diampu', 'Mata Pelajaran', 'Terakhir']],
      body:
        summary.length > 0
          ? summary.map((row, idx) => [
              String(idx + 1),
              row.teacherName,
              row.roleLabel,
              `${row.journalCount} sesi`,
              `${row.gradeCount} nilai`,
              row.classesHandled.join(', ') || '-',
              row.subjectsHandled.join(', ') || '-',
              row.lastActivityDate ? formatTanggalID(row.lastActivityDate) : '-',
            ])
          : [['-', 'Belum ada catatan aktivitas guru pada filter ini', '-', '-', '-', '-', '-', '-']],
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
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20) + 7;
    if (nextY > pageHeight - 35) {
      doc.addPage();
      nextY = drawHeader();
    }

    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(9.5);
    doc.text(`B. Riwayat Jurnal Mengajar Guru (${filteredJournals.length} Sesi)`, marginX, nextY);
    nextY += 2.5;

    autoTable(doc, {
      startY: nextY,
      margin: { left: marginX, right: marginX },
      head: [['No', 'Tanggal', 'Jam', 'Guru Pengajar', 'Kelas', 'Mapel', 'Materi Pokok', 'Presensi']],
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
                j.topic,
                `H:${c.H} S:${c.S} I:${c.I} A:${c.A} D:${c.D}`,
              ];
            })
          : [['-', '-', '-', '-', '-', '-', 'Belum ada riwayat jurnal mengajar', '-']],
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
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 20) + 7;
    if (afterJrnY > pageHeight - 35) {
      doc.addPage();
      afterJrnY = drawHeader();
    }

    const studentMap = new Map(students.map((s) => [s.id, s]));
    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(9.5);
    doc.text(`C. Riwayat Penilaian Guru (${filteredGrades.length} Entri Nilai)`, marginX, afterJrnY);
    afterJrnY += 2.5;

    autoTable(doc, {
      startY: afterJrnY,
      margin: { left: marginX, right: marginX },
      head: [['No', 'Guru Penilai', 'Kelas', 'Mapel', 'Jenis Ujian', 'Nama Siswa', 'Nilai', 'Status']],
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
          : [['-', '-', '-', '-', '-', 'Belum ada riwayat penilaian guru', '-', '-']],
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
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? afterJrnY + 20;
    drawSignatures(finalActY);
  }

  // 2. KEHADIRAN MENDATAR
  if (opts.reportType === 'kehadiran' || opts.reportType === 'semua') {
    const matrices = buildAttendanceMatrices(students, filteredJournals, opts.selectedClasses);
    matrices.forEach((m) => {
      ensureNewSectionPage();
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(11.5);
      doc.text(`LEGER KEHADIRAN SISWA — KELAS ${m.className}`, pageWidth / 2, y, {
        align: 'center',
      });
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9);
      doc.text(
        `Tahun Ajaran ${settings.academicYear}  |  Semester ${settings.semester}  |  Total Pertemuan: ${m.journals.length}`,
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

      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head,
        body,
        styles: {
          font: pdfFont,
          fontSize: 7.5,
          cellPadding: 1.5,
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
          2: { halign: 'left', cellWidth: 40 },
        },
      });

      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
      drawSignatures(finalY);
    });
  }

  // 3. REKAP NILAI
  if (opts.reportType === 'nilai' || opts.reportType === 'semua') {
    const matrices = buildGradeMatrices(students, grades, settings, opts);
    matrices.forEach((m) => {
      ensureNewSectionPage();
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(11.5);
      doc.text(`REKAPITULASI NILAI SISWA — KELAS ${m.className}`, pageWidth / 2, y, {
        align: 'center',
      });
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9);
      doc.text(
        `Mata Pelajaran: ${m.subject}  |  KKM: ${settings.kkm}  |  TA ${settings.academicYear} (${settings.semester})`,
        pageWidth / 2,
        y + 4.8,
        { align: 'center' }
      );
      y += 9;

      const avgLabel = settings.useWeightedAverage ? 'Nilai Akhir' : 'Rata-rata';
      const head = [['No', 'NIS', 'Nama Siswa', 'L/P', ...m.examTypes, avgLabel, 'Keterangan']];
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

      autoTable(doc, {
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

      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
      drawSignatures(finalY);
    });
  }

  // 4. REKAP PRESENSI RINGKAS PER SISWA & KELAS
  if (opts.reportType === 'rekap_presensi') {
    const recaps = buildAttendanceRecapByClass(students, filteredJournals, opts.selectedClasses);
    if (recaps.length === 0) {
      ensureNewSectionPage();
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(11.5);
      doc.text('REKAPITULASI PRESENSI SISWA', pageWidth / 2, y, { align: 'center' });
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9.5);
      doc.text('Belum ada data siswa/presensi pada filter terpilih.', pageWidth / 2, y + 10, {
        align: 'center',
      });
    } else {
      recaps.forEach((recap) => {
        ensureNewSectionPage();
        doc.setFont(pdfFont, 'bold');
        doc.setFontSize(11.5);
        doc.text(`REKAPITULASI PRESENSI SISWA — KELAS ${recap.className}`, pageWidth / 2, y, {
          align: 'center',
        });
        doc.setFont(pdfFont, 'normal');
        doc.setFontSize(9);
        doc.text(
          `TA ${settings.academicYear} (${settings.semester})  |  Pertemuan: ${recap.totalMeetings}  |  Rata-rata Hadir: ${recap.avgPresencePct}%  |  Perlu Pembinaan: ${recap.attentionCount} siswa`,
          pageWidth / 2,
          y + 4.8,
          { align: 'center' }
        );
        y += 9;

        autoTable(doc, {
          startY: y,
          margin: { left: marginX, right: marginX },
          head: [['No', 'NIS', 'Nama Siswa', 'L/P', 'Pertemuan', 'H', 'S', 'I', 'A', 'D', '% Hadir', 'Status']],
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
          (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
        drawSignatures(finalY);
      });
    }
  }

  // 5. MONITORING KETIDAKHADIRAN (S / I / A / D)
  if (opts.reportType === 'ketidakhadiran') {
    ensureNewSectionPage();
    const abs = buildAbsenceLog(students, filteredJournals);
    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(11.5);
    doc.text('LAPORAN MONITORING & TINDAK LANJUT KETIDAKHADIRAN SISWA', pageWidth / 2, y, {
      align: 'center',
    });
    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(9);
    doc.text(
      `TA ${settings.academicYear} (${settings.semester})  |  Total Sakit: ${abs.counts.S}  |  Izin: ${abs.counts.I}  |  Alpha: ${abs.counts.A}  |  Dispen: ${abs.counts.D}`,
      pageWidth / 2,
      y + 4.8,
      { align: 'center' }
    );
    y += 10;

    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(9.5);
    doc.text(`A. Rekap Akumulasi Siswa Tidak Hadir (${abs.summary.length} Siswa)`, marginX, y);
    y += 2.5;

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['No', 'NIS', 'Nama Siswa', 'Kelas', 'L/P', 'Sakit', 'Izin', 'Alpha', 'Dispen', 'Total']],
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
          : [['-', '-', 'Tidak ada siswa yang tercatat tidak hadir pada filter ini', '-', '-', '0', '0', '0', '0', '0']],
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
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20) + 7;
    if (nextY > pageHeight - 35) {
      doc.addPage();
      nextY = drawHeader();
    }

    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(9.5);
    doc.text(`B. Rincian Kronologis Ketidakhadiran (${abs.logs.length} Catatan)`, marginX, nextY);
    nextY += 2.5;

    autoTable(doc, {
      startY: nextY,
      margin: { left: marginX, right: marginX },
      head: [['No', 'Tanggal', 'Jam', 'Kelas', 'Mapel', 'Nama Siswa', 'Status', 'Catatan']],
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
          : [['-', '-', '-', '-', '-', 'Tidak ada catatan ketidakhadiran', '-', '-']],
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
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 20;
    drawSignatures(finalY);
  }

  // 6. ANALISIS KETUNTASAN & DAFTAR REMEDIAL
  if (opts.reportType === 'remedial') {
    ensureNewSectionPage();
    const blocks = buildRemedialAnalysis(students, grades, settings, opts);
    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(11.5);
    doc.text('LAPORAN ANALISIS KETUNTASAN BELAJAR & PROGRAM REMEDIAL', pageWidth / 2, y, {
      align: 'center',
    });
    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(9);
    doc.text(
      `KKM Sekolah: ${settings.kkm}  |  Tahun Ajaran ${settings.academicYear}  |  Semester ${settings.semester}`,
      pageWidth / 2,
      y + 4.8,
      { align: 'center' }
    );
    y += 10;

    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(9.5);
    doc.text('A. Ringkasan Daya Serap & Ketuntasan Klasikal per Kelas & Mapel', marginX, y);
    y += 2.5;

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['No', 'Kelas', 'Mata Pelajaran', 'Siswa', 'Dinilai', 'Tuntas', 'Remedial', 'Daya Serap', 'Rata-rata', 'Min/Maks']],
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
          : [['-', '-', 'Belum ada data penilaian pada filter ini', '-', '-', '-', '-', '-', '-', '-']],
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
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20) + 7;
    if (nextY > pageHeight - 35) {
      doc.addPage();
      nextY = drawHeader();
    }

    const remedialRows = blocks.flatMap((b) =>
      b.remedialStudents.map((r) => ({ block: b, row: r }))
    );

    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(9.5);
    doc.text(`B. Daftar Siswa Wajib Remedial (< KKM ${settings.kkm}) — ${remedialRows.length} Entri`, marginX, nextY);
    nextY += 2.5;

    autoTable(doc, {
      startY: nextY,
      margin: { left: marginX, right: marginX },
      head: [['No', 'Kelas', 'Mapel', 'NIS', 'Nama Siswa', 'Nilai', 'Kurang', 'Komponen < KKM', 'Tindak Lanjut']],
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
          : [['-', '-', '-', '-', 'Seluruh siswa yang dinilai sudah tuntas memenuhi KKM', '-', '-', '-', '-']],
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
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 20;
    drawSignatures(finalY);
  }

  // 7. LEGER NILAI GABUNGAN SEMUA MAPEL PER KELAS
  if (opts.reportType === 'leger_kelas') {
    const ledgers = buildClassMultiSubjectLedger(students, grades, settings, opts);
    ledgers.forEach((l) => {
      ensureNewSectionPage();
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(11.5);
      doc.text(`LEGER NILAI GABUNGAN MATA PELAJARAN — KELAS ${l.className}`, pageWidth / 2, y, {
        align: 'center',
      });
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9);
      doc.text(
        `KKM: ${settings.kkm}  |  Tahun Ajaran ${settings.academicYear}  |  Semester ${settings.semester}`,
        pageWidth / 2,
        y + 4.8,
        { align: 'center' }
      );
      y += 9;

      const head = [['No', 'NIS', 'Nama Siswa', 'L/P', ...l.subjects, 'Jumlah', 'Rata-rata', 'Rank', 'Status']];
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

      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head,
        body,
        styles: {
          font: pdfFont,
          fontSize: 7.2,
          cellPadding: 1.4,
          halign: 'center',
          textColor: [15, 23, 42],
          lineColor: [203, 213, 225],
          lineWidth: 0.15,
        },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: { 2: { halign: 'left', cellWidth: 38 } },
      });

      const finalY =
        (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
      drawSignatures(finalY);
    });
  }

  // 8. DAFTAR INDUK & PROFIL SISWA PER KELAS
  if (opts.reportType === 'daftar_siswa') {
    const blocks = buildStudentRosterByClass(students, opts.selectedClasses);
    blocks.forEach((b) => {
      ensureNewSectionPage();
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(11.5);
      doc.text(`DAFTAR PESERTA DIDIK — KELAS ${b.className}`, pageWidth / 2, y, {
        align: 'center',
      });
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9);
      doc.text(
        `Wali Kelas: ${b.homeroomTeacher}  |  L: ${b.maleCount}  |  P: ${b.femaleCount}  |  Total: ${b.totalCount} Siswa  |  TA ${settings.academicYear}`,
        pageWidth / 2,
        y + 4.8,
        { align: 'center' }
      );
      y += 9;

      autoTable(doc, {
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
        (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
      drawSignatures(finalY);
    });
  }

  doc.save(`Laporan_Resmi_${opts.reportType.toUpperCase()}_${getTodayIso()}.pdf`);
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
  const showStamp = opts?.showStamp ?? sigStamp.showStampDefault;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  const leftPng = await dataUrlToPngBase64(normKop.leftLogoDataUrl);
  const rightPng = await dataUrlToPngBase64(normKop.rightLogoDataUrl);
  const principalSigPng =
    showPrincipalSig && sigStamp.principalSignatureDataUrl
      ? await dataUrlToPngBase64(sigStamp.principalSignatureDataUrl, 480)
      : null;
  const teacherSigPng =
    showTeacherSig && sigStamp.teacherSignatureDataUrl
      ? await dataUrlToPngBase64(sigStamp.teacherSignatureDataUrl, 480)
      : null;
  const stampPng =
    showStamp && sigStamp.stampDataUrl
      ? await dataUrlToPngBase64(sigStamp.stampDataUrl, 480)
      : null;
  let photoPng = await dataUrlToPngBase64(getStudentPhotoUrl(student), 240);
  if (!photoPng && student.photoDataUrl) {
    photoPng = await dataUrlToPngBase64(
      getStudentPhotoUrl({ photoDataUrl: '', gender: student.gender }),
      240
    );
  }

  let y = 12;
  const leftLogoMm = Math.round((normKop.leftLogoSize / 64) * 20 * 10) / 10;
  const rightLogoMm = Math.round((normKop.rightLogoSize / 64) * 20 * 10) / 10;
  const maxLogoMm = Math.max(leftLogoMm, rightLogoMm, 20);

  if (leftPng) doc.addImage(leftPng, 'PNG', marginX + 2, y, leftLogoMm, leftLogoMm);
  if (rightPng) {
    doc.addImage(rightPng, 'PNG', pageWidth - marginX - rightLogoMm - 2, y, rightLogoMm, rightLogoMm);
  }

  const pxToPt = (px: number) => Math.round(px * 0.85 * 10) / 10;
  const toJsPdfStyle = (st: KopSuratTextStyle) =>
    st.bold && st.italic ? 'bolditalic' : st.bold ? 'bold' : st.italic ? 'italic' : 'normal';
  const centerX = pageWidth / 2;

  const drawKopLine = (text: string, yPos: number, sizePx: number, st: KopSuratTextStyle) => {
    if (!text) return;
    doc.setFont(kopFont, toJsPdfStyle(st));
    doc.setFontSize(pxToPt(sizePx));
    doc.text(text, centerX, yPos, { align: 'center' });
    if (st.underline) {
      const w = doc.getTextWidth(text);
      doc.setLineWidth(0.25);
      doc.line(centerX - w / 2, yPos + 0.7, centerX + w / 2, yPos + 0.7);
    }
  };

  drawKopLine(normKop.line1, y + 3, normKop.lineSizes.line1, normKop.lineStyles.line1);
  drawKopLine(normKop.line2, y + 7.8, normKop.lineSizes.line2, normKop.lineStyles.line2);
  drawKopLine(normKop.line3, y + 12.2, normKop.lineSizes.line3, normKop.lineStyles.line3);
  drawKopLine(normKop.line4, y + 17.2, normKop.lineSizes.line4, normKop.lineStyles.line4);
  drawKopLine(normKop.line5, y + 21.4, normKop.lineSizes.line5, normKop.lineStyles.line5);
  drawKopLine(normKop.line6, y + 25.0, normKop.lineSizes.line6, normKop.lineStyles.line6);

  y += Math.max(27.5, maxLogoMm + 3);
  doc.setLineWidth(0.8);
  doc.line(marginX, y, pageWidth - marginX, y);
  doc.setLineWidth(0.25);
  doc.line(marginX, y + 1.1, pageWidth - marginX, y + 1.1);
  y += 7;

  doc.setFont(bodyFont, 'bold');
  doc.setFontSize(11.5);
  doc.text('PROFIL & LAPORAN AKTIVITAS INDIVIDU SISWA', centerX, y, { align: 'center' });
  doc.setFont(bodyFont, 'normal');
  doc.setFontSize(9);
  doc.text(
    `Tahun Ajaran ${settings.academicYear}  |  Semester ${settings.semester}  |  Font: ${activeReportFont}`,
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
    doc.addPage();
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
  if (showPrincipalSig || showTeacherSig) {
    const maxBlockDownMm = Math.max(
      0,
      pxToMm(sigStamp.principalBlockOffsetY),
      pxToMm(sigStamp.teacherBlockOffsetY)
    );
    let sigY = afterGradeY + 10;
    if (sigY + 36 + maxBlockDownMm > pageHeight - 10) {
      doc.addPage();
      sigY = 20;
    }

    doc.setFont(bodyFont, 'normal');
    doc.setFontSize(9.5);
    const sigMm = Math.round((sigStamp.signatureSize / 54) * 14 * 10) / 10;
    const sigW = Math.round(sigMm * 2.2 * 10) / 10;
    const stampMm = Math.round((sigStamp.stampSize / 74) * 20 * 10) / 10;
    const stampOnTeacher =
      (sigStamp.stampTarget === 'teacher' && showTeacherSig) || !showPrincipalSig;

    const clampBlockX = (xVal: number) => Math.max(6, Math.min(pageWidth - 48, xVal));
    const clampBlockY = (yVal: number) => Math.max(12, Math.min(pageHeight - 34, yVal));

    if (showPrincipalSig) {
      const leftX = clampBlockX(marginX + 8 + pxToMm(sigStamp.principalBlockOffsetX));
      const pY = clampBlockY(sigY + pxToMm(sigStamp.principalBlockOffsetY));
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
          sigCx - sigW / 2,
          sigCy - sigMm / 2,
          sigW,
          sigMm
        );
      }
      doc.setFont(bodyFont, 'bold');
      doc.text(settings.principalName, leftX, pY + 24);
      doc.setFont(bodyFont, 'normal');
      doc.text(`NIP. ${settings.principalNip}`, leftX, pY + 28.6);
    }

    if (showTeacherSig) {
      const rightX = clampBlockX(pageWidth - marginX - 68 + pxToMm(sigStamp.teacherBlockOffsetX));
      const tY = clampBlockY(sigY + pxToMm(sigStamp.teacherBlockOffsetY));
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
        const sigCx = rightX + 17 + pxToMm(sigStamp.teacherSigOffsetX);
        const sigCy = tStageCenterY + pxToMm(sigStamp.teacherSigOffsetY);
        doc.addImage(
          teacherSigPng,
          'PNG',
          sigCx - sigW / 2,
          sigCy - sigMm / 2,
          sigW,
          sigMm
        );
      }
      doc.setFont(bodyFont, 'bold');
      doc.text(settings.teacherProfile.name, rightX, tY + 24);
      doc.setFont(bodyFont, 'normal');
      doc.text(`NIP. ${settings.teacherProfile.nip}`, rightX, tY + 28.6);
    }
  }

  const safeName = student.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Profil_Siswa_${safeName}_${getTodayIso()}.pdf`);
}
