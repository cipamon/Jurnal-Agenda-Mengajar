import type {
  PaperOrientation,
  PaperSize,
  PortalDatabase,
  ReportPageLayoutsMap,
  SessionState,
  SingleReportType,
  SystemSettings,
} from '../types.ts';
import {
  ALL_SINGLE_REPORT_META,
  DEFAULT_KOP_LINE_SIZES,
  DEFAULT_KOP_LINE_STYLES,
  formatStudentTtl,
  normalizeExtraSignatureRows,
  parseTtlFields,
} from './helpers.ts';
import { createDefaultSettings, createSeedDatabase } from './seedData.ts';

const IDB_NAME = 'portal_eguru_v10_idb';
const IDB_STORE = 'workspace_store';
const IDB_KEY = 'primary_db';
const IDB_SAFETY_BACKUP_KEY = 'safety_backup_db';

const LS_DB_KEY = 'portal_eguru_v10_data';
const LS_SAFETY_BACKUP_KEY = 'portal_eguru_v10_safety_backup';
const LS_SESSION_KEY = 'portal_eguru_v10_session';

export const CURRENT_APP_SCHEMA_VERSION = '10.3.0';

/**
 * Safe schema migration for upgrades from v10.0 / v10.1 / v10.2 -> v10.3+.
 * Preserves ALL existing user data, settings, Kop Surat, signatures, stamps, logos,
 * students, journals, grades, and accounts while safely backfilling new fields.
 */
export function migrateSettings(rawSettings?: Partial<SystemSettings> & { sheetsWebAppUrl?: unknown }): SystemSettings {
  const defaults = createDefaultSettings();
  if (!rawSettings || typeof rawSettings !== 'object') {
    return defaults;
  }

  // Explicitly discard legacy sheetsWebAppUrl while retaining every other setting field
  const { sheetsWebAppUrl: _legacySheetsUrl, ...restRaw } = rawSettings;
  void _legacySheetsUrl;

  const rawKop = rawSettings.kopSurat || ({} as Partial<SystemSettings['kopSurat']>);
  const rawSig = rawSettings.signatureStamp;
  const rawBrand = rawSettings.webBrand;
  const rawTeacher = rawSettings.teacherProfile || ({} as Partial<SystemSettings['teacherProfile']>);

  const validPaperSizes = new Set<PaperSize>(['A4', 'F4', 'Letter', 'Legal']);
  const validReportTypes = new Set<SingleReportType>(ALL_SINGLE_REPORT_META.map((m) => m.id));
  const sanitizedPageLayouts: ReportPageLayoutsMap = {};
  if (rawSettings.reportPageLayouts && typeof rawSettings.reportPageLayouts === 'object') {
    Object.entries(rawSettings.reportPageLayouts).forEach(([k, val]) => {
      if (!validReportTypes.has(k as SingleReportType) || !val || typeof val !== 'object') return;
      const layoutVal = val as { paperSize?: unknown; orientation?: unknown };
      const orient: PaperOrientation =
        layoutVal.orientation === 'portrait' ? 'portrait' : 'landscape';
      const pSize = validPaperSizes.has(layoutVal.paperSize as PaperSize)
        ? (layoutVal.paperSize as PaperSize)
        : undefined;
      sanitizedPageLayouts[k as SingleReportType] = pSize
        ? { paperSize: pSize, orientation: orient }
        : { orientation: orient };
    });
  }

  return {
    ...defaults,
    ...restRaw,
    themeId: rawSettings.themeId || defaults.themeId,
    reportFontFamily: rawSettings.reportFontFamily || rawKop.fontFamily || defaults.reportFontFamily,
    reportPaperSize: rawSettings.reportPaperSize || defaults.reportPaperSize || 'A4',
    reportOrientation: rawSettings.reportOrientation || defaults.reportOrientation || 'landscape',
    reportPageLayouts: sanitizedPageLayouts,
    lockReportFormat:
      rawSettings.lockReportFormat !== undefined
        ? Boolean(rawSettings.lockReportFormat)
        : defaults.lockReportFormat ?? true,
    classes:
      Array.isArray(rawSettings.classes) && rawSettings.classes.length > 0
        ? rawSettings.classes
        : defaults.classes,
    subjects:
      Array.isArray(rawSettings.subjects) && rawSettings.subjects.length > 0
        ? rawSettings.subjects
        : defaults.subjects,
    examTypes:
      Array.isArray(rawSettings.examTypes) && rawSettings.examTypes.length > 0
        ? rawSettings.examTypes
        : defaults.examTypes,
    learningObjectives: Array.isArray(rawSettings.learningObjectives)
      ? rawSettings.learningObjectives
      : defaults.learningObjectives || [],
    academicYears:
      Array.isArray(rawSettings.academicYears) && rawSettings.academicYears.length > 0
        ? rawSettings.academicYears
        : defaults.academicYears,
    examWeights: {
      ...(defaults.examWeights || {}),
      ...(rawSettings.examWeights || {}),
    },
    useWeightedAverage:
      rawSettings.useWeightedAverage !== undefined
        ? rawSettings.useWeightedAverage
        : defaults.useWeightedAverage,
    webBrand: {
      appName: rawBrand?.appName || defaults.webBrand!.appName,
      schoolName: rawBrand?.schoolName ?? rawTeacher.school ?? defaults.teacherProfile.school,
      tabTitle: rawBrand?.tabTitle || defaults.webBrand!.tabTitle,
      loginTitle: rawBrand?.loginTitle ?? 'Selamat Datang',
      loginSubtitle: rawBrand?.loginSubtitle ?? 'Masuk untuk melanjutkan',
      loginFooterText: rawBrand?.loginFooterText ?? 'Jurnal · Presensi · Leger Nilai',
      webLogoDataUrl: rawBrand?.webLogoDataUrl || defaults.webBrand!.webLogoDataUrl,
      webLogoSize: rawBrand?.webLogoSize ?? defaults.webBrand!.webLogoSize ?? 36,
    },
    signatureStamp: {
      ...defaults.signatureStamp!,
      ...(rawSig || {}),
      showPrincipalSigImgDefault: rawSig?.showPrincipalSigImgDefault ?? true,
      showTeacherSigImgDefault: rawSig?.showTeacherSigImgDefault ?? true,
      // Preserve explicit empty string '' if admin deliberately removed default stamp
      stampDataUrl:
        rawSig === undefined ? defaults.signatureStamp!.stampDataUrl : rawSig.stampDataUrl ?? '',
      extraRows: normalizeExtraSignatureRows(rawSig?.extraRows),
    },
    kopSurat: {
      ...defaults.kopSurat,
      ...rawKop,
      lineSizes: {
        ...DEFAULT_KOP_LINE_SIZES,
        ...(rawKop.lineSizes || {}),
      },
      lineStyles: {
        ...DEFAULT_KOP_LINE_STYLES,
        ...(rawKop.lineStyles || {}),
      },
    },
    teacherProfile: {
      ...defaults.teacherProfile,
      ...rawTeacher,
    },
  };
}

export function migrateDatabase(raw: unknown): PortalDatabase | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<PortalDatabase>;
  if (!obj.settings) return null;

  const migratedSettings = migrateSettings(
    obj.settings as Partial<SystemSettings> & { sheetsWebAppUrl?: unknown }
  );

  const seedFallback = createSeedDatabase();
  const existingUsers =
    Array.isArray(obj.users) && obj.users.length > 0 ? obj.users : seedFallback.users || [];

  const students = Array.isArray(obj.students)
    ? obj.students.map((st) => {
        const parsedTtl = parseTtlFields(st.ttl);
        const birthPlace = st.birthPlace !== undefined ? st.birthPlace : parsedTtl.birthPlace;
        const birthDate = st.birthDate !== undefined ? st.birthDate : parsedTtl.birthDate;
        return {
          ...st,
          status: st.status || 'aktif',
          nisn: st.nisn ?? '',
          birthPlace,
          birthDate,
          ttl: formatStudentTtl({ birthPlace, birthDate, ttl: st.ttl }),
          phone: st.phone ?? '',
          homeroomTeacher: st.homeroomTeacher ?? '',
          counselor: st.counselor ?? '',
        };
      })
    : [];

  const journals = Array.isArray(obj.journals)
    ? obj.journals.map((j) => ({
        ...j,
        attendance: j.attendance || {},
      }))
    : [];

  const grades = Array.isArray(obj.grades) ? obj.grades : [];
  const schedules = Array.isArray(obj.schedules)
    ? obj.schedules
    : seedFallback.schedules || [];
  const agendas = Array.isArray(obj.agendas)
    ? obj.agendas
    : seedFallback.agendas || [];

  return {
    version: CURRENT_APP_SCHEMA_VERSION,
    lastSyncedAt: obj.lastSyncedAt ?? null,
    lastModifiedAt: typeof obj.lastModifiedAt === 'string' ? obj.lastModifiedAt : undefined,
    students,
    journals,
    grades,
    schedules,
    agendas,
    users: existingUsers,
    settings: migratedSettings,
  };
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadLocalSafetyBackup(): Promise<PortalDatabase | null> {
  try {
    const db = await openIDB();
    const idbData = await new Promise<PortalDatabase | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_SAFETY_BACKUP_KEY);
      req.onsuccess = () => resolve((req.result as PortalDatabase) || null);
      req.onerror = () => resolve(null);
    });
    if (idbData && idbData.settings) {
      const migrated = migrateDatabase(idbData);
      if (migrated) return migrated;
    }
  } catch {
    // Fallback to LocalStorage below
  }

  try {
    const raw = localStorage.getItem(LS_SAFETY_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortalDatabase;
    return migrateDatabase(parsed);
  } catch {
    return null;
  }
}

export async function saveLocalSafetyBackup(data: PortalDatabase): Promise<void> {
  const safePayload: PortalDatabase = {
    ...data,
    version: CURRENT_APP_SCHEMA_VERSION,
  };

  try {
    localStorage.setItem(LS_SAFETY_BACKUP_KEY, JSON.stringify(safePayload));
  } catch {
    // Ignore localStorage quota exceeded
  }

  try {
    const db = await openIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(safePayload, IDB_SAFETY_BACKUP_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Best-effort IndexedDB write
  }
}

export async function loadDatabase(): Promise<PortalDatabase | null> {
  try {
    const db = await openIDB();
    const idbData = await new Promise<PortalDatabase | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as PortalDatabase) || null);
      req.onerror = () => resolve(null);
    });
    if (idbData && idbData.settings) {
      const migrated = migrateDatabase(idbData);
      if (migrated) return migrated;
    }
  } catch {
    // Fallback to LocalStorage below
  }

  try {
    const raw = localStorage.getItem(LS_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PortalDatabase;
      const migrated = migrateDatabase(parsed);
      if (migrated) return migrated;
    }
  } catch {
    // Fallback to safety backup below
  }

  return loadLocalSafetyBackup();
}

export async function saveDatabase(data: PortalDatabase): Promise<void> {
  const safePayload: PortalDatabase = {
    ...data,
    version: CURRENT_APP_SCHEMA_VERSION,
  };

  try {
    localStorage.setItem(LS_DB_KEY, JSON.stringify(safePayload));
  } catch {
    // Ignore localStorage quota exceeded when large images are uploaded; IndexedDB handles larger payloads
  }

  try {
    const db = await openIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(safePayload, IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Best-effort IndexedDB write
  }
}

export function loadSession(): SessionState | null {
  try {
    localStorage.removeItem(LS_SESSION_KEY);
  } catch {
    // ignore
  }
  return null;
}

export function saveSession(_session: SessionState): void {
  // Custom server session tokens are held strictly in memory (never persisted in localStorage)
}

export function clearSession(): void {
  try {
    localStorage.removeItem(LS_SESSION_KEY);
  } catch {
    // ignore
  }
}
