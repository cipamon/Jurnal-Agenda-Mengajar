import {
  AttendanceStatus,
  GradeRecord,
  JournalEntry,
  PortalDatabase,
  RowMarkerColor,
  Student,
  SystemSettings,
} from '../types';
import { DEFAULT_LEFT_LOGO, DEFAULT_RIGHT_LOGO } from './defaultLogos';

export function createDefaultSettings(overrides?: Partial<SystemSettings>): SystemSettings {
  return {
    academicYear: '2025/2026',
    semester: 'Ganjil',
    kkm: 75,
    signatureCity: 'Bandung',
    principalTitle: 'Kepala Sekolah',
    principalName: 'Drs. H. Ahmad Fauzi, M.Pd.',
    principalNip: '19680412 199403 1 008',
    sheetsWebAppUrl: '',
    kopSurat: {
      line1: 'PEMERINTAH DAERAH PROVINSI JAWA BARAT',
      line2: 'DINAS PENDIDIKAN',
      line3: 'CABANG DINAS PENDIDIKAN WILAYAH VII',
      line4: 'SMA NEGERI 1 NUSANTARA',
      line5: 'Jl. Pendidikan Raya No. 45, Kota Bandung 40115 Telp. (022) 4231980',
      line6: 'Website: www.sman1nusantara.sch.id  |  Email: info@sman1nusantara.sch.id',
      leftLogoDataUrl: DEFAULT_LEFT_LOGO,
      rightLogoDataUrl: DEFAULT_RIGHT_LOGO,
    },
    teacherProfile: {
      name: 'Rina Kusumawardani, S.Pd., M.Pd.',
      nip: '19870915 201101 2 014',
      school: 'SMA Negeri 1 Nusantara',
      email: 'guru@sman1nusantara.sch.id',
      password: 'guru123',
    },
    classes: ['X IPA 1', 'X IPA 2', 'XI IPA 1', 'XII IPA 1'],
    subjects: ['Matematika Wajib', 'Matematika Peminatan', 'Informatika', 'Fisika'],
    examTypes: ['Tugas 1', 'UH 1', 'Tugas 2', 'PTS', 'PAS'],
    academicYears: ['2024/2025', '2025/2026', '2026/2027'],
    ...overrides,
  };
}

export function createSeedDatabase(
  emailOverride?: string,
  sheetsUrlOverride?: string,
  academicYearOverride?: string,
  semesterOverride?: 'Ganjil' | 'Genap'
): PortalDatabase {
  const settings = createDefaultSettings({
    ...(academicYearOverride ? { academicYear: academicYearOverride } : {}),
    ...(semesterOverride ? { semester: semesterOverride } : {}),
    ...(sheetsUrlOverride ? { sheetsWebAppUrl: sheetsUrlOverride } : {}),
  });

  if (emailOverride) {
    settings.teacherProfile.email = emailOverride;
  }

  const students: Student[] = [
    // X IPA 1 (7 siswa)
    { id: 'std-101', nis: '25261001', name: 'Aditya Pratama Putra', gender: 'L', className: 'X IPA 1' },
    { id: 'std-102', nis: '25261002', name: 'Aulia Rahmawati', gender: 'P', className: 'X IPA 1' },
    { id: 'std-103', nis: '25261003', name: 'Bagas Kurniawan', gender: 'L', className: 'X IPA 1' },
    { id: 'std-104', nis: '25261004', name: 'Citra Dewi Lestari', gender: 'P', className: 'X IPA 1' },
    { id: 'std-105', nis: '25261005', name: 'Dimas Arya Saputra', gender: 'L', className: 'X IPA 1' },
    { id: 'std-106', nis: '25261006', name: 'Fadhilah Nurul Azmi', gender: 'P', className: 'X IPA 1' },
    { id: 'std-107', nis: '25261007', name: 'Gilang Ramadhan', gender: 'L', className: 'X IPA 1' },

    // X IPA 2 (7 siswa)
    { id: 'std-201', nis: '25262001', name: 'Hana Safitri', gender: 'P', className: 'X IPA 2' },
    { id: 'std-202', nis: '25262002', name: 'Irfan Hakim Wijaya', gender: 'L', className: 'X IPA 2' },
    { id: 'std-203', nis: '25262003', name: 'Jihan Nabila Putri', gender: 'P', className: 'X IPA 2' },
    { id: 'std-204', nis: '25262004', name: 'Kevin Mahendra', gender: 'L', className: 'X IPA 2' },
    { id: 'std-205', nis: '25262005', name: 'Larasati Permata', gender: 'P', className: 'X IPA 2' },
    { id: 'std-206', nis: '25262006', name: 'Muhammad Rizky Fauzan', gender: 'L', className: 'X IPA 2' },
    { id: 'std-207', nis: '25262007', name: 'Nadia Khairunnisa', gender: 'P', className: 'X IPA 2' },

    // XI IPA 1 (7 siswa)
    { id: 'std-301', nis: '24251001', name: 'Oka Wijaya Kusuma', gender: 'L', className: 'XI IPA 1' },
    { id: 'std-302', nis: '24251002', name: 'Putri Amelia Sari', gender: 'P', className: 'XI IPA 1' },
    { id: 'std-303', nis: '24251003', name: 'Raka Surya Pratama', gender: 'L', className: 'XI IPA 1' },
    { id: 'std-304', nis: '24251004', name: 'Salsa Bila Azzahra', gender: 'P', className: 'XI IPA 1' },
    { id: 'std-305', nis: '24251005', name: 'Taufik Hidayatullah', gender: 'L', className: 'XI IPA 1' },
    { id: 'std-306', nis: '24251006', name: 'Vina Oktaviani', gender: 'P', className: 'XI IPA 1' },
    { id: 'std-307', nis: '24251007', name: 'Yoga Pradana', gender: 'L', className: 'XI IPA 1' },

    // XII IPA 1 (7 siswa)
    { id: 'std-401', nis: '23241001', name: 'Zahra Salsabila', gender: 'P', className: 'XII IPA 1' },
    { id: 'std-402', nis: '23241002', name: 'Alvin Hendrawan', gender: 'L', className: 'XII IPA 1' },
    { id: 'std-403', nis: '23241003', name: 'Bella Puspita Ningrum', gender: 'P', className: 'XII IPA 1' },
    { id: 'std-404', nis: '23241004', name: 'Daffa Alfarizi', gender: 'L', className: 'XII IPA 1' },
    { id: 'std-405', nis: '23241005', name: 'Eka Wulandari', gender: 'P', className: 'XII IPA 1' },
    { id: 'std-406', nis: '23241006', name: 'Farhan Maulana', gender: 'L', className: 'XII IPA 1' },
    { id: 'std-407', nis: '23241007', name: 'Gita Purnama Sari', gender: 'P', className: 'XII IPA 1' },
  ];

  // Build deterministic realistic attendance for a class
  const buildAttendance = (
    className: string,
    overrides: Record<string, { status: AttendanceStatus; note: string }>
  ) => {
    const map: Record<string, { status: AttendanceStatus; note: string }> = {};
    students
      .filter((s) => s.className === className)
      .forEach((s) => {
        map[s.id] = overrides[s.id] ?? { status: 'H', note: '' };
      });
    return map;
  };

  const nowIso = new Date().toISOString();

  const journals: JournalEntry[] = [
    {
      id: 'jrn-01',
      date: '2026-11-02',
      period: '1 - 2',
      className: 'X IPA 1',
      subject: 'Matematika Wajib',
      topic: 'Persamaan & Pertidaksamaan Nilai Mutlak Linear',
      activities: 'Pemaparan konsep jarak pada garis bilangan, diskusi kelompok LKPD 1, dan latihan soal kontekstual.',
      attendance: buildAttendance('X IPA 1', {
        'std-103': { status: 'S', note: 'Demam (surat orang tua)' },
      }),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'jrn-02',
      date: '2026-11-05',
      period: '3 - 4',
      className: 'X IPA 1',
      subject: 'Matematika Wajib',
      topic: 'Sistem Persamaan Linear Tiga Variabel (SPLTV)',
      activities: 'Metode eliminasi-substitusi gabungan dan pemecahan masalah terapan ekonomi.',
      attendance: buildAttendance('X IPA 1', {
        'std-105': { status: 'I', note: 'Izin keperluan keluarga' },
        'std-107': { status: 'D', note: 'Dispen Lomba OSN Kota' },
      }),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'jrn-03',
      date: '2026-11-09',
      period: '1 - 2',
      className: 'X IPA 1',
      subject: 'Matematika Wajib',
      topic: 'Fungsi Komposisi & Fungsi Invers',
      activities: 'Eksplorasi pemetaan relasi fungsi, kuis formatif 10 soal, dan pembahasan klasikal.',
      attendance: buildAttendance('X IPA 1', {}),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'jrn-04',
      date: '2026-11-12',
      period: '1 - 2',
      className: 'X IPA 1',
      subject: 'Matematika Wajib',
      topic: 'Rasio Trigonometri pada Segitiga Siku-Siku',
      activities: 'Praktik pengukuran sudut elevasi sederhana di halaman sekolah dengan klinometer.',
      attendance: buildAttendance('X IPA 1', {
        'std-104': { status: 'S', note: 'Izin sakit gigi' },
      }),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'jrn-05',
      date: '2026-11-03',
      period: '5 - 6',
      className: 'X IPA 2',
      subject: 'Matematika Wajib',
      topic: 'Persamaan & Pertidaksamaan Nilai Mutlak Linear',
      activities: 'Demonstrasi grafik fungsi nilai mutlak dan pendampingan pengerjaan soal bertingkat.',
      attendance: buildAttendance('X IPA 2', {
        'std-204': { status: 'A', note: 'Tanpa keterangan' },
      }),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'jrn-06',
      date: '2026-11-06',
      period: '1 - 2',
      className: 'X IPA 2',
      subject: 'Matematika Wajib',
      topic: 'Sistem Persamaan Linear Tiga Variabel (SPLTV)',
      activities: 'Presentasi hasil diskusi kelompok dan evaluasi pemahaman melalui kuis singkat.',
      attendance: buildAttendance('X IPA 2', {
        'std-202': { status: 'I', note: 'Acara keluarga di luar kota' },
      }),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'jrn-07',
      date: '2026-11-10',
      period: '5 - 6',
      className: 'X IPA 2',
      subject: 'Informatika',
      topic: 'Algoritma Pencarian & Pengurutan Data',
      activities: 'Simulasi Bubble Sort dan Binary Search secara interaktif serta implementasi pseudocode.',
      attendance: buildAttendance('X IPA 2', {
        'std-206': { status: 'S', note: 'Flu ringan' },
      }),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'jrn-08',
      date: '2026-11-04',
      period: '1 - 2',
      className: 'XI IPA 1',
      subject: 'Matematika Peminatan',
      topic: 'Persamaan Trigonometri Dasar & Bentuk Kuadrat',
      activities: 'Penurunan rumus himpunan penyelesaian sinus, kosinus, dan tangen pada interval [0, 2pi].',
      attendance: buildAttendance('XI IPA 1', {
        'std-303': { status: 'D', note: 'Dispen Latihan Paskibra' },
      }),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'jrn-09',
      date: '2026-11-11',
      period: '3 - 4',
      className: 'XI IPA 1',
      subject: 'Matematika Peminatan',
      topic: 'Polinomial & Teorema Sisa',
      activities: 'Pembagian suku banyak cara bersusun dan skema Horner, dilanjutkan latihan terbimbing.',
      attendance: buildAttendance('XI IPA 1', {
        'std-305': { status: 'A', note: 'Belum hadir tanpa konfirmasi' },
        'std-302': { status: 'H', note: '' },
      }),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'jrn-10',
      date: '2026-11-13',
      period: '1 - 2',
      className: 'XI IPA 1',
      subject: 'Matematika Peminatan',
      topic: 'Persamaan Lingkaran & Garis Singgung',
      activities: 'Menentukan pusat dan jari-jari lingkaran serta garis singgung melalui titik pada lingkaran.',
      attendance: buildAttendance('XI IPA 1', {}),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'jrn-11',
      date: '2026-11-06',
      period: '3 - 4',
      className: 'XII IPA 1',
      subject: 'Matematika Peminatan',
      topic: 'Limit Fungsi Trigonometri Menuju Nol & Tak Hingga',
      activities: 'Pembuktian teorema limit dasar trigonometri dan pembahasan soal latihan UTBK.',
      attendance: buildAttendance('XII IPA 1', {
        'std-404': { status: 'I', note: 'Tes kesehatan kedinasan' },
      }),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'jrn-12',
      date: '2026-11-14',
      period: '3 - 4',
      className: 'XII IPA 1',
      subject: 'Matematika Peminatan',
      topic: 'Turunan Fungsi Trigonometri & Aplikasi Maksimum-Minimum',
      activities: 'Analisis titik stasioner, kemonotonan kurva, dan uji turunan kedua.',
      attendance: buildAttendance('XII IPA 1', {}),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  // Build comprehensive grade matrix records for all 4 classes
  const grades: GradeRecord[] = [];
  const examScoresSeed: Record<string, number[]> = {
    'X IPA 1': [88, 92, 72, 85, 79, 95, 68],
    'X IPA 2': [84, 78, 90, 66, 87, 81, 91],
    'XI IPA 1': [86, 93, 74, 89, 64, 88, 82],
    'XII IPA 1': [94, 85, 90, 77, 83, 71, 89],
  };

  const examOffsets: Record<string, number> = {
    'Tugas 1': 2,
    'UH 1': -3,
    'Tugas 2': 4,
    PTS: -2,
    PAS: 1,
  };

  const classSubjectMap: Record<string, string> = {
    'X IPA 1': 'Matematika Wajib',
    'X IPA 2': 'Matematika Wajib',
    'XI IPA 1': 'Matematika Peminatan',
    'XII IPA 1': 'Matematika Peminatan',
  };

  Object.entries(examScoresSeed).forEach(([className, baseScores]) => {
    const classStudents = students.filter((s) => s.className === className);
    const subject = classSubjectMap[className];
    classStudents.forEach((student, idx) => {
      const base = baseScores[idx] ?? 80;
      settings.examTypes.forEach((examType, eIdx) => {
        const offset = examOffsets[examType] ?? (eIdx % 2 === 0 ? 1 : -1);
        const rawScore = Math.max(55, Math.min(100, base + offset + ((idx + eIdx) % 3) - 1));
        let marker: RowMarkerColor = 'neutral';
        let note = '';
        if (rawScore >= 90) {
          marker = 'blue';
          note = 'Sangat baik, siap pengayaan';
        } else if (rawScore >= settings.kkm) {
          marker = 'green';
          note = 'Tuntas KKM';
        } else if (rawScore >= 68) {
          marker = 'yellow';
          note = 'Perlu remedial latihan soal';
        } else {
          marker = 'red';
          note = 'Perhatian khusus & bimbingan';
        }

        grades.push({
          id: `grd-${student.id}-${examType.replace(/\s+/g, '')}`,
          studentId: student.id,
          className,
          subject,
          examType,
          score: rawScore,
          note,
          marker,
          updatedAt: nowIso,
        });
      });
    });
  });

  return {
    version: '10.2.0',
    lastSyncedAt: nowIso,
    students,
    journals,
    grades,
    settings,
  };
}
