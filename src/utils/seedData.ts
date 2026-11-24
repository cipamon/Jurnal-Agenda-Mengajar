import type {
  AppUser,
  AttendanceStatus,
  GradeRecord,
  JournalEntry,
  PortalDatabase,
  RowMarkerColor,
  Student,
  SystemSettings,
} from '../types.ts';
import { DEFAULT_WEB_LOGO } from './defaultAvatars.ts';
import { DEFAULT_LEFT_LOGO, DEFAULT_RIGHT_LOGO, DEFAULT_SCHOOL_STAMP } from './defaultLogos.ts';

export function createDefaultSettings(overrides?: Partial<SystemSettings>): SystemSettings {
  return {
    academicYear: '2025/2026',
    semester: 'Ganjil',
    kkm: 75,
    signatureCity: 'Bandung',
    principalTitle: 'Kepala Sekolah',
    principalName: 'Drs. H. Ahmad Fauzi, M.Pd.',
    principalNip: '19680412 199403 1 008',
    themeId: 'neomorphic',
    reportFontFamily: 'Times New Roman',
    reportPaperSize: 'A4',
    reportOrientation: 'landscape',
    reportPageLayouts: {},
    lockReportFormat: true,
    signatureStamp: {
      principalSignatureDataUrl: '',
      teacherSignatureDataUrl: '',
      stampDataUrl: DEFAULT_SCHOOL_STAMP,
      signatureSize: 54,
      stampSize: 74,
      showStampDefault: true,
      principalSigOffsetX: 0,
      principalSigOffsetY: 0,
      teacherSigOffsetX: 0,
      teacherSigOffsetY: 0,
      stampOffsetX: 0,
      stampOffsetY: 0,
      principalBlockOffsetX: 0,
      principalBlockOffsetY: 0,
      teacherBlockOffsetX: 0,
      teacherBlockOffsetY: 0,
      stampTarget: 'principal',
      extraRows: [],
    },
    webBrand: {
      appName: 'Portal E-Guru v10.2',
      tabTitle: 'Portal E-Guru v10.2 — Sistem Jurnal Mengajar, Presensi & Penilaian Guru Terpadu',
      webLogoDataUrl: DEFAULT_WEB_LOGO,
      webLogoSize: 36,
    },
    kopSurat: {
      line1: 'PEMERINTAH DAERAH PROVINSI JAWA BARAT',
      line2: 'DINAS PENDIDIKAN',
      line3: 'CABANG DINAS PENDIDIKAN WILAYAH VII',
      line4: 'SMA NEGERI 1 NUSANTARA',
      line5: 'Jl. Pendidikan Raya No. 45, Kota Bandung 40115 Telp. (022) 4231980',
      line6: 'Website: www.sman1nusantara.sch.id  |  Email: info@sman1nusantara.sch.id',
      leftLogoDataUrl: DEFAULT_LEFT_LOGO,
      rightLogoDataUrl: DEFAULT_RIGHT_LOGO,
      leftLogoSize: 64,
      rightLogoSize: 64,
      fontFamily: 'Times New Roman',
      lineSizes: {
        line1: 12,
        line2: 14,
        line3: 12,
        line4: 16,
        line5: 11,
        line6: 11,
      },
      lineStyles: {
        line1: { bold: true, italic: false, underline: false },
        line2: { bold: true, italic: false, underline: false },
        line3: { bold: false, italic: false, underline: false },
        line4: { bold: true, italic: false, underline: false },
        line5: { bold: false, italic: false, underline: false },
        line6: { bold: false, italic: false, underline: false },
      },
    },
    teacherProfile: {
      name: 'Rina Kusumawardani, S.Pd., M.Pd.',
      nip: '19870915 201101 2 014',
      school: 'SMA Negeri 1 Nusantara',
      email: 'guru@sman1nusantara.sch.id',
      password: '',
      gender: 'P',
      assignedClasses: ['X IPA 1', 'X IPA 2', 'XI IPA 1'],
      assignedSubjects: ['Matematika Wajib', 'Matematika Peminatan'],
    },
    classes: ['X IPA 1', 'X IPA 2', 'XI IPA 1', 'XII IPA 1'],
    subjects: ['Matematika Wajib', 'Matematika Peminatan', 'Informatika', 'Fisika'],
    examTypes: ['Tugas 1', 'UH 1', 'Tugas 2', 'PTS', 'PAS'],
    examWeights: {
      'Tugas 1': 15,
      'UH 1': 20,
      'Tugas 2': 15,
      PTS: 25,
      PAS: 25,
    },
    learningObjectives: [
      'Menyelesaikan persamaan dan pertidaksamaan nilai mutlak bentuk linear satu variabel secara kontekstual',
      'Menyusun dan menyelesaikan Sistem Persamaan Linear Tiga Variabel (SPLTV) dari masalah nyata',
      'Menentukan fungsi komposisi dan fungsi invers serta sifat-sifatnya',
      'Menerapkan rasio trigonometri pada segitiga siku-siku untuk mengukur tinggi dan jarak',
      'Menganalisis persamaan lingkaran, garis singgung, serta teorema sisa polinomial',
    ],
    useWeightedAverage: true,
    academicYears: ['2024/2025', '2025/2026', '2026/2027'],
    ...overrides,
  };
}

export function createSeedDatabase(
  emailOverride?: string,
  academicYearOverride?: string,
  semesterOverride?: 'Ganjil' | 'Genap'
): PortalDatabase {
  const settings = createDefaultSettings({
    ...(academicYearOverride ? { academicYear: academicYearOverride } : {}),
    ...(semesterOverride ? { semester: semesterOverride } : {}),
  });

  if (emailOverride) {
    settings.teacherProfile.email = emailOverride;
  }

  const rawStudents: Student[] = [
    // X IPA 1 (7 siswa)
    { id: 'std-101', absenNo: '01', nis: '25261001', name: 'Aditya Pratama Putra', gender: 'L', className: 'X IPA 1', email: 'aditya.pratama@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 14 Mei 2010', address: 'Jl. Merdeka No. 18, Sumur Bandung, Kota Bandung' },
    { id: 'std-102', absenNo: '02', nis: '25261002', name: 'Aulia Rahmawati', gender: 'P', className: 'X IPA 1', email: 'aulia.rahmawati@siswa.sman1nusantara.sch.id', ttl: 'Cimahi, 03 Agustus 2010', address: 'Komplek Taman Cibeunying Blok C-4, Kota Bandung' },
    { id: 'std-103', absenNo: '03', nis: '25261003', name: 'Bagas Kurniawan', gender: 'L', className: 'X IPA 1', email: 'bagas.kurniawan@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 21 Januari 2010', address: 'Jl. Buah Batu No. 112, Lengkong, Kota Bandung' },
    { id: 'std-104', absenNo: '04', nis: '25261004', name: 'Citra Dewi Lestari', gender: 'P', className: 'X IPA 1', email: 'citra.dewi@siswa.sman1nusantara.sch.id', ttl: 'Garut, 09 September 2010', address: 'Jl. Antapani Lama No. 27, Antapani, Kota Bandung' },
    { id: 'std-105', absenNo: '05', nis: '25261005', name: 'Dimas Arya Saputra', gender: 'L', className: 'X IPA 1', email: 'dimas.arya@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 17 Maret 2010', address: 'Jl. Setiabudi No. 89, Sukasari, Kota Bandung' },
    { id: 'std-106', absenNo: '06', nis: '25261006', name: 'Fadhilah Nurul Azmi', gender: 'P', className: 'X IPA 1', email: 'fadhilah.azmi@siswa.sman1nusantara.sch.id', ttl: 'Sumedang, 28 November 2009', address: 'Jl. Dipatiukur No. 54, Coblong, Kota Bandung' },
    { id: 'std-107', absenNo: '07', nis: '25261007', name: 'Gilang Ramadhan', gender: 'L', className: 'X IPA 1', email: 'gilang.ramadhan@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 05 Juli 2010', address: 'Jl. Soekarno Hatta No. 310, Rancasari, Kota Bandung' },

    // X IPA 2 (7 siswa)
    { id: 'std-201', absenNo: '01', nis: '25262001', name: 'Hana Safitri', gender: 'P', className: 'X IPA 2', email: 'hana.safitri@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 12 Februari 2010', address: 'Jl. Ahmad Yani No. 204, Kiaracondong, Kota Bandung' },
    { id: 'std-202', absenNo: '02', nis: '25262002', name: 'Irfan Hakim Wijaya', gender: 'L', className: 'X IPA 2', email: 'irfan.hakim@siswa.sman1nusantara.sch.id', ttl: 'Tasikmalaya, 19 April 2010', address: 'Jl. Kopo Permai Blok B-11, Bojongloa, Kota Bandung' },
    { id: 'std-203', absenNo: '03', nis: '25262003', name: 'Jihan Nabila Putri', gender: 'P', className: 'X IPA 2', email: 'jihan.nabila@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 30 Oktober 2009', address: 'Jl. Dago Asri III No. 9, Coblong, Kota Bandung' },
    { id: 'std-204', absenNo: '04', nis: '25262004', name: 'Kevin Mahendra', gender: 'L', className: 'X IPA 2', email: 'kevin.mahendra@siswa.sman1nusantara.sch.id', ttl: 'Jakarta, 07 Juni 2010', address: 'Jl. Riau No. 76, Bandung Wetan, Kota Bandung' },
    { id: 'std-205', absenNo: '05', nis: '25262005', name: 'Larasati Permata', gender: 'P', className: 'X IPA 2', email: 'larasati.permata@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 22 Desember 2009', address: 'Jl. Turangga No. 15, Lengkong, Kota Bandung' },
    { id: 'std-206', absenNo: '06', nis: '25262006', name: 'Muhammad Rizky Fauzan', gender: 'L', className: 'X IPA 2', email: 'rizky.fauzan@siswa.sman1nusantara.sch.id', ttl: 'Cianjur, 11 Mei 2010', address: 'Jl. Pasir Kaliki No. 43, Cicendo, Kota Bandung' },
    { id: 'std-207', absenNo: '07', nis: '25262007', name: 'Nadia Khairunnisa', gender: 'P', className: 'X IPA 2', email: 'nadia.khairunnisa@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 25 Agustus 2010', address: 'Jl. Cihampelas No. 160, Coblong, Kota Bandung' },

    // XI IPA 1 (7 siswa)
    { id: 'std-301', absenNo: '01', nis: '24251001', name: 'Oka Wijaya Kusuma', gender: 'L', className: 'XI IPA 1', email: 'oka.wijaya@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 16 Maret 2009', address: 'Jl. Asia Afrika No. 92, Regol, Kota Bandung' },
    { id: 'std-302', absenNo: '02', nis: '24251002', name: 'Putri Amelia Sari', gender: 'P', className: 'XI IPA 1', email: 'putri.amelia@siswa.sman1nusantara.sch.id', ttl: 'Subang, 04 Juli 2009', address: 'Jl. Supratman No. 31, Cibeunying Kaler, Kota Bandung' },
    { id: 'std-303', absenNo: '03', nis: '24251003', name: 'Raka Surya Pratama', gender: 'L', className: 'XI IPA 1', email: 'raka.surya@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 27 Januari 2009', address: 'Jl. Arcamanik Endah No. 19, Arcamanik, Kota Bandung' },
    { id: 'std-304', absenNo: '04', nis: '24251004', name: 'Salsa Bila Azzahra', gender: 'P', className: 'XI IPA 1', email: 'salsa.azzahra@siswa.sman1nusantara.sch.id', ttl: 'Purwakarta, 13 September 2009', address: 'Jl. Ciumbuleuit No. 67, Cidadap, Kota Bandung' },
    { id: 'std-305', absenNo: '05', nis: '24251005', name: 'Taufik Hidayatullah', gender: 'L', className: 'XI IPA 1', email: 'taufik.hidayat@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 08 November 2008', address: 'Jl. Rajawali Timur No. 88, Andir, Kota Bandung' },
    { id: 'std-306', absenNo: '06', nis: '24251006', name: 'Vina Oktaviani', gender: 'P', className: 'XI IPA 1', email: 'vina.oktaviani@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 18 Oktober 2009', address: 'Jl. Pelajar Pejuang 45 No. 50, Lengkong, Kota Bandung' },
    { id: 'std-307', absenNo: '07', nis: '24251007', name: 'Yoga Pradana', gender: 'L', className: 'XI IPA 1', email: 'yoga.pradana@siswa.sman1nusantara.sch.id', ttl: 'Cimahi, 02 Mei 2009', address: 'Jl. Sukajadi No. 134, Sukajadi, Kota Bandung' },

    // XII IPA 1 (7 siswa)
    { id: 'std-401', absenNo: '01', nis: '23241001', name: 'Zahra Salsabila', gender: 'P', className: 'XII IPA 1', email: 'zahra.salsabila@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 20 April 2008', address: 'Jl. Ganesha No. 14, Coblong, Kota Bandung' },
    { id: 'std-402', absenNo: '02', nis: '23241002', name: 'Alvin Hendrawan', gender: 'L', className: 'XII IPA 1', email: 'alvin.hendrawan@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 15 Agustus 2008', address: 'Jl. Talaga Bodas No. 23, Lengkong, Kota Bandung' },
    { id: 'std-403', absenNo: '03', nis: '23241003', name: 'Bella Puspita Ningrum', gender: 'P', className: 'XII IPA 1', email: 'bella.puspita@siswa.sman1nusantara.sch.id', ttl: 'Bogor, 06 Desember 2007', address: 'Jl. Cipaganti No. 72, Coblong, Kota Bandung' },
    { id: 'std-404', absenNo: '04', nis: '23241004', name: 'Daffa Alfarizi', gender: 'L', className: 'XII IPA 1', email: 'daffa.alfarizi@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 29 Maret 2008', address: 'Jl. Gatot Subroto No. 145, Batununggal, Kota Bandung' },
    { id: 'std-405', absenNo: '05', nis: '23241005', name: 'Eka Wulandari', gender: 'P', className: 'XII IPA 1', email: 'eka.wulandari@siswa.sman1nusantara.sch.id', ttl: 'Cirebon, 10 Januari 2008', address: 'Jl. Pahlawan No. 39, Cibeunying Kaler, Kota Bandung' },
    { id: 'std-406', absenNo: '06', nis: '23241006', name: 'Farhan Maulana', gender: 'L', className: 'XII IPA 1', email: 'farhan.maulana@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 24 Juni 2008', address: 'Jl. Margacinta No. 61, Buahbatu, Kota Bandung' },
    { id: 'std-407', absenNo: '07', nis: '23241007', name: 'Gita Purnama Sari', gender: 'P', className: 'XII IPA 1', email: 'gita.purnama@siswa.sman1nusantara.sch.id', ttl: 'Bandung, 01 September 2008', address: 'Jl. Banda No. 28, Bandung Wetan, Kota Bandung' },
  ];

  const homeroomByClass: Record<string, string> = {
    'X IPA 1': 'Budi Hartono, S.Pd.',
    'X IPA 2': 'Hendra Wijaya, S.Kom.',
    'XI IPA 1': 'Dra. Rina Kusumawati, M.Pd.',
    'XII IPA 1': 'Dr. Nurul Hidayah, M.Pd.',
  };

  const counselorByClass: Record<string, string> = {
    'X IPA 1': 'Dra. Ratna Sari, M.Pd., Kons.',
    'X IPA 2': 'Dra. Ratna Sari, M.Pd., Kons.',
    'XI IPA 1': 'Ahmad Fauzan, S.Pd., Kons.',
    'XII IPA 1': 'Ahmad Fauzan, S.Pd., Kons.',
  };

  const students: Student[] = rawStudents.map((s, idx) => {
    const ttlParts = (s.ttl || '').split(',');
    const birthPlace = (ttlParts[0] || 'Bandung').trim();
    const birthDate = ttlParts.slice(1).join(',').trim() || '10 Mei 2010';
    const baseYearCode = s.nis.startsWith('23') ? '008' : s.nis.startsWith('24') ? '009' : '010';
    const nisn = `${baseYearCode}${String(4100201 + idx).padStart(7, '0')}`;
    const phone = `0812-2300-${String(1001 + idx).padStart(4, '0')}`;
    return {
      ...s,
      nisn,
      birthPlace,
      birthDate,
      phone,
      homeroomTeacher: homeroomByClass[s.className] || 'Budi Hartono, S.Pd.',
      counselor: counselorByClass[s.className] || 'Dra. Ratna Sari, M.Pd., Kons.',
      status: 'aktif',
      enrollmentYear: settings.academicYear,
    };
  });

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

  const rawJournals: JournalEntry[] = [
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
      teacherId: 'usr-guru-2',
      teacherName: 'Hendra Wijaya, S.Kom.',
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

  const journals: JournalEntry[] = rawJournals.map((j) => ({
    ...j,
    teacherId: j.teacherId || 'usr-guru-1',
    teacherName: j.teacherName || settings.teacherProfile.name,
    academicYear: settings.academicYear,
    semester: settings.semester,
  }));

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
          id: `grd-${settings.academicYear}-${settings.semester}-${student.id}-${subject.replace(/\s+/g, '')}-${examType.replace(/\s+/g, '')}`,
          studentId: student.id,
          className,
          subject,
          examType,
          score: rawScore,
          note,
          marker,
          teacherId: 'usr-guru-1',
          teacherName: settings.teacherProfile.name,
          academicYear: settings.academicYear,
          semester: settings.semester,
          updatedAt: nowIso,
        });
      });
    });
  });

  const users: AppUser[] = [
    {
      id: 'usr-admin-1',
      username: 'admin',
      name: 'Administrator Sistem',
      nip: '19850101 201001 1 001',
      email: 'admin@sman1nusantara.sch.id',
      password: '',
      role: 'admin',
      school: settings.teacherProfile.school,
      gender: 'L',
      active: true,
      createdAt: nowIso,
    },
    {
      id: 'usr-guru-1',
      username: 'guru',
      name: settings.teacherProfile.name,
      nip: settings.teacherProfile.nip,
      email: settings.teacherProfile.email,
      password: '',
      role: 'guru',
      school: settings.teacherProfile.school,
      gender: 'P',
      assignedClasses: ['X IPA 1', 'X IPA 2', 'XI IPA 1'],
      assignedSubjects: ['Matematika Wajib', 'Matematika Peminatan'],
      active: true,
      createdAt: nowIso,
    },
    {
      id: 'usr-guru-2',
      username: 'guru2',
      name: 'Hendra Wijaya, S.Kom.',
      nip: '19900521 201603 1 006',
      email: 'guru2@sman1nusantara.sch.id',
      password: '',
      role: 'guru',
      school: settings.teacherProfile.school,
      gender: 'L',
      assignedClasses: ['X IPA 2', 'XII IPA 1'],
      assignedSubjects: ['Informatika', 'Fisika'],
      active: true,
      createdAt: nowIso,
    },
    {
      id: 'usr-wali-1',
      username: 'walikelas',
      name: 'Budi Hartono, S.Pd.',
      nip: '19890310 201402 1 003',
      email: 'walikelas@sman1nusantara.sch.id',
      password: '',
      role: 'wali_kelas',
      school: settings.teacherProfile.school,
      gender: 'L',
      assignedClasses: ['X IPA 1'],
      assignedSubjects: [],
      active: true,
      createdAt: nowIso,
    },
    {
      id: 'usr-kepsek-1',
      username: 'kepsek',
      name: settings.principalName,
      nip: settings.principalNip,
      email: 'kepsek@sman1nusantara.sch.id',
      password: '',
      role: 'kepala_sekolah',
      school: settings.teacherProfile.school,
      gender: 'L',
      active: true,
      createdAt: nowIso,
    },
    {
      id: 'usr-staff-1',
      username: 'staff',
      name: 'Siti Aminah, A.Md.',
      nip: '19920614 201903 2 009',
      email: 'staff@sman1nusantara.sch.id',
      password: '',
      role: 'karyawan',
      school: settings.teacherProfile.school,
      gender: 'P',
      active: true,
      createdAt: nowIso,
    },
  ];

  const schedules = [
    {
      id: 'sch-01',
      day: 'Senin' as const,
      period: '1 - 2',
      startTime: '07:15',
      endTime: '08:45',
      className: 'X IPA 1',
      subject: 'Matematika Wajib',
      room: 'Ruang 101',
      teacherId: 'usr-guru-1',
      teacherName: settings.teacherProfile.name,
      updatedAt: nowIso,
    },
    {
      id: 'sch-02',
      day: 'Selasa' as const,
      period: '5 - 6',
      startTime: '10:30',
      endTime: '12:00',
      className: 'X IPA 2',
      subject: 'Matematika Wajib',
      room: 'Ruang 102',
      teacherId: 'usr-guru-1',
      teacherName: settings.teacherProfile.name,
      updatedAt: nowIso,
    },
    {
      id: 'sch-03',
      day: 'Rabu' as const,
      period: '1 - 2',
      startTime: '07:15',
      endTime: '08:45',
      className: 'XI IPA 1',
      subject: 'Matematika Peminatan',
      room: 'Ruang 201',
      teacherId: 'usr-guru-1',
      teacherName: settings.teacherProfile.name,
      updatedAt: nowIso,
    },
    {
      id: 'sch-04',
      day: 'Kamis' as const,
      period: '3 - 4',
      startTime: '09:00',
      endTime: '10:30',
      className: 'X IPA 1',
      subject: 'Matematika Wajib',
      room: 'Ruang 101',
      teacherId: 'usr-guru-1',
      teacherName: settings.teacherProfile.name,
      updatedAt: nowIso,
    },
    {
      id: 'sch-05',
      day: 'Jumat' as const,
      period: '3 - 4',
      startTime: '09:00',
      endTime: '10:30',
      className: 'XII IPA 1',
      subject: 'Matematika Peminatan',
      room: 'Ruang 301',
      teacherId: 'usr-guru-1',
      teacherName: settings.teacherProfile.name,
      updatedAt: nowIso,
    },
  ];

  const agendas = [
    {
      id: 'agd-01',
      date: '2026-11-16',
      title: 'Koreksi Hasil UH 1 & Pemetaan Remedial X IPA 1',
      note: 'Siapkan soal pengayaan untuk siswa tuntas > 90 dan latihan terbimbing untuk di bawah KKM.',
      done: false,
      teacherId: 'usr-guru-1',
      teacherName: settings.teacherProfile.name,
      updatedAt: nowIso,
    },
    {
      id: 'agd-02',
      date: '2026-11-18',
      title: 'Unggah Modul Ajar & LKPD Trigonometri',
      note: 'Pastikan tautan Drive modul sudah dibagikan akses lihat untuk peserta didik.',
      done: true,
      teacherId: 'usr-guru-1',
      teacherName: settings.teacherProfile.name,
      updatedAt: nowIso,
    },
  ];

  return {
    version: '10.3.0',
    lastSyncedAt: nowIso,
    students,
    journals,
    grades,
    schedules,
    agendas,
    users,
    settings,
  };
}
