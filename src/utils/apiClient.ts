import {
  AppUser,
  GradeRecord,
  JournalEntry,
  PortalDatabase,
  Student,
  SystemSettings,
  TeacherProfile,
} from '../types';

// Bearer token is stored strictly in JS memory (never in localStorage or sessionStorage)
let inMemoryBearerToken: string | null = null;

export function setApiAuthToken(token: string | null): void {
  inMemoryBearerToken = token && token.trim() ? token.trim() : null;
}

export function getApiAuthToken(): string | null {
  return inMemoryBearerToken;
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
      throw new Error('Sesi server belum aktif. Silakan masuk terlebih dahulu.');
    }
    headers['Authorization'] = `Bearer ${inMemoryBearerToken}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  } & T;

  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Permintaan server gagal (HTTP ${res.status}).`);
  }

  return data;
}

export interface ServerAuthStatus {
  ok: boolean;
  adminConfigured: boolean;
  envAdminManaged: boolean;
  adminUsernameHint: string;
}

export interface ServerAuthResponse {
  ok: boolean;
  token: string;
  user: AppUser;
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
