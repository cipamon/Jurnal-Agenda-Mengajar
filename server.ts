import 'dotenv/config';
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  AppUser,
  GradeRecord,
  JournalEntry,
  PortalDatabase,
  Student,
  SystemSettings,
  TeacherAgendaItem,
  TeacherProfile,
  TeachingScheduleItem,
  UserRole,
} from './src/types.ts';
import { createSeedDatabase } from './src/utils/seedData.ts';
import { CURRENT_APP_SCHEMA_VERSION, migrateDatabase, migrateSettings } from './src/utils/storage.ts';

const __filename =
  typeof import.meta !== 'undefined' && import.meta.url
    ? fileURLToPath(import.meta.url)
    : path.resolve(process.cwd(), 'server.ts');
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
const IS_NETLIFY = Boolean(
  process.env.PORTAL_NETLIFY_FUNCTION ||
    process.env.NETLIFY ||
    process.env.NETLIFY_LOCAL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT
);
const IS_SERVERLESS = IS_VERCEL || IS_NETLIFY;
const candidateDataDirs = [
  path.resolve(__dirname, '.data'),
  path.resolve(process.cwd(), '.data'),
  path.resolve(__dirname, '..', '..', '.data'),
];
const BUNDLED_DATA_DIR =
  candidateDataDirs.find((dir) => fs.existsSync(dir)) || path.resolve(__dirname, '.data');
const DATA_DIR = process.env.PORTAL_DATA_DIR
  ? path.resolve(process.env.PORTAL_DATA_DIR)
  : IS_SERVERLESS
    ? path.resolve('/tmp', 'portal-eguru-data')
    : BUNDLED_DATA_DIR;

// Ephemeral in-memory fallback signing key when SESSION_SECRET env var is unset
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

interface StoredServerUser extends Omit<AppUser, 'password'> {
  username: string;
  passwordSalt: string;
  passwordHash: string;
}

interface UsersStore {
  adminClaimed: boolean;
  users: StoredServerUser[];
}

interface WorkspaceStore {
  version: string;
  lastSyncedAt: string | null;
  students: Student[];
  journals: JournalEntry[];
  grades: GradeRecord[];
  schedules: TeachingScheduleItem[];
  agendas: TeacherAgendaItem[];
  settings: SystemSettings;
}

interface TokenPayload {
  sub: string;
  username: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

interface AuthedRequest extends Request {
  authUser?: {
    id: string;
    username: string;
    email: string;
    role: UserRole;
    isEnvAdmin?: boolean;
  };
}

function resolveInsideDataDir(filename: string): string {
  const cleaned = path.basename(filename);
  const resolved = path.resolve(DATA_DIR, cleaned);
  if (!resolved.startsWith(DATA_DIR + path.sep)) {
    throw new Error('Path luar direktori data ditolak.');
  }
  return resolved;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  ensureDataDir();
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function hashPassword(plain: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPasswordHash(plain: string, salt: string, expectedHash: string): boolean {
  if (!plain || !salt || !expectedHash) return false;
  try {
    const derived = crypto.scryptSync(plain, salt, 64);
    const expected = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function timingSafeCompareStrings(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a).digest();
  const digestB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function signAuthToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  const now = Date.now();
  const fullPayload: TokenPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${sig}`;
}

function verifyAuthToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    if (!timingSafeCompareStrings(sigB64, expectedSig)) return null;
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as TokenPayload;
    if (!decoded || typeof decoded.sub !== 'string' || typeof decoded.exp !== 'number') {
      return null;
    }
    if (Date.now() > decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

function sanitizeSettingsForServer(raw: SystemSettings): SystemSettings {
  const migrated = migrateSettings(raw);
  return {
    ...migrated,
    teacherProfile: {
      ...migrated.teacherProfile,
      password: '',
    },
  };
}

function deriveUsername(rawUsername: string | undefined, email: string, fallbackId: string): string {
  const trimmed = String(rawUsername || '').trim().toLowerCase();
  if (trimmed) return trimmed.replace(/[^a-z0-9._@-]/g, '');
  const prefix = String(email || '')
    .split('@')[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
  return prefix || fallbackId;
}

function toPublicAppUser(u: StoredServerUser): AppUser {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    nip: u.nip,
    email: u.email,
    password: '',
    role: u.role,
    school: u.school,
    gender: u.gender,
    photoDataUrl: u.photoDataUrl || '',
    assignedClasses: Array.isArray(u.assignedClasses) ? u.assignedClasses : [],
    assignedSubjects: Array.isArray(u.assignedSubjects) ? u.assignedSubjects : [],
    signatureDataUrl: u.signatureDataUrl || '',
    signatureSize: typeof u.signatureSize === 'number' ? u.signatureSize : undefined,
    signatureOffsetX: typeof u.signatureOffsetX === 'number' ? u.signatureOffsetX : undefined,
    signatureOffsetY: typeof u.signatureOffsetY === 'number' ? u.signatureOffsetY : undefined,
    hasPassword: Boolean(u.passwordHash && u.passwordSalt),
    active: Boolean(u.active),
    createdAt: u.createdAt,
  };
}

const WORKSPACE_FILE = resolveInsideDataDir('workspace.json');
const USERS_FILE = resolveInsideDataDir('users.json');
const LEGACY_WORKSPACE_FILE = resolveInsideDataDir('guru_sman1nusantara.sch.id.json');
const BACKUPS_DIR = path.resolve(DATA_DIR, 'backups');

function ensureBackupsDir(): void {
  ensureDataDir();
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

function resolveInsideBackupsDir(filename: string): string {
  const cleaned = path.basename(String(filename || '').trim());
  if (!cleaned || !/^[a-zA-Z0-9._-]+$/.test(cleaned) || !cleaned.endsWith('.json')) {
    throw new Error('Nama file cadangan tidak valid.');
  }
  const resolved = path.resolve(BACKUPS_DIR, cleaned);
  if (!resolved.startsWith(BACKUPS_DIR + path.sep)) {
    throw new Error('Path cadangan di luar direktori yang diizinkan ditolak.');
  }
  return resolved;
}

interface ServerBackupSummary {
  filename: string;
  createdAt: string;
  reason: string;
  sizeBytes: number;
  schoolName: string;
  studentCount: number;
  journalCount: number;
  gradeCount: number;
}

function listServerBackups(): ServerBackupSummary[] {
  ensureBackupsDir();
  const entries = fs
    .readdirSync(BACKUPS_DIR)
    .filter((name) => name.endsWith('.json') && name.startsWith('backup_'))
    .sort()
    .reverse();

  const list: ServerBackupSummary[] = [];
  for (const name of entries.slice(0, 25)) {
    try {
      const fullPath = resolveInsideBackupsDir(name);
      const stat = fs.statSync(fullPath);
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as {
        createdAt?: string;
        reason?: string;
        workspace?: WorkspaceStore;
      };
      const ws = parsed.workspace;
      list.push({
        filename: name,
        createdAt: parsed.createdAt || stat.mtime.toISOString(),
        reason: parsed.reason || 'snapshot',
        sizeBytes: stat.size,
        schoolName: ws?.settings?.webBrand?.schoolName || ws?.settings?.teacherProfile?.school || '-',
        studentCount: Array.isArray(ws?.students) ? ws!.students.length : 0,
        journalCount: Array.isArray(ws?.journals) ? ws!.journals.length : 0,
        gradeCount: Array.isArray(ws?.grades) ? ws!.grades.length : 0,
      });
    } catch {
      // skip unreadable backup entry
    }
  }
  return list;
}

function createServerBackupSnapshot(reason = 'manual'): ServerBackupSummary | null {
  try {
    ensureBackupsDir();
    if (!fs.existsSync(WORKSPACE_FILE)) return null;
    const rawWs = JSON.parse(fs.readFileSync(WORKSPACE_FILE, 'utf-8')) as WorkspaceStore;
    const rawUsers = fs.existsSync(USERS_FILE)
      ? (JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')) as UsersStore)
      : null;

    const safeReason = String(reason || 'manual').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${stamp}_${safeReason}.json`;
    const targetPath = resolveInsideBackupsDir(filename);

    const payload = {
      backupVersion: CURRENT_APP_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      reason: safeReason,
      workspace: rawWs,
      users: rawUsers ? rawUsers.users.map(toPublicAppUser) : [],
    };
    writeJsonAtomic(targetPath, payload);

    // Prune older snapshots beyond 25 while never removing newer backups
    const allBackups = fs
      .readdirSync(BACKUPS_DIR)
      .filter((name) => name.endsWith('.json') && name.startsWith('backup_'))
      .sort()
      .reverse();
    for (const oldFile of allBackups.slice(25)) {
      try {
        fs.unlinkSync(resolveInsideBackupsDir(oldFile));
      } catch {
        // ignore prune errors
      }
    }

    const stat = fs.statSync(targetPath);
    return {
      filename,
      createdAt: payload.createdAt,
      reason: safeReason,
      sizeBytes: stat.size,
      schoolName:
        rawWs?.settings?.webBrand?.schoolName || rawWs?.settings?.teacherProfile?.school || '-',
      studentCount: Array.isArray(rawWs?.students) ? rawWs.students.length : 0,
      journalCount: Array.isArray(rawWs?.journals) ? rawWs.journals.length : 0,
      gradeCount: Array.isArray(rawWs?.grades) ? rawWs.grades.length : 0,
    };
  } catch {
    return null;
  }
}

function readLegacyDatabaseIfAvailable(): PortalDatabase | null {
  try {
    if (!fs.existsSync(LEGACY_WORKSPACE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(LEGACY_WORKSPACE_FILE, 'utf-8'));
    return migrateDatabase(raw);
  } catch {
    return null;
  }
}

function loadWorkspaceStore(): WorkspaceStore {
  ensureDataDir();
  if (fs.existsSync(WORKSPACE_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(WORKSPACE_FILE, 'utf-8')) as Partial<WorkspaceStore>;
      const migrated = migrateDatabase(parsed);
      if (migrated) {
        return {
          version: CURRENT_APP_SCHEMA_VERSION,
          lastSyncedAt: migrated.lastSyncedAt,
          students: migrated.students,
          journals: migrated.journals,
          grades: migrated.grades,
          schedules: migrated.schedules || [],
          agendas: migrated.agendas || [],
          settings: sanitizeSettingsForServer(migrated.settings),
        };
      }
    } catch {
      // Preserve raw corrupt workspace file inside backups before falling back
      try {
        ensureBackupsDir();
        const corruptName = `corrupt_workspace_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        fs.copyFileSync(WORKSPACE_FILE, path.resolve(BACKUPS_DIR, corruptName));
      } catch {
        // ignore copy error
      }
    }
  }

  let bundledSource: PortalDatabase | null = null;
  if (IS_SERVERLESS) {
    try {
      const bundledWsFile = path.resolve(BUNDLED_DATA_DIR, 'workspace.json');
      if (fs.existsSync(bundledWsFile)) {
        bundledSource = migrateDatabase(JSON.parse(fs.readFileSync(bundledWsFile, 'utf-8')));
      }
    } catch {
      bundledSource = null;
    }
  }

  const initialSource = bundledSource || readLegacyDatabaseIfAvailable() || createSeedDatabase();
  const initialStore: WorkspaceStore = {
    version: CURRENT_APP_SCHEMA_VERSION,
    lastSyncedAt: initialSource.lastSyncedAt || new Date().toISOString(),
    students: initialSource.students,
    journals: initialSource.journals,
    grades: initialSource.grades,
    schedules: initialSource.schedules || [],
    agendas: initialSource.agendas || [],
    settings: sanitizeSettingsForServer(initialSource.settings),
  };
  writeJsonAtomic(WORKSPACE_FILE, initialStore);
  return initialStore;
}

function saveWorkspaceStore(store: WorkspaceStore): WorkspaceStore {
  const next: WorkspaceStore = {
    version: CURRENT_APP_SCHEMA_VERSION,
    lastSyncedAt: new Date().toISOString(),
    students: Array.isArray(store.students) ? store.students : [],
    journals: Array.isArray(store.journals) ? store.journals : [],
    grades: Array.isArray(store.grades) ? store.grades : [],
    schedules: Array.isArray(store.schedules) ? store.schedules : [],
    agendas: Array.isArray(store.agendas) ? store.agendas : [],
    settings: sanitizeSettingsForServer(store.settings),
  };
  writeJsonAtomic(WORKSPACE_FILE, next);
  return next;
}

function loadUsersStore(): UsersStore {
  ensureDataDir();
  if (fs.existsSync(USERS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')) as Partial<UsersStore>;
      if (parsed && Array.isArray(parsed.users)) {
        return {
          adminClaimed: Boolean(parsed.adminClaimed),
          users: parsed.users.map((u) => ({
            ...u,
            username: deriveUsername(u.username, u.email, u.id),
            passwordSalt: String(u.passwordSalt || ''),
            passwordHash: String(u.passwordHash || ''),
          })),
        };
      }
    } catch {
      // fall through to initialize
    }
  }

  if (IS_SERVERLESS) {
    try {
      const bundledUsersFile = path.resolve(BUNDLED_DATA_DIR, 'users.json');
      if (fs.existsSync(bundledUsersFile)) {
        const parsed = JSON.parse(fs.readFileSync(bundledUsersFile, 'utf-8')) as Partial<UsersStore>;
        if (parsed && Array.isArray(parsed.users)) {
          const bundledStore: UsersStore = {
            adminClaimed: Boolean(parsed.adminClaimed),
            users: parsed.users.map((u) => ({
              ...u,
              username: deriveUsername(u.username, u.email, u.id),
              passwordSalt: String(u.passwordSalt || ''),
              passwordHash: String(u.passwordHash || ''),
            })),
          };
          writeJsonAtomic(USERS_FILE, bundledStore);
          return bundledStore;
        }
      }
    } catch {
      // fall through to seed initialization
    }
  }

  const legacy = readLegacyDatabaseIfAvailable();
  const seedUsers = (legacy?.users && legacy.users.length > 0 ? legacy.users : createSeedDatabase().users) || [];
  const storedUsers: StoredServerUser[] = seedUsers.map((u) => ({
    id: u.id,
    username: deriveUsername(u.username, u.email, u.id),
    name: u.name,
    nip: u.nip,
    email: u.email,
    role: u.role,
    school: u.school,
    gender: u.gender,
    photoDataUrl: u.photoDataUrl || '',
    assignedClasses: u.assignedClasses || [],
    assignedSubjects: u.assignedSubjects || [],
    signatureDataUrl: u.signatureDataUrl || '',
    signatureSize: u.signatureSize,
    signatureOffsetX: u.signatureOffsetX,
    signatureOffsetY: u.signatureOffsetY,
    active: u.active,
    createdAt: u.createdAt,
    passwordSalt: '',
    passwordHash: '',
  }));

  const store: UsersStore = {
    adminClaimed: false,
    users: storedUsers,
  };
  writeJsonAtomic(USERS_FILE, store);
  return store;
}

function saveUsersStore(store: UsersStore): void {
  writeJsonAtomic(USERS_FILE, store);
}

function getEnvAdminConfig(): { enabled: boolean; username: string; password: string } {
  const envPass = String(process.env.ADMIN_PASSWORD || '').trim();
  const envUser = String(process.env.ADMIN_USERNAME || 'admin').trim() || 'admin';
  return {
    enabled: envPass.length > 0,
    username: envUser,
    password: envPass,
  };
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'Autentikasi diperlukan (Bearer token hilang).' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const decoded = verifyAuthToken(token);
  if (!decoded) {
    res.status(401).json({ ok: false, error: 'Sesi telah kedaluwarsa atau token tidak valid.' });
    return;
  }

  const envAdmin = getEnvAdminConfig();
  if (decoded.sub === 'usr-admin-env' && envAdmin.enabled) {
    req.authUser = {
      id: 'usr-admin-env',
      username: decoded.username,
      email: decoded.email,
      role: 'admin',
      isEnvAdmin: true,
    };
    next();
    return;
  }

  const usersStore = loadUsersStore();
  const matched = usersStore.users.find((u) => u.id === decoded.sub);
  if (!matched) {
    res.status(401).json({ ok: false, error: 'Akun pengguna tidak ditemukan di server.' });
    return;
  }
  if (!matched.active) {
    res.status(403).json({ ok: false, error: 'Akun Anda telah dinonaktifkan oleh Admin Sistem.' });
    return;
  }

  req.authUser = {
    id: matched.id,
    username: matched.username,
    email: matched.email,
    role: matched.role,
  };
  next();
}

function requireRoles(allowed: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ ok: false, error: 'Autentikasi diperlukan.' });
      return;
    }
    if (!allowed.includes(req.authUser.role)) {
      res.status(403).json({ ok: false, error: 'Anda tidak memiliki hak akses untuk tindakan ini.' });
      return;
    }
    next();
  };
}

export async function createApiApp(): Promise<express.Express> {
  // Ensure initial stores exist cleanly at startup and create boot backup snapshot
  loadWorkspaceStore();
  loadUsersStore();
  if (!IS_SERVERLESS) {
    createServerBackupSnapshot('boot');
  }

  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use((req, _res, next) => {
    if (req.url.startsWith('/.netlify/functions/api')) {
      const stripped = req.url.slice('/.netlify/functions/api'.length) || '/';
      req.url = stripped.startsWith('/api')
        ? stripped
        : `/api${stripped.startsWith('/') ? stripped : `/${stripped}`}`;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      mode: IS_VERCEL
        ? 'vercel-serverless'
        : IS_NETLIFY
          ? 'netlify-serverless'
          : 'fullstack',
      service: 'Portal E-Guru v10.3',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/auth/status', (_req, res) => {
    const envAdmin = getEnvAdminConfig();
    const usersStore = loadUsersStore();
    const ws = loadWorkspaceStore();
    const primaryAdmin = usersStore.users.find((u) => u.role === 'admin' && u.active);
    res.json({
      ok: true,
      adminConfigured: envAdmin.enabled || usersStore.adminClaimed,
      envAdminManaged: envAdmin.enabled,
      ephemeralStorage: Boolean(IS_SERVERLESS && !process.env.PORTAL_DATA_DIR),
      settingsConfigured: Boolean(ws.settings.updatedAt),
      adminUsernameHint: envAdmin.enabled
        ? envAdmin.username
        : primaryAdmin?.username || 'admin',
      webBrand: ws.settings.webBrand,
      academicYear: ws.settings.academicYear,
      semester: ws.settings.semester,
      academicYears: ws.settings.academicYears,
    });
  });

  // First-run atomic Admin claim (locked permanently once claimed or when ADMIN_PASSWORD env is configured)
  app.post('/api/auth/claim-admin', (req, res) => {
    try {
      const envAdmin = getEnvAdminConfig();
      const usersStore = loadUsersStore();
      if (envAdmin.enabled || usersStore.adminClaimed) {
        res.status(409).json({
          ok: false,
          error: 'Akun Admin utama sudah diaktifkan. Silakan login menggunakan username & password Admin.',
        });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const rawUsername = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      const rawPassword = typeof body.password === 'string' ? body.password : '';
      const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
      const rawName = typeof body.name === 'string' ? body.name.trim() : '';
      const rawStaffPassword = typeof body.staffPassword === 'string' ? body.staffPassword.trim() : '';
      const reqAcademicYear = typeof body.academicYear === 'string' ? body.academicYear.trim() : '';
      const reqSemester =
        body.semester === 'Ganjil' || body.semester === 'Genap' ? body.semester : undefined;

      if (!rawUsername || !/^[a-z0-9._@-]{3,64}$/.test(rawUsername)) {
        res.status(400).json({
          ok: false,
          error: 'Username Admin wajib 3–64 karakter (huruf kecil, angka, titik, garis bawah, atau @).',
        });
        return;
      }
      if (rawPassword.length < 8 || rawPassword.length > 128) {
        res.status(400).json({
          ok: false,
          error: 'Password Admin wajib diisi minimal 8 karakter (maksimal 128 karakter).',
        });
        return;
      }
      if (rawStaffPassword.length > 0 && (rawStaffPassword.length < 6 || rawStaffPassword.length > 128)) {
        res.status(400).json({
          ok: false,
          error: 'Password awal akun lain minimal 6 karakter (maksimal 128 karakter).',
        });
        return;
      }

      const workspace = loadWorkspaceStore();
      const resolvedEmail =
        rawEmail && rawEmail.includes('@')
          ? rawEmail
          : rawUsername.includes('@')
            ? rawUsername
            : `${rawUsername}@sman1nusantara.sch.id`;

      const { salt, hash } = hashPassword(rawPassword);
      const existingAdminIdx = usersStore.users.findIndex((u) => u.role === 'admin');
      const nowIso = new Date().toISOString();

      let adminUser: StoredServerUser;
      if (existingAdminIdx >= 0) {
        adminUser = {
          ...usersStore.users[existingAdminIdx],
          username: rawUsername,
          email: resolvedEmail,
          name: rawName || usersStore.users[existingAdminIdx].name || 'Administrator Sistem',
          active: true,
          passwordSalt: salt,
          passwordHash: hash,
        };
        usersStore.users[existingAdminIdx] = adminUser;
      } else {
        adminUser = {
          id: 'usr-admin-1',
          username: rawUsername,
          name: rawName || 'Administrator Sistem',
          nip: '19850101 201001 1 001',
          email: resolvedEmail,
          role: 'admin',
          school: workspace.settings.teacherProfile.school || 'SMA Negeri 1 Nusantara',
          gender: 'L',
          photoDataUrl: '',
          assignedClasses: [],
          assignedSubjects: [],
          active: true,
          createdAt: nowIso,
          passwordSalt: salt,
          passwordHash: hash,
        };
        usersStore.users.unshift(adminUser);
      }

      let activatedStaffCount = 0;
      if (rawStaffPassword.length >= 6) {
        usersStore.users = usersStore.users.map((u) => {
          if (u.id === adminUser.id || u.role === 'admin') return u;
          if (!u.passwordHash || !u.passwordSalt) {
            const staffHashed = hashPassword(rawStaffPassword);
            activatedStaffCount += 1;
            return {
              ...u,
              passwordSalt: staffHashed.salt,
              passwordHash: staffHashed.hash,
            };
          }
          return u;
        });
      }

      if (
        (reqAcademicYear && workspace.settings.academicYears.includes(reqAcademicYear)) ||
        reqSemester
      ) {
        workspace.settings = sanitizeSettingsForServer({
          ...workspace.settings,
          ...(reqAcademicYear && workspace.settings.academicYears.includes(reqAcademicYear)
            ? { academicYear: reqAcademicYear }
            : {}),
          ...(reqSemester ? { semester: reqSemester } : {}),
          updatedAt: nowIso,
        });
        saveWorkspaceStore(workspace);
      }

      usersStore.adminClaimed = true;
      saveUsersStore(usersStore);

      const token = signAuthToken({
        sub: adminUser.id,
        username: adminUser.username,
        email: adminUser.email,
        role: 'admin',
      });

      res.json({
        ok: true,
        token,
        user: toPublicAppUser(adminUser),
        activatedStaffCount,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal mengaktifkan akun Admin.',
      });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const identifier =
        typeof body.identifier === 'string'
          ? body.identifier.trim()
          : typeof body.email === 'string'
            ? body.email.trim()
            : '';
      const password = typeof body.password === 'string' ? body.password : '';

      if (!identifier || !password) {
        res.status(400).json({ ok: false, error: 'Username/Email dan Password wajib diisi.' });
        return;
      }

      const idLower = identifier.toLowerCase();
      const envAdmin = getEnvAdminConfig();
      const usersStore = loadUsersStore();

      // Env-configured ADMIN_PASSWORD always overrides any fallback admin credential
      if (envAdmin.enabled) {
        const storedAdmin = usersStore.users.find((u) => u.role === 'admin' && u.active);
        const matchesEnvIdentity =
          idLower === envAdmin.username.toLowerCase() ||
          (storedAdmin &&
            (idLower === storedAdmin.username.toLowerCase() ||
              idLower === storedAdmin.email.toLowerCase()));

        if (matchesEnvIdentity) {
          if (!timingSafeCompareStrings(password, envAdmin.password)) {
            res.status(401).json({ ok: false, error: 'Username atau password Admin tidak sesuai.' });
            return;
          }

          // Preserve last saved settings in workspace.json (do NOT overwrite academicYear/semester on login)
          const targetAdmin = storedAdmin || {
            id: 'usr-admin-env',
            username: envAdmin.username,
            name: 'Administrator Sistem',
            nip: '-',
            email: envAdmin.username.includes('@')
              ? envAdmin.username
              : `${envAdmin.username}@sman1nusantara.sch.id`,
            role: 'admin' as UserRole,
            school: loadWorkspaceStore().settings.teacherProfile.school,
            gender: 'L' as const,
            photoDataUrl: '',
            assignedClasses: [],
            assignedSubjects: [],
            active: true,
            createdAt: new Date().toISOString(),
            passwordSalt: '',
            passwordHash: '',
          };

          const token = signAuthToken({
            sub: targetAdmin.id,
            username: targetAdmin.username,
            email: targetAdmin.email,
            role: 'admin',
          });

          res.json({ ok: true, token, user: toPublicAppUser(targetAdmin) });
          return;
        }
      }

      const matched = usersStore.users.find(
        (u) => u.username.toLowerCase() === idLower || u.email.toLowerCase() === idLower
      );

      if (!matched) {
        res.status(401).json({ ok: false, error: 'Username/Email atau password tidak sesuai.' });
        return;
      }
      if (!matched.active) {
        res.status(403).json({ ok: false, error: 'Akun ini sedang dinonaktifkan oleh Admin Sistem.' });
        return;
      }
      if (!matched.passwordHash || !matched.passwordSalt) {
        res.status(401).json({
          ok: false,
          error:
            matched.role === 'admin'
              ? 'Akun Admin belum diaktivasi. Silakan buat password Admin terlebih dahulu.'
              : 'Password akun ini belum ditetapkan oleh Admin. Hubungi Admin Sistem di menu Admin & Pengguna.',
        });
        return;
      }
      if (!verifyPasswordHash(password, matched.passwordSalt, matched.passwordHash)) {
        res.status(401).json({ ok: false, error: 'Username/Email atau password tidak sesuai.' });
        return;
      }

      // Preserve last saved settings in workspace.json on login
      const token = signAuthToken({
        sub: matched.id,
        username: matched.username,
        email: matched.email,
        role: matched.role,
      });

      res.json({ ok: true, token, user: toPublicAppUser(matched) });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal memproses login.',
      });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const authUser = req.authUser!;
    if (authUser.isEnvAdmin) {
      res.json({
        ok: true,
        user: {
          id: authUser.id,
          username: authUser.username,
          name: 'Administrator Sistem',
          nip: '-',
          email: authUser.email,
          password: '',
          role: 'admin',
          school: loadWorkspaceStore().settings.teacherProfile.school,
          gender: 'L',
          hasPassword: true,
          active: true,
          createdAt: new Date().toISOString(),
        },
      });
      return;
    }
    const usersStore = loadUsersStore();
    const found = usersStore.users.find((u) => u.id === authUser.id);
    if (!found) {
      res.status(404).json({ ok: false, error: 'Pengguna tidak ditemukan.' });
      return;
    }
    res.json({ ok: true, user: toPublicAppUser(found) });
  });

  app.get('/api/workspace', requireAuth, (_req, res) => {
    const ws = loadWorkspaceStore();
    const usersStore = loadUsersStore();
    res.json({
      ok: true,
      database: {
        ...ws,
        users: usersStore.users.map(toPublicAppUser),
      },
    });
  });

  app.put('/api/workspace/settings', requireAuth, requireRoles(['admin']), (req, res) => {
    try {
      const body = req.body as { settings?: SystemSettings };
      if (!body.settings || typeof body.settings !== 'object') {
        res.status(400).json({ ok: false, error: 'Payload pengaturan tidak valid.' });
        return;
      }
      const rawKkm = Number(body.settings.kkm);
      if (Number.isNaN(rawKkm) || rawKkm < 0 || rawKkm > 100) {
        res.status(400).json({ ok: false, error: 'Nilai KKM harus antara 0 hingga 100.' });
        return;
      }
      if (body.settings.semester !== 'Ganjil' && body.settings.semester !== 'Genap') {
        res.status(400).json({ ok: false, error: 'Semester harus Ganjil atau Genap.' });
        return;
      }
      if (
        !Array.isArray(body.settings.classes) ||
        body.settings.classes.length === 0 ||
        !Array.isArray(body.settings.subjects) ||
        body.settings.subjects.length === 0 ||
        !Array.isArray(body.settings.examTypes) ||
        body.settings.examTypes.length === 0
      ) {
        res.status(400).json({
          ok: false,
          error: 'Daftar kelas, mata pelajaran, dan jenis ujian tidak boleh kosong.',
        });
        return;
      }
      const ws = loadWorkspaceStore();
      ws.settings = sanitizeSettingsForServer({
        ...body.settings,
        updatedAt: new Date().toISOString(),
      });
      const saved = saveWorkspaceStore(ws);
      res.json({ ok: true, settings: saved.settings, lastSyncedAt: saved.lastSyncedAt });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan di server.',
      });
    }
  });

  function getServerUserScope(authUser: NonNullable<AuthedRequest['authUser']>) {
    const usersStore = loadUsersStore();
    const matched = usersStore.users.find((u) => u.id === authUser.id);
    const isTeachingRole = authUser.role === 'guru' || authUser.role === 'wali_kelas';
    const assignedClasses = isTeachingRole && Array.isArray(matched?.assignedClasses)
      ? matched.assignedClasses
      : [];
    const assignedSubjects = isTeachingRole && Array.isArray(matched?.assignedSubjects)
      ? matched.assignedSubjects
      : [];
    const hasClassRestriction = isTeachingRole && assignedClasses.length > 0;
    const hasSubjectRestriction = isTeachingRole && assignedSubjects.length > 0;
    return {
      isAdmin: authUser.role === 'admin',
      role: authUser.role,
      userId: authUser.id,
      isClassAllowed: (cls: string) =>
        authUser.role === 'admin' || !hasClassRestriction || assignedClasses.includes(cls),
      isSubjectAllowed: (subj: string) =>
        authUser.role === 'admin' || !hasSubjectRestriction || assignedSubjects.includes(subj),
      isOwnerOrAdmin: (teacherId?: string) =>
        authUser.role === 'admin' || !teacherId || teacherId === authUser.id,
    };
  }

  app.put(
    '/api/workspace/students',
    requireAuth,
    requireRoles(['admin', 'guru', 'wali_kelas', 'karyawan']),
    (req: AuthedRequest, res) => {
      try {
        const body = req.body as { students?: Student[] };
        if (!Array.isArray(body.students)) {
          res.status(400).json({ ok: false, error: 'Data siswa harus berupa daftar array.' });
          return;
        }
        for (const st of body.students) {
          if (!st || !String(st.id || '').trim() || !String(st.nis || '').trim() || !String(st.name || '').trim()) {
            res.status(400).json({ ok: false, error: 'Setiap data siswa wajib memiliki ID, NIS, dan Nama.' });
            return;
          }
        }
        const ws = loadWorkspaceStore();
        const scope = getServerUserScope(req.authUser!);
        if (!scope.isAdmin) {
          const existingMap = new Map(ws.students.map((s) => [s.id, s]));
          const incomingMap = new Map(body.students.map((s) => [s.id, s]));

          for (const prev of ws.students) {
            if (!incomingMap.has(prev.id) && !scope.isClassAllowed(prev.className)) {
              res.status(403).json({
                ok: false,
                error: 'Akses ditolak: Anda tidak dapat menghapus siswa di luar kelas tanggung jawab Anda.',
              });
              return;
            }
          }

          for (const nextItem of body.students) {
            const prev = existingMap.get(nextItem.id);
            if (!prev) {
              if (!scope.isClassAllowed(nextItem.className)) {
                res.status(403).json({
                  ok: false,
                  error: 'Akses ditolak: Anda tidak dapat menambah siswa ke kelas di luar tanggung jawab Anda.',
                });
                return;
              }
              if (scope.role === 'guru' && nextItem.status && nextItem.status !== 'aktif') {
                res.status(403).json({
                  ok: false,
                  error: 'Akses ditolak: Guru Mapel hanya dapat menambahkan siswa berstatus Aktif.',
                });
                return;
              }
            } else if (JSON.stringify(prev) !== JSON.stringify(nextItem)) {
              if (!scope.isClassAllowed(prev.className)) {
                res.status(403).json({
                  ok: false,
                  error: 'Akses ditolak: siswa ini berada di luar kelas tanggung jawab Anda.',
                });
                return;
              }
              if (scope.role === 'guru') {
                if (!scope.isClassAllowed(nextItem.className)) {
                  res.status(403).json({
                    ok: false,
                    error: 'Akses ditolak: kelas tujuan berada di luar tanggung jawab Anda.',
                  });
                  return;
                }
                if ((nextItem.status || 'aktif') !== (prev.status || 'aktif')) {
                  res.status(403).json({
                    ok: false,
                    error: 'Akses ditolak: perubahan status mutasi/kelulusan hanya untuk Wali Kelas, Staff TU, atau Admin.',
                  });
                  return;
                }
              }
            }
          }
        }
        ws.students = body.students.map((st) => ({
          ...st,
          nis: String(st.nis).trim(),
          name: String(st.name).trim(),
          status:
            st.status === 'lulus' || st.status === 'pindah' || st.status === 'keluar'
              ? st.status
              : 'aktif',
        }));
        const saved = saveWorkspaceStore(ws);
        res.json({ ok: true, lastSyncedAt: saved.lastSyncedAt });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: err instanceof Error ? err.message : 'Gagal menyimpan data siswa di server.',
        });
      }
    }
  );

  app.put(
    '/api/workspace/journals',
    requireAuth,
    requireRoles(['admin', 'guru', 'wali_kelas']),
    (req: AuthedRequest, res) => {
      try {
        const body = req.body as { journals?: JournalEntry[] };
        if (!Array.isArray(body.journals)) {
          res.status(400).json({ ok: false, error: 'Data jurnal harus berupa daftar array.' });
          return;
        }
        for (const j of body.journals) {
          if (
            !j ||
            !String(j.id || '').trim() ||
            !String(j.date || '').trim() ||
            !String(j.className || '').trim() ||
            !String(j.subject || '').trim()
          ) {
            res.status(400).json({
              ok: false,
              error: 'Setiap entri jurnal wajib memiliki ID, tanggal, kelas, dan mata pelajaran.',
            });
            return;
          }
        }
        const ws = loadWorkspaceStore();
        const scope = getServerUserScope(req.authUser!);
        const existingMap = new Map(ws.journals.map((j) => [j.id, j]));
        if (!scope.isAdmin) {
          const incomingMap = new Map(body.journals.map((j) => [j.id, j]));

          for (const prev of ws.journals) {
            if (
              !incomingMap.has(prev.id) &&
              (!scope.isClassAllowed(prev.className) ||
                !scope.isSubjectAllowed(prev.subject) ||
                !scope.isOwnerOrAdmin(prev.teacherId))
            ) {
              res.status(403).json({
                ok: false,
                error: 'Akses ditolak: Anda hanya dapat menghapus jurnal milik Anda dalam cakupan ampu.',
              });
              return;
            }
          }

          for (const nextItem of body.journals) {
            const prev = existingMap.get(nextItem.id);
            if (!prev) {
              if (
                !scope.isClassAllowed(nextItem.className) ||
                !scope.isSubjectAllowed(nextItem.subject) ||
                !scope.isOwnerOrAdmin(nextItem.teacherId)
              ) {
                res.status(403).json({
                  ok: false,
                  error: 'Akses ditolak: jurnal baru harus sesuai kelas, mata pelajaran, dan akun Anda.',
                });
                return;
              }
            } else if (JSON.stringify(prev) !== JSON.stringify(nextItem)) {
              if (
                !scope.isClassAllowed(prev.className) ||
                !scope.isSubjectAllowed(prev.subject) ||
                !scope.isClassAllowed(nextItem.className) ||
                !scope.isSubjectAllowed(nextItem.subject) ||
                !scope.isOwnerOrAdmin(prev.teacherId)
              ) {
                res.status(403).json({
                  ok: false,
                  error: 'Akses ditolak: Anda hanya dapat mengubah jurnal milik Anda dalam cakupan ampu.',
                });
                return;
              }
            }
          }
        }
        ws.journals = body.journals.map((j) => {
          const prev = existingMap.get(j.id);
          return !scope.isAdmin && !prev
            ? { ...j, teacherId: req.authUser!.id }
            : j;
        });
        const saved = saveWorkspaceStore(ws);
        res.json({ ok: true, lastSyncedAt: saved.lastSyncedAt });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: err instanceof Error ? err.message : 'Gagal menyimpan jurnal di server.',
        });
      }
    }
  );

  app.put(
    '/api/workspace/grades',
    requireAuth,
    requireRoles(['admin', 'guru', 'wali_kelas']),
    (req: AuthedRequest, res) => {
      try {
        const body = req.body as { grades?: GradeRecord[] };
        if (!Array.isArray(body.grades)) {
          res.status(400).json({ ok: false, error: 'Data nilai harus berupa daftar array.' });
          return;
        }
        for (const g of body.grades) {
          if (
            !g ||
            !String(g.id || '').trim() ||
            !String(g.studentId || '').trim() ||
            !String(g.className || '').trim() ||
            !String(g.subject || '').trim() ||
            !String(g.examType || '').trim()
          ) {
            res.status(400).json({
              ok: false,
              error: 'Setiap data nilai wajib memiliki ID, ID siswa, kelas, mapel, dan jenis ujian.',
            });
            return;
          }
          if (g.score !== null && (typeof g.score !== 'number' || Number.isNaN(g.score) || g.score < 0 || g.score > 100)) {
            res.status(400).json({
              ok: false,
              error: 'Skor nilai harus bernilai kosong (null) atau angka 0 hingga 100.',
            });
            return;
          }
        }
        const ws = loadWorkspaceStore();
        const scope = getServerUserScope(req.authUser!);
        const existingMap = new Map(ws.grades.map((g) => [g.id, g]));
        if (!scope.isAdmin) {
          const incomingMap = new Map(body.grades.map((g) => [g.id, g]));

          for (const prev of ws.grades) {
            if (
              !incomingMap.has(prev.id) &&
              (!scope.isClassAllowed(prev.className) || !scope.isSubjectAllowed(prev.subject))
            ) {
              res.status(403).json({
                ok: false,
                error: 'Akses ditolak: Anda tidak dapat menghapus nilai di luar cakupan ampu Anda.',
              });
              return;
            }
          }

          for (const nextItem of body.grades) {
            const prev = existingMap.get(nextItem.id);
            if (!prev) {
              if (!scope.isClassAllowed(nextItem.className) || !scope.isSubjectAllowed(nextItem.subject)) {
                res.status(403).json({
                  ok: false,
                  error: 'Akses ditolak: nilai berada di luar kelas atau mata pelajaran ampu Anda.',
                });
                return;
              }
            } else if (JSON.stringify(prev) !== JSON.stringify(nextItem)) {
              if (
                !scope.isClassAllowed(prev.className) ||
                !scope.isSubjectAllowed(prev.subject) ||
                !scope.isClassAllowed(nextItem.className) ||
                !scope.isSubjectAllowed(nextItem.subject)
              ) {
                res.status(403).json({
                  ok: false,
                  error: 'Akses ditolak: Anda tidak dapat mengubah nilai di luar cakupan ampu Anda.',
                });
                return;
              }
            }
          }
        }
        ws.grades = body.grades.map((g) => {
          const prev = existingMap.get(g.id);
          return !scope.isAdmin && !prev
            ? { ...g, teacherId: req.authUser!.id }
            : g;
        });
        const saved = saveWorkspaceStore(ws);
        res.json({ ok: true, lastSyncedAt: saved.lastSyncedAt });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: err instanceof Error ? err.message : 'Gagal menyimpan nilai di server.',
        });
      }
    }
  );

  app.put(
    '/api/workspace/schedules',
    requireAuth,
    requireRoles(['admin', 'guru', 'wali_kelas']),
    (req: AuthedRequest, res) => {
      try {
        const body = req.body as { schedules?: TeachingScheduleItem[] };
        if (!Array.isArray(body.schedules)) {
          res.status(400).json({ ok: false, error: 'Data jadwal mengajar harus berupa daftar array.' });
          return;
        }
        for (const s of body.schedules) {
          if (
            !s ||
            !String(s.id || '').trim() ||
            !String(s.day || '').trim() ||
            !String(s.className || '').trim() ||
            !String(s.subject || '').trim()
          ) {
            res.status(400).json({
              ok: false,
              error: 'Setiap slot jadwal wajib memiliki ID, hari, kelas, dan mata pelajaran.',
            });
            return;
          }
        }
        const ws = loadWorkspaceStore();
        const scope = getServerUserScope(req.authUser!);
        const existingMap = new Map((ws.schedules || []).map((s) => [s.id, s]));
        if (!scope.isAdmin) {
          const incomingMap = new Map(body.schedules.map((s) => [s.id, s]));

          for (const prev of ws.schedules || []) {
            if (
              !incomingMap.has(prev.id) &&
              (!scope.isClassAllowed(prev.className) ||
                !scope.isSubjectAllowed(prev.subject) ||
                !scope.isOwnerOrAdmin(prev.teacherId))
            ) {
              res.status(403).json({
                ok: false,
                error: 'Akses ditolak: Anda hanya dapat menghapus jadwal milik Anda sendiri.',
              });
              return;
            }
          }

          for (const nextItem of body.schedules) {
            const prev = existingMap.get(nextItem.id);
            if (!prev) {
              if (
                !scope.isClassAllowed(nextItem.className) ||
                !scope.isSubjectAllowed(nextItem.subject) ||
                !scope.isOwnerOrAdmin(nextItem.teacherId)
              ) {
                res.status(403).json({
                  ok: false,
                  error: 'Akses ditolak: jadwal baru berada di luar tanggung jawab Anda.',
                });
                return;
              }
            } else if (JSON.stringify(prev) !== JSON.stringify(nextItem)) {
              if (
                !scope.isClassAllowed(prev.className) ||
                !scope.isSubjectAllowed(prev.subject) ||
                !scope.isClassAllowed(nextItem.className) ||
                !scope.isSubjectAllowed(nextItem.subject) ||
                !scope.isOwnerOrAdmin(prev.teacherId)
              ) {
                res.status(403).json({
                  ok: false,
                  error: 'Akses ditolak: Anda hanya dapat mengubah jadwal milik Anda sendiri.',
                });
                return;
              }
            }
          }
        }
        ws.schedules = body.schedules.map((s) => {
          const prev = existingMap.get(s.id);
          return !scope.isAdmin && !prev
            ? { ...s, teacherId: req.authUser!.id }
            : s;
        });
        const saved = saveWorkspaceStore(ws);
        res.json({ ok: true, lastSyncedAt: saved.lastSyncedAt });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: err instanceof Error ? err.message : 'Gagal menyimpan jadwal mengajar di server.',
        });
      }
    }
  );

  app.put(
    '/api/workspace/agendas',
    requireAuth,
    requireRoles(['admin', 'guru', 'wali_kelas']),
    (req: AuthedRequest, res) => {
      try {
        const body = req.body as { agendas?: TeacherAgendaItem[] };
        if (!Array.isArray(body.agendas)) {
          res.status(400).json({ ok: false, error: 'Data agenda guru harus berupa daftar array.' });
          return;
        }
        for (const a of body.agendas) {
          if (!a || !String(a.id || '').trim() || !String(a.date || '').trim() || !String(a.title || '').trim()) {
            res.status(400).json({
              ok: false,
              error: 'Setiap agenda wajib memiliki ID, tanggal, dan judul agenda.',
            });
            return;
          }
        }
        const ws = loadWorkspaceStore();
        const scope = getServerUserScope(req.authUser!);
        const existingMap = new Map((ws.agendas || []).map((a) => [a.id, a]));
        if (!scope.isAdmin) {
          const incomingMap = new Map(body.agendas.map((a) => [a.id, a]));

          for (const prev of ws.agendas || []) {
            if (!incomingMap.has(prev.id) && !scope.isOwnerOrAdmin(prev.teacherId)) {
              res.status(403).json({
                ok: false,
                error: 'Akses ditolak: Anda hanya dapat menghapus agenda milik Anda sendiri.',
              });
              return;
            }
          }

          for (const nextItem of body.agendas) {
            const prev = existingMap.get(nextItem.id);
            if (!prev && !scope.isOwnerOrAdmin(nextItem.teacherId)) {
              res.status(403).json({
                ok: false,
                error: 'Akses ditolak: Anda tidak dapat membuat agenda atas nama guru lain.',
              });
              return;
            }
            if (prev && JSON.stringify(prev) !== JSON.stringify(nextItem) && !scope.isOwnerOrAdmin(prev.teacherId)) {
              res.status(403).json({
                ok: false,
                error: 'Akses ditolak: Anda hanya dapat mengubah agenda milik Anda sendiri.',
              });
              return;
            }
          }
        }
        ws.agendas = body.agendas.map((a) => {
          const prev = existingMap.get(a.id);
          return !scope.isAdmin && !prev
            ? { ...a, teacherId: req.authUser!.id }
            : a;
        });
        const saved = saveWorkspaceStore(ws);
        res.json({ ok: true, lastSyncedAt: saved.lastSyncedAt });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: err instanceof Error ? err.message : 'Gagal menyimpan agenda guru di server.',
        });
      }
    }
  );

  const ALLOWED_IMAGE_PROXY_HOSTS = new Set([
    'drive.google.com',
    'drive.usercontent.google.com',
    'lh3.googleusercontent.com',
    'lh3.google.com',
    'dl.dropboxusercontent.com',
    'www.dropbox.com',
  ]);

  app.get('/api/proxy-image', requireAuth, async (req, res) => {
    try {
      const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
      if (!rawUrl || !rawUrl.startsWith('https://')) {
        res.status(400).json({ ok: false, error: 'URL gambar harus menggunakan HTTPS yang valid.' });
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        res.status(400).json({ ok: false, error: 'Format URL tidak valid.' });
        return;
      }
      if (
        parsed.protocol !== 'https:' ||
        parsed.username ||
        parsed.password ||
        !ALLOWED_IMAGE_PROXY_HOSTS.has(parsed.hostname.toLowerCase())
      ) {
        res.status(403).json({
          ok: false,
          error: 'Host gambar eksternal tidak diizinkan oleh proxy.',
        });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const upstream = await fetch(parsed.toString(), {
          signal: controller.signal,
          headers: { Accept: 'image/*' },
        });
        if (!upstream.ok) {
          res.status(502).json({ ok: false, error: `Gagal mengunduh gambar (${upstream.status}).` });
          return;
        }
        const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
        if (!contentType.startsWith('image/')) {
          res.status(415).json({ ok: false, error: 'Tautan tidak mengembalikan berkas gambar.' });
          return;
        }
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (buf.byteLength > 5 * 1024 * 1024) {
          res.status(413).json({ ok: false, error: 'Ukuran gambar eksternal melebihi batas 5 MB.' });
          return;
        }
        const mime = contentType.split(';')[0].trim() || 'image/png';
        const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
        res.json({ ok: true, dataUrl });
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal memproses gambar eksternal.',
      });
    }
  });

  const VALID_USER_ROLES = new Set<UserRole>([
    'admin',
    'guru',
    'wali_kelas',
    'kepala_sekolah',
    'karyawan',
  ]);

  app.put('/api/workspace/users', requireAuth, requireRoles(['admin']), (req, res) => {
    try {
      const body = req.body as { users?: AppUser[] };
      if (!Array.isArray(body.users)) {
        res.status(400).json({ ok: false, error: 'Daftar pengguna tidak valid.' });
        return;
      }

      const activeAdminCount = body.users.filter((u) => u.role === 'admin' && u.active).length;
      if (activeAdminCount < 1) {
        res.status(400).json({
          ok: false,
          error: 'Minimal harus ada 1 akun Admin Sistem yang tetap aktif.',
        });
        return;
      }

      const prevStore = loadUsersStore();
      const prevMap = new Map(prevStore.users.map((u) => [u.id, u]));
      const seenEmails = new Set<string>();
      const seenUsernames = new Set<string>();

      const nextUsers: StoredServerUser[] = body.users.map((u) => {
        if (!VALID_USER_ROLES.has(u.role)) {
          throw new Error(`Role "${String(u.role)}" tidak valid.`);
        }
        const cleanEmail = String(u.email || '').trim().slice(0, 200);
        if (!cleanEmail || !cleanEmail.includes('@')) {
          throw new Error(`Email untuk ${u.name || 'pengguna'} tidak valid.`);
        }
        const normEmail = cleanEmail.toLowerCase();
        if (seenEmails.has(normEmail)) {
          throw new Error(`Duplikat email ditemukan: ${cleanEmail}`);
        }
        seenEmails.add(normEmail);

        const resolvedUsername = deriveUsername(u.username, cleanEmail, String(u.id));
        if (seenUsernames.has(resolvedUsername)) {
          throw new Error(`Duplikat username ditemukan: ${resolvedUsername}`);
        }
        seenUsernames.add(resolvedUsername);

        const existing = prevMap.get(u.id);
        const plainNewPass = typeof u.password === 'string' ? u.password.trim() : '';
        let passwordSalt = existing?.passwordSalt || '';
        let passwordHash = existing?.passwordHash || '';

        if (plainNewPass.length > 0) {
          if (plainNewPass.length < 6 || plainNewPass.length > 128) {
            throw new Error(`Password untuk ${u.name || cleanEmail} harus 6–128 karakter.`);
          }
          const hashed = hashPassword(plainNewPass);
          passwordSalt = hashed.salt;
          passwordHash = hashed.hash;
        }

        const isTeachingRole = u.role === 'guru' || u.role === 'wali_kelas';

        return {
          id: String(u.id),
          username: resolvedUsername,
          name: String(u.name || 'Pengguna').slice(0, 150),
          nip: String(u.nip || '-').slice(0, 60),
          email: cleanEmail,
          role: u.role,
          school: String(u.school || '').slice(0, 180),
          gender: u.gender === 'P' ? 'P' : 'L',
          photoDataUrl: String(u.photoDataUrl || ''),
          assignedClasses: isTeachingRole && Array.isArray(u.assignedClasses) ? u.assignedClasses : [],
          assignedSubjects:
            isTeachingRole && Array.isArray(u.assignedSubjects) ? u.assignedSubjects : [],
          signatureDataUrl:
            typeof u.signatureDataUrl === 'string'
              ? u.signatureDataUrl
              : existing?.signatureDataUrl || '',
          signatureSize:
            typeof u.signatureSize === 'number'
              ? u.signatureSize
              : existing?.signatureSize,
          signatureOffsetX:
            typeof u.signatureOffsetX === 'number'
              ? u.signatureOffsetX
              : existing?.signatureOffsetX,
          signatureOffsetY:
            typeof u.signatureOffsetY === 'number'
              ? u.signatureOffsetY
              : existing?.signatureOffsetY,
          active: Boolean(u.active),
          createdAt: u.createdAt || existing?.createdAt || new Date().toISOString(),
          passwordSalt,
          passwordHash,
        };
      });

      const hasPasswordedAdmin = nextUsers.some(
        (u) => u.role === 'admin' && u.active && Boolean(u.passwordHash)
      );
      saveUsersStore({
        adminClaimed: prevStore.adminClaimed || hasPasswordedAdmin,
        users: nextUsers,
      });

      res.json({
        ok: true,
        users: nextUsers.map(toPublicAppUser),
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal memperbarui pengguna.',
      });
    }
  });

  app.put('/api/workspace/profile', requireAuth, (req: AuthedRequest, res) => {
    try {
      const authUser = req.authUser!;
      const body = req.body as { teacherProfile?: TeacherProfile };
      const tp = body.teacherProfile;
      if (!tp || typeof tp !== 'object' || !String(tp.name || '').trim()) {
        res.status(400).json({ ok: false, error: 'Data profil tidak valid.' });
        return;
      }

      const usersStore = loadUsersStore();
      const targetIdx = usersStore.users.findIndex((u) => u.id === authUser.id);
      let updatedUser: StoredServerUser | null = null;

      if (targetIdx >= 0) {
        const cur = usersStore.users[targetIdx];
        const plainNewPass = typeof tp.password === 'string' ? tp.password.trim() : '';
        let passwordSalt = cur.passwordSalt;
        let passwordHash = cur.passwordHash;
        if (plainNewPass.length > 0) {
          if (plainNewPass.length < 6 || plainNewPass.length > 128) {
            res.status(400).json({ ok: false, error: 'Password baru harus 6–128 karakter.' });
            return;
          }
          const hashed = hashPassword(plainNewPass);
          passwordSalt = hashed.salt;
          passwordHash = hashed.hash;
        }

        const isTeachingRole = cur.role === 'guru' || cur.role === 'wali_kelas';
        const allowTeacherSig = isTeachingRole || cur.role === 'admin';
        updatedUser = {
          ...cur,
          name: String(tp.name).trim().slice(0, 150),
          nip: String(tp.nip || '-').trim().slice(0, 60),
          school: String(tp.school || cur.school).trim().slice(0, 180),
          email: authUser.role === 'admin' && tp.email ? String(tp.email).trim() : cur.email,
          gender: tp.gender === 'P' ? 'P' : tp.gender === 'L' ? 'L' : cur.gender,
          photoDataUrl: String(tp.photoDataUrl || ''),
          assignedClasses:
            isTeachingRole && Array.isArray(tp.assignedClasses) ? tp.assignedClasses : [],
          assignedSubjects:
            isTeachingRole && Array.isArray(tp.assignedSubjects) ? tp.assignedSubjects : [],
          signatureDataUrl: allowTeacherSig
            ? tp.signatureDataUrl !== undefined
              ? String(tp.signatureDataUrl || '')
              : cur.signatureDataUrl || ''
            : cur.signatureDataUrl || '',
          signatureSize: allowTeacherSig
            ? typeof tp.signatureSize === 'number'
              ? Math.max(40, Math.min(280, tp.signatureSize))
              : cur.signatureSize
            : cur.signatureSize,
          signatureOffsetX: allowTeacherSig
            ? typeof tp.signatureOffsetX === 'number'
              ? tp.signatureOffsetX
              : cur.signatureOffsetX
            : cur.signatureOffsetX,
          signatureOffsetY: allowTeacherSig
            ? typeof tp.signatureOffsetY === 'number'
              ? tp.signatureOffsetY
              : cur.signatureOffsetY
            : cur.signatureOffsetY,
          passwordSalt,
          passwordHash,
        };
        usersStore.users[targetIdx] = updatedUser;
        saveUsersStore(usersStore);
      }

      const ws = loadWorkspaceStore();
      if (
        authUser.role === 'admin' &&
        updatedUser &&
        (updatedUser.id === 'usr-guru-1' ||
          updatedUser.email.toLowerCase() === ws.settings.teacherProfile.email.toLowerCase())
      ) {
        ws.settings = sanitizeSettingsForServer({
          ...ws.settings,
          updatedAt: new Date().toISOString(),
          teacherProfile: {
            ...ws.settings.teacherProfile,
            name: updatedUser.name,
            nip: updatedUser.nip,
            school: updatedUser.school,
            email: updatedUser.email,
            gender: updatedUser.gender,
            photoDataUrl: updatedUser.photoDataUrl,
            assignedClasses: updatedUser.assignedClasses,
            assignedSubjects: updatedUser.assignedSubjects,
            signatureDataUrl: updatedUser.signatureDataUrl,
            signatureSize: updatedUser.signatureSize,
            signatureOffsetX: updatedUser.signatureOffsetX,
            signatureOffsetY: updatedUser.signatureOffsetY,
            password: '',
          },
        });
        saveWorkspaceStore(ws);
      }

      const fallbackEnvAdminUser: AppUser | null =
        !updatedUser && authUser.isEnvAdmin
          ? {
              id: authUser.id,
              username: authUser.username,
              name: String(tp.name).trim().slice(0, 150),
              nip: String(tp.nip || '-').trim().slice(0, 60),
              email: authUser.email,
              password: '',
              role: 'admin',
              school: String(tp.school || ws.settings.teacherProfile.school).trim().slice(0, 180),
              gender: tp.gender === 'P' ? 'P' : 'L',
              photoDataUrl: String(tp.photoDataUrl || ''),
              assignedClasses: [],
              assignedSubjects: [],
              signatureDataUrl: String(tp.signatureDataUrl || ''),
              signatureSize: typeof tp.signatureSize === 'number' ? tp.signatureSize : undefined,
              signatureOffsetX:
                typeof tp.signatureOffsetX === 'number' ? tp.signatureOffsetX : undefined,
              signatureOffsetY:
                typeof tp.signatureOffsetY === 'number' ? tp.signatureOffsetY : undefined,
              hasPassword: true,
              active: true,
              createdAt: new Date().toISOString(),
            }
          : null;

      res.json({
        ok: true,
        user: updatedUser ? toPublicAppUser(updatedUser) : fallbackEnvAdminUser,
        settings: ws.settings,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal memperbarui profil.',
      });
    }
  });

  app.get('/api/workspace/backups', requireAuth, requireRoles(['admin']), (_req, res) => {
    try {
      res.json({ ok: true, backups: listServerBackups() });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal membaca daftar cadangan server.',
      });
    }
  });

  app.post('/api/workspace/backup', requireAuth, requireRoles(['admin']), (req, res) => {
    try {
      const body = (req.body || {}) as { reason?: string };
      const snapshot = createServerBackupSnapshot(body.reason || 'manual');
      if (!snapshot) {
        res.status(500).json({ ok: false, error: 'Gagal membuat cadangan server.' });
        return;
      }
      res.json({ ok: true, backup: snapshot, backups: listServerBackups() });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal membuat cadangan server.',
      });
    }
  });

  app.get('/api/workspace/backups/:filename', requireAuth, requireRoles(['admin']), (req, res) => {
    try {
      const targetPath = resolveInsideBackupsDir(req.params.filename);
      if (!fs.existsSync(targetPath)) {
        res.status(404).json({ ok: false, error: 'File cadangan tidak ditemukan.' });
        return;
      }
      const content = fs.readFileSync(targetPath, 'utf-8');
      res.json({ ok: true, content });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal mengunduh cadangan server.',
      });
    }
  });

  app.put('/api/workspace/restore', requireAuth, requireRoles(['admin']), (req, res) => {
    try {
      const body = req.body as { database?: PortalDatabase };
      const migrated = migrateDatabase(body.database);
      if (!migrated) {
        res.status(400).json({ ok: false, error: 'Format cadangan database tidak valid.' });
        return;
      }

      // Always create a safety backup snapshot before restoring
      createServerBackupSnapshot('before_restore');

      const savedWs = saveWorkspaceStore({
        version: CURRENT_APP_SCHEMA_VERSION,
        lastSyncedAt: new Date().toISOString(),
        students: migrated.students,
        journals: migrated.journals,
        grades: migrated.grades,
        schedules: migrated.schedules || [],
        agendas: migrated.agendas || [],
        settings: migrated.settings,
      });

      const prevStore = loadUsersStore();
      const prevMap = new Map(prevStore.users.map((u) => [u.id, u]));
      const restoredUsers: StoredServerUser[] = (migrated.users || []).map((u) => {
        const existing = prevMap.get(u.id);
        const plain = typeof u.password === 'string' ? u.password.trim() : '';
        let passwordSalt = existing?.passwordSalt || '';
        let passwordHash = existing?.passwordHash || '';
        if (plain.length >= 6) {
          const h = hashPassword(plain);
          passwordSalt = h.salt;
          passwordHash = h.hash;
        }
        return {
          id: u.id,
          username: deriveUsername(u.username, u.email, u.id),
          name: u.name,
          nip: u.nip,
          email: u.email,
          role: u.role,
          school: u.school,
          gender: u.gender,
          photoDataUrl: u.photoDataUrl || '',
          assignedClasses: u.assignedClasses || [],
          assignedSubjects: u.assignedSubjects || [],
          signatureDataUrl: u.signatureDataUrl || existing?.signatureDataUrl || '',
          signatureSize: u.signatureSize ?? existing?.signatureSize,
          signatureOffsetX: u.signatureOffsetX ?? existing?.signatureOffsetX,
          signatureOffsetY: u.signatureOffsetY ?? existing?.signatureOffsetY,
          active: u.active,
          createdAt: u.createdAt,
          passwordSalt,
          passwordHash,
        };
      });

      // Keep active admin credential intact if backup didn't include admins
      const currentAdmin = prevStore.users.find((u) => u.role === 'admin' && u.active);
      if (currentAdmin && !restoredUsers.some((u) => u.role === 'admin' && u.active)) {
        restoredUsers.unshift(currentAdmin);
      }

      saveUsersStore({
        adminClaimed: prevStore.adminClaimed,
        users: restoredUsers,
      });

      res.json({
        ok: true,
        database: {
          ...savedWs,
          users: restoredUsers.map(toPublicAppUser),
        },
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal memulihkan cadangan di server.',
      });
    }
  });

  app.post('/api/workspace/reset-demo', requireAuth, requireRoles(['admin']), (_req, res) => {
    try {
      // Always create a safety backup snapshot before resetting to demo
      createServerBackupSnapshot('before_reset');

      const fresh = createSeedDatabase();
      const nowIso = new Date().toISOString();
      const savedWs = saveWorkspaceStore({
        version: CURRENT_APP_SCHEMA_VERSION,
        lastSyncedAt: nowIso,
        students: fresh.students,
        journals: fresh.journals,
        grades: fresh.grades,
        schedules: fresh.schedules || [],
        agendas: fresh.agendas || [],
        settings: {
          ...fresh.settings,
          updatedAt: nowIso,
        },
      });

      // Keep existing Admin login credentials so Admin is never locked out after reset
      const prevStore = loadUsersStore();
      const prevMap = new Map(prevStore.users.map((u) => [u.id, u]));
      const nextUsers: StoredServerUser[] = (fresh.users || []).map((u) => {
        const prev = prevMap.get(u.id);
        return {
          id: u.id,
          username: prev?.username || deriveUsername(u.username, u.email, u.id),
          name: prev && prev.role === 'admin' ? prev.name : u.name,
          nip: prev && prev.role === 'admin' ? prev.nip : u.nip,
          email: prev && prev.role === 'admin' ? prev.email : u.email,
          role: u.role,
          school: u.school,
          gender: u.gender,
          photoDataUrl: prev?.photoDataUrl || '',
          assignedClasses: u.assignedClasses || [],
          assignedSubjects: u.assignedSubjects || [],
          signatureDataUrl: '',
          active: u.active,
          createdAt: prev?.createdAt || u.createdAt,
          passwordSalt: prev?.passwordSalt || '',
          passwordHash: prev?.passwordHash || '',
        };
      });
      saveUsersStore({ adminClaimed: prevStore.adminClaimed, users: nextUsers });

      res.json({
        ok: true,
        database: {
          ...savedWs,
          users: nextUsers.map(toPublicAppUser),
        },
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal mereset data demo.',
      });
    }
  });

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ ok: false, error: 'Endpoint API tidak ditemukan.' });
  });

  return app;
}

async function startStandaloneServer() {
  const app = await createApiApp();

  const hasDistIndex = fs.existsSync(path.resolve(__dirname, 'dist', 'index.html'));
  const isDevMode =
    process.argv.includes('--dev') ||
    (process.env.NODE_ENV !== 'production' &&
      process.env.npm_lifecycle_event !== 'start' &&
      !hasDistIndex);

  if (isDevMode) {
    const viteModule = 'vite';
    const { createServer: createViteServer } = (await import(viteModule)) as typeof import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Portal E-Guru v10.3 full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

let isDirectMain = false;
try {
  if (!IS_SERVERLESS && process.argv[1]) {
    isDirectMain = fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(__filename);
  }
} catch {
  isDirectMain = false;
}

if (isDirectMain) {
  void startStandaloneServer();
}
