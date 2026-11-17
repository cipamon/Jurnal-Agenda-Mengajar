import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  AttendanceStatus,
  GradeRecord,
  JournalEntry,
  PaperOrientation,
  PrintFontFamily,
  ReportType,
  Student,
  SystemSettings,
} from '../types';
import { dataUrlToPngBase64 } from './defaultLogos';
import { formatTanggalID, formatTanggalShort, getTodayIso } from './helpers';

export interface ReportFilterOptions {
  reportType: ReportType;
  selectedClasses: string[];
  selectedSubject: string; // 'ALL' or subject name
  startDate: string;
  endDate: string;
  showKopSurat: boolean;
  showPrincipalSig: boolean;
  showTeacherSig: boolean;
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
              grades
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
        let sum = 0;
        let cnt = 0;
        settings.examTypes.forEach((ex) => {
          const rec = grades.find(
            (g) =>
              g.studentId === st.id &&
              g.className === cls &&
              g.subject === subj &&
              g.examType === ex
          );
          const val = rec && rec.score !== null ? rec.score : null;
          scoreMap[st.id][ex] = val;
          if (val !== null) {
            sum += val;
            cnt += 1;
          }
        });
        avgMap[st.id] = cnt > 0 ? Math.round((sum / cnt) * 10) / 10 : null;
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

export async function exportReportToPdf(
  students: Student[],
  journals: JournalEntry[],
  grades: GradeRecord[],
  settings: SystemSettings,
  opts: ReportFilterOptions
) {
  const doc = new jsPDF({
    orientation: opts.orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pdfFont = mapPrintFontToJsPdf(opts.fontFamily);
  doc.setFont(pdfFont, 'normal');

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  const leftPng = opts.showKopSurat
    ? await dataUrlToPngBase64(settings.kopSurat.leftLogoDataUrl)
    : null;
  const rightPng = opts.showKopSurat
    ? await dataUrlToPngBase64(settings.kopSurat.rightLogoDataUrl)
    : null;

  const drawHeader = (): number => {
    let cursorY = 12;
    if (opts.showKopSurat) {
      const logoSize = 20;
      if (leftPng) {
        doc.addImage(leftPng, 'PNG', marginX + 2, cursorY, logoSize, logoSize);
      }
      if (rightPng) {
        doc.addImage(
          rightPng,
          'PNG',
          pageWidth - marginX - logoSize - 2,
          cursorY,
          logoSize,
          logoSize
        );
      }

      const centerX = pageWidth / 2;
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(10.5);
      if (settings.kopSurat.line1) {
        doc.text(settings.kopSurat.line1, centerX, cursorY + 3, { align: 'center' });
      }
      doc.setFontSize(12);
      if (settings.kopSurat.line2) {
        doc.text(settings.kopSurat.line2, centerX, cursorY + 7.8, { align: 'center' });
      }
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9.5);
      if (settings.kopSurat.line3) {
        doc.text(settings.kopSurat.line3, centerX, cursorY + 12.2, { align: 'center' });
      }
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(13.5);
      if (settings.kopSurat.line4) {
        doc.text(settings.kopSurat.line4, centerX, cursorY + 17.2, { align: 'center' });
      }
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(8.2);
      if (settings.kopSurat.line5) {
        doc.text(settings.kopSurat.line5, centerX, cursorY + 21.4, { align: 'center' });
      }
      if (settings.kopSurat.line6) {
        doc.text(settings.kopSurat.line6, centerX, cursorY + 25.0, { align: 'center' });
      }

      cursorY += 27.5;
      doc.setLineWidth(0.8);
      doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
      doc.setLineWidth(0.25);
      doc.line(marginX, cursorY + 1.1, pageWidth - marginX, cursorY + 1.1);
      cursorY += 6;
    }
    return cursorY;
  };

  const drawSignatures = (startY: number) => {
    if (!opts.showPrincipalSig && !opts.showTeacherSig) return;
    let y = startY + 8;
    if (y + 34 > pageHeight - 10) {
      doc.addPage();
      y = 18;
    }

    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(9.5);

    const todayStr = formatTanggalID(getTodayIso());

    if (opts.showPrincipalSig) {
      const leftX = marginX + 8;
      doc.text('Mengetahui,', leftX, y);
      doc.text(settings.principalTitle, leftX, y + 4.8);
      doc.setFont(pdfFont, 'bold');
      doc.text(settings.principalName, leftX, y + 23);
      doc.setFont(pdfFont, 'normal');
      doc.text(`NIP. ${settings.principalNip}`, leftX, y + 27.6);
    }

    if (opts.showTeacherSig) {
      const rightX = pageWidth - marginX - 68;
      doc.text(`${settings.signatureCity}, ${todayStr}`, rightX, y);
      doc.text('Guru Mata Pelajaran,', rightX, y + 4.8);
      doc.setFont(pdfFont, 'bold');
      doc.text(settings.teacherProfile.name, rightX, y + 23);
      doc.setFont(pdfFont, 'normal');
      doc.text(`NIP. ${settings.teacherProfile.nip}`, rightX, y + 27.6);
    }
  };

  const filteredJournals = filterJournalsForReport(journals, opts);
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
      head: [['No', 'Tanggal', 'Jam', 'Kelas', 'Mata Pelajaran', 'Materi Pokok', 'Kegiatan Pembelajaran', 'Presensi']],
      body:
        bodyRows.length > 0
          ? bodyRows
          : [['-', '-', '-', '-', '-', 'Belum ada data jurnal untuk filter ini', '-', '-']],
      styles: {
        font: pdfFont,
        fontSize: 8,
        cellPadding: 2,
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
        0: { halign: 'center', cellWidth: 9 },
        2: { halign: 'center', cellWidth: 14 },
        3: { cellWidth: 18 },
      },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
    drawSignatures(finalY);
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

      const head = [['No', 'NIS', 'Nama Siswa', 'L/P', ...m.examTypes, 'Rata-rata', 'Keterangan']];
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

  doc.save(`Laporan_Resmi_${opts.reportType.toUpperCase()}_${getTodayIso()}.pdf`);
}
