/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { ClassDetailModal } from './components/ClassDetailModal';
import { DashboardView } from './components/DashboardView';
import { GradesMatrixView } from './components/GradesMatrixView';
import { JournalAttendanceView } from './components/JournalAttendanceView';
import { LoginView } from './components/LoginView';
import { PrintReportsView } from './components/PrintReportsView';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
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
  SessionState,
  Student,
  SystemSettings,
  UserRole,
} from './types';
import {
  getScopedPortalData,
  normalizeWebBrand,
  ROLE_PERMISSIONS,
  USER_ROLE_LABELS,
} from './utils/helpers';
import { createSeedDatabase } from './utils/seedData';
import {
  clearSession,
  loadDatabase,
  loadSession,
  saveDatabase,
  saveSession,
  syncToGoogleSheets,
  syncToServer,
} from './utils/storage';

export default function App() {
  const [db, setDb] = useState<PortalDatabase | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [isReady, setIsReady] = useState(false);

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
  const [promotionModal, setPromotionModal] = useState<{
    open: boolean;
    preselectedIds: string[];
  }>({ open: false, preselectedIds: [] });

  const notify = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Initial hydration from IndexedDB / LocalStorage
  useEffect(() => {
    let mounted = true;
    (async () => {
      const storedDb = await loadDatabase();
      const storedSession = loadSession();
      if (!mounted) return;
      if (storedDb) {
        const defaultUsers = createSeedDatabase().users ?? [];
        const hydrated: PortalDatabase = {
          ...storedDb,
          users: storedDb.users && storedDb.users.length > 0 ? storedDb.users : defaultUsers,
        };
        setDb(hydrated);
      } else {
        const seeded = createSeedDatabase();
        setDb(seeded);
        await saveDatabase(seeded);
      }
      if (storedSession) {
        setSession(storedSession);
      }
      setIsReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Sync browser tab title & favicon whenever settings.webBrand changes
  useEffect(() => {
    if (!db) return;
    const brand = normalizeWebBrand(db.settings);
    document.title = brand.tabTitle;

    let linkEl = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!linkEl) {
      linkEl = document.createElement('link');
      linkEl.rel = 'icon';
      document.head.appendChild(linkEl);
    }
    linkEl.href = brand.webLogoDataUrl;
  }, [db]);

  // Persist DB whenever modified
  const updateDatabase = useCallback((updater: (prev: PortalDatabase) => PortalDatabase) => {
    setDb((prev) => {
      const base = prev ?? createSeedDatabase();
      const next = updater(base);
      void saveDatabase(next);
      return next;
    });
  }, []);

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

  const handleLogin = (payload: {
    email: string;
    password: string;
    sheetsWebAppUrl: string;
    academicYear: string;
    semester: 'Ganjil' | 'Genap';
    useDemoSeed: boolean;
    demoAsAdmin?: boolean;
    demoRole?: UserRole;
  }): string | null => {
    if (payload.useDemoSeed) {
      const targetRole: UserRole = payload.demoRole || (payload.demoAsAdmin ? 'admin' : 'guru');
      const seeded = createSeedDatabase(
        targetRole === 'guru' ? payload.email : undefined,
        payload.sheetsWebAppUrl,
        payload.academicYear,
        payload.semester
      );
      setDb(seeded);
      void saveDatabase(seeded);
      const seedUsers = seeded.users ?? [];
      const targetUser = seedUsers.find((u) => u.role === targetRole) || seedUsers[0];
      const finalRole = targetUser?.role || targetRole;
      const nextSession: SessionState = {
        isAuthenticated: true,
        email: targetUser?.email || seeded.settings.teacherProfile.email,
        userId: targetUser?.id,
        role: finalRole,
        loggedInAt: new Date().toISOString(),
      };
      saveSession(nextSession);
      setSession(nextSession);
      setActiveMenu(finalRole === 'admin' ? 'pengaturan' : 'dashboard');
      notify(`Berhasil masuk sebagai ${USER_ROLE_LABELS[finalRole]} (Data Demo).`);
      return null;
    }

    const currentDb = db ?? createSeedDatabase();
    const userList = currentDb.users && currentDb.users.length > 0 ? currentDb.users : createSeedDatabase().users ?? [];
    const matchedUser = userList.find(
      (u) => u.email.toLowerCase() === payload.email.toLowerCase()
    );

    if (matchedUser) {
      if (!matchedUser.active) {
        return 'Akun pengguna ini sedang dinonaktifkan oleh Admin Sistem.';
      }
      if (matchedUser.password !== payload.password) {
        return 'Password tidak sesuai untuk akun tersebut.';
      }
      updateDatabase((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          academicYear: payload.academicYear,
          semester: payload.semester,
          ...(payload.sheetsWebAppUrl ? { sheetsWebAppUrl: payload.sheetsWebAppUrl } : {}),
        },
      }));
      const nextSession: SessionState = {
        isAuthenticated: true,
        email: matchedUser.email,
        userId: matchedUser.id,
        role: matchedUser.role,
        loggedInAt: new Date().toISOString(),
      };
      saveSession(nextSession);
      setSession(nextSession);
      setActiveMenu('dashboard');
      notify(`Selamat datang, ${matchedUser.name} (${USER_ROLE_LABELS[matchedUser.role]}).`);
      return null;
    }

    // Fallback check against legacy teacherProfile credentials
    const expectedEmail = currentDb.settings.teacherProfile.email.toLowerCase();
    const expectedPass = currentDb.settings.teacherProfile.password;
    if (payload.email.toLowerCase() === expectedEmail && payload.password === expectedPass) {
      updateDatabase((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          academicYear: payload.academicYear,
          semester: payload.semester,
          ...(payload.sheetsWebAppUrl ? { sheetsWebAppUrl: payload.sheetsWebAppUrl } : {}),
        },
      }));
      const nextSession: SessionState = {
        isAuthenticated: true,
        email: payload.email,
        role: 'guru',
        loggedInAt: new Date().toISOString(),
      };
      saveSession(nextSession);
      setSession(nextSession);
      setActiveMenu('dashboard');
      return null;
    }

    return 'Email atau password tidak terdaftar. Gunakan tombol Demo Otomatis atau cek daftar akun pada Pengaturan Admin.';
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  const handleSwitchUserSession = (user: AppUser) => {
    const nextSession: SessionState = {
      isAuthenticated: true,
      email: user.email,
      userId: user.id,
      role: user.role,
      loggedInAt: new Date().toISOString(),
    };
    saveSession(nextSession);
    setSession(nextSession);
  };

  const handleManualSync = async () => {
    if (!db) return;
    setIsSyncing(true);
    try {
      await saveDatabase(db);
      const serverRes = await syncToServer(db);
      let msg = serverRes.ok
        ? 'Data berhasil disimpan ke penyimpanan lokal & dicadangkan di server.'
        : 'Data tersimpan aman di penyimpanan lokal (IndexedDB/LocalStorage).';

      if (db.settings.sheetsWebAppUrl.trim()) {
        const sheetsRes = await syncToGoogleSheets(db.settings.sheetsWebAppUrl, db);
        msg = sheetsRes.ok
          ? 'Data tersimpan lokal & tersinkronisasi ke Google Sheets.'
          : `Tersimpan lokal. Sinkron Google Sheets gagal: ${sheetsRes.error || 'cek URL Web App'}`;
      }

      updateDatabase((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }));
      notify(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncGoogleSheetsOnly = async (overrideUrl?: string) => {
    const targetUrl = (overrideUrl ?? db?.settings.sheetsWebAppUrl ?? '').trim();
    if (!db || !targetUrl) {
      notify('Masukkan Google Sheets Web App URL terlebih dahulu.');
      return;
    }
    setIsSyncing(true);
    try {
      const res = await syncToGoogleSheets(targetUrl, db);
      if (res.ok) {
        notify('Sinkronisasi ke Google Sheets berhasil.');
      } else {
        notify(`Gagal sinkron Google Sheets: ${res.error || 'Periksa izin Web App URL'}`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Journal handlers
  const handleSaveJournal = (entry: JournalEntry, isEdit: boolean) => {
    updateDatabase((prev) => {
      const exists = prev.journals.some((j) => j.id === entry.id);
      const journals = exists
        ? prev.journals.map((j) => (j.id === entry.id ? entry : j))
        : [entry, ...prev.journals];
      return { ...prev, journals };
    });
    notify(isEdit ? 'Jurnal dan presensi berhasil diperbarui.' : 'Jurnal dan presensi baru berhasil disimpan.');
  };

  const handleDeleteJournals = (ids: string[]) => {
    updateDatabase((prev) => ({
      ...prev,
      journals: prev.journals.filter((j) => !ids.includes(j.id)),
    }));
    notify(`${ids.length} jurnal berhasil dihapus.`);
  };

  const handleImportJournals = (entries: JournalEntry[]) => {
    updateDatabase((prev) => {
      const extraClasses = new Set(prev.settings.classes);
      const extraSubjects = new Set(prev.settings.subjects);
      entries.forEach((e) => {
        if (e.className) extraClasses.add(e.className);
        if (e.subject) extraSubjects.add(e.subject);
      });
      return {
        ...prev,
        journals: [...entries, ...prev.journals],
        settings: {
          ...prev.settings,
          classes: Array.from(extraClasses),
          subjects: Array.from(extraSubjects),
        },
      };
    });
    notify(`Berhasil mengimpor ${entries.length} jurnal mengajar.`);
  };

  const handleBulkUpdateLedger = (updatedJournals: JournalEntry[]) => {
    const mapById = new Map(updatedJournals.map((j) => [j.id, j]));
    updateDatabase((prev) => ({
      ...prev,
      journals: prev.journals.map((j) => mapById.get(j.id) || j),
    }));
    notify(`Perubahan leger kehadiran (${updatedJournals.length} pertemuan) berhasil disimpan.`);
  };

  // Grade handlers
  const handleSaveGradesBatch = (records: GradeRecord[]) => {
    updateDatabase((prev) => {
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
          nextGrades[idx] = { ...rec, id: nextGrades[idx].id };
        } else {
          nextGrades.push(rec);
        }
      });
      return { ...prev, grades: nextGrades };
    });
    notify(`Berhasil menyimpan ${records.length} data nilai siswa.`);
  };

  const handleDeleteGrades = (ids: string[]) => {
    const delSet = new Set(ids);
    updateDatabase((prev) => ({
      ...prev,
      grades: prev.grades.filter((g) => !delSet.has(g.id)),
    }));
    notify(`${ids.length} catatan nilai berhasil dihapus.`);
  };

  // Student handlers
  const handleAddOrUpdateStudent = (student: Student, isEdit: boolean) => {
    updateDatabase((prev) => {
      const students = isEdit
        ? prev.students.map((s) => (s.id === student.id ? student : s))
        : [...prev.students, student];
      return { ...prev, students };
    });
    if (isEdit && selectedStudentModal?.id === student.id) {
      setSelectedStudentModal(student);
    }
    notify(isEdit ? `Data siswa ${student.name} diperbarui.` : `Siswa ${student.name} ditambahkan.`);
  };

  const handlePromoteStudents = (updatedStudents: Student[], summaryMsg: string) => {
    const updatedMap = new Map(updatedStudents.map((s) => [s.id, s]));
    updateDatabase((prev) => ({
      ...prev,
      students: prev.students.map((s) => updatedMap.get(s.id) || s),
    }));
    notify(summaryMsg);
  };

  const handleDeleteStudent = (id: string) => {
    updateDatabase((prev) => ({
      ...prev,
      students: prev.students.filter((s) => s.id !== id),
      grades: prev.grades.filter((g) => g.studentId !== id),
    }));
    if (selectedStudentModal?.id === id) setSelectedStudentModal(null);
    if (studentFormModal?.student?.id === id) setStudentFormModal(null);
    notify('Data siswa dihapus.');
  };

  const handleDeleteStudentsBulk = (ids: string[]) => {
    const delSet = new Set(ids);
    updateDatabase((prev) => ({
      ...prev,
      students: prev.students.filter((s) => !delSet.has(s.id)),
      grades: prev.grades.filter((g) => !delSet.has(g.studentId)),
    }));
    if (selectedStudentModal && delSet.has(selectedStudentModal.id)) setSelectedStudentModal(null);
    if (studentFormModal?.student && delSet.has(studentFormModal.student.id)) {
      setStudentFormModal(null);
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
      updateDatabase((prev) => {
        const extraClasses = new Set(prev.settings.classes);
        toAdd.forEach((st) => {
          if (st.className) extraClasses.add(st.className);
        });
        return {
          ...prev,
          students: [...prev.students, ...toAdd],
          settings: {
            ...prev.settings,
            classes: Array.from(extraClasses),
          },
        };
      });
    }

    notify(
      skippedCount > 0
        ? `Impor selesai: ${addedCount} siswa ditambahkan, ${skippedCount} baris dilewati karena NIS sudah terdaftar.`
        : `Impor selesai: ${addedCount} siswa baru ditambahkan.`
    );
  };

  // Settings & Users handlers
  const handleUpdateSettings = (nextSettings: SystemSettings) => {
    updateDatabase((prev) => ({
      ...prev,
      settings: nextSettings,
    }));
  };

  const handleUpdateUsers = (nextUsers: AppUser[]) => {
    updateDatabase((prev) => {
      const matchedTeacher = nextUsers.find(
        (u) =>
          u.id === 'usr-guru-1' ||
          u.email.toLowerCase() === prev.settings.teacherProfile.email.toLowerCase()
      );
      return {
        ...prev,
        users: nextUsers,
        settings: matchedTeacher
          ? {
              ...prev.settings,
              teacherProfile: {
                ...prev.settings.teacherProfile,
                name: matchedTeacher.name,
                nip: matchedTeacher.nip,
                school: matchedTeacher.school,
                email: matchedTeacher.email,
                password: matchedTeacher.password,
                gender: matchedTeacher.gender,
                photoDataUrl: matchedTeacher.photoDataUrl,
                assignedClasses: matchedTeacher.assignedClasses,
                assignedSubjects: matchedTeacher.assignedSubjects,
              },
            }
          : prev.settings,
      };
    });
  };

  const handleResetDemoData = () => {
    const fresh = createSeedDatabase();
    setDb(fresh);
    void saveDatabase(fresh);
    notify('Seluruh data berhasil direset ke data demo standar.');
  };

  if (!isReady || !db) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-sm">
        Memuat Portal E-Guru v10.2...
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
        defaultSheetsUrl={db.settings.sheetsWebAppUrl}
        academicYears={db.settings.academicYears}
        webBrand={webBrand}
        onLogin={handleLogin}
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
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

          {activeMenu === 'laporan' && rolePerms.allowedMenus.includes('laporan') && (
            <PrintReportsView
              students={scoped.scopedActiveStudents}
              journals={scoped.scopedJournals}
              grades={scoped.scopedGrades}
              settings={effectiveScopedSettings}
              onUpdateSettings={rolePerms.canAccessSettings ? handleUpdateSettings : undefined}
              onNotify={notify}
            />
          )}

          {activeMenu === 'pengaturan' && rolePerms.canAccessSettings && (
            <SettingsView
              settings={db.settings}
              users={usersList}
              activeUser={activeUser}
              currentUserRole={currentUserRole}
              currentUserEmail={session.email}
              onUpdateSettings={handleUpdateSettings}
              onUpdateUsers={handleUpdateUsers}
              onSwitchUserSession={handleSwitchUserSession}
              onOpenTeacherProfileModal={() => setShowTeacherProfileModal(true)}
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
        settings={db.settings}
        activeUser={activeUser}
        currentUserRole={currentUserRole}
        onSaveProfile={(updated) => {
          const tp = updated.teacherProfile;
          updateDatabase((prev) => {
            const prevUsers = prev.users ?? [];
            const targetIdx = activeUser
              ? prevUsers.findIndex((u) => u.id === activeUser.id)
              : prevUsers.findIndex((u) => u.email.toLowerCase() === session.email.toLowerCase());

            const nextUsers =
              targetIdx >= 0
                ? prevUsers.map((u, idx) =>
                    idx === targetIdx
                      ? {
                          ...u,
                          name: tp.name,
                          nip: tp.nip,
                          school: tp.school,
                          email: tp.email,
                          password: tp.password,
                          gender: tp.gender ?? u.gender,
                          photoDataUrl: tp.photoDataUrl,
                          assignedClasses: tp.assignedClasses ?? [],
                          assignedSubjects: tp.assignedSubjects ?? [],
                        }
                      : u
                  )
                : prevUsers;

            const shouldSyncLegacyTeacherProfile =
              !activeUser ||
              activeUser.id === 'usr-guru-1' ||
              activeUser.email.toLowerCase() === prev.settings.teacherProfile.email.toLowerCase();

            return {
              ...prev,
              users: nextUsers,
              settings: {
                ...prev.settings,
                sheetsWebAppUrl: updated.sheetsWebAppUrl,
                ...(shouldSyncLegacyTeacherProfile ? { teacherProfile: tp } : {}),
              },
            };
          });

          if (tp.email.toLowerCase() !== session.email.toLowerCase()) {
            const nextSession: SessionState = {
              ...session,
              email: tp.email,
              userId: activeUser?.id || session.userId,
            };
            saveSession(nextSession);
            setSession(nextSession);
          }

          notify('Profil & tanggung jawab mengajar berhasil diperbarui.');
        }}
        onSyncGoogleSheets={(sheetsUrl) => void handleSyncGoogleSheetsOnly(sheetsUrl)}
        onResetDemoData={handleResetDemoData}
        onClose={() => setShowTeacherProfileModal(false)}
      />
    </div>
  );
}

