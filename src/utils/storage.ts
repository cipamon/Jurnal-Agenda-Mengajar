import { PortalDatabase, SessionState } from '../types';

const IDB_NAME = 'portal_eguru_v10_idb';
const IDB_STORE = 'workspace_store';
const IDB_KEY = 'primary_db';

const LS_DB_KEY = 'portal_eguru_v10_data';
const LS_SESSION_KEY = 'portal_eguru_v10_session';

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
      return idbData;
    }
  } catch {
    // Fallback to LocalStorage below
  }

  try {
    const raw = localStorage.getItem(LS_DB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortalDatabase;
    return parsed && parsed.settings ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveDatabase(data: PortalDatabase): Promise<void> {
  try {
    localStorage.setItem(LS_DB_KEY, JSON.stringify(data));
  } catch {
    // Ignore localStorage quota exceeded when large images are uploaded; IndexedDB handles larger payloads
  }

  try {
    const db = await openIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(data, IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Best-effort IndexedDB write
  }
}

export function loadSession(): SessionState | null {
  try {
    const raw = localStorage.getItem(LS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionState;
    return parsed && parsed.isAuthenticated ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: SessionState): void {
  try {
    localStorage.setItem(LS_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(LS_SESSION_KEY);
  } catch {
    // ignore
  }
}

export async function syncToServer(db: PortalDatabase): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/sync/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: db.settings.teacherProfile.email,
        data: db,
      }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    return json;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Koneksi server gagal' };
  }
}

export async function syncToGoogleSheets(
  webAppUrl: string,
  db: PortalDatabase
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/sync/sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webAppUrl,
        payload: {
          source: 'Portal E-Guru v10.2',
          syncedAt: new Date().toISOString(),
          academicYear: db.settings.academicYear,
          semester: db.settings.semester,
          teacher: db.settings.teacherProfile.name,
          studentsCount: db.students.length,
          journalsCount: db.journals.length,
          gradesCount: db.grades.length,
          students: db.students,
          journals: db.journals,
          grades: db.grades,
        },
      }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    return json;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Gagal sinkronisasi ke Google Sheets' };
  }
}
