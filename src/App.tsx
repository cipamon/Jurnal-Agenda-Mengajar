/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { CheckCircle2, X } from 'lucide-react';
import { AdminUsersModal } from './components/AdminUsersModal';
import { ClassDetailModal } from './components/ClassDetailModal';
import { DashboardView } from './components/DashboardView';
import { GradesMatrixView } from './components/GradesMatrixView';
import {
  JournalAttendanceView,
  JournalPresetDraft,
} from './components/JournalAttendanceView';
import { LoginView } from './components/LoginView';
import { PrintReportsView } from './components/PrintReportsView';
import { ScheduleAgendaView } from './components/ScheduleAgendaView';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { StaffTeachersView } from './components/StaffTeachersView';
import { StudentDetailModal } from './components/StudentDetailModal';
import { StudentEditModal } from './components/StudentEditModal';
import { StudentPromotionModal } from './components/StudentPromotionModal';
import { StudentsView } from './components/StudentsView';
import { SubjectDetailModal } from './components/SubjectDetailModal';
import { TeacherProfileModal } from './components/TeacherProfileModal';
import { Topbar } from './components/Topbar';
import {
  AppUser,
  GradeRecord,
  JournalEntry,
  MenuId,
  PortalDatabase,
  ReportType,
  SessionState,
  Student,
  SystemSettings,
  TeacherAgendaItem,
  TeachingScheduleItem,
  ThemeId,
  UserRole,
} from './types';
import {
  getScopedPortalData,
  getTodayIso,
  normalizeWebBrand,
  ROLE_PERMISSIONS,
  THEME_PRESETS,
  USER_ROLE_LABELS,
} from './utils/helpers';
import { auth, googleProvider } from './firebase';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  fsDeleteAgenda,
  fsDeleteGrades,
  fsDeleteJournals,
  fsDeleteSchedule,
  fsDeleteStudents,
  fsReplaceEntireDatabase,
  fsSaveAgenda,
  fsSaveGradesBatch,
  fsSaveJournal,
  fsSaveJournalsBatch,
  fsSaveSchedule,
  fsSaveSettings,
  fsSaveStudent,
  fsSaveStudentsBatch,
  fsSyncUsersAdmin,
  fsUpdateSelfProfile,
  subscribeToSchoolWorkspace,
  verifyAndBootstrapFirebaseAccount,
} from './utils/firestoreSync';
import { createSeedDatabase } from './utils/seedData';
import {
  apiClaimAdmin,
  apiFetchWorkspace,
  apiLoginServer,
  apiResetDemoWorkspace,
  apiRestoreWorkspace,
  apiSaveAgendas,
  apiSaveGrades,
  apiSaveJournals,
  apiSaveOwnProfile,
  apiSaveSchedules,
  apiSaveSettings,
  apiSaveStudents,
  apiSaveUsers,
  setApiAuthToken,
  setOnUnauthorizedHandler,
} from './utils/apiClient';
import {
  clearSession,
  loadDatabase,
  saveDatabase,
  saveLocalSafetyBackup,
  saveSession,
} from './utils/storage';

const LS_LOCAL_THEME_KEY = 'portal_eguru_local_theme';

export default function App() {
  const [db, setDb] = useState<PortalDatabase | null>(null);
  const dbRef = useRef<PortalDatabase | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [cloudVerified, setCloudVerified] = useState(false);
  const [cloudUsersSynced, setCloudUsersSynced] = useState(false);
  const [cloudAuthError, setCloudAuthError] = useState<string | null>(null);
  const verifyingUidRef = useRef<string | null>(null);
  const pendingCloudSaveRef = useRef<Promise<unknown> | null>(null);
  const [localThemeOverride, setLocalThemeOverride] = useState<ThemeId | null>(() => {
    try {
      return (localStorage.getItem(LS_LOCAL_THEME_KEY) as ThemeId) || null;
    } catch {
      return null;
    }
  });

  const [activeMenu, setActiveMenu] = useState<MenuId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [draftJournal, setDraftJournal] = useState<{
    mode: 'create' | 'edit' | 'duplicate';
    entry: JournalEntry;
  } | null>(null);
  const [scheduleJournalPreset, setScheduleJournalPreset] = useState<JournalPresetDraft | null>(null);
  const [selectedStudentModal, setSelectedStudentModal] = useState<Student | null>(null);
  const [studentFormModal, setStudentFormModal] = useState<{
    mode: 'create' | 'edit';
    student: Student | null;
  } | null>(null);
  const [selectedClassModal, setSelectedClassModal] = useState<string | null>(null);
  const [selectedSubjectModal, setSelectedSubjectModal] = useState<string | null>(null);
  const [showTeacherProfileModal, setShowTeacherProfileModal] = useState(false);
  const [periodScope, setPeriodScope] = useState<'active' | 'all'>('active');
  const [reportPreset, setReportPreset] = useState<{
    reportType?: ReportType;
    teacherId?: string;
  } | null>(null);
  const [promotionModal, setPromotionModal] = useState<{
    open: boolean;
    preselectedIds: string[];
  }>({ open: false, preselectedIds: [] });

  const notify = useCallback((message: string) => {
    setToast(message);
  }, []);

  const trackRemoteSave = useCallback(
    (promise: Promise<unknown>, errorPrefix: string) => {
      pendingCloudSaveRef.current = promise;
      void promise
        .catch((err) => {
          notify(
            `${errorPrefix}: ${err instanceof Error ? err.message : 'Kesalahan koneksi server.'}`
          );
        })
        .finally(() => {
          if (pendingCloudSaveRef.current === promise) {
            pendingCloudSaveRef.current = null;
          }
        });
    },
    [notify]
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  useEffect(() => {
    setOnUnauthorizedHandler(() => {
      setCloudVerified(false);
      setCloudUsersSynced(false);
      clearSession();
      setSession(null);
      setCloudAuthError('Sesi server telah berakhir. Silakan masuk kembali.');
    });
    return () => {
      setOnUnauthorizedHandler(null);
    };
  }, []);

  // Initial hydration from IndexedDB / LocalStorage + Firebase Auth session listener
  useEffect(() => {
    let mounted = true;
    let authUnsub: (() => void) | null = null;

    (async () => {
      const storedDb = await loadDatabase();
      clearSession();
      if (!mounted) return;
      let initialDb: PortalDatabase;
      if (storedDb) {
        const defaultUsers = createSeedDatabase().users ?? [];
        initialDb = {
          ...storedDb,
          users: storedDb.users && storedDb.users.length > 0 ? storedDb.users : defaultUsers,
        };
      } else {
        initialDb = createSeedDatabase();
        await saveDatabase(initialDb);
      }
      dbRef.current = initialDb;
      setDb(initialDb);

      authUnsub = onAuthStateChanged(auth, async (fbUser) => {
        if (!mounted) return;
        if (!fbUser) {
          setCloudVerified(false);
          setIsReady(true);
          return;
        }
        if (verifyingUidRef.current === fbUser.uid) {
          setIsReady(true);
          return;
        }
        verifyingUidRef.current = fbUser.uid;
        try {
          const res = await verifyAndBootstrapFirebaseAccount(fbUser, dbRef.current);
          if (!mounted) return;
          if (!res.ok) {
            setCloudVerified(false);
            setCloudAuthError(res.message);
            await signOut(auth);
            clearSession();
            setSession(null);
          } else {
            setApiAuthToken(null);
            setCloudAuthError(null);
            setCloudVerified(true);
            const nextSession: SessionState = {
              isAuthenticated: true,
              email: res.email,
              userId: res.userId,
              role: res.role,
              authProvider: 'google',
              loggedInAt: new Date().toISOString(),
            };
            saveSession(nextSession);
            setSession(nextSession);
          }
        } catch (err) {
          if (!mounted) return;
          setCloudVerified(false);
          setCloudAuthError(
            err instanceof Error ? err.message : 'Gagal memverifikasi sesi Firebase.'
          );
        } finally {
          verifyingUidRef.current = null;
          if (mounted) setIsReady(true);
        }
      });
    })();

    return () => {
      mounted = false;
      authUnsub?.();
    };
  }, []);

  const isCloudActive = Boolean(cloudVerified && session?.authProvider === 'google');
  const isServerActive = Boolean(session?.isAuthenticated && session?.authProvider === 'server');

  // Real-time Firestore listener: syncs all school data across accounts automatically
  useEffect(() => {
    if (!isCloudActive || !session?.email) {
      setCloudUsersSynced(false);
      return;
    }
    const baseFallback = dbRef.current ?? createSeedDatabase();
    const unsub = subscribeToSchoolWorkspace({
      role: session.role || 'guru',
      userEmail: session.email,
      initialLocalFallback: baseFallback,
      onSync: (syncedDb) => {
        setDb(syncedDb);
        setCloudUsersSynced(true);
      },
    });
    return () => unsub();
  }, [isCloudActive, session?.email, session?.role]);

  // Live role & active-status enforcement across accounts when Admin updates/disables a user
  useEffect(() => {
    if (!isCloudActive || !cloudUsersSynced || !db || !session?.email) return;
    const cloudUsers = db.users ?? [];
    const emailLower = session.email.toLowerCase();
    const matched = cloudUsers.find(
      (u) =>
        (session.userId && u.id === session.userId) ||
        u.email.toLowerCase() === emailLower
    );

    if (matched && !matched.active) {
      setCloudUsersSynced(false);
      setCloudVerified(false);
      setCloudAuthError('Akun Anda telah dinonaktifkan oleh Admin Sistem.');
      void signOut(auth);
      clearSession();
      setSession(null);
      return;
    }

    if (!matched && cloudUsers.length > 0 && emailLower !== BOOTSTRAPPED_ADMIN_EMAIL) {
      setCloudUsersSynced(false);
      setCloudVerified(false);
      setCloudAuthError('Akses akun Anda telah dihapus oleh Admin Sistem.');
      void signOut(auth);
      clearSession();
      setSession(null);
      return;
    }

    if (matched && (matched.role !== session.role || matched.id !== session.userId)) {
      const updatedSession: SessionState = {
        ...session,
        userId: matched.id,
        role: matched.role,
      };
      saveSession(updatedSession);
      setSession(updatedSession);
    }
  }, [isCloudActive, cloudUsersSynced, db, session]);

  // Sync browser tab title, favicon & UI theme whenever settings change
  useEffect(() => {
    if (!db) return;
    const brand = normalizeWebBrand(db.settings);
    document.title = brand.tabTitle;
    const effectiveTheme = localThemeOverride || db.settings.themeId || 'neomorphic';
    document.documentElement.setAttribute('data-theme', effectiveTheme);

    let linkEl = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!linkEl) {
      linkEl = document.createElement('link');
      linkEl.rel = 'icon';
      document.head.appendChild(linkEl);
    }
    linkEl.href = brand.webLogoDataUrl;
  }, [db, localThemeOverride]);

  // Persist DB whenever modified synchronously so remote saves receive exact snapshot
  const updateDatabase = useCallback(
    (updater: (prev: PortalDatabase) => PortalDatabase): PortalDatabase => {
      const base = dbRef.current ?? createSeedDatabase();
      const updated = updater(base);
      const next: PortalDatabase = {
        ...updated,
        lastModifiedAt: new Date().toISOString(),
      };
      dbRef.current = next;
      setDb(next);
      void saveDatabase(next);
      return next;
    },
    []
  );

  // Enforce RBAC allowed menus whenever user session/role changes
  useEffect(() => {
    if (!db || !session?.isAuthenticated) return;
    const users = db.users && db.users.length > 0 ? db.users : createSeedDatabase().users ?? [];
    const matched = users.find(
      (u) =>
        (session.userId && u.id === session.userId) ||
        u.email.toLowerCase() === session.email.toLowerCase()
    );
    const role: UserRole = matched?.role || session.role || 'guru';
    const perms = ROLE_PERMISSIONS[role];
    if (!perms.allowedMenus.includes(activeMenu)) {
      setActiveMenu(perms.allowedMenus[0] || 'dashboard');
    }
  }, [db, session, activeMenu]);

  const handleGoogleLogin = async (_payload?: {
    academicYear: string;
    semester: 'Ganjil' | 'Genap';
  }): Promise<string | null> => {
    setCloudAuthError(null);
    setApiAuthToken(null);
    if (dbRef.current) {
      void saveLocalSafetyBackup(dbRef.current);
    }
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const fbUser = cred.user;
      verifyingUidRef.current = fbUser.uid;
      const res = await verifyAndBootstrapFirebaseAccount(fbUser, dbRef.current);
      if (!res.ok) {
        setCloudVerified(false);
        await signOut(auth);
        clearSession();
        setSession(null);
        return res.message;
      }
      setCloudVerified(true);
      const nextSession: SessionState = {
        isAuthenticated: true,
        email: res.email,
        userId: res.userId,
        role: res.role,
        authProvider: 'google',
        loggedInAt: new Date().toISOString(),
      };
      saveSession(nextSession);
      setSession(nextSession);
      setActiveMenu('dashboard');
      notify(`Terhubung ke Firebase sebagai ${res.email} (${USER_ROLE_LABELS[res.role]}).`);
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login Google dibatalkan atau gagal.';
      if (msg.includes('popup-closed-by-user')) {
        return 'Jendela login Google ditutup sebelum selesai.';
      }
      return msg;
    } finally {
      verifyingUidRef.current = null;
    }
  };

  const handleServerLogin = async (payload: {
    identifier: string;
    password: string;
    academicYear: string;
    semester: 'Ganjil' | 'Genap';
  }): Promise<string | null> => {
    setCloudAuthError(null);
    if (auth.currentUser) {
      try {
        await signOut(auth);
      } catch {
        // ignore
      }
      setCloudVerified(false);
    }
    try {
      const prevLocalDb = dbRef.current;
      if (prevLocalDb) {
        void saveLocalSafetyBackup(prevLocalDb);
      }

      const authRes = await apiLoginServer(payload);
      const workspaceDb = await apiFetchWorkspace();

      const localModifiedMs = prevLocalDb?.lastModifiedAt ? Date.parse(prevLocalDb.lastModifiedAt) : 0;
      const serverSyncedMs = workspaceDb.lastSyncedAt ? Date.parse(workspaceDb.lastSyncedAt) : 0;
      const shouldPreserveLocalLatest =
        authRes.user.role === 'admin' &&
        Boolean(prevLocalDb) &&
        localModifiedMs > 0 &&
        localModifiedMs > serverSyncedMs;

      const activeDb = shouldPreserveLocalLatest && prevLocalDb ? prevLocalDb : workspaceDb;
      dbRef.current = activeDb;
      setDb(activeDb);
      void saveDatabase(activeDb);

      const nextSession: SessionState = {
        isAuthenticated: true,
        email: authRes.user.email,
        username: authRes.user.username,
        userId: authRes.user.id,
        role: authRes.user.role,
        authProvider: 'server',
        loggedInAt: new Date().toISOString(),
      };
      setSession(nextSession);
      setActiveMenu('dashboard');
      notify(
        shouldPreserveLocalLatest
          ? `Terhubung sebagai ${authRes.user.name}. Pengaturan & input terakhir di perangkat dipertahankan (Auto-Restore nonaktif).`
          : `Terhubung ke server sebagai ${authRes.user.name} (${USER_ROLE_LABELS[authRes.user.role]}).`
      );
      return null;
    } catch (err) {
      setApiAuthToken(null);
      return err instanceof Error ? err.message : 'Gagal masuk ke server.';
    }
  };

  const handleClaimAdmin = async (payload: {
    username: string;
    password: string;
    email?: string;
    staffPassword?: string;
    academicYear: string;
    semester: 'Ganjil' | 'Genap';
  }): Promise<string | null> => {
    setCloudAuthError(null);
    if (auth.currentUser) {
      try {
        await signOut(auth);
      } catch {
        // ignore
      }
      setCloudVerified(false);
    }
    try {
      const authRes = await apiClaimAdmin({
        username: payload.username,
        password: payload.password,
        email: payload.email,
        staffPassword: payload.staffPassword,
        academicYear: payload.academicYear,
        semester: payload.semester,
      });
      const workspaceDb = await apiFetchWorkspace();
      dbRef.current = workspaceDb;
      setDb(workspaceDb);
      void saveDatabase(workspaceDb);

      const nextSession: SessionState = {
        isAuthenticated: true,
        email: authRes.user.email,
        username: authRes.user.username,
        userId: authRes.user.id,
        role: authRes.user.role,
        authProvider: 'server',
        loggedInAt: new Date().toISOString(),
      };
      setSession(nextSession);
      setActiveMenu('pengaturan');
      const staffNote =
        authRes.activatedStaffCount && authRes.activatedStaffCount > 0
          ? ` dan ${authRes.activatedStaffCount} akun role lainnya siap digunakan.`
          : '.';
      notify(
        `Akun Admin (${authRes.user.username}) berhasil diaktifkan di server${staffNote}`
      );
      return null;
    } catch (err) {
      setApiAuthToken(null);
      return err instanceof Error ? err.message : 'Gagal mengaktifkan akun Admin.';
    }
  };

  const handleServerUnlockAdmin = async (
    identifier: string,
    password: string
  ): Promise<string | null> => {
    try {
      const prevLocalDb = dbRef.current;
      if (prevLocalDb) {
        void saveLocalSafetyBackup(prevLocalDb);
      }
      const authRes = await apiLoginServer({ identifier, password });
      if (authRes.user.role !== 'admin') {
        return 'Akun tersebut bukan Admin Sistem.';
      }
      const workspaceDb = await apiFetchWorkspace();
      const localModifiedMs = prevLocalDb?.lastModifiedAt ? Date.parse(prevLocalDb.lastModifiedAt) : 0;
      const serverSyncedMs = workspaceDb.lastSyncedAt ? Date.parse(workspaceDb.lastSyncedAt) : 0;
      const shouldPreserveLocalLatest =
        Boolean(prevLocalDb) && localModifiedMs > 0 && localModifiedMs > serverSyncedMs;

      const activeDb = shouldPreserveLocalLatest && prevLocalDb ? prevLocalDb : workspaceDb;
      dbRef.current = activeDb;
      setDb(activeDb);
      void saveDatabase(activeDb);

      setSession({
        isAuthenticated: true,
        email: authRes.user.email,
        username: authRes.user.username,
        userId: authRes.user.id,
        role: authRes.user.role,
        authProvider: 'server',
        loggedInAt: new Date().toISOString(),
      });
      notify(`Mode Admin aktif (${authRes.user.name}).`);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Kredensial Admin tidak valid.';
    }
  };

  const handleLogout = async () => {
    if (pendingCloudSaveRef.current) {
      try {
        await pendingCloudSaveRef.current;
      } catch {
        // Error sudah diberitahukan ke pengguna
      }
    }
    setApiAuthToken(null);
    setCloudVerified(false);
    setCloudUsersSynced(false);
    setCloudAuthError(null);
    if (auth.currentUser) {
      try {
        await signOut(auth);
      } catch {
        // ignore signOut error
      }
    }
    clearSession();
    setSession(null);
  };

  const handleManualSync = async () => {
    if (!db) return;
    setIsSyncing(true);
    try {
      await saveDatabase(db);
      if (isCloudActive) {
        if (session?.role === 'admin') {
          await fsSaveSettings(db.settings);
        }
        updateDatabase((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }));
        notify('Data tersinkronisasi aman di Firebase Firestore & penyimpanan lokal.');
        return;
      }
      if (isServerActive) {
        const currentRole = session?.role || 'guru';
        const permsNow = ROLE_PERMISSIONS[currentRole];
        if (currentRole === 'admin') {
          await apiSaveSettings(db.settings);
        }
        if (permsNow.canManageStudents) {
          await apiSaveStudents(db.students);
        }
        if (permsNow.canManageJournals) {
          await apiSaveJournals(db.journals);
          await apiSaveSchedules(db.schedules || []);
          await apiSaveAgendas(db.agendas || []);
        }
        if (permsNow.canManageGrades) {
          await apiSaveGrades(db.grades);
        }
        const fresh = await apiFetchWorkspace();
        const synced = { ...fresh, lastSyncedAt: new Date().toISOString() };
        dbRef.current = synced;
        setDb(synced);
        await saveDatabase(synced);
        notify('Data tersinkronisasi penuh dengan server backend Portal E-Guru.');
        return;
      }

      updateDatabase((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }));
      notify('Data tersimpan aman di penyimpanan lokal.');
    } catch (err) {
      notify(
        `Gagal menyinkronkan ke server: ${
          err instanceof Error ? err.message : 'Kesalahan jaringan.'
        }`
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const resolveActiveAuth = () => {
    const currentDb = dbRef.current ?? db;
    const users = currentDb?.users ?? [];
    const matched = session
      ? users.find(
          (u) =>
            (session.userId && u.id === session.userId) ||
            u.email.toLowerCase() === session.email.toLowerCase()
        )
      : undefined;
    const role: UserRole = matched?.role || session?.role || 'guru';
    const perms = ROLE_PERMISSIONS[role];
    const scopedData = currentDb ? getScopedPortalData(currentDb, matched, role, periodScope) : null;
    const isClassInScope = (cls: string) =>
      role === 'admin' || !scopedData?.hasClassRestriction || scopedData.allowedClasses.includes(cls);
    const isSubjectInScope = (subj: string) =>
      role === 'admin' || !scopedData?.hasSubjectRestriction || scopedData.allowedSubjects.includes(subj);
    const isOwnerOrAdmin = (teacherId?: string) =>
      role === 'admin' || !teacherId || !matched?.id || teacherId === matched.id;
    return {
      user: matched,
      role,
      perms,
      scopedData,
      isClassInScope,
      isSubjectInScope,
      isOwnerOrAdmin,
    };
  };

  // Journal handlers
  const handleSaveJournal = (entry: JournalEntry, isEdit: boolean) => {
    const { perms, isClassInScope, isSubjectInScope, isOwnerOrAdmin, user } = resolveActiveAuth();
    if (!perms.canManageJournals) {
      notify('Akses ditolak: peran Anda tidak diizinkan mengubah jurnal mengajar.');
      return;
    }
    if (!isClassInScope(entry.className) || !isSubjectInScope(entry.subject)) {
      notify('Akses ditolak: kelas atau mata pelajaran berada di luar tanggung jawab Anda.');
      return;
    }
    const existing = (dbRef.current?.journals || []).find((j) => j.id === entry.id);
    if (existing && !isOwnerOrAdmin(existing.teacherId)) {
      notify('Akses ditolak: Anda hanya dapat mengubah jurnal mengajar milik Anda sendiri.');
      return;
    }
    const normalizedEntry: JournalEntry = {
      ...entry,
      teacherId: existing?.teacherId || entry.teacherId || user?.id,
    };
    const nextDb = updateDatabase((prev) => {
      const exists = prev.journals.some((j) => j.id === normalizedEntry.id);
      const journals = exists
        ? prev.journals.map((j) => (j.id === normalizedEntry.id ? normalizedEntry : j))
        : [normalizedEntry, ...prev.journals];
      return { ...prev, journals };
    });
    if (isCloudActive) {
      trackRemoteSave(fsSaveJournal(normalizedEntry), 'Gagal menyimpan jurnal ke Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveJournals(nextDb.journals), 'Gagal menyimpan jurnal ke server');
    }
    notify(isEdit ? 'Jurnal dan presensi berhasil diperbarui.' : 'Jurnal dan presensi baru berhasil disimpan.');
  };

  const handleDeleteJournals = (ids: string[]) => {
    const { perms, isClassInScope, isSubjectInScope, isOwnerOrAdmin } = resolveActiveAuth();
    if (!perms.canManageJournals) {
      notify('Akses ditolak: peran Anda tidak diizinkan menghapus jurnal.');
      return;
    }
    const currentJournals = dbRef.current?.journals || [];
    const allowedIds = ids.filter((id) => {
      const target = currentJournals.find((j) => j.id === id);
      if (!target) return false;
      return isClassInScope(target.className) && isSubjectInScope(target.subject) && isOwnerOrAdmin(target.teacherId);
    });
    if (allowedIds.length === 0) {
      notify('Akses ditolak: tidak ada jurnal milik Anda dalam cakupan yang dapat dihapus.');
      return;
    }
    const delSet = new Set(allowedIds);
    const nextDb = updateDatabase((prev) => ({
      ...prev,
      journals: prev.journals.filter((j) => !delSet.has(j.id)),
    }));
    if (isCloudActive) {
      trackRemoteSave(fsDeleteJournals(allowedIds), 'Gagal menghapus jurnal di Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveJournals(nextDb.journals), 'Gagal menghapus jurnal di server');
    }
    notify(`${allowedIds.length} jurnal berhasil dihapus.`);
  };

  const handleImportJournals = (entries: JournalEntry[]) => {
    const { role, perms, user, isClassInScope, isSubjectInScope } = resolveActiveAuth();
    if (!perms.canManageJournals) {
      notify('Akses ditolak: peran Anda tidak diizinkan mengimpor jurnal.');
      return;
    }
    const scopedEntries = entries
      .filter((e) => isClassInScope(e.className) && isSubjectInScope(e.subject))
      .map((e) => ({ ...e, teacherId: e.teacherId || user?.id }));
    if (scopedEntries.length === 0) {
      notify('Tidak ada baris jurnal yang sesuai dengan kelas & mata pelajaran ampu Anda.');
      return;
    }
    let nextSettingsToSync: SystemSettings | null = null;
    const nextDb = updateDatabase((prev) => {
      let updatedSettings = prev.settings;
      if (role === 'admin') {
        const extraClasses = new Set(prev.settings.classes);
        const extraSubjects = new Set(prev.settings.subjects);
        scopedEntries.forEach((e) => {
          if (e.className) extraClasses.add(e.className);
          if (e.subject) extraSubjects.add(e.subject);
        });
        updatedSettings = {
          ...prev.settings,
          classes: Array.from(extraClasses),
          subjects: Array.from(extraSubjects),
        };
        if (
          updatedSettings.classes.length !== prev.settings.classes.length ||
          updatedSettings.subjects.length !== prev.settings.subjects.length
        ) {
          nextSettingsToSync = updatedSettings;
        }
      }
      return {
        ...prev,
        journals: [...scopedEntries, ...prev.journals],
        settings: updatedSettings,
      };
    });
    if (isCloudActive) {
      trackRemoteSave(
        Promise.all([
          fsSaveJournalsBatch(scopedEntries),
          nextSettingsToSync && role === 'admin'
            ? fsSaveSettings(nextSettingsToSync)
            : Promise.resolve(),
        ]),
        'Gagal menyinkronkan impor jurnal ke Firebase'
      );
    } else if (isServerActive) {
      trackRemoteSave(
        Promise.all([
          apiSaveJournals(nextDb.journals),
          nextSettingsToSync && role === 'admin'
            ? apiSaveSettings(nextSettingsToSync)
            : Promise.resolve(),
        ]),
        'Gagal menyimpan impor jurnal ke server'
      );
    }
    notify(`Berhasil mengimpor ${scopedEntries.length} jurnal mengajar.`);
  };

  const handleBulkUpdateLedger = (updatedJournals: JournalEntry[]) => {
    const { perms, isClassInScope, isSubjectInScope, isOwnerOrAdmin } = resolveActiveAuth();
    if (!perms.canManageJournals) {
      notify('Akses ditolak: peran Anda tidak diizinkan mengubah leger presensi.');
      return;
    }
    const existingMap = new Map((dbRef.current?.journals || []).map((j) => [j.id, j]));
    const permittedUpdates = updatedJournals.filter((j) => {
      const existing = existingMap.get(j.id);
      return (
        isClassInScope(j.className) &&
        isSubjectInScope(j.subject) &&
        isOwnerOrAdmin(existing?.teacherId ?? j.teacherId)
      );
    });
    if (permittedUpdates.length === 0) {
      notify('Akses ditolak: Anda hanya dapat memperbarui presensi pada pertemuan milik Anda sendiri.');
      return;
    }
    const mapById = new Map(permittedUpdates.map((j) => [j.id, j]));
    const nextDb = updateDatabase((prev) => ({
      ...prev,
      journals: prev.journals.map((j) => mapById.get(j.id) || j),
    }));
    if (isCloudActive) {
      trackRemoteSave(fsSaveJournalsBatch(permittedUpdates), 'Gagal menyimpan leger ke Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveJournals(nextDb.journals), 'Gagal menyimpan leger ke server');
    }
    notify(`Perubahan leger kehadiran (${permittedUpdates.length} pertemuan) berhasil disimpan.`);
  };

  // Grade handlers
  const handleSaveGradesBatch = (records: GradeRecord[]) => {
    const { perms, user, isClassInScope, isSubjectInScope } = resolveActiveAuth();
    if (!perms.canManageGrades) {
      notify('Akses ditolak: peran Anda tidak diizinkan mengubah nilai siswa.');
      return;
    }
    const scopedRecords = records
      .filter((r) => isClassInScope(r.className) && isSubjectInScope(r.subject))
      .map((r) => ({ ...r, teacherId: r.teacherId || user?.id }));
    if (scopedRecords.length === 0) {
      notify('Akses ditolak: kelas atau mata pelajaran nilai di luar tanggung jawab Anda.');
      return;
    }
    const resolvedBatch: GradeRecord[] = [];
    const nextDb = updateDatabase((prev) => {
      const nextGrades = [...prev.grades];
      scopedRecords.forEach((rec) => {
        const recYear = rec.academicYear || prev.settings.academicYear;
        const recSem = rec.semester || prev.settings.semester;
        const idx = nextGrades.findIndex(
          (g) =>
            g.studentId === rec.studentId &&
            g.className === rec.className &&
            g.subject === rec.subject &&
            g.examType === rec.examType &&
            (g.academicYear || prev.settings.academicYear) === recYear &&
            (g.semester || prev.settings.semester) === recSem
        );
        if (idx >= 0) {
          const mergedRec = { ...rec, id: nextGrades[idx].id };
          nextGrades[idx] = mergedRec;
          resolvedBatch.push(mergedRec);
        } else {
          nextGrades.push(rec);
          resolvedBatch.push(rec);
        }
      });
      return { ...prev, grades: nextGrades };
    });
    if (isCloudActive && resolvedBatch.length > 0) {
      trackRemoteSave(fsSaveGradesBatch(resolvedBatch), 'Gagal menyimpan nilai ke Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveGrades(nextDb.grades), 'Gagal menyimpan nilai ke server');
    }
    notify(`Berhasil menyimpan ${scopedRecords.length} data nilai siswa.`);
  };

  const handleDeleteGrades = (ids: string[]) => {
    const { perms, isClassInScope, isSubjectInScope } = resolveActiveAuth();
    if (!perms.canManageGrades) {
      notify('Akses ditolak: peran Anda tidak diizinkan menghapus nilai siswa.');
      return;
    }
    const currentGrades = dbRef.current?.grades || [];
    const allowedIds = ids.filter((id) => {
      const g = currentGrades.find((rec) => rec.id === id);
      return g ? isClassInScope(g.className) && isSubjectInScope(g.subject) : false;
    });
    if (allowedIds.length === 0) {
      notify('Tidak ada data nilai dalam cakupan yang dapat dihapus.');
      return;
    }
    const delSet = new Set(allowedIds);
    const nextDb = updateDatabase((prev) => ({
      ...prev,
      grades: prev.grades.filter((g) => !delSet.has(g.id)),
    }));
    if (isCloudActive) {
      trackRemoteSave(fsDeleteGrades(allowedIds), 'Gagal menghapus nilai di Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveGrades(nextDb.grades), 'Gagal menghapus nilai di server');
    }
    notify(`${allowedIds.length} catatan nilai berhasil dihapus.`);
  };

  // Schedule & Agenda handlers
  const handleSaveSchedule = (item: TeachingScheduleItem, isEdit: boolean) => {
    const { perms, user, isClassInScope, isSubjectInScope, isOwnerOrAdmin } = resolveActiveAuth();
    if (!perms.canManageJournals) {
      notify('Akses ditolak: peran Anda tidak diizinkan mengubah jadwal mengajar.');
      return;
    }
    if (!isClassInScope(item.className) || !isSubjectInScope(item.subject)) {
      notify('Akses ditolak: kelas atau mata pelajaran jadwal di luar tanggung jawab Anda.');
      return;
    }
    const existing = (dbRef.current?.schedules || []).find((s) => s.id === item.id);
    if (existing && !isOwnerOrAdmin(existing.teacherId)) {
      notify('Akses ditolak: Anda hanya dapat mengubah slot jadwal milik Anda sendiri.');
      return;
    }
    const normalizedItem: TeachingScheduleItem = {
      ...item,
      teacherId: existing?.teacherId || item.teacherId || user?.id,
    };
    const nextDb = updateDatabase((prev) => {
      const list = prev.schedules || [];
      const exists = list.some((s) => s.id === normalizedItem.id);
      const schedules = exists
        ? list.map((s) => (s.id === normalizedItem.id ? normalizedItem : s))
        : [...list, normalizedItem];
      return { ...prev, schedules };
    });
    if (isCloudActive) {
      trackRemoteSave(fsSaveSchedule(normalizedItem), 'Gagal menyimpan jadwal ke Firebase');
    } else if (isServerActive) {
      trackRemoteSave(
        apiSaveSchedules(nextDb.schedules || []),
        'Gagal menyimpan jadwal ke server'
      );
    }
    notify(isEdit ? 'Jadwal mengajar diperbarui.' : 'Jadwal mengajar baru ditambahkan.');
  };

  const handleDeleteSchedule = (id: string) => {
    const { perms, isOwnerOrAdmin } = resolveActiveAuth();
    if (!perms.canManageJournals) {
      notify('Akses ditolak: peran Anda tidak diizinkan menghapus jadwal mengajar.');
      return;
    }
    const existing = (dbRef.current?.schedules || []).find((s) => s.id === id);
    if (!existing || !isOwnerOrAdmin(existing.teacherId)) {
      notify('Akses ditolak: Anda hanya dapat menghapus slot jadwal milik Anda sendiri.');
      return;
    }
    const nextDb = updateDatabase((prev) => ({
      ...prev,
      schedules: (prev.schedules || []).filter((s) => s.id !== id),
    }));
    if (isCloudActive) {
      trackRemoteSave(fsDeleteSchedule(id), 'Gagal menghapus jadwal di Firebase');
    } else if (isServerActive) {
      trackRemoteSave(
        apiSaveSchedules(nextDb.schedules || []),
        'Gagal menghapus jadwal di server'
      );
    }
    notify('Slot jadwal mengajar dihapus.');
  };

  const handleSaveAgenda = (item: TeacherAgendaItem, isEdit: boolean) => {
    const { perms, user, isOwnerOrAdmin } = resolveActiveAuth();
    if (!perms.canManageJournals) {
      notify('Akses ditolak: peran Anda tidak diizinkan mengubah agenda guru.');
      return;
    }
    const existing = (dbRef.current?.agendas || []).find((a) => a.id === item.id);
    if (existing && !isOwnerOrAdmin(existing.teacherId)) {
      notify('Akses ditolak: Anda hanya dapat mengubah agenda milik Anda sendiri.');
      return;
    }
    const normalizedItem: TeacherAgendaItem = {
      ...item,
      teacherId: existing?.teacherId || item.teacherId || user?.id,
    };
    const nextDb = updateDatabase((prev) => {
      const list = prev.agendas || [];
      const exists = list.some((a) => a.id === normalizedItem.id);
      const agendas = exists
        ? list.map((a) => (a.id === normalizedItem.id ? normalizedItem : a))
        : [normalizedItem, ...list];
      return { ...prev, agendas };
    });
    if (isCloudActive) {
      trackRemoteSave(fsSaveAgenda(normalizedItem), 'Gagal menyimpan agenda ke Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveAgendas(nextDb.agendas || []), 'Gagal menyimpan agenda ke server');
    }
    notify(isEdit ? 'Agenda kerja diperbarui.' : 'Agenda kerja baru ditambahkan.');
  };

  const handleDeleteAgenda = (id: string) => {
    const { perms, isOwnerOrAdmin } = resolveActiveAuth();
    if (!perms.canManageJournals) {
      notify('Akses ditolak: peran Anda tidak diizinkan menghapus agenda guru.');
      return;
    }
    const existing = (dbRef.current?.agendas || []).find((a) => a.id === id);
    if (!existing || !isOwnerOrAdmin(existing.teacherId)) {
      notify('Akses ditolak: Anda hanya dapat menghapus agenda milik Anda sendiri.');
      return;
    }
    const nextDb = updateDatabase((prev) => ({
      ...prev,
      agendas: (prev.agendas || []).filter((a) => a.id !== id),
    }));
    if (isCloudActive) {
      trackRemoteSave(fsDeleteAgenda(id), 'Gagal menghapus agenda di Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveAgendas(nextDb.agendas || []), 'Gagal menghapus agenda di server');
    }
    notify('Catatan agenda dihapus.');
  };

  const handleCreateJournalFromSchedule = (slot: TeachingScheduleItem) => {
    const { perms } = resolveActiveAuth();
    if (!perms.canManageJournals || !perms.allowedMenus.includes('jurnal')) {
      notify('Akses ditolak: peran Anda tidak diizinkan mencatat jurnal mengajar.');
      return;
    }
    setDraftJournal(null);
    setScheduleJournalPreset({
      date: getTodayIso(),
      period: slot.period,
      className: slot.className,
      subject: slot.subject,
    });
    setActiveMenu('jurnal');
    notify(`Siap mengisi jurnal ${slot.className} — ${slot.subject} (Jam ${slot.period}).`);
  };

  // Student handlers
  const handleAddOrUpdateStudent = (student: Student, isEdit: boolean) => {
    const { perms, isClassInScope } = resolveActiveAuth();
    if (!perms.canManageStudents) {
      notify('Akses ditolak: peran Anda hanya memiliki akses lihat untuk data siswa.');
      return;
    }
    if (!isClassInScope(student.className)) {
      notify('Akses ditolak: kelas siswa berada di luar tanggung jawab Anda.');
      return;
    }
    const existing = (dbRef.current?.students || []).find((s) => s.id === student.id);
    if (existing && !isClassInScope(existing.className)) {
      notify('Akses ditolak: Anda tidak dapat mengubah data siswa dari kelas lain.');
      return;
    }
    const sanitizedStudent: Student = !perms.canPromoteStudents
      ? {
          ...student,
          status: isEdit && existing ? existing.status || 'aktif' : 'aktif',
        }
      : student;
    const nextDb = updateDatabase((prev) => {
      const students = isEdit
        ? prev.students.map((s) => (s.id === sanitizedStudent.id ? sanitizedStudent : s))
        : [...prev.students, sanitizedStudent];
      return { ...prev, students };
    });
    if (isEdit && selectedStudentModal?.id === sanitizedStudent.id) {
      setSelectedStudentModal(sanitizedStudent);
    }
    if (isCloudActive) {
      trackRemoteSave(fsSaveStudent(sanitizedStudent), 'Gagal menyimpan siswa ke Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveStudents(nextDb.students), 'Gagal menyimpan siswa ke server');
    }
    notify(
      isEdit
        ? `Data siswa ${sanitizedStudent.name} diperbarui.`
        : `Siswa ${sanitizedStudent.name} ditambahkan.`
    );
  };

  const handlePromoteStudents = (updatedStudents: Student[], summaryMsg: string) => {
    const { perms, isClassInScope } = resolveActiveAuth();
    if (!perms.canPromoteStudents) {
      notify('Akses ditolak: kenaikan kelas & mutasi hanya dapat dilakukan oleh Wali Kelas, Staff TU, atau Admin.');
      return;
    }
    const existingMap = new Map((dbRef.current?.students || []).map((s) => [s.id, s]));
    const permittedUpdates = updatedStudents.filter((s) => {
      const cur = existingMap.get(s.id);
      return cur ? isClassInScope(cur.className) : false;
    });
    if (permittedUpdates.length === 0) {
      notify('Akses ditolak: tidak ada siswa dalam kelas binaan Anda untuk dimutasi.');
      return;
    }
    const updatedMap = new Map(permittedUpdates.map((s) => [s.id, s]));
    const nextDb = updateDatabase((prev) => ({
      ...prev,
      students: prev.students.map((s) => updatedMap.get(s.id) || s),
    }));
    if (isCloudActive) {
      trackRemoteSave(fsSaveStudentsBatch(permittedUpdates), 'Gagal menyimpan mutasi ke Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveStudents(nextDb.students), 'Gagal menyimpan mutasi ke server');
    }
    notify(summaryMsg);
  };

  const handleDeleteStudent = (id: string) => {
    const { perms, isClassInScope } = resolveActiveAuth();
    if (!perms.canManageStudents) {
      notify('Akses ditolak: peran Anda tidak diizinkan menghapus data siswa.');
      return;
    }
    const target = (dbRef.current?.students || []).find((s) => s.id === id);
    if (!target || !isClassInScope(target.className)) {
      notify('Akses ditolak: siswa berada di luar kelas tanggung jawab Anda.');
      return;
    }
    const gradeIds = (dbRef.current?.grades || [])
      .filter((g) => g.studentId === id)
      .map((g) => g.id);
    const nextDb = updateDatabase((prev) => ({
      ...prev,
      students: prev.students.filter((s) => s.id !== id),
      grades: prev.grades.filter((g) => g.studentId !== id),
    }));
    if (selectedStudentModal?.id === id) setSelectedStudentModal(null);
    if (studentFormModal?.student?.id === id) setStudentFormModal(null);
    if (isCloudActive) {
      trackRemoteSave(fsDeleteStudents([id], gradeIds), 'Gagal menghapus siswa di Firebase');
    } else if (isServerActive) {
      trackRemoteSave(
        Promise.all([apiSaveStudents(nextDb.students), apiSaveGrades(nextDb.grades)]),
        'Gagal menghapus siswa di server'
      );
    }
    notify('Data siswa dihapus.');
  };

  const handleDeleteStudentsBulk = (ids: string[]) => {
    const { perms, isClassInScope } = resolveActiveAuth();
    if (!perms.canManageStudents) {
      notify('Akses ditolak: peran Anda tidak diizinkan menghapus data siswa.');
      return;
    }
    const currentStudents = dbRef.current?.students || [];
    const allowedIds = ids.filter((id) => {
      const target = currentStudents.find((s) => s.id === id);
      return target ? isClassInScope(target.className) : false;
    });
    if (allowedIds.length === 0) {
      notify('Akses ditolak: tidak ada siswa dalam kelas tanggung jawab Anda.');
      return;
    }
    const delSet = new Set(allowedIds);
    const gradeIds = (dbRef.current?.grades || [])
      .filter((g) => delSet.has(g.studentId))
      .map((g) => g.id);
    const nextDb = updateDatabase((prev) => ({
      ...prev,
      students: prev.students.filter((s) => !delSet.has(s.id)),
      grades: prev.grades.filter((g) => !delSet.has(g.studentId)),
    }));
    if (selectedStudentModal && delSet.has(selectedStudentModal.id)) setSelectedStudentModal(null);
    if (studentFormModal?.student && delSet.has(studentFormModal.student.id)) {
      setStudentFormModal(null);
    }
    if (isCloudActive) {
      trackRemoteSave(fsDeleteStudents(allowedIds, gradeIds), 'Gagal menghapus siswa di Firebase');
    } else if (isServerActive) {
      trackRemoteSave(
        Promise.all([apiSaveStudents(nextDb.students), apiSaveGrades(nextDb.grades)]),
        'Gagal menghapus siswa di server'
      );
    }
    notify(`${allowedIds.length} data siswa berhasil dihapus.`);
  };

  const handleImportStudents = (newStudents: Student[]) => {
    const { role, perms, isClassInScope } = resolveActiveAuth();
    if (!perms.canManageStudents) {
      notify('Akses ditolak: peran Anda tidak diizinkan mengimpor data siswa.');
      return;
    }
    const currentStudents = db?.students ?? [];
    const existingNis = new Set(currentStudents.map((s) => s.nis.trim().toLowerCase()));
    let addedCount = 0;
    let skippedCount = 0;
    const toAdd: Student[] = [];

    newStudents.forEach((st) => {
      if (!isClassInScope(st.className)) {
        skippedCount++;
        return;
      }
      const normNis = st.nis.trim().toLowerCase();
      if (!existingNis.has(normNis)) {
        existingNis.add(normNis);
        toAdd.push(!perms.canPromoteStudents ? { ...st, status: 'aktif' } : st);
        addedCount++;
      } else {
        skippedCount++;
      }
    });

    if (toAdd.length > 0) {
      let nextSettingsToSync: SystemSettings | null = null;
      const nextDb = updateDatabase((prev) => {
        let updatedSettings = prev.settings;
        if (role === 'admin') {
          const extraClasses = new Set(prev.settings.classes);
          toAdd.forEach((st) => {
            if (st.className) extraClasses.add(st.className);
          });
          updatedSettings = {
            ...prev.settings,
            classes: Array.from(extraClasses),
          };
          if (updatedSettings.classes.length !== prev.settings.classes.length) {
            nextSettingsToSync = updatedSettings;
          }
        }
        return {
          ...prev,
          students: [...prev.students, ...toAdd],
          settings: updatedSettings,
        };
      });
      if (isCloudActive) {
        trackRemoteSave(
          Promise.all([
            fsSaveStudentsBatch(toAdd),
            nextSettingsToSync && role === 'admin'
              ? fsSaveSettings(nextSettingsToSync)
              : Promise.resolve(),
          ]),
          'Gagal menyinkronkan impor siswa ke Firebase'
        );
      } else if (isServerActive) {
        trackRemoteSave(
          Promise.all([
            apiSaveStudents(nextDb.students),
            nextSettingsToSync && role === 'admin'
              ? apiSaveSettings(nextSettingsToSync)
              : Promise.resolve(),
          ]),
          'Gagal menyimpan impor siswa ke server'
        );
      }
    }

    notify(
      skippedCount > 0
        ? `Impor selesai: ${addedCount} siswa ditambahkan, ${skippedCount} baris dilewati (NIS sudah ada / kelas di luar akses).`
        : `Impor selesai: ${addedCount} siswa baru ditambahkan.`
    );
  };

  // Settings & Users handlers
  const handleUpdateSettings = async (nextSettings: SystemSettings): Promise<boolean> => {
    const { role, perms } = resolveActiveAuth();
    if (role !== 'admin' || !perms.canAccessSettings) {
      notify('Akses ditolak: hanya Admin Sistem yang dapat mengubah pengaturan.');
      return false;
    }
    const base = dbRef.current ?? db ?? createSeedDatabase();
    const nextDb: PortalDatabase = {
      ...base,
      lastModifiedAt: new Date().toISOString(),
      settings: nextSettings,
    };
    dbRef.current = nextDb;
    setDb(nextDb);
    await saveDatabase(nextDb);
    void saveLocalSafetyBackup(nextDb);

    if (isCloudActive) {
      const savePromise = fsSaveSettings(nextSettings);
      pendingCloudSaveRef.current = savePromise;
      try {
        await savePromise;
        return true;
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Gagal menyinkronkan pengaturan ke Firebase Firestore.';
        notify(`Gagal menyimpan ke Firebase: ${msg}`);
        return false;
      } finally {
        if (pendingCloudSaveRef.current === savePromise) {
          pendingCloudSaveRef.current = null;
        }
      }
    }

    if (isServerActive) {
      const savePromise = apiSaveSettings(nextSettings);
      pendingCloudSaveRef.current = savePromise;
      try {
        const savedSettings = await savePromise;
        const confirmedDb: PortalDatabase = {
          ...(dbRef.current ?? nextDb),
          settings: savedSettings,
        };
        dbRef.current = confirmedDb;
        setDb(confirmedDb);
        await saveDatabase(confirmedDb);
        return true;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Gagal menyimpan pengaturan ke server backend.';
        notify(`Gagal menyimpan ke server: ${msg}`);
        return false;
      } finally {
        if (pendingCloudSaveRef.current === savePromise) {
          pendingCloudSaveRef.current = null;
        }
      }
    }
    return true;
  };

  const handleUpdateUsers = (nextUsers: AppUser[]) => {
    const { role } = resolveActiveAuth();
    if (role !== 'admin') {
      notify('Akses ditolak: hanya Admin Sistem yang dapat mengelola data guru & pengguna.');
      return;
    }
    const prevUsers = dbRef.current?.users ?? [];
    const sanitizedLocalUsers = nextUsers.map((u) => ({ ...u, password: '' }));
    let nextSettingsForSync: SystemSettings | null = null;

    updateDatabase((prev) => {
      const matchedTeacher = sanitizedLocalUsers.find(
        (u) =>
          u.id === 'usr-guru-1' ||
          u.email.toLowerCase() === prev.settings.teacherProfile.email.toLowerCase()
      );
      const updatedSettings = matchedTeacher
        ? {
            ...prev.settings,
            teacherProfile: {
              ...prev.settings.teacherProfile,
              name: matchedTeacher.name,
              nip: matchedTeacher.nip,
              school: matchedTeacher.school,
              email: matchedTeacher.email,
              password: '',
              gender: matchedTeacher.gender,
              photoDataUrl: matchedTeacher.photoDataUrl,
              assignedClasses: matchedTeacher.assignedClasses,
              assignedSubjects: matchedTeacher.assignedSubjects,
              signatureDataUrl: matchedTeacher.signatureDataUrl,
              signatureSize: matchedTeacher.signatureSize,
              signatureOffsetX: matchedTeacher.signatureOffsetX,
              signatureOffsetY: matchedTeacher.signatureOffsetY,
            },
          }
        : prev.settings;
      if (matchedTeacher) nextSettingsForSync = updatedSettings;
      return {
        ...prev,
        users: sanitizedLocalUsers,
        settings: updatedSettings,
      };
    });

    if (isCloudActive) {
      trackRemoteSave(
        Promise.all([
          fsSyncUsersAdmin(prevUsers, sanitizedLocalUsers),
          nextSettingsForSync && session?.role === 'admin'
            ? fsSaveSettings(nextSettingsForSync)
            : Promise.resolve(),
        ]),
        'Gagal menyimpan daftar pengguna ke Firebase'
      );
    } else if (isServerActive) {
      const serverPromise = (async () => {
        const savedUsers = await apiSaveUsers(nextUsers);
        if (nextSettingsForSync && session?.role === 'admin') {
          await apiSaveSettings(nextSettingsForSync);
        }
        updateDatabase((prev) => ({
          ...prev,
          users: savedUsers,
        }));
      })();
      trackRemoteSave(serverPromise, 'Gagal menyimpan daftar pengguna ke server');
    }
  };

  const handleResetDemoData = async () => {
    const { role } = resolveActiveAuth();
    if (role !== 'admin') {
      notify('Akses ditolak: hanya Admin Sistem yang dapat mereset seluruh data.');
      return;
    }
    if (isServerActive) {
      try {
        const serverFresh = await apiResetDemoWorkspace();
        dbRef.current = serverFresh;
        setDb(serverFresh);
        await saveDatabase(serverFresh);
        notify('Seluruh data server berhasil direset ke data demo (akun Admin tetap dipertahankan).');
      } catch (err) {
        notify(
          `Gagal mereset data demo di server: ${
            err instanceof Error ? err.message : 'Kesalahan server.'
          }`
        );
      }
      return;
    }

    const fresh = createSeedDatabase();
    if (isCloudActive && session?.email) {
      const hasCurrentAdmin = (fresh.users || []).some(
        (u) => u.email.toLowerCase() === session.email.toLowerCase()
      );
      if (!hasCurrentAdmin) {
        fresh.users = [
          {
            id: session.userId || 'usr-admin-owner',
            name: auth.currentUser?.displayName || 'Admin Utama Sekolah',
            nip: '-',
            email: session.email,
            password: '',
            role: 'admin',
            school: fresh.settings.teacherProfile.school,
            gender: 'L',
            photoDataUrl: auth.currentUser?.photoURL || '',
            assignedClasses: [],
            assignedSubjects: [],
            active: true,
            createdAt: new Date().toISOString(),
          },
          ...(fresh.users || []),
        ];
      }
      void fsReplaceEntireDatabase(fresh);
    }
    dbRef.current = fresh;
    setDb(fresh);
    void saveDatabase(fresh);
    notify('Seluruh data berhasil direset ke data demo standar.');
  };

  if (!isReady || !db) {
    return (
      <div className="min-h-screen bg-[linear-gradient(155deg,#f3f7ff_0%,#e6effc_52%,#dce7f8_100%)] flex flex-col items-center justify-center gap-4 text-slate-800 px-4">
        <div className="w-16 h-16 rounded-2xl bg-white/85 backdrop-blur-md shadow-[8px_10px_24px_rgba(133,158,201,0.35),-6px_-6px_16px_rgba(255,255,255,0.95)] border border-white flex items-center justify-center">
          <div className="w-7 h-7 rounded-full border-[3px] border-blue-600/25 border-t-blue-600 animate-spin" />
        </div>
        <p className="text-sm font-semibold tracking-tight text-slate-700">
          Memuat Portal E-Guru v10.3...
        </p>
      </div>
    );
  }

  const webBrand = normalizeWebBrand(db.settings);
  const usersList = db.users && db.users.length > 0 ? db.users : createSeedDatabase().users ?? [];

  if (!session?.isAuthenticated) {
    return (
      <LoginView
        defaultEmail={db.settings.teacherProfile.email}
        defaultAcademicYear={db.settings.academicYear}
        defaultSemester={db.settings.semester}
        academicYears={db.settings.academicYears}
        webBrand={webBrand}
        externalError={cloudAuthError}
        onGoogleLogin={handleGoogleLogin}
        onServerLogin={handleServerLogin}
        onClaimAdmin={handleClaimAdmin}
      />
    );
  }

  const activeUser = usersList.find(
    (u) =>
      (session.userId && u.id === session.userId) ||
      u.email.toLowerCase() === session.email.toLowerCase()
  );
  const currentUserRole: UserRole = activeUser?.role || session.role || 'guru';
  const rolePerms = ROLE_PERMISSIONS[currentUserRole];
  const currentUserName = activeUser?.name || db.settings.teacherProfile.name;
  const currentUserNip = activeUser?.nip || db.settings.teacherProfile.nip;
  const currentUserGender: 'L' | 'P' =
    activeUser?.gender || db.settings.teacherProfile.gender || 'P';
  const currentUserPhoto =
    activeUser?.photoDataUrl ||
    (currentUserRole === 'guru' ? db.settings.teacherProfile.photoDataUrl : undefined);

  const scoped = getScopedPortalData(db, activeUser, currentUserRole, periodScope);
  const effectiveScopedSettings: SystemSettings =
    activeUser && (currentUserRole === 'guru' || currentUserRole === 'wali_kelas')
      ? {
          ...scoped.scopedSettings,
          teacherProfile: {
            ...scoped.scopedSettings.teacherProfile,
            name: activeUser.name,
            nip: activeUser.nip,
            school: activeUser.school,
            email: activeUser.email,
            password: activeUser.password,
            gender: activeUser.gender,
            photoDataUrl: activeUser.photoDataUrl,
            assignedClasses: activeUser.assignedClasses,
            assignedSubjects: activeUser.assignedSubjects,
            signatureDataUrl: activeUser.signatureDataUrl,
            signatureSize: activeUser.signatureSize,
            signatureOffsetX: activeUser.signatureOffsetX,
            signatureOffsetY: activeUser.signatureOffsetY,
          },
        }
      : scoped.scopedSettings;

  const handleSaveTeacherProfile = (updated: { teacherProfile: SystemSettings['teacherProfile'] }) => {
    const isTeachingRole = currentUserRole === 'guru' || currentUserRole === 'wali_kelas';
    const allowPersonalTeacherSig = isTeachingRole || currentUserRole === 'admin';
    const tp = updated.teacherProfile;
    const sanitizedTp = {
      ...tp,
      password: '',
      assignedClasses: isTeachingRole ? tp.assignedClasses ?? [] : [],
      assignedSubjects: isTeachingRole ? tp.assignedSubjects ?? [] : [],
      ...(allowPersonalTeacherSig
        ? {}
        : {
            signatureDataUrl: undefined,
            signatureSize: undefined,
            signatureOffsetX: undefined,
            signatureOffsetY: undefined,
          }),
    };
    const prevUsersSnapshot = dbRef.current?.users ?? [];
    let resolvedNextUsers: AppUser[] = prevUsersSnapshot;
    let resolvedNextSettings: SystemSettings | null = null;
    let updatedSelfUser: AppUser | null = null;

    updateDatabase((prev) => {
      const prevUsers = prev.users ?? [];
      const targetIdx = activeUser
        ? prevUsers.findIndex((u) => u.id === activeUser.id)
        : prevUsers.findIndex((u) => u.email.toLowerCase() === session.email.toLowerCase());

      const nextUsers =
        targetIdx >= 0
          ? prevUsers.map((u, idx) => {
              if (idx !== targetIdx) return u;
              const nextUser: AppUser = {
                ...u,
                name: sanitizedTp.name,
                nip: sanitizedTp.nip,
                school: sanitizedTp.school,
                email: currentUserRole !== 'admin' ? u.email : sanitizedTp.email,
                password: '',
                gender: sanitizedTp.gender ?? u.gender,
                photoDataUrl: sanitizedTp.photoDataUrl,
                assignedClasses: isTeachingRole ? sanitizedTp.assignedClasses ?? [] : [],
                assignedSubjects: isTeachingRole ? sanitizedTp.assignedSubjects ?? [] : [],
                signatureDataUrl: allowPersonalTeacherSig
                  ? sanitizedTp.signatureDataUrl ?? u.signatureDataUrl
                  : u.signatureDataUrl,
                signatureSize: allowPersonalTeacherSig
                  ? sanitizedTp.signatureSize ?? u.signatureSize
                  : u.signatureSize,
                signatureOffsetX: allowPersonalTeacherSig
                  ? sanitizedTp.signatureOffsetX ?? u.signatureOffsetX
                  : u.signatureOffsetX,
                signatureOffsetY: allowPersonalTeacherSig
                  ? sanitizedTp.signatureOffsetY ?? u.signatureOffsetY
                  : u.signatureOffsetY,
              };
              updatedSelfUser = nextUser;
              return nextUser;
            })
          : prevUsers;

      resolvedNextUsers = nextUsers;

      const shouldSyncLegacyTeacherProfile =
        currentUserRole === 'admin' &&
        (!activeUser ||
          activeUser.id === 'usr-guru-1' ||
          activeUser.email.toLowerCase() === prev.settings.teacherProfile.email.toLowerCase());

      const nextSettings = {
        ...prev.settings,
        ...(shouldSyncLegacyTeacherProfile ? { teacherProfile: sanitizedTp } : {}),
      };
      if (shouldSyncLegacyTeacherProfile) resolvedNextSettings = nextSettings;

      return {
        ...prev,
        users: nextUsers,
        settings: nextSettings,
      };
    });

    if (isCloudActive) {
      if (currentUserRole === 'admin') {
        trackRemoteSave(
          Promise.all([
            fsSyncUsersAdmin(prevUsersSnapshot, resolvedNextUsers),
            resolvedNextSettings ? fsSaveSettings(resolvedNextSettings) : Promise.resolve(),
          ]),
          'Gagal menyimpan profil ke Firebase'
        );
      } else if (updatedSelfUser) {
        trackRemoteSave(
          fsUpdateSelfProfile((updatedSelfUser as AppUser).id, updatedSelfUser),
          'Gagal menyimpan profil ke Firebase'
        );
      }
    } else if (isServerActive) {
      const serverPromise = (async () => {
        const res = await apiSaveOwnProfile({ ...sanitizedTp, password: tp.password });
        updateDatabase((prev) => ({
          ...prev,
          users: res.user
            ? prev.users?.map((u) => (u.id === res.user!.id ? res.user! : u))
            : prev.users,
          settings: res.settings || prev.settings,
        }));
      })();
      trackRemoteSave(serverPromise, 'Gagal menyimpan profil ke server');
    }

    if (
      currentUserRole === 'admin' &&
      tp.email.toLowerCase() !== session.email.toLowerCase() &&
      session.authProvider !== 'google'
    ) {
      const nextSession: SessionState = {
        ...session,
        email: tp.email,
        userId: activeUser?.id || session.userId,
      };
      setSession(nextSession);
    }

    notify('Profil & tanggung jawab mengajar berhasil diperbarui.');
  };

  const activeThemeId: ThemeId = localThemeOverride || db.settings.themeId || 'neomorphic';

  return (
    <div className="eguru-app-shell min-h-screen bg-[#ebf2fc] text-slate-900 overflow-x-clip">
      {/* Subtle Ambient 3D Depth Orbs (Non-printing decorative backdrop) */}
      <div
        aria-hidden="true"
        className="no-print pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div
          className="absolute -top-28 -right-24 w-[420px] h-[420px] rounded-full opacity-55 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(59, 130, 246, 0.22) 0%, rgba(99, 102, 241, 0.08) 55%, transparent 75%)',
          }}
        />
        <div
          className="absolute -bottom-32 left-20 lg:left-72 w-[380px] h-[380px] rounded-full opacity-50 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(37, 99, 235, 0.18) 0%, rgba(14, 165, 233, 0.06) 55%, transparent 75%)',
          }}
        />
      </div>

      <Sidebar
        activeMenu={activeMenu}
        onSelectMenu={setActiveMenu}
        teacherProfile={effectiveScopedSettings.teacherProfile}
        webBrand={webBrand}
        currentUserName={currentUserName}
        currentUserNip={currentUserNip}
        currentUserRole={currentUserRole}
        currentUserGender={currentUserGender}
        currentUserPhoto={currentUserPhoto}
        periodScope={periodScope}
        onTogglePeriodScope={() =>
          setPeriodScope((prev) => (prev === 'active' ? 'all' : 'active'))
        }
        onOpenProfileModal={() => setShowTeacherProfileModal(true)}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* When StudentDetailModal is open, mark workspace no-print so Cetak Individu prints ONLY the student sheet */}
      <div
        className={`relative z-10 lg:pl-64 flex flex-col min-h-screen min-w-0 ${
          selectedStudentModal ? 'no-print' : ''
        }`}
      >
        <Topbar
          activeMenu={activeMenu}
          settings={{ ...effectiveScopedSettings, themeId: activeThemeId }}
          periodScope={periodScope}
          onTogglePeriodScope={() =>
            setPeriodScope((prev) => (prev === 'active' ? 'all' : 'active'))
          }
          onChangeTheme={(themeId: ThemeId) => {
            try {
              localStorage.setItem(LS_LOCAL_THEME_KEY, themeId);
            } catch {
              // ignore
            }
            setLocalThemeOverride(themeId);
            if (currentUserRole === 'admin') {
              const latestSettings = dbRef.current?.settings ?? db.settings;
              const nextSettings = { ...latestSettings, themeId };
              updateDatabase((prev) => ({
                ...prev,
                settings: { ...prev.settings, themeId },
              }));
              if (isCloudActive) {
                trackRemoteSave(fsSaveSettings(nextSettings), 'Gagal menyimpan tema ke Firebase');
              } else if (isServerActive) {
                trackRemoteSave(apiSaveSettings(nextSettings), 'Gagal menyimpan tema ke server');
              }
            }
            const preset = THEME_PRESETS.find((t) => t.id === themeId);
            notify(`Tema portal diganti ke "${preset?.name || themeId}".`);
          }}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onManualSync={handleManualSync}
          isSyncing={isSyncing}
        />

        <main className="flex-1 min-w-0 p-3.5 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {activeMenu === 'dashboard' && (
            <DashboardView
              students={scoped.scopedActiveStudents}
              journals={scoped.scopedJournals}
              grades={scoped.scopedGrades}
              settings={effectiveScopedSettings}
              currentUserName={currentUserName}
              currentUserRole={currentUserRole}
              currentUserGender={currentUserGender}
              currentUserPhoto={currentUserPhoto}
              scopeSummary={scoped.scopeSummaryText}
              onNavigate={setActiveMenu}
              onOpenProfileModal={() => setShowTeacherProfileModal(true)}
              onEditJournal={(entry) => {
                if (!rolePerms.canManageJournals || !rolePerms.allowedMenus.includes('jurnal')) return;
                setDraftJournal({ mode: 'edit', entry });
                setActiveMenu('jurnal');
              }}
              onDuplicateJournal={(entry) => {
                if (!rolePerms.canManageJournals || !rolePerms.allowedMenus.includes('jurnal')) return;
                setDraftJournal({ mode: 'duplicate', entry });
                setActiveMenu('jurnal');
              }}
              onViewStudent={setSelectedStudentModal}
              onViewClass={setSelectedClassModal}
              onViewSubject={setSelectedSubjectModal}
            />
          )}

          {activeMenu === 'jadwal' && rolePerms.allowedMenus.includes('jadwal') && (
            <ScheduleAgendaView
              schedules={(db.schedules || []).filter((s) => {
                if (currentUserRole === 'admin' || currentUserRole === 'kepala_sekolah') return true;
                const classOk = !scoped.hasClassRestriction || scoped.allowedClasses.includes(s.className);
                const subjectOk = !scoped.hasSubjectRestriction || scoped.allowedSubjects.includes(s.subject);
                const ownerOrShared = !s.teacherId || s.teacherId === activeUser?.id;
                return classOk && subjectOk && ownerOrShared;
              })}
              agendas={(db.agendas || []).filter((a) => {
                if (currentUserRole === 'admin' || currentUserRole === 'kepala_sekolah') return true;
                return !a.teacherId || a.teacherId === activeUser?.id;
              })}
              settings={effectiveScopedSettings}
              currentUserId={activeUser?.id}
              currentUserName={currentUserName}
              readOnly={!rolePerms.canManageJournals}
              canManageAll={currentUserRole === 'admin'}
              onSaveSchedule={handleSaveSchedule}
              onDeleteSchedule={handleDeleteSchedule}
              onCreateJournalFromSchedule={handleCreateJournalFromSchedule}
              onSaveAgenda={handleSaveAgenda}
              onDeleteAgenda={handleDeleteAgenda}
              onNotify={notify}
            />
          )}

          {activeMenu === 'jurnal' && rolePerms.allowedMenus.includes('jurnal') && (
            <JournalAttendanceView
              students={scoped.scopedActiveStudents}
              journals={scoped.scopedJournals}
              settings={effectiveScopedSettings}
              currentUserId={activeUser?.id}
              currentUserName={currentUserName}
              readOnly={!rolePerms.canManageJournals}
              draftJournal={draftJournal}
              presetDraft={scheduleJournalPreset}
              onConsumePresetDraft={() => setScheduleJournalPreset(null)}
              onClearDraft={() => setDraftJournal(null)}
              onSaveJournal={handleSaveJournal}
              onImportJournals={handleImportJournals}
              onDeleteJournals={handleDeleteJournals}
              onBulkUpdateLedger={handleBulkUpdateLedger}
              onViewStudent={setSelectedStudentModal}
              onViewClass={setSelectedClassModal}
              onViewSubject={setSelectedSubjectModal}
              onNotify={notify}
            />
          )}

          {activeMenu === 'nilai' && rolePerms.allowedMenus.includes('nilai') && (
            <GradesMatrixView
              students={scoped.scopedActiveStudents}
              grades={scoped.scopedGrades}
              settings={effectiveScopedSettings}
              currentUserId={activeUser?.id}
              currentUserName={currentUserName}
              readOnly={!rolePerms.canManageGrades}
              onSaveGradesBatch={handleSaveGradesBatch}
              onDeleteGrades={handleDeleteGrades}
              onViewStudent={setSelectedStudentModal}
              onViewClass={setSelectedClassModal}
              onViewSubject={setSelectedSubjectModal}
              onNotify={notify}
            />
          )}

          {activeMenu === 'siswa' && rolePerms.allowedMenus.includes('siswa') && (
            <StudentsView
              students={scoped.scopedStudents}
              settings={effectiveScopedSettings}
              canManageStudents={rolePerms.canManageStudents}
              canPromoteStudents={rolePerms.canPromoteStudents}
              onDeleteStudent={handleDeleteStudent}
              onDeleteStudentsBulk={handleDeleteStudentsBulk}
              onImportStudents={handleImportStudents}
              onViewStudent={setSelectedStudentModal}
              onViewClass={setSelectedClassModal}
              onCreateStudentModal={() => setStudentFormModal({ mode: 'create', student: null })}
              onEditStudentModal={(st) => setStudentFormModal({ mode: 'edit', student: st })}
              onOpenPromotionModal={(preselectedIds) =>
                setPromotionModal({ open: true, preselectedIds })
              }
              onNotify={notify}
            />
          )}

          {activeMenu === 'pegawai' && rolePerms.allowedMenus.includes('pegawai') && (
            <StaffTeachersView
              users={usersList}
              journals={db.journals}
              grades={db.grades}
              allClasses={db.settings.classes}
              allSubjects={db.settings.subjects}
              defaultSchool={db.settings.teacherProfile.school}
              currentUserEmail={session.email}
              isCloudMode={isCloudActive}
              isServerMode={isServerActive}
              onUpdateUsers={handleUpdateUsers}
              onPrintTeacherHistory={(teacherId) => {
                setReportPreset({ reportType: 'aktivitas_guru', teacherId });
                setActiveMenu('laporan');
              }}
              onNotify={notify}
            />
          )}

          {activeMenu === 'laporan' && rolePerms.allowedMenus.includes('laporan') && (
            <PrintReportsView
              students={scoped.scopedActiveStudents}
              journals={scoped.scopedJournals}
              grades={scoped.scopedGrades}
              users={usersList}
              activeUser={activeUser}
              currentUserRole={currentUserRole}
              initialReportType={reportPreset?.reportType}
              initialTeacherFilter={reportPreset?.teacherId}
              onConsumePreset={() => setReportPreset(null)}
              settings={effectiveScopedSettings}
              onNotify={notify}
            />
          )}

          {activeMenu === 'profil' && rolePerms.allowedMenus.includes('profil') && (
            <TeacherProfileModal
              variant="page"
              isOpen={true}
              isCloudMode={isCloudActive}
              isServerMode={isServerActive}
              settings={db.settings}
              activeUser={activeUser}
              currentUserRole={currentUserRole}
              onSaveProfile={handleSaveTeacherProfile}
              onResetDemoData={handleResetDemoData}
            />
          )}

          {activeMenu === 'pengguna' && rolePerms.allowedMenus.includes('pengguna') && (
            <AdminUsersModal
              variant="page"
              isOpen={true}
              isCloudMode={isCloudActive}
              isServerMode={isServerActive}
              users={usersList}
              allClasses={db.settings.classes}
              allSubjects={db.settings.subjects}
              defaultSchool={db.settings.teacherProfile.school}
              currentUserRole={currentUserRole}
              currentUserEmail={session.email}
              onUpdateUsers={handleUpdateUsers}
              onServerUnlockAdmin={isServerActive ? handleServerUnlockAdmin : undefined}
              onNotify={notify}
            />
          )}

          {activeMenu === 'pengaturan' && rolePerms.canAccessSettings && (
            <SettingsView
              database={db}
              settings={db.settings}
              isServerActive={isServerActive}
              onUpdateSettings={handleUpdateSettings}
              onRestoreDatabase={(restored) => {
                if (currentUserRole !== 'admin') {
                  notify('Akses ditolak: hanya Admin Sistem yang dapat memulihkan cadangan.');
                  return;
                }
                if (dbRef.current) {
                  void saveLocalSafetyBackup(dbRef.current);
                }
                const stampedRestored: PortalDatabase = {
                  ...restored,
                  lastModifiedAt: new Date().toISOString(),
                };
                dbRef.current = stampedRestored;
                setDb(stampedRestored);
                void saveDatabase(stampedRestored);
                if (isCloudActive) {
                  trackRemoteSave(
                    fsReplaceEntireDatabase(stampedRestored),
                    'Gagal memulihkan cadangan ke Firebase'
                  );
                } else if (isServerActive) {
                  trackRemoteSave(
                    apiRestoreWorkspace(stampedRestored).then((serverRestored) => {
                      dbRef.current = serverRestored;
                      setDb(serverRestored);
                      void saveDatabase(serverRestored);
                    }),
                    'Gagal memulihkan cadangan ke server'
                  );
                }
              }}
              onViewClass={setSelectedClassModal}
              onViewSubject={setSelectedSubjectModal}
              onNotify={notify}
            />
          )}
        </main>
      </div>

      {/* Frosted Neomorphic Toast Notification */}
      {toast && (
        <div
          role="status"
          className="no-print fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-5 sm:right-5 z-50 sm:max-w-sm bg-[#0b1630]/92 backdrop-blur-xl text-white px-4 py-3 rounded-2xl shadow-[0_18px_40px_-8px_rgba(15,23,42,0.55),0_0_24px_rgba(59,130,246,0.28)] border border-blue-400/25 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
            <p className="text-xs font-medium leading-snug">{toast}</p>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-300 hover:text-white shrink-0 min-w-[36px] min-h-[36px] -mr-1.5 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Tutup notifikasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <StudentDetailModal
        student={selectedStudentModal}
        journals={scoped.scopedJournals}
        grades={scoped.scopedGrades}
        settings={effectiveScopedSettings}
        activeUser={activeUser}
        canEditStudent={rolePerms.canManageStudents}
        onEditStudent={(st) => {
          if (!rolePerms.canManageStudents) return;
          setSelectedStudentModal(null);
          setStudentFormModal({ mode: 'edit', student: st });
        }}
        onViewClass={setSelectedClassModal}
        onViewSubject={setSelectedSubjectModal}
        onNotify={notify}
        onClose={() => setSelectedStudentModal(null)}
      />

      {rolePerms.canManageStudents && (
        <StudentEditModal
          isOpen={Boolean(studentFormModal)}
          mode={studentFormModal?.mode || 'edit'}
          student={studentFormModal?.student || null}
          classes={scoped.allowedClasses}
          existingStudents={db.students}
          canPromoteStudents={rolePerms.canPromoteStudents}
          teacherSuggestions={Array.from(
            new Set([
              ...usersList
                .filter((u) => u.active && (u.role === 'guru' || u.role === 'wali_kelas'))
                .map((u) => u.name),
              ...db.students.map((s) => s.homeroomTeacher || '').filter(Boolean),
              ...db.students.map((s) => s.counselor || '').filter(Boolean),
            ])
          )}
          defaultEnrollmentYear={db.settings.academicYear}
          onSave={(savedStudent, isEdit) => {
            handleAddOrUpdateStudent(savedStudent, isEdit);
            setStudentFormModal(null);
          }}
          onClose={() => setStudentFormModal(null)}
        />
      )}

      {rolePerms.canPromoteStudents && (
        <StudentPromotionModal
          isOpen={promotionModal.open}
          students={scoped.scopedStudents}
          classes={db.settings.classes}
          academicYears={db.settings.academicYears}
          currentAcademicYear={db.settings.academicYear}
          preselectedStudentIds={promotionModal.preselectedIds}
          onApplyPromotion={handlePromoteStudents}
          onClose={() => setPromotionModal({ open: false, preselectedIds: [] })}
        />
      )}

      <ClassDetailModal
        className={selectedClassModal}
        students={scoped.scopedActiveStudents}
        journals={scoped.scopedJournals}
        grades={scoped.scopedGrades}
        settings={effectiveScopedSettings}
        currentUserRole={currentUserRole}
        onSelectStudent={setSelectedStudentModal}
        onSelectSubject={setSelectedSubjectModal}
        onNavigate={setActiveMenu}
        onClose={() => setSelectedClassModal(null)}
      />

      <SubjectDetailModal
        subject={selectedSubjectModal}
        students={scoped.scopedActiveStudents}
        journals={scoped.scopedJournals}
        grades={scoped.scopedGrades}
        settings={effectiveScopedSettings}
        currentUserRole={currentUserRole}
        onSelectClass={setSelectedClassModal}
        onSelectStudent={setSelectedStudentModal}
        onNavigate={setActiveMenu}
        onClose={() => setSelectedSubjectModal(null)}
      />

      <TeacherProfileModal
        isOpen={showTeacherProfileModal}
        isCloudMode={isCloudActive}
        isServerMode={isServerActive}
        settings={db.settings}
        activeUser={activeUser}
        currentUserRole={currentUserRole}
        onSaveProfile={handleSaveTeacherProfile}
        onResetDemoData={handleResetDemoData}
        onClose={() => setShowTeacherProfileModal(false)}
      />
    </div>
  );
}

