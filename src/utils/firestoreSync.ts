import { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  AppUser,
  DayOfWeek,
  GradeRecord,
  JournalEntry,
  PortalDatabase,
  Student,
  SystemSettings,
  TeacherAgendaItem,
  TeachingScheduleItem,
  UserRole,
} from '../types';
import { createSeedDatabase } from './seedData';
import { CURRENT_APP_SCHEMA_VERSION, migrateDatabase, migrateSettings, saveDatabase } from './storage';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'wikwikeuy@gmail.com';

const ASSET_MARKER_PREFIX = 'asset://';

type AssetSlotKey =
  | 'leftLogo'
  | 'rightLogo'
  | 'webLogo'
  | 'principalSig'
  | 'teacherSig'
  | 'stamp';

export function toMemberAccessKey(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/\./g, '_dot_')
    .replace(/-/g, '_dash_')
    .replace(/\+/g, '_plus_')
    .replace(/[^a-z0-9_]/g, '_');
}

export function sanitizeDocId(raw: string, fallbackPrefix = 'doc'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 120);
  return cleaned || `${fallbackPrefix}-${Date.now()}`;
}

function tsToIso(val: unknown, fallback = ''): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return fallback || new Date().toISOString();
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    });
    return out as T;
  }
  return value;
}

export async function shrinkDataUrlIfNeeded(dataUrl: string, maxChars: number): Promise<string> {
  const trimmed = String(dataUrl || '').trim();
  if (!trimmed || !trimmed.startsWith('data:image/') || trimmed.length <= maxChars) {
    return trimmed.length > maxChars ? '' : trimmed;
  }

  if (typeof document === 'undefined') return trimmed.slice(0, maxChars);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const isPng = trimmed.startsWith('data:image/png');
        const mime = isPng ? 'image/png' : 'image/jpeg';
        let scale = Math.min(1, Math.sqrt(maxChars / trimmed.length));
        const tryEncode = (s: number, q: number): string => {
          const w = Math.max(48, Math.round(img.width * s));
          const h = Math.max(48, Math.round(img.height * s));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return '';
          ctx.drawImage(img, 0, 0, w, h);
          return canvas.toDataURL(mime, q);
        };

        let out = tryEncode(scale, 0.86);
        let attempts = 0;
        while (out.length > maxChars && attempts < 5) {
          attempts++;
          scale *= 0.72;
          out = tryEncode(scale, isPng ? 1 : 0.72);
        }
        if (out.length > maxChars && isPng) {
          // Fallback to JPEG if PNG stays too large for Firestore doc limit
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(48, Math.round(img.width * 0.65));
          canvas.height = Math.max(48, Math.round(img.height * 0.65));
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            out = canvas.toDataURL('image/jpeg', 0.8);
          }
        }
        resolve(out.length <= maxChars ? out : '');
      } catch {
        resolve('');
      }
    };
    img.onerror = () => resolve('');
    img.src = trimmed;
  });
}

async function commitOperationsInChunks(
  ops: Array<(batch: ReturnType<typeof writeBatch>) => void>,
  chunkSize = 380,
  opType: OperationType = OperationType.WRITE,
  pathDesc = 'batch'
): Promise<void> {
  for (let i = 0; i < ops.length; i += chunkSize) {
    const slice = ops.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    slice.forEach((fn) => fn(batch));
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, opType, pathDesc);
    }
  }
}

function extractSettingsAndAssets(settings: SystemSettings): {
  slimSettings: SystemSettings;
  assets: Record<AssetSlotKey, string>;
} {
  const migrated = migrateSettings(settings);
  const assets: Record<AssetSlotKey, string> = {
    leftLogo: '',
    rightLogo: '',
    webLogo: '',
    principalSig: '',
    teacherSig: '',
    stamp: '',
  };

  const processField = (raw: string | undefined, key: AssetSlotKey): string => {
    const val = String(raw || '').trim();
    if (!val) return '';
    if (val.startsWith('data:')) {
      assets[key] = val;
      return `${ASSET_MARKER_PREFIX}${key}`;
    }
    return val;
  };

  const slimSettings: SystemSettings = {
    ...migrated,
    kopSurat: {
      ...migrated.kopSurat,
      leftLogoDataUrl: processField(migrated.kopSurat.leftLogoDataUrl, 'leftLogo'),
      rightLogoDataUrl: processField(migrated.kopSurat.rightLogoDataUrl, 'rightLogo'),
    },
    webBrand: {
      ...migrated.webBrand!,
      webLogoDataUrl: processField(migrated.webBrand?.webLogoDataUrl, 'webLogo'),
    },
    signatureStamp: {
      ...migrated.signatureStamp!,
      principalSignatureDataUrl: processField(
        migrated.signatureStamp?.principalSignatureDataUrl,
        'principalSig'
      ),
      teacherSignatureDataUrl: processField(
        migrated.signatureStamp?.teacherSignatureDataUrl,
        'teacherSig'
      ),
      stampDataUrl: processField(migrated.signatureStamp?.stampDataUrl, 'stamp'),
    },
    teacherProfile: {
      ...migrated.teacherProfile,
      // Do not persist plaintext password or oversized avatar in shared settings doc
      password: '',
      photoDataUrl:
        migrated.teacherProfile.photoDataUrl &&
        migrated.teacherProfile.photoDataUrl.length <= 120000
          ? migrated.teacherProfile.photoDataUrl
          : '',
    },
  };

  return { slimSettings, assets };
}

function hydrateSettingsFromAssets(
  rawSettings: SystemSettings,
  assetMap: Map<string, string>,
  fallbackSettings?: SystemSettings
): SystemSettings {
  const resolveField = (
    val: string | undefined,
    key: AssetSlotKey,
    fallbackVal?: string
  ): string => {
    const str = String(val || '');
    if (str.startsWith(ASSET_MARKER_PREFIX)) {
      const assetId = str.slice(ASSET_MARKER_PREFIX.length) || key;
      const found = assetMap.get(assetId);
      if (found !== undefined) return found;
      return fallbackVal || '';
    }
    return str;
  };

  const migrated = migrateSettings(rawSettings);
  return {
    ...migrated,
    kopSurat: {
      ...migrated.kopSurat,
      leftLogoDataUrl: resolveField(
        migrated.kopSurat.leftLogoDataUrl,
        'leftLogo',
        fallbackSettings?.kopSurat.leftLogoDataUrl
      ),
      rightLogoDataUrl: resolveField(
        migrated.kopSurat.rightLogoDataUrl,
        'rightLogo',
        fallbackSettings?.kopSurat.rightLogoDataUrl
      ),
    },
    webBrand: {
      ...migrated.webBrand!,
      webLogoDataUrl: resolveField(
        migrated.webBrand?.webLogoDataUrl,
        'webLogo',
        fallbackSettings?.webBrand?.webLogoDataUrl
      ),
    },
    signatureStamp: {
      ...migrated.signatureStamp!,
      principalSignatureDataUrl: resolveField(
        migrated.signatureStamp?.principalSignatureDataUrl,
        'principalSig',
        fallbackSettings?.signatureStamp?.principalSignatureDataUrl
      ),
      teacherSignatureDataUrl: resolveField(
        migrated.signatureStamp?.teacherSignatureDataUrl,
        'teacherSig',
        fallbackSettings?.signatureStamp?.teacherSignatureDataUrl
      ),
      stampDataUrl: resolveField(
        migrated.signatureStamp?.stampDataUrl,
        'stamp',
        fallbackSettings?.signatureStamp?.stampDataUrl
      ),
    },
  };
}

function buildSettingsPayload(slimSettings: SystemSettings, uid: string) {
  return {
    version: CURRENT_APP_SCHEMA_VERSION,
    academicYear: String(slimSettings.academicYear || '2025/2026').slice(0, 20),
    semester: slimSettings.semester === 'Genap' ? 'Genap' : 'Ganjil',
    kkm: Number(slimSettings.kkm ?? 75),
    signatureCity: String(slimSettings.signatureCity || '').slice(0, 100),
    principalTitle: String(slimSettings.principalTitle || '').slice(0, 120),
    principalName: String(slimSettings.principalName || '').slice(0, 150),
    principalNip: String(slimSettings.principalNip || '').slice(0, 60),
    themeId: slimSettings.themeId || 'neomorphic',
    reportFontFamily: slimSettings.reportFontFamily || 'Times New Roman',
    reportPaperSize: slimSettings.reportPaperSize || 'A4',
    reportOrientation: slimSettings.reportOrientation === 'portrait' ? 'portrait' : 'landscape',
    reportPageLayouts: stripUndefinedDeep(slimSettings.reportPageLayouts || {}),
    lockReportFormat: slimSettings.lockReportFormat !== undefined ? Boolean(slimSettings.lockReportFormat) : true,
    signatureStamp: stripUndefinedDeep(slimSettings.signatureStamp || {}),
    webBrand: stripUndefinedDeep(slimSettings.webBrand || {}),
    kopSurat: stripUndefinedDeep(slimSettings.kopSurat || {}),
    teacherProfile: stripUndefinedDeep(slimSettings.teacherProfile || {}),
    classes: (slimSettings.classes || []).map((c) => String(c || '').slice(0, 160)).slice(0, 200),
    subjects: (slimSettings.subjects || []).map((s) => String(s || '').slice(0, 160)).slice(0, 200),
    examTypes: (slimSettings.examTypes || []).map((e) => String(e || '').slice(0, 160)).slice(0, 100),
    learningObjectives: (slimSettings.learningObjectives || [])
      .map((item) => String(item || '').slice(0, 160))
      .slice(0, 200),
    examWeights: stripUndefinedDeep(slimSettings.examWeights || {}),
    useWeightedAverage: Boolean(slimSettings.useWeightedAverage),
    academicYears: (slimSettings.academicYears || []).map((y) => String(y || '').slice(0, 160)).slice(0, 50),
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  };
}

async function prepareSlimSettingsAndAssets(rawSettings: SystemSettings): Promise<{
  slimSettings: SystemSettings;
  safeAssets: Partial<Record<AssetSlotKey, string>>;
}> {
  const { slimSettings, assets } = extractSettingsAndAssets(rawSettings);
  const safeAssets: Partial<Record<AssetSlotKey, string>> = {};

  for (const key of Object.keys(assets) as AssetSlotKey[]) {
    const val = assets[key];
    if (!val) continue;
    const safe = await shrinkDataUrlIfNeeded(val, 880000);
    if (!safe) {
      throw new Error(
        `Gambar aset (${key}) terlalu besar atau formatnya tidak dapat dikompresi untuk disimpan ke Firebase (maks. 880 KB).`
      );
    }
    safeAssets[key] = safe;
  }

  const shrinkExtraRowsTo = async (limitChars: number) => {
    if (!slimSettings.signatureStamp?.extraRows || slimSettings.signatureStamp.extraRows.length === 0) {
      return;
    }
    slimSettings.signatureStamp.extraRows = await Promise.all(
      slimSettings.signatureStamp.extraRows.map(async (row) => ({
        ...row,
        signers: await Promise.all(
          row.signers.map(async (signer) => ({
            ...signer,
            signatureDataUrl: signer.signatureDataUrl
              ? await shrinkDataUrlIfNeeded(signer.signatureDataUrl, limitChars)
              : '',
          }))
        ),
      }))
    );
  };

  await shrinkExtraRowsTo(85000);
  if (JSON.stringify(slimSettings).length > 880000) {
    await shrinkExtraRowsTo(36000);
  }
  if (JSON.stringify(slimSettings).length > 900000) {
    await shrinkExtraRowsTo(16000);
  }

  return { slimSettings, safeAssets };
}

async function buildStudentPayloads(student: Student) {
  const id = sanitizeDocId(student.id, 'stu');
  const safePhoto = await shrinkDataUrlIfNeeded(student.photoDataUrl || '', 340000);
  const publicDoc = {
    id,
    nis: String(student.nis || '-').slice(0, 40),
    nisn: String(student.nisn || '').slice(0, 40),
    absenNo: String(student.absenNo || '').slice(0, 16),
    name: String(student.name || 'Tanpa Nama').slice(0, 150),
    gender: student.gender === 'P' ? 'P' : 'L',
    className: String(student.className || 'X').slice(0, 60),
    status: student.status || 'aktif',
    enrollmentYear: String(student.enrollmentYear || '').slice(0, 20),
    photoDataUrl: safePhoto,
    birthPlace: String(student.birthPlace || '').slice(0, 100),
    birthDate: String(student.birthDate || '').slice(0, 30),
    ttl: String(student.ttl || '').slice(0, 140),
    homeroomTeacher: String(student.homeroomTeacher || '').slice(0, 150),
    counselor: String(student.counselor || '').slice(0, 150),
    updatedAt: serverTimestamp(),
  };
  const contactDoc = {
    studentId: id,
    email: String(student.email || '').slice(0, 200),
    address: String(student.address || '').slice(0, 400),
    phone: String(student.phone || '').slice(0, 40),
    updatedAt: serverTimestamp(),
  };
  return { id, publicDoc, contactDoc };
}

async function buildAppUserPayloads(user: AppUser, existingCreatedAt?: Timestamp | null) {
  const id = sanitizeDocId(user.id, 'usr');
  const safePhoto = await shrinkDataUrlIfNeeded(user.photoDataUrl || '', 340000);
  const safeSignature = await shrinkDataUrlIfNeeded(user.signatureDataUrl || '', 240000);
  const emailTrimmed = String(user.email || '').trim().slice(0, 200);
  const emailLower = emailTrimmed.toLowerCase();

  const publicDoc = {
    id,
    name: String(user.name || 'Pengguna').slice(0, 150),
    nip: String(user.nip || '-').slice(0, 60),
    role: user.role,
    school: String(user.school || '').slice(0, 180),
    gender: user.gender === 'P' ? 'P' : 'L',
    photoDataUrl: safePhoto,
    assignedClasses: (user.assignedClasses || []).slice(0, 200),
    assignedSubjects: (user.assignedSubjects || []).slice(0, 200),
    signatureDataUrl: safeSignature,
    signatureSize: Math.max(40, Math.min(280, Number(user.signatureSize ?? 54))),
    signatureOffsetX: Math.max(-300, Math.min(300, Number(user.signatureOffsetX ?? 0))),
    signatureOffsetY: Math.max(-300, Math.min(300, Number(user.signatureOffsetY ?? 0))),
    active: Boolean(user.active),
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const privateDoc = {
    userId: id,
    email: emailTrimmed,
    emailLower,
    updatedAt: serverTimestamp(),
  };

  const memberAccessDoc = {
    userId: id,
    emailLower,
    role: user.role,
    active: Boolean(user.active),
    updatedAt: serverTimestamp(),
  };

  return { id, emailKey: toMemberAccessKey(emailLower), publicDoc, privateDoc, memberAccessDoc };
}

function buildJournalPayload(
  entry: JournalEntry,
  uid: string,
  existingCreatedAt?: Timestamp | null
) {
  const id = sanitizeDocId(entry.id, 'jrn');
  return {
    id,
    payload: {
      id,
      date: String(entry.date || '').slice(0, 20),
      period: String(entry.period || '').slice(0, 40),
      className: String(entry.className || 'X').slice(0, 60),
      subject: String(entry.subject || 'Umum').slice(0, 120),
      topic: String(entry.topic || '').slice(0, 300),
      learningObjective: String(entry.learningObjective || '').slice(0, 500),
      materialUrl: String(entry.materialUrl || '').slice(0, 600),
      activities: String(entry.activities || '').slice(0, 2000),
      attendance: entry.attendance || {},
      teacherId: String(entry.teacherId || '').slice(0, 128),
      teacherName: String(entry.teacherName || '').slice(0, 150),
      academicYear: String(entry.academicYear || '').slice(0, 20),
      semester: entry.semester === 'Genap' ? 'Genap' : 'Ganjil',
      createdAt: existingCreatedAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    },
  };
}

function buildGradePayload(record: GradeRecord, uid: string) {
  const id = sanitizeDocId(record.id, 'grd');
  const studentId = sanitizeDocId(record.studentId, 'stu');
  const numScore =
    record.score === null || record.score === undefined || Number.isNaN(Number(record.score))
      ? null
      : Math.max(0, Math.min(100, Number(record.score)));

  return {
    id,
    payload: {
      id,
      studentId,
      className: String(record.className || 'X').slice(0, 60),
      subject: String(record.subject || 'Umum').slice(0, 120),
      examType: String(record.examType || 'Tugas').slice(0, 80),
      score: numScore,
      note: String(record.note || '').slice(0, 500),
      marker: record.marker || 'neutral',
      teacherId: String(record.teacherId || '').slice(0, 128),
      teacherName: String(record.teacherName || '').slice(0, 150),
      academicYear: String(record.academicYear || '').slice(0, 20),
      semester: record.semester === 'Genap' ? 'Genap' : 'Ganjil',
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    },
  };
}

const VALID_DAYS = new Set<DayOfWeek>(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']);

function buildSchedulePayload(item: TeachingScheduleItem, uid: string) {
  const id = sanitizeDocId(item.id, 'sch');
  const day = VALID_DAYS.has(item.day) ? item.day : 'Senin';
  return {
    id,
    payload: {
      id,
      day,
      period: String(item.period || '1 - 2').slice(0, 40),
      startTime: String(item.startTime || '').slice(0, 20),
      endTime: String(item.endTime || '').slice(0, 20),
      className: String(item.className || 'X').slice(0, 60),
      subject: String(item.subject || 'Umum').slice(0, 120),
      room: String(item.room || '').slice(0, 80),
      teacherId: String(item.teacherId || '').slice(0, 128),
      teacherName: String(item.teacherName || '').slice(0, 150),
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    },
  };
}

function buildAgendaPayload(item: TeacherAgendaItem, uid: string) {
  const id = sanitizeDocId(item.id, 'agd');
  return {
    id,
    payload: {
      id,
      date: String(item.date || '').slice(0, 20),
      title: String(item.title || 'Agenda').slice(0, 200),
      note: String(item.note || '').slice(0, 1000),
      done: Boolean(item.done),
      teacherId: String(item.teacherId || '').slice(0, 128),
      teacherName: String(item.teacherName || '').slice(0, 150),
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    },
  };
}

// Track Firestore createdAt Timestamps so updates preserve immutable createdAt cleanly
const journalCreatedAtMap = new Map<string, Timestamp>();
const userCreatedAtMap = new Map<string, Timestamp>();

export type MemberAuthVerificationResult =
  | {
      ok: true;
      role: UserRole;
      userId: string;
      email: string;
      isBootstrappedOwner: boolean;
    }
  | {
      ok: false;
      reason: 'unverified' | 'not_registered' | 'inactive' | 'error';
      message: string;
    };

export async function verifyAndBootstrapFirebaseAccount(
  firebaseUser: FirebaseUser,
  localDbFallback: PortalDatabase | null
): Promise<MemberAuthVerificationResult> {
  const email = (firebaseUser.email || '').trim();
  const emailLower = email.toLowerCase();
  if (!email || !firebaseUser.emailVerified) {
    return {
      ok: false,
      reason: 'unverified',
      message: 'Akun Google harus memiliki email terverifikasi untuk mengakses database Firebase.',
    };
  }

  const isBootstrappedOwner = emailLower === BOOTSTRAPPED_ADMIN_EMAIL;
  const emailKey = toMemberAccessKey(emailLower);

  let memberSnap;
  try {
    memberSnap = await getDocFromServer(doc(db, 'memberAccess', emailKey));
  } catch (err) {
    if (!isBootstrappedOwner) {
      return {
        ok: false,
        reason: 'not_registered',
        message: `Email ${email} belum terdaftar di Portal E-Guru atau akses ditolak. Hubungi Admin Sekolah untuk mendaftarkan email ini pada menu Admin & Pengguna.`,
      };
    }
    handleFirestoreError(err, OperationType.GET, `memberAccess/${emailKey}`);
  }

  if (!isBootstrappedOwner) {
    if (!memberSnap.exists()) {
      return {
        ok: false,
        reason: 'not_registered',
        message: `Email Google "${email}" belum terdaftar oleh Admin Sekolah. Minta Admin menambahkan email ini di menu Admin & Pengguna agar dapat sinkronisasi otomatis.`,
      };
    }
    const data = memberSnap.data() as { role?: UserRole; active?: boolean; userId?: string };
    if (data.active !== true) {
      return {
        ok: false,
        reason: 'inactive',
        message: `Akun "${email}" sedang dinonaktifkan oleh Admin Sistem.`,
      };
    }
    return {
      ok: true,
      role: data.role || 'guru',
      userId: data.userId || '',
      email,
      isBootstrappedOwner: false,
    };
  }

  // Bootstrapped owner (wikwikeuy@gmail.com): check if school settings exist in Firestore.
  // CRITICAL: NEVER overwrite existing Firestore data! Only initialize if settings/school does not exist yet.
  let settingsSnap;
  try {
    settingsSnap = await getDocFromServer(doc(db, 'settings', 'school'));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'settings/school');
  }

  if (!settingsSnap.exists()) {
    const sourceDb =
      (localDbFallback && migrateDatabase(localDbFallback)) || createSeedDatabase();
    const baseUsers = sourceDb.users && sourceDb.users.length > 0 ? sourceDb.users : createSeedDatabase().users || [];
    const hasOwnerUser = baseUsers.some((u) => u.email.toLowerCase() === emailLower);
    const ownerUser: AppUser = {
      id: 'usr-admin-owner',
      name: firebaseUser.displayName || 'Admin Utama Sekolah',
      nip: '-',
      email,
      password: '',
      role: 'admin',
      school: sourceDb.settings.teacherProfile.school || 'SMA Negeri 1 Nusantara',
      gender: 'L',
      photoDataUrl: firebaseUser.photoURL || '',
      assignedClasses: [],
      assignedSubjects: [],
      active: true,
      createdAt: new Date().toISOString(),
    };

    const dbToSeed: PortalDatabase = {
      ...sourceDb,
      users: hasOwnerUser
        ? baseUsers.map((u) =>
            u.email.toLowerCase() === emailLower ? { ...u, role: 'admin', active: true } : u
          )
        : [ownerUser, ...baseUsers],
    };

    await fsInitializeDatabaseOnce(dbToSeed, firebaseUser.uid);
    return {
      ok: true,
      role: 'admin',
      userId: hasOwnerUser
        ? dbToSeed.users!.find((u) => u.email.toLowerCase() === emailLower)?.id || 'usr-admin-owner'
        : ownerUser.id,
      email,
      isBootstrappedOwner: true,
    };
  }

  // Settings already exist in Firestore — make sure bootstrapped owner has memberAccess & user entry without touching existing data
  if (!memberSnap.exists()) {
    const ownerId = 'usr-admin-owner';
    const ownerUser: AppUser = {
      id: ownerId,
      name: firebaseUser.displayName || 'Admin Utama Sekolah',
      nip: '-',
      email,
      password: '',
      role: 'admin',
      school: (settingsSnap.data()?.teacherProfile as { school?: string } | undefined)?.school || 'SMA Negeri 1 Nusantara',
      gender: 'L',
      photoDataUrl: firebaseUser.photoURL || '',
      assignedClasses: [],
      assignedSubjects: [],
      active: true,
      createdAt: new Date().toISOString(),
    };
    const payloads = await buildAppUserPayloads(ownerUser, null);
    const batch = writeBatch(db);
    batch.set(doc(db, 'memberAccess', payloads.emailKey), payloads.memberAccessDoc);
    batch.set(doc(db, 'appUsers', payloads.id), payloads.publicDoc);
    batch.set(doc(db, 'appUserPrivates', payloads.id), payloads.privateDoc);
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `memberAccess/${payloads.emailKey}`);
    }
    return { ok: true, role: 'admin', userId: ownerId, email, isBootstrappedOwner: true };
  }

  const mData = memberSnap.data() as { role?: UserRole; userId?: string };
  return {
    ok: true,
    role: mData.role || 'admin',
    userId: mData.userId || 'usr-admin-owner',
    email,
    isBootstrappedOwner: true,
  };
}

export async function fsInitializeDatabaseOnce(
  sourceDb: PortalDatabase,
  uid: string
): Promise<void> {
  const { slimSettings, safeAssets } = await prepareSlimSettingsAndAssets(sourceDb.settings);
  const phase1Ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  // 1. Settings
  phase1Ops.push((batch) => {
    batch.set(doc(db, 'settings', 'school'), buildSettingsPayload(slimSettings, uid));
  });

  // 2. School Assets
  for (const key of Object.keys(safeAssets) as AssetSlotKey[]) {
    const safeDataUrl = safeAssets[key];
    if (!safeDataUrl) continue;
    phase1Ops.push((batch) => {
      batch.set(doc(db, 'schoolAssets', key), {
        id: key,
        dataUrl: safeDataUrl,
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
      });
    });
  }

  // 3. Users + MemberAccess
  for (const u of sourceDb.users || []) {
    if (!u.email) continue;
    const p = await buildAppUserPayloads(u, null);
    phase1Ops.push((batch) => {
      batch.set(doc(db, 'memberAccess', p.emailKey), p.memberAccessDoc);
      batch.set(doc(db, 'appUsers', p.id), p.publicDoc);
      batch.set(doc(db, 'appUserPrivates', p.id), p.privateDoc);
    });
  }

  // 4. Students + Contacts
  const validStudentIds = new Set<string>();
  for (const st of sourceDb.students || []) {
    const p = await buildStudentPayloads(st);
    validStudentIds.add(p.id);
    phase1Ops.push((batch) => {
      batch.set(doc(db, 'students', p.id), p.publicDoc);
      batch.set(doc(db, 'studentContacts', p.id), p.contactDoc);
    });
  }

  await commitOperationsInChunks(phase1Ops, 300, OperationType.WRITE, 'initial-migration-phase1');

  // 5. Journals + Grades (after students exist so existsAfter/exists rules succeed cleanly)
  const phase2Ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  for (const j of sourceDb.journals || []) {
    const jp = buildJournalPayload(j, uid, null);
    phase2Ops.push((batch) => {
      batch.set(doc(db, 'journals', jp.id), jp.payload);
    });
  }
  for (const g of sourceDb.grades || []) {
    const sid = sanitizeDocId(g.studentId, 'stu');
    if (!validStudentIds.has(sid)) continue;
    const gp = buildGradePayload(g, uid);
    phase2Ops.push((batch) => {
      batch.set(doc(db, 'grades', gp.id), gp.payload);
    });
  }

  for (const s of sourceDb.schedules || []) {
    const sp = buildSchedulePayload(s, uid);
    phase2Ops.push((batch) => {
      batch.set(doc(db, 'schedules', sp.id), sp.payload);
    });
  }
  for (const a of sourceDb.agendas || []) {
    const ap = buildAgendaPayload(a, uid);
    phase2Ops.push((batch) => {
      batch.set(doc(db, 'agendas', ap.id), ap.payload);
    });
  }

  if (phase2Ops.length > 0) {
    await commitOperationsInChunks(phase2Ops, 350, OperationType.WRITE, 'initial-migration-phase2');
  }
}

export function subscribeToSchoolWorkspace(opts: {
  role: UserRole;
  userEmail: string;
  initialLocalFallback: PortalDatabase;
  onSync: (dbData: PortalDatabase) => void;
}): Unsubscribe {
  const { role, userEmail, initialLocalFallback, onSync } = opts;
  const emailLower = userEmail.trim().toLowerCase();

  let rawSettings: SystemSettings | null = null;
  let hasSettings = false;
  let hasAssets = false;
  let hasStudents = false;
  let hasContacts = false;
  let hasJournals = false;
  let hasGrades = false;
  let hasSchedules = false;
  let hasAgendas = false;
  let hasUsers = false;
  let hasPrivates = false;

  const assetsMap = new Map<string, string>();
  const studentsPublicMap = new Map<string, Omit<Student, 'email' | 'address' | 'phone'>>();
  const studentContactsMap = new Map<string, { email: string; address: string; phone: string }>();
  let journalsList: JournalEntry[] = [];
  let gradesList: GradeRecord[] = [];
  let schedulesList: TeachingScheduleItem[] = [];
  let agendasList: TeacherAgendaItem[] = [];
  const usersPublicMap = new Map<string, AppUser>();
  const userPrivatesMap = new Map<string, { email: string }>();

  const emitMerged = () => {
    if (
      !hasSettings ||
      !hasAssets ||
      !hasStudents ||
      !hasContacts ||
      !hasJournals ||
      !hasGrades ||
      !hasSchedules ||
      !hasAgendas ||
      !hasUsers ||
      !hasPrivates
    ) {
      return;
    }

    const hydratedSettings = hydrateSettingsFromAssets(
      rawSettings || initialLocalFallback.settings,
      assetsMap,
      initialLocalFallback.settings
    );

    const students: Student[] = Array.from(studentsPublicMap.values()).map((st) => {
      const contact = studentContactsMap.get(st.id);
      return {
        ...st,
        email: contact?.email ?? '',
        address: contact?.address ?? '',
        phone: contact?.phone ?? '',
      };
    });

    const users: AppUser[] = Array.from(usersPublicMap.values()).map((u) => {
      const priv = userPrivatesMap.get(u.id);
      return {
        ...u,
        email: priv?.email || (u.id === 'usr-admin-owner' ? userEmail : u.email) || '',
      };
    });

    const syncedModifiedAt = hydratedSettings.updatedAt || undefined;
    const merged: PortalDatabase = {
      version: CURRENT_APP_SCHEMA_VERSION,
      lastSyncedAt: new Date().toISOString(),
      ...(syncedModifiedAt ? { lastModifiedAt: syncedModifiedAt } : {}),
      settings: hydratedSettings,
      students,
      journals: journalsList,
      grades: gradesList,
      schedules: schedulesList,
      agendas: agendasList,
      users,
    };

    void saveDatabase(merged);
    onSync(merged);
  };

  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      doc(db, 'settings', 'school'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as SystemSettings & { updatedAt?: unknown };
          rawSettings = {
            ...data,
            updatedAt: data.updatedAt ? tsToIso(data.updatedAt) : undefined,
          };
        }
        hasSettings = true;
        emitMerged();
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/school')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'schoolAssets'),
      (snap) => {
        assetsMap.clear();
        snap.forEach((d) => {
          const data = d.data() as { id?: string; dataUrl?: string };
          assetsMap.set(data.id || d.id, data.dataUrl || '');
        });
        hasAssets = true;
        emitMerged();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'schoolAssets')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'students'),
      (snap) => {
        studentsPublicMap.clear();
        snap.forEach((d) => {
          const data = d.data() as Omit<Student, 'email' | 'address' | 'phone'>;
          studentsPublicMap.set(d.id, { ...data, id: data.id || d.id });
        });
        hasStudents = true;
        emitMerged();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'students')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'studentContacts'),
      (snap) => {
        studentContactsMap.clear();
        snap.forEach((d) => {
          const data = d.data() as { email?: string; address?: string; phone?: string };
          studentContactsMap.set(d.id, {
            email: data.email || '',
            address: data.address || '',
            phone: data.phone || '',
          });
        });
        hasContacts = true;
        emitMerged();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'studentContacts')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'journals'),
      (snap) => {
        journalCreatedAtMap.clear();
        const next: JournalEntry[] = [];
        snap.forEach((d) => {
          const raw = d.data() as Record<string, unknown>;
          if (raw.createdAt instanceof Timestamp) {
            journalCreatedAtMap.set(d.id, raw.createdAt);
          }
          next.push({
            id: String(raw.id || d.id),
            date: String(raw.date || ''),
            period: String(raw.period || ''),
            className: String(raw.className || ''),
            subject: String(raw.subject || ''),
            topic: String(raw.topic || ''),
            learningObjective: String(raw.learningObjective || ''),
            materialUrl: String(raw.materialUrl || ''),
            activities: String(raw.activities || ''),
            attendance: (raw.attendance as JournalEntry['attendance']) || {},
            teacherId: String(raw.teacherId || ''),
            teacherName: String(raw.teacherName || ''),
            academicYear: String(raw.academicYear || ''),
            semester: raw.semester === 'Genap' ? 'Genap' : 'Ganjil',
            createdAt: tsToIso(raw.createdAt),
            updatedAt: tsToIso(raw.updatedAt),
          });
        });
        next.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        journalsList = next;
        hasJournals = true;
        emitMerged();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'journals')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'grades'),
      (snap) => {
        const next: GradeRecord[] = [];
        snap.forEach((d) => {
          const raw = d.data() as Record<string, unknown>;
          next.push({
            id: String(raw.id || d.id),
            studentId: String(raw.studentId || ''),
            className: String(raw.className || ''),
            subject: String(raw.subject || ''),
            examType: String(raw.examType || ''),
            score: raw.score === null || raw.score === undefined ? null : Number(raw.score),
            note: String(raw.note || ''),
            marker: (raw.marker as GradeRecord['marker']) || 'neutral',
            teacherId: String(raw.teacherId || ''),
            teacherName: String(raw.teacherName || ''),
            academicYear: String(raw.academicYear || ''),
            semester: raw.semester === 'Genap' ? 'Genap' : 'Ganjil',
            updatedAt: tsToIso(raw.updatedAt),
          });
        });
        gradesList = next;
        hasGrades = true;
        emitMerged();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'grades')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'schedules'),
      (snap) => {
        const next: TeachingScheduleItem[] = [];
        snap.forEach((d) => {
          const raw = d.data() as Record<string, unknown>;
          next.push({
            id: String(raw.id || d.id),
            day: (VALID_DAYS.has(raw.day as DayOfWeek) ? raw.day : 'Senin') as DayOfWeek,
            period: String(raw.period || ''),
            startTime: String(raw.startTime || ''),
            endTime: String(raw.endTime || ''),
            className: String(raw.className || ''),
            subject: String(raw.subject || ''),
            room: String(raw.room || ''),
            teacherId: String(raw.teacherId || ''),
            teacherName: String(raw.teacherName || ''),
            updatedAt: tsToIso(raw.updatedAt),
          });
        });
        schedulesList = next;
        hasSchedules = true;
        emitMerged();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'schedules')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'agendas'),
      (snap) => {
        const next: TeacherAgendaItem[] = [];
        snap.forEach((d) => {
          const raw = d.data() as Record<string, unknown>;
          next.push({
            id: String(raw.id || d.id),
            date: String(raw.date || ''),
            title: String(raw.title || ''),
            note: String(raw.note || ''),
            done: Boolean(raw.done),
            teacherId: String(raw.teacherId || ''),
            teacherName: String(raw.teacherName || ''),
            updatedAt: tsToIso(raw.updatedAt),
          });
        });
        next.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        agendasList = next;
        hasAgendas = true;
        emitMerged();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'agendas')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'appUsers'),
      (snap) => {
        userCreatedAtMap.clear();
        usersPublicMap.clear();
        snap.forEach((d) => {
          const raw = d.data() as Record<string, unknown>;
          if (raw.createdAt instanceof Timestamp) {
            userCreatedAtMap.set(d.id, raw.createdAt);
          }
          usersPublicMap.set(d.id, {
            id: String(raw.id || d.id),
            name: String(raw.name || ''),
            nip: String(raw.nip || '-'),
            email: '',
            password: '',
            role: (raw.role as UserRole) || 'guru',
            school: String(raw.school || ''),
            gender: raw.gender === 'P' ? 'P' : 'L',
            photoDataUrl: String(raw.photoDataUrl || ''),
            assignedClasses: Array.isArray(raw.assignedClasses) ? (raw.assignedClasses as string[]) : [],
            assignedSubjects: Array.isArray(raw.assignedSubjects) ? (raw.assignedSubjects as string[]) : [],
            signatureDataUrl: String(raw.signatureDataUrl || ''),
            signatureSize:
              typeof raw.signatureSize === 'number' ? raw.signatureSize : undefined,
            signatureOffsetX:
              typeof raw.signatureOffsetX === 'number' ? raw.signatureOffsetX : undefined,
            signatureOffsetY:
              typeof raw.signatureOffsetY === 'number' ? raw.signatureOffsetY : undefined,
            active: raw.active !== false,
            createdAt: tsToIso(raw.createdAt),
          });
        });
        hasUsers = true;
        emitMerged();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'appUsers')
    )
  );

  const privatesQuery =
    role === 'admin'
      ? collection(db, 'appUserPrivates')
      : query(collection(db, 'appUserPrivates'), where('emailLower', '==', emailLower));

  unsubs.push(
    onSnapshot(
      privatesQuery,
      (snap) => {
        userPrivatesMap.clear();
        snap.forEach((d) => {
          const raw = d.data() as { userId?: string; email?: string };
          userPrivatesMap.set(raw.userId || d.id, { email: raw.email || '' });
        });
        hasPrivates = true;
        emitMerged();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'appUserPrivates')
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

// -----------------------------------------------------------------------------
// Granular Cloud Mutation Helpers
// -----------------------------------------------------------------------------
export async function fsSaveSettings(nextSettings: SystemSettings): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Sesi Firebase belum aktif. Silakan masuk ulang dengan akun Google Admin.');
  }
  const { slimSettings, safeAssets } = await prepareSlimSettingsAndAssets(nextSettings);
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  ops.push((batch) => {
    batch.set(doc(db, 'settings', 'school'), buildSettingsPayload(slimSettings, uid));
  });

  for (const key of Object.keys(safeAssets) as AssetSlotKey[]) {
    const safe = safeAssets[key];
    if (safe) {
      ops.push((batch) => {
        batch.set(doc(db, 'schoolAssets', key), {
          id: key,
          dataUrl: safe,
          updatedAt: serverTimestamp(),
          updatedByUid: uid,
        });
      });
    }
  }

  await commitOperationsInChunks(ops, 100, OperationType.WRITE, 'settings/school');
}

export async function fsSaveStudent(student: Student): Promise<void> {
  if (!auth.currentUser?.uid) return;
  const p = await buildStudentPayloads(student);
  const batch = writeBatch(db);
  batch.set(doc(db, 'students', p.id), p.publicDoc);
  batch.set(doc(db, 'studentContacts', p.id), p.contactDoc);
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `students/${p.id}`);
  }
}

export async function fsSaveStudentsBatch(students: Student[]): Promise<void> {
  if (!auth.currentUser?.uid || students.length === 0) return;
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  for (const st of students) {
    const p = await buildStudentPayloads(st);
    ops.push((batch) => {
      batch.set(doc(db, 'students', p.id), p.publicDoc);
      batch.set(doc(db, 'studentContacts', p.id), p.contactDoc);
    });
  }
  await commitOperationsInChunks(ops, 300, OperationType.WRITE, 'students');
}

export async function fsDeleteStudents(ids: string[], gradeIdsToDelete: string[]): Promise<void> {
  if (!auth.currentUser?.uid || ids.length === 0) return;
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  ids.forEach((rawId) => {
    const id = sanitizeDocId(rawId, 'stu');
    ops.push((batch) => {
      batch.delete(doc(db, 'students', id));
      batch.delete(doc(db, 'studentContacts', id));
    });
  });
  gradeIdsToDelete.forEach((rawGid) => {
    const gid = sanitizeDocId(rawGid, 'grd');
    ops.push((batch) => {
      batch.delete(doc(db, 'grades', gid));
    });
  });
  await commitOperationsInChunks(ops, 350, OperationType.DELETE, 'students');
}

export async function fsSaveJournal(entry: JournalEntry): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const id = sanitizeDocId(entry.id, 'jrn');
  const existingCreatedAt = journalCreatedAtMap.get(id) || null;
  const jp = buildJournalPayload(entry, uid, existingCreatedAt);
  const batch = writeBatch(db);
  batch.set(doc(db, 'journals', jp.id), jp.payload);
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `journals/${jp.id}`);
  }
}

export async function fsSaveJournalsBatch(entries: JournalEntry[]): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || entries.length === 0) return;
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = entries.map((entry) => {
    const id = sanitizeDocId(entry.id, 'jrn');
    const jp = buildJournalPayload(entry, uid, journalCreatedAtMap.get(id) || null);
    return (batch) => {
      batch.set(doc(db, 'journals', jp.id), jp.payload);
    };
  });
  await commitOperationsInChunks(ops, 350, OperationType.WRITE, 'journals');
}

export async function fsDeleteJournals(ids: string[]): Promise<void> {
  if (!auth.currentUser?.uid || ids.length === 0) return;
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = ids.map((rawId) => {
    const id = sanitizeDocId(rawId, 'jrn');
    return (batch) => {
      batch.delete(doc(db, 'journals', id));
    };
  });
  await commitOperationsInChunks(ops, 350, OperationType.DELETE, 'journals');
}

export async function fsSaveGradesBatch(records: GradeRecord[]): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || records.length === 0) return;
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = records.map((rec) => {
    const gp = buildGradePayload(rec, uid);
    return (batch) => {
      batch.set(doc(db, 'grades', gp.id), gp.payload);
    };
  });
  await commitOperationsInChunks(ops, 350, OperationType.WRITE, 'grades');
}

export async function fsDeleteGrades(ids: string[]): Promise<void> {
  if (!auth.currentUser?.uid || ids.length === 0) return;
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = ids.map((rawId) => {
    const id = sanitizeDocId(rawId, 'grd');
    return (batch) => {
      batch.delete(doc(db, 'grades', id));
    };
  });
  await commitOperationsInChunks(ops, 350, OperationType.DELETE, 'grades');
}

export async function fsSaveSchedule(item: TeachingScheduleItem): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const sp = buildSchedulePayload(item, uid);
  const batch = writeBatch(db);
  batch.set(doc(db, 'schedules', sp.id), sp.payload);
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `schedules/${sp.id}`);
  }
}

export async function fsDeleteSchedule(rawId: string): Promise<void> {
  if (!auth.currentUser?.uid || !rawId) return;
  const id = sanitizeDocId(rawId, 'sch');
  const batch = writeBatch(db);
  batch.delete(doc(db, 'schedules', id));
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `schedules/${id}`);
  }
}

export async function fsSaveAgenda(item: TeacherAgendaItem): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const ap = buildAgendaPayload(item, uid);
  const batch = writeBatch(db);
  batch.set(doc(db, 'agendas', ap.id), ap.payload);
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `agendas/${ap.id}`);
  }
}

export async function fsDeleteAgenda(rawId: string): Promise<void> {
  if (!auth.currentUser?.uid || !rawId) return;
  const id = sanitizeDocId(rawId, 'agd');
  const batch = writeBatch(db);
  batch.delete(doc(db, 'agendas', id));
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `agendas/${id}`);
  }
}

export async function fsSyncUsersAdmin(prevUsers: AppUser[], nextUsers: AppUser[]): Promise<void> {
  if (!auth.currentUser?.uid) return;
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  const nextMap = new Map(nextUsers.map((u) => [sanitizeDocId(u.id, 'usr'), u]));

  for (const prev of prevUsers) {
    const pid = sanitizeDocId(prev.id, 'usr');
    const nextMatch = nextMap.get(pid);
    if (!nextMatch) {
      ops.push((batch) => {
        batch.delete(doc(db, 'appUsers', pid));
        batch.delete(doc(db, 'appUserPrivates', pid));
        if (prev.email) {
          batch.delete(doc(db, 'memberAccess', toMemberAccessKey(prev.email)));
        }
      });
    } else if (
      prev.email &&
      nextMatch.email &&
      prev.email.trim().toLowerCase() !== nextMatch.email.trim().toLowerCase()
    ) {
      ops.push((batch) => {
        batch.delete(doc(db, 'memberAccess', toMemberAccessKey(prev.email)));
      });
    }
  }

  for (const u of nextUsers) {
    if (!u.email) continue;
    const id = sanitizeDocId(u.id, 'usr');
    const p = await buildAppUserPayloads(u, userCreatedAtMap.get(id) || null);
    ops.push((batch) => {
      batch.set(doc(db, 'appUsers', p.id), p.publicDoc);
      batch.set(doc(db, 'appUserPrivates', p.id), p.privateDoc);
      batch.set(doc(db, 'memberAccess', p.emailKey), p.memberAccessDoc);
    });
  }

  await commitOperationsInChunks(ops, 300, OperationType.WRITE, 'appUsers');
}

export async function fsUpdateSelfProfile(userId: string, updated: AppUser): Promise<void> {
  if (!auth.currentUser?.uid) return;
  const id = sanitizeDocId(userId, 'usr');
  const safePhoto = await shrinkDataUrlIfNeeded(updated.photoDataUrl || '', 340000);
  const safeSignature = await shrinkDataUrlIfNeeded(updated.signatureDataUrl || '', 240000);
  const batch = writeBatch(db);
  batch.update(doc(db, 'appUsers', id), {
    name: String(updated.name || '').slice(0, 150),
    nip: String(updated.nip || '-').slice(0, 60),
    school: String(updated.school || '').slice(0, 180),
    gender: updated.gender === 'P' ? 'P' : 'L',
    photoDataUrl: safePhoto,
    assignedClasses: (updated.assignedClasses || []).slice(0, 200),
    assignedSubjects: (updated.assignedSubjects || []).slice(0, 200),
    signatureDataUrl: safeSignature,
    signatureSize: Math.max(40, Math.min(280, Number(updated.signatureSize ?? 54))),
    signatureOffsetX: Math.max(-300, Math.min(300, Number(updated.signatureOffsetX ?? 0))),
    signatureOffsetY: Math.max(-300, Math.min(300, Number(updated.signatureOffsetY ?? 0))),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `appUsers/${id}`);
  }
}

export async function fsReplaceEntireDatabase(restored: PortalDatabase): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  // Clear obsolete docs in students/studentContacts/journals/grades/schedules/agendas cleanly before writing restored state
  const collectionsToPrune = ['grades', 'journals', 'schedules', 'agendas', 'studentContacts', 'students'] as const;
  const deleteOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  for (const colName of collectionsToPrune) {
    try {
      const snap = await getDocs(collection(db, colName));
      snap.forEach((d) => {
        deleteOps.push((batch) => batch.delete(d.ref));
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, colName);
    }
  }

  if (deleteOps.length > 0) {
    await commitOperationsInChunks(deleteOps, 350, OperationType.DELETE, 'restore-prune');
  }

  journalCreatedAtMap.clear();
  // Ensure existing appUsers keep their immutable createdAt Timestamp during upsert
  const restoredWithUsersOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  const restoredUsers = restored.users || [];
  const restoredUserIds = new Set(restoredUsers.map((u) => sanitizeDocId(u.id, 'usr')));

  try {
    const existingUsersSnap = await getDocs(collection(db, 'appUsers'));
    existingUsersSnap.forEach((d) => {
      const ts = d.data()?.createdAt;
      if (ts instanceof Timestamp) {
        userCreatedAtMap.set(d.id, ts);
      }
      if (!restoredUserIds.has(d.id)) {
        restoredWithUsersOps.push((batch) => batch.delete(d.ref));
      }
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'appUsers');
  }

  for (const u of restoredUsers) {
    if (!u.email) continue;
    const id = sanitizeDocId(u.id, 'usr');
    const p = await buildAppUserPayloads(u, userCreatedAtMap.get(id) || null);
    restoredWithUsersOps.push((batch) => {
      batch.set(doc(db, 'appUsers', p.id), p.publicDoc);
      batch.set(doc(db, 'appUserPrivates', p.id), p.privateDoc);
      batch.set(doc(db, 'memberAccess', p.emailKey), p.memberAccessDoc);
    });
  }

  if (restoredWithUsersOps.length > 0) {
    await commitOperationsInChunks(restoredWithUsersOps, 300, OperationType.WRITE, 'restore-users');
  }

  await fsInitializeDatabaseOnce({ ...restored, users: [] }, uid);
}
