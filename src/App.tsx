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
import { JournalAttendanceView } from './components/JournalAttendanceView';
import { LoginView } from './components/LoginView';
import { PrintReportsView } from './components/PrintReportsView';
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
  ThemeId,
  UserRole,
} from './types';
import {
  getScopedPortalData,
  normalizeWebBrand,
  ROLE_PERMISSIONS,
  THEME_PRESETS,
  USER_ROLE_LABELS,
} from './utils/helpers';
import { auth, googleProvider } from './firebase';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  fsDeleteGrades,
  fsDeleteJournals,
  fsDeleteStudents,
  fsReplaceEntireDatabase,
  fsSaveGradesBatch,
  fsSaveJournal,
  fsSaveJournalsBatch,
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
  apiSaveGrades,
  apiSaveJournals,
  apiSaveOwnProfile,
  apiSaveSettings,
  apiSaveStudents,
  apiSaveUsers,
  setApiAuthToken,
} from './utils/apiClient';
import {
  clearSession,
  loadDatabase,
  saveDatabase,
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
    const effectiveTheme = localThemeOverride || db.settings.themeId || 'indigo';
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
      const next = updater(base);
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

  const handleGoogleLogin = async (): Promise<string | null> => {
    setCloudAuthError(null);
    setApiAuthToken(null);
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
      const authRes = await apiLoginServer(payload);
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
      setActiveMenu('dashboard');
      notify(
        `Terhubung ke server sebagai ${authRes.user.name} (${USER_ROLE_LABELS[authRes.user.role]}).`
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
      });
      let workspaceDb = await apiFetchWorkspace();
      if (
        workspaceDb.settings.academicYear !== payload.academicYear ||
        workspaceDb.settings.semester !== payload.semester
      ) {
        const updatedSettings: SystemSettings = {
          ...workspaceDb.settings,
          academicYear: payload.academicYear,
          semester: payload.semester,
        };
        const savedSettings = await apiSaveSettings(updatedSettings);
        workspaceDb = { ...workspaceDb, settings: savedSettings };
      }
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
      notify(
        `Akun Admin (${authRes.user.username}) berhasil diaktifkan & terkunci aman di server.`
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
      const authRes = await apiLoginServer({ identifier, password });
      if (authRes.user.role !== 'admin') {
        return 'Akun tersebut bukan Admin Sistem.';
      }
      const workspaceDb = await apiFetchWorkspace();
      dbRef.current = workspaceDb;
      setDb(workspaceDb);
      void saveDatabase(workspaceDb);

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

  // Journal handlers
  const handleSaveJournal = (entry: JournalEntry, isEdit: boolean) => {
    const nextDb = updateDatabase((prev) => {
      const exists = prev.journals.some((j) => j.id === entry.id);
      const journals = exists
        ? prev.journals.map((j) => (j.id === entry.id ? entry : j))
        : [entry, ...prev.journals];
      return { ...prev, journals };
    });
    if (isCloudActive) {
      trackRemoteSave(fsSaveJournal(entry), 'Gagal menyimpan jurnal ke Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveJournals(nextDb.journals), 'Gagal menyimpan jurnal ke server');
    }
    notify(isEdit ? 'Jurnal dan presensi berhasil diperbarui.' : 'Jurnal dan presensi baru berhasil disimpan.');
  };

  const handleDeleteJournals = (ids: string[]) => {
    const nextDb = updateDatabase((prev) => ({
      ...prev,
      journals: prev.journals.filter((j) => !ids.includes(j.id)),
    }));
    if (isCloudActive) {
      trackRemoteSave(fsDeleteJournals(ids), 'Gagal menghapus jurnal di Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveJournals(nextDb.journals), 'Gagal menghapus jurnal di server');
    }
    notify(`${ids.length} jurnal berhasil dihapus.`);
  };

  const handleImportJournals = (entries: JournalEntry[]) => {
    let nextSettingsToSync: SystemSettings | null = null;
    const nextDb = updateDatabase((prev) => {
      const extraClasses = new Set(prev.settings.classes);
      const extraSubjects = new Set(prev.settings.subjects);
      entries.forEach((e) => {
        if (e.className) extraClasses.add(e.className);
        if (e.subject) extraSubjects.add(e.subject);
      });
      const updatedSettings: SystemSettings = {
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
      return {
        ...prev,
        journals: [...entries, ...prev.journals],
        settings: updatedSettings,
      };
    });
    if (isCloudActive) {
      trackRemoteSave(
        Promise.all([
          fsSaveJournalsBatch(entries),
          nextSettingsToSync && session?.role === 'admin'
            ? fsSaveSettings(nextSettingsToSync)
            : Promise.resolve(),
        ]),
        'Gagal menyinkronkan impor jurnal ke Firebase'
      );
    } else if (isServerActive) {
      trackRemoteSave(
        Promise.all([
          apiSaveJournals(nextDb.journals),
          nextSettingsToSync && session?.role === 'admin'
            ? apiSaveSettings(nextSettingsToSync)
            : Promise.resolve(),
        ]),
        'Gagal menyimpan impor jurnal ke server'
      );
    }
    notify(`Berhasil mengimpor ${entries.length} jurnal mengajar.`);
  };

  const handleBulkUpdateLedger = (updatedJournals: JournalEntry[]) => {
    const mapById = new Map(updatedJournals.map((j) => [j.id, j]));
    const nextDb = updateDatabase((prev) => ({
      ...prev,
      journals: prev.journals.map((j) => mapById.get(j.id) || j),
    }));
    if (isCloudActive) {
      trackRemoteSave(fsSaveJournalsBatch(updatedJournals), 'Gagal menyimpan leger ke Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveJournals(nextDb.journals), 'Gagal menyimpan leger ke server');
    }
    notify(`Perubahan leger kehadiran (${updatedJournals.length} pertemuan) berhasil disimpan.`);
  };

  // Grade handlers
  const handleSaveGradesBatch = (records: GradeRecord[]) => {
    const resolvedBatch: GradeRecord[] = [];
    const nextDb = updateDatabase((prev) => {
      const nextGrades = [...prev.grades];
      records.forEach((rec) => {
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
    notify(`Berhasil menyimpan ${records.length} data nilai siswa.`);
  };

  const handleDeleteGrades = (ids: string[]) => {
    const delSet = new Set(ids);
    const nextDb = updateDatabase((prev) => ({
      ...prev,
      grades: prev.grades.filter((g) => !delSet.has(g.id)),
    }));
    if (isCloudActive) {
      trackRemoteSave(fsDeleteGrades(ids), 'Gagal menghapus nilai di Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveGrades(nextDb.grades), 'Gagal menghapus nilai di server');
    }
    notify(`${ids.length} catatan nilai berhasil dihapus.`);
  };

  // Student handlers
  const handleAddOrUpdateStudent = (student: Student, isEdit: boolean) => {
    const nextDb = updateDatabase((prev) => {
      const students = isEdit
        ? prev.students.map((s) => (s.id === student.id ? student : s))
        : [...prev.students, student];
      return { ...prev, students };
    });
    if (isEdit && selectedStudentModal?.id === student.id) {
      setSelectedStudentModal(student);
    }
    if (isCloudActive) {
      trackRemoteSave(fsSaveStudent(student), 'Gagal menyimpan siswa ke Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveStudents(nextDb.students), 'Gagal menyimpan siswa ke server');
    }
    notify(isEdit ? `Data siswa ${student.name} diperbarui.` : `Siswa ${student.name} ditambahkan.`);
  };

  const handlePromoteStudents = (updatedStudents: Student[], summaryMsg: string) => {
    const updatedMap = new Map(updatedStudents.map((s) => [s.id, s]));
    const nextDb = updateDatabase((prev) => ({
      ...prev,
      students: prev.students.map((s) => updatedMap.get(s.id) || s),
    }));
    if (isCloudActive) {
      trackRemoteSave(fsSaveStudentsBatch(updatedStudents), 'Gagal menyimpan mutasi ke Firebase');
    } else if (isServerActive) {
      trackRemoteSave(apiSaveStudents(nextDb.students), 'Gagal menyimpan mutasi ke server');
    }
    notify(summaryMsg);
  };

  const handleDeleteStudent = (id: string) => {
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
    const delSet = new Set(ids);
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
      trackRemoteSave(fsDeleteStudents(ids, gradeIds), 'Gagal menghapus siswa di Firebase');
    } else if (isServerActive) {
      trackRemoteSave(
        Promise.all([apiSaveStudents(nextDb.students), apiSaveGrades(nextDb.grades)]),
        'Gagal menghapus siswa di server'
      );
    }
    notify(`${ids.length} data siswa berhasil dihapus.`);
  };

  const handleImportStudents = (newStudents: Student[]) => {
    const currentStudents = db?.students ?? [];
    const existingNis = new Set(currentStudents.map((s) => s.nis.trim().toLowerCase()));
    let addedCount = 0;
    let skippedCount = 0;
    const toAdd: Student[] = [];

    newStudents.forEach((st) => {
      const normNis = st.nis.trim().toLowerCase();
      if (!existingNis.has(normNis)) {
        existingNis.add(normNis);
        toAdd.push(st);
        addedCount++;
      } else {
        skippedCount++;
      }
    });

    if (toAdd.length > 0) {
      let nextSettingsToSync: SystemSettings | null = null;
      const nextDb = updateDatabase((prev) => {
        const extraClasses = new Set(prev.settings.classes);
        toAdd.forEach((st) => {
          if (st.className) extraClasses.add(st.className);
        });
        const updatedSettings: SystemSettings = {
          ...prev.settings,
          classes: Array.from(extraClasses),
        };
        if (updatedSettings.classes.length !== prev.settings.classes.length) {
          nextSettingsToSync = updatedSettings;
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
            nextSettingsToSync && session?.role === 'admin'
              ? fsSaveSettings(nextSettingsToSync)
              : Promise.resolve(),
          ]),
          'Gagal menyinkronkan impor siswa ke Firebase'
        );
      } else if (isServerActive) {
        trackRemoteSave(
          Promise.all([
            apiSaveStudents(nextDb.students),
            nextSettingsToSync && session?.role === 'admin'
              ? apiSaveSettings(nextSettingsToSync)
              : Promise.resolve(),
          ]),
          'Gagal menyimpan impor siswa ke server'
        );
      }
    }

    notify(
      skippedCount > 0
        ? `Impor selesai: ${addedCount} siswa ditambahkan, ${skippedCount} baris dilewati karena NIS sudah terdaftar.`
        : `Impor selesai: ${addedCount} siswa baru ditambahkan.`
    );
  };

  // Settings & Users handlers
  const handleUpdateSettings = async (nextSettings: SystemSettings): Promise<boolean> => {
    const base = dbRef.current ?? db ?? createSeedDatabase();
    const nextDb: PortalDatabase = {
      ...base,
      settings: nextSettings,
    };
    dbRef.current = nextDb;
    setDb(nextDb);
    await saveDatabase(nextDb);

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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-sm">
        Memuat Portal E-Guru v10.3...
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
          },
        }
      : scoped.scopedSettings;

  const handleSaveTeacherProfile = (updated: { teacherProfile: SystemSettings['teacherProfile'] }) => {
    const tp = updated.teacherProfile;
    const sanitizedTp = { ...tp, password: '' };
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
                assignedClasses: sanitizedTp.assignedClasses ?? [],
                assignedSubjects: sanitizedTp.assignedSubjects ?? [],
              };
              updatedSelfUser = nextUser;
              return nextUser;
            })
          : prevUsers;

      resolvedNextUsers = nextUsers;

      const shouldSyncLegacyTeacherProfile =
        !activeUser ||
        activeUser.id === 'usr-guru-1' ||
        activeUser.email.toLowerCase() === prev.settings.teacherProfile.email.toLowerCase();

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
        const res = await apiSaveOwnProfile(tp);
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

  return (
    <div className="eguru-app-shell min-h-screen bg-slate-50 text-slate-900">
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
        onOpenProfileModal={() => setShowTeacherProfileModal(true)}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* When StudentDetailModal is open, mark workspace no-print so Cetak Individu prints ONLY the student sheet */}
      <div className={`lg:pl-64 flex flex-col min-h-screen ${selectedStudentModal ? 'no-print' : ''}`}>
        <Topbar
          activeMenu={activeMenu}
          settings={effectiveScopedSettings}
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

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
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
                setDraftJournal({ mode: 'edit', entry });
                setActiveMenu('jurnal');
              }}
              onDuplicateJournal={(entry) => {
                setDraftJournal({ mode: 'duplicate', entry });
                setActiveMenu('jurnal');
              }}
              onViewClass={setSelectedClassModal}
              onViewSubject={setSelectedSubjectModal}
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
              onUpdateSettings={handleUpdateSettings}
              onRestoreDatabase={(restored) => {
                dbRef.current = restored;
                setDb(restored);
                void saveDatabase(restored);
                if (isCloudActive) {
                  trackRemoteSave(
                    fsReplaceEntireDatabase(restored),
                    'Gagal memulihkan cadangan ke Firebase'
                  );
                } else if (isServerActive) {
                  trackRemoteSave(
                    apiRestoreWorkspace(restored).then((serverRestored) => {
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

      {/* Clean Toast Notification */}
      {toast && (
        <div
          role="status"
          className="no-print fixed bottom-5 right-5 z-50 max-w-sm bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg border border-slate-700 flex items-center gap-3"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-xs font-medium leading-snug">{toast}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-white shrink-0 cursor-pointer"
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
        canEditStudent={rolePerms.canManageStudents}
        onEditStudent={(st) => {
          setSelectedStudentModal(null);
          setStudentFormModal({ mode: 'edit', student: st });
        }}
        onViewClass={setSelectedClassModal}
        onViewSubject={setSelectedSubjectModal}
        onNotify={notify}
        onClose={() => setSelectedStudentModal(null)}
      />

      <StudentEditModal
        isOpen={Boolean(studentFormModal)}
        mode={studentFormModal?.mode || 'edit'}
        student={studentFormModal?.student || null}
        classes={scoped.allowedClasses}
        existingStudents={db.students}
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

      <ClassDetailModal
        className={selectedClassModal}
        students={scoped.scopedActiveStudents}
        journals={scoped.scopedJournals}
        grades={scoped.scopedGrades}
        settings={effectiveScopedSettings}
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

