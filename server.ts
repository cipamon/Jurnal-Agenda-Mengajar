import 'dotenv/config';
import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  AppUser,
  GradeRecord,
  JournalEntry,
  PortalDatabase,
  Student,
  SystemSettings,
  TeacherProfile,
  UserRole,
} from './src/types';
import { createSeedDatabase } from './src/utils/seedData';
import { CURRENT_APP_SCHEMA_VERSION, migrateDatabase, migrateSettings } from './src/utils/storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(__dirname, '.data');

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
    active: Boolean(u.active),
    createdAt: u.createdAt,
  };
}

const WORKSPACE_FILE = resolveInsideDataDir('workspace.json');
const USERS_FILE = resolveInsideDataDir('users.json');
const LEGACY_WORKSPACE_FILE = resolveInsideDataDir('guru_sman1nusantara.sch.id.json');

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
          settings: sanitizeSettingsForServer(migrated.settings),
        };
      }
    } catch {
      // fall back to legacy/seed below
    }
  }

  const initialSource = readLegacyDatabaseIfAvailable() || createSeedDatabase();
  const initialStore: WorkspaceStore = {
    version: CURRENT_APP_SCHEMA_VERSION,
    lastSyncedAt: initialSource.lastSyncedAt || new Date().toISOString(),
    students: initialSource.students,
    journals: initialSource.journals,
    grades: initialSource.grades,
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

async function startServer() {
  // Ensure initial stores exist cleanly at startup
  loadWorkspaceStore();
  loadUsersStore();

  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      mode: 'fullstack',
      service: 'Portal E-Guru v10.3',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/auth/status', (_req, res) => {
    const envAdmin = getEnvAdminConfig();
    const usersStore = loadUsersStore();
    const primaryAdmin = usersStore.users.find((u) => u.role === 'admin' && u.active);
    res.json({
      ok: true,
      adminConfigured: envAdmin.enabled || usersStore.adminClaimed,
      envAdminManaged: envAdmin.enabled,
      adminUsernameHint: envAdmin.enabled
        ? envAdmin.username
        : primaryAdmin?.username || 'admin',
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
      const academicYear = typeof body.academicYear === 'string' ? body.academicYear.trim() : '';
      const semester =
        body.semester === 'Ganjil' || body.semester === 'Genap' ? body.semester : undefined;

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

          if (academicYear || semester) {
            const ws = loadWorkspaceStore();
            if (
              (academicYear && ws.settings.academicYears.includes(academicYear)) ||
              semester
            ) {
              ws.settings = {
                ...ws.settings,
                ...(academicYear && ws.settings.academicYears.includes(academicYear)
                  ? { academicYear }
                  : {}),
                ...(semester ? { semester } : {}),
              };
              saveWorkspaceStore(ws);
            }
          }

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

      if (matched.role === 'admin' && (academicYear || semester)) {
        const ws = loadWorkspaceStore();
        ws.settings = {
          ...ws.settings,
          ...(academicYear && ws.settings.academicYears.includes(academicYear)
            ? { academicYear }
            : {}),
          ...(semester ? { semester } : {}),
        };
        saveWorkspaceStore(ws);
      }

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
      const ws = loadWorkspaceStore();
      ws.settings = sanitizeSettingsForServer(body.settings);
      const saved = saveWorkspaceStore(ws);
      res.json({ ok: true, settings: saved.settings, lastSyncedAt: saved.lastSyncedAt });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan di server.',
      });
    }
  });

  app.put(
    '/api/workspace/students',
    requireAuth,
    requireRoles(['admin', 'guru', 'wali_kelas', 'karyawan']),
    (req, res) => {
      try {
        const body = req.body as { students?: Student[] };
        if (!Array.isArray(body.students)) {
          res.status(400).json({ ok: false, error: 'Data siswa harus berupa daftar array.' });
          return;
        }
        const ws = loadWorkspaceStore();
        ws.students = body.students;
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
    (req, res) => {
      try {
        const body = req.body as { journals?: JournalEntry[] };
        if (!Array.isArray(body.journals)) {
          res.status(400).json({ ok: false, error: 'Data jurnal harus berupa daftar array.' });
          return;
        }
        const ws = loadWorkspaceStore();
        ws.journals = body.journals;
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
    (req, res) => {
      try {
        const body = req.body as { grades?: GradeRecord[] };
        if (!Array.isArray(body.grades)) {
          res.status(400).json({ ok: false, error: 'Data nilai harus berupa daftar array.' });
          return;
        }
        const ws = loadWorkspaceStore();
        ws.grades = body.grades;
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

      const nextUsers: StoredServerUser[] = body.users.map((u) => {
        const existing = prevMap.get(u.id);
        const plainNewPass = typeof u.password === 'string' ? u.password.trim() : '';
        let passwordSalt = existing?.passwordSalt || '';
        let passwordHash = existing?.passwordHash || '';

        if (plainNewPass.length > 0) {
          if (plainNewPass.length < 6) {
            throw new Error(`Password untuk ${u.name || u.email} minimal 6 karakter.`);
          }
          const hashed = hashPassword(plainNewPass);
          passwordSalt = hashed.salt;
          passwordHash = hashed.hash;
        }

        return {
          id: String(u.id),
          username: deriveUsername(u.username, u.email, u.id),
          name: String(u.name || 'Pengguna').slice(0, 150),
          nip: String(u.nip || '-').slice(0, 60),
          email: String(u.email || '').trim().slice(0, 200),
          role: u.role,
          school: String(u.school || '').slice(0, 180),
          gender: u.gender === 'P' ? 'P' : 'L',
          photoDataUrl: String(u.photoDataUrl || ''),
          assignedClasses: Array.isArray(u.assignedClasses) ? u.assignedClasses : [],
          assignedSubjects: Array.isArray(u.assignedSubjects) ? u.assignedSubjects : [],
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
          if (plainNewPass.length < 6) {
            res.status(400).json({ ok: false, error: 'Password baru minimal 6 karakter.' });
            return;
          }
          const hashed = hashPassword(plainNewPass);
          passwordSalt = hashed.salt;
          passwordHash = hashed.hash;
        }

        updatedUser = {
          ...cur,
          name: String(tp.name).trim().slice(0, 150),
          nip: String(tp.nip || '-').trim().slice(0, 60),
          school: String(tp.school || cur.school).trim().slice(0, 180),
          email: authUser.role === 'admin' && tp.email ? String(tp.email).trim() : cur.email,
          gender: tp.gender === 'P' ? 'P' : tp.gender === 'L' ? 'L' : cur.gender,
          photoDataUrl: String(tp.photoDataUrl || ''),
          assignedClasses: Array.isArray(tp.assignedClasses) ? tp.assignedClasses : [],
          assignedSubjects: Array.isArray(tp.assignedSubjects) ? tp.assignedSubjects : [],
          passwordSalt,
          passwordHash,
        };
        usersStore.users[targetIdx] = updatedUser;
        saveUsersStore(usersStore);
      }

      const ws = loadWorkspaceStore();
      if (
        updatedUser &&
        (updatedUser.id === 'usr-guru-1' ||
          updatedUser.email.toLowerCase() === ws.settings.teacherProfile.email.toLowerCase())
      ) {
        ws.settings = sanitizeSettingsForServer({
          ...ws.settings,
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
            password: '',
          },
        });
        saveWorkspaceStore(ws);
      }

      res.json({
        ok: true,
        user: updatedUser ? toPublicAppUser(updatedUser) : null,
        settings: ws.settings,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal memperbarui profil.',
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

      const savedWs = saveWorkspaceStore({
        version: CURRENT_APP_SCHEMA_VERSION,
        lastSyncedAt: new Date().toISOString(),
        students: migrated.students,
        journals: migrated.journals,
        grades: migrated.grades,
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
      const fresh = createSeedDatabase();
      const savedWs = saveWorkspaceStore({
        version: CURRENT_APP_SCHEMA_VERSION,
        lastSyncedAt: new Date().toISOString(),
        students: fresh.students,
        journals: fresh.journals,
        grades: fresh.grades,
        settings: fresh.settings,
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

  if (process.env.NODE_ENV !== 'production') {
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

startServer();
