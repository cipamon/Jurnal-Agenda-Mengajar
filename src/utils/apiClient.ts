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
  WebBrandConfig,
} from '../types.ts';

// Bearer token is stored strictly in JS memory (never in localStorage or sessionStorage)
let inMemoryBearerToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setApiAuthToken(token: string | null): void {
  inMemoryBearerToken = token && token.trim() ? token.trim() : null;
}

export function getApiAuthToken(): string | null {
  return inMemoryBearerToken;
}

export function setOnUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export class ApiHttpError extends Error {
  status: number;
  isBackendUnavailable: boolean;

  constructor(message: string, status: number, isBackendUnavailable = false) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.isBackendUnavailable = isBackendUnavailable;
  }
}

async function apiRequest<T>(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    requireAuth?: boolean;
  } = {}
): Promise<T> {
  const { method = 'GET', body, requireAuth = true } = options;
  const headers: Record<string, string> = {
    'X-Requested-With': 'PortalEGuru',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (requireAuth) {
    if (!inMemoryBearerToken) {
      throw new ApiHttpError('Sesi server belum aktif. Silakan masuk terlebih dahulu.', 401, false);
    }
    headers['Authorization'] = `Bearer ${inMemoryBearerToken}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiHttpError(
      'Tidak dapat terhubung ke server backend (/api).',
      0,
      true
    );
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');
  const data = (isJson ? await res.json().catch(() => ({})) : {}) as {
    ok?: boolean;
    error?: string;
  } & T;

  if (res.status === 401 && requireAuth) {
    setApiAuthToken(null);
    if (unauthorizedHandler) unauthorizedHandler();
  }

  const isGenuineApiJson = isJson && typeof data.ok === 'boolean';
  if (!isGenuineApiJson) {
    throw new ApiHttpError(
      `Endpoint server (${url}) tidak tersedia pada host ini (HTTP ${res.status || 404}).`,
      res.status || 404,
      true
    );
  }

  if (!res.ok || data.ok === false) {
    throw new ApiHttpError(
      data.error || `Permintaan server gagal (HTTP ${res.status}).`,
      res.status,
      res.status === 404 && !data.error
    );
  }

  return data;
}

export interface ServerAuthStatus {
  ok: boolean;
  adminConfigured: boolean;
  envAdminManaged: boolean;
  adminUsernameHint: string;
  webBrand?: WebBrandConfig;
  academicYear?: string;
  semester?: 'Ganjil' | 'Genap';
  academicYears?: string[];
}

export interface ServerAuthResponse {
  ok: boolean;
  token: string;
  user: AppUser;
  activatedStaffCount?: number;
}

export async function apiGetAuthStatus(): Promise<ServerAuthStatus> {
  return apiRequest<ServerAuthStatus>('/api/auth/status', {
    method: 'GET',
    requireAuth: false,
  });
}

export async function apiClaimAdmin(payload: {
  username: string;
  password: string;
  email?: string;
  name?: string;
  staffPassword?: string;
  academicYear?: string;
  semester?: 'Ganjil' | 'Genap';
}): Promise<ServerAuthResponse> {
  const res = await apiRequest<ServerAuthResponse>('/api/auth/claim-admin', {
    method: 'POST',
    body: payload,
    requireAuth: false,
  });
  setApiAuthToken(res.token);
  return res;
}

export async function apiLoginServer(payload: {
  identifier: string;
  password: string;
  academicYear?: string;
  semester?: 'Ganjil' | 'Genap';
}): Promise<ServerAuthResponse> {
  const res = await apiRequest<ServerAuthResponse>('/api/auth/login', {
    method: 'POST',
    body: payload,
    requireAuth: false,
  });
  setApiAuthToken(res.token);
  return res;
}

export async function apiFetchWorkspace(): Promise<PortalDatabase> {
  const res = await apiRequest<{ ok: boolean; database: PortalDatabase }>('/api/workspace', {
    method: 'GET',
  });
  return res.database;
}

export async function apiSaveSettings(settings: SystemSettings): Promise<SystemSettings> {
  const res = await apiRequest<{ ok: boolean; settings: SystemSettings }>(
    '/api/workspace/settings',
    {
      method: 'PUT',
      body: { settings },
    }
  );
  return res.settings;
}

export async function apiSaveStudents(students: Student[]): Promise<void> {
  await apiRequest('/api/workspace/students', {
    method: 'PUT',
    body: { students },
  });
}

export async function apiSaveJournals(journals: JournalEntry[]): Promise<void> {
  await apiRequest('/api/workspace/journals', {
    method: 'PUT',
    body: { journals },
  });
}

export async function apiSaveGrades(grades: GradeRecord[]): Promise<void> {
  await apiRequest('/api/workspace/grades', {
    method: 'PUT',
    body: { grades },
  });
}

export async function apiSaveSchedules(schedules: TeachingScheduleItem[]): Promise<void> {
  await apiRequest('/api/workspace/schedules', {
    method: 'PUT',
    body: { schedules },
  });
}

export async function apiSaveAgendas(agendas: TeacherAgendaItem[]): Promise<void> {
  await apiRequest('/api/workspace/agendas', {
    method: 'PUT',
    body: { agendas },
  });
}

export async function apiSaveUsers(users: AppUser[]): Promise<AppUser[]> {
  const res = await apiRequest<{ ok: boolean; users: AppUser[] }>('/api/workspace/users', {
    method: 'PUT',
    body: { users },
  });
  return res.users;
}

export async function apiSaveOwnProfile(
  teacherProfile: TeacherProfile
): Promise<{ user: AppUser | null; settings: SystemSettings }> {
  const res = await apiRequest<{ ok: boolean; user: AppUser | null; settings: SystemSettings }>(
    '/api/workspace/profile',
    {
      method: 'PUT',
      body: { teacherProfile },
    }
  );
  return { user: res.user, settings: res.settings };
}

export async function apiRestoreWorkspace(database: PortalDatabase): Promise<PortalDatabase> {
  const res = await apiRequest<{ ok: boolean; database: PortalDatabase }>(
    '/api/workspace/restore',
    {
      method: 'PUT',
      body: { database },
    }
  );
  return res.database;
}

export async function apiResetDemoWorkspace(): Promise<PortalDatabase> {
  const res = await apiRequest<{ ok: boolean; database: PortalDatabase }>(
    '/api/workspace/reset-demo',
    {
      method: 'POST',
      body: {},
    }
  );
  return res.database;
}
