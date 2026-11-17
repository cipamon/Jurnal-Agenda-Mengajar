/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { DashboardView } from './components/DashboardView';
import { GradesMatrixView } from './components/GradesMatrixView';
import { JournalAttendanceView } from './components/JournalAttendanceView';
import { LoginView } from './components/LoginView';
import { PrintReportsView } from './components/PrintReportsView';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { StudentsView } from './components/StudentsView';
import { Topbar } from './components/Topbar';
import {
  GradeRecord,
  JournalEntry,
  MenuId,
  PortalDatabase,
  SessionState,
  Student,
  SystemSettings,
} from './types';
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
        setDb(storedDb);
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

  // Persist DB whenever modified
  const updateDatabase = useCallback((updater: (prev: PortalDatabase) => PortalDatabase) => {
    setDb((prev) => {
      const base = prev ?? createSeedDatabase();
      const next = updater(base);
      void saveDatabase(next);
      return next;
    });
  }, []);

  const handleLogin = (payload: {
    email: string;
    password: string;
    sheetsWebAppUrl: string;
    academicYear: string;
    semester: 'Ganjil' | 'Genap';
    useDemoSeed: boolean;
  }): string | null => {
    if (payload.useDemoSeed) {
      const seeded = createSeedDatabase(
        payload.email,
        payload.sheetsWebAppUrl,
        payload.academicYear,
        payload.semester
      );
      setDb(seeded);
      void saveDatabase(seeded);
      const nextSession: SessionState = {
        isAuthenticated: true,
        email: seeded.settings.teacherProfile.email,
        loggedInAt: new Date().toISOString(),
      };
      saveSession(nextSession);
      setSession(nextSession);
      setActiveMenu('dashboard');
      notify('Berhasil masuk dengan data demo otomatis.');
      return null;
    }

    const currentDb = db ?? createSeedDatabase();
    const expectedEmail = currentDb.settings.teacherProfile.email.toLowerCase();
    const expectedPass = currentDb.settings.teacherProfile.password;

    if (
      payload.email.toLowerCase() !== expectedEmail &&
      payload.email.toLowerCase() !== 'guru@sman1nusantara.sch.id'
    ) {
      // Allow custom email login if password matches default/configured password, updating teacher email smoothly
      if (payload.password !== expectedPass && payload.password !== 'guru123') {
        return 'Email atau password tidak sesuai. Gunakan tombol "Masuk dengan Data Demo Otomatis" untuk uji coba cepat.';
      }
    } else if (payload.password !== expectedPass && payload.password !== 'guru123') {
      return 'Password tidak sesuai. Password default demo adalah guru123.';
    }

    updateDatabase((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        academicYear: payload.academicYear,
        semester: payload.semester,
        ...(payload.sheetsWebAppUrl ? { sheetsWebAppUrl: payload.sheetsWebAppUrl } : {}),
        teacherProfile: {
          ...prev.settings.teacherProfile,
          email: payload.email,
        },
      },
    }));

    const nextSession: SessionState = {
      isAuthenticated: true,
      email: payload.email,
      loggedInAt: new Date().toISOString(),
    };
    saveSession(nextSession);
    setSession(nextSession);
    setActiveMenu('dashboard');
    return null;
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
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

  const handleSyncGoogleSheetsOnly = async () => {
    if (!db || !db.settings.sheetsWebAppUrl.trim()) {
      notify('Masukkan Google Sheets Web App URL terlebih dahulu.');
      return;
    }
    setIsSyncing(true);
    try {
      const res = await syncToGoogleSheets(db.settings.sheetsWebAppUrl, db);
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
        const idx = nextGrades.findIndex(
          (g) =>
            g.studentId === rec.studentId &&
            g.className === rec.className &&
            g.subject === rec.subject &&
            g.examType === rec.examType
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

  // Student handlers
  const handleAddOrUpdateStudent = (student: Student, isEdit: boolean) => {
    updateDatabase((prev) => {
      const students = isEdit
        ? prev.students.map((s) => (s.id === student.id ? student : s))
        : [...prev.students, student];
      return { ...prev, students };
    });
    notify(isEdit ? `Data siswa ${student.name} diperbarui.` : `Siswa ${student.name} ditambahkan.`);
  };

  const handleDeleteStudent = (id: string) => {
    updateDatabase((prev) => ({
      ...prev,
      students: prev.students.filter((s) => s.id !== id),
      grades: prev.grades.filter((g) => g.studentId !== id),
    }));
    notify('Data siswa dihapus.');
  };

  const handleImportStudents = (newStudents: Student[]) => {
    updateDatabase((prev) => {
      const existingNis = new Set(prev.students.map((s) => s.nis));
      const merged = [...prev.students];
      let addedCount = 0;
      const extraClasses = new Set(prev.settings.classes);

      newStudents.forEach((st) => {
        if (st.className) extraClasses.add(st.className);
        if (!existingNis.has(st.nis)) {
          existingNis.add(st.nis);
          merged.push(st);
          addedCount++;
        }
      });

      return {
        ...prev,
        students: merged,
        settings: {
          ...prev.settings,
          classes: Array.from(extraClasses),
        },
      };
    });
    notify(`Impor selesai: ${newStudents.length} baris diproses.`);
  };

  // Settings handler
  const handleUpdateSettings = (nextSettings: SystemSettings) => {
    updateDatabase((prev) => ({
      ...prev,
      settings: nextSettings,
    }));
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

  if (!session?.isAuthenticated) {
    return (
      <LoginView
        defaultEmail={db.settings.teacherProfile.email}
        defaultAcademicYear={db.settings.academicYear}
        defaultSemester={db.settings.semester}
        defaultSheetsUrl={db.settings.sheetsWebAppUrl}
        academicYears={db.settings.academicYears}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        activeMenu={activeMenu}
        onSelectMenu={setActiveMenu}
        teacherProfile={db.settings.teacherProfile}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="lg:pl-64 flex flex-col min-h-screen">
        <Topbar
          activeMenu={activeMenu}
          settings={db.settings}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onManualSync={handleManualSync}
          isSyncing={isSyncing}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {activeMenu === 'dashboard' && (
            <DashboardView
              students={db.students}
              journals={db.journals}
              grades={db.grades}
              settings={db.settings}
              onNavigate={setActiveMenu}
              onEditJournal={(entry) => {
                setDraftJournal({ mode: 'edit', entry });
                setActiveMenu('jurnal');
              }}
              onDuplicateJournal={(entry) => {
                setDraftJournal({ mode: 'duplicate', entry });
                setActiveMenu('jurnal');
              }}
            />
          )}

          {activeMenu === 'jurnal' && (
            <JournalAttendanceView
              students={db.students}
              journals={db.journals}
              settings={db.settings}
              draftJournal={draftJournal}
              onClearDraft={() => setDraftJournal(null)}
              onSaveJournal={handleSaveJournal}
              onDeleteJournals={handleDeleteJournals}
              onBulkUpdateLedger={handleBulkUpdateLedger}
              onNotify={notify}
            />
          )}

          {activeMenu === 'nilai' && (
            <GradesMatrixView
              students={db.students}
              grades={db.grades}
              settings={db.settings}
              onSaveGradesBatch={handleSaveGradesBatch}
              onNotify={notify}
            />
          )}

          {activeMenu === 'siswa' && (
            <StudentsView
              students={db.students}
              settings={db.settings}
              onAddOrUpdateStudent={handleAddOrUpdateStudent}
              onDeleteStudent={handleDeleteStudent}
              onImportStudents={handleImportStudents}
              onNotify={notify}
            />
          )}

          {activeMenu === 'laporan' && (
            <PrintReportsView
              students={db.students}
              journals={db.journals}
              grades={db.grades}
              settings={db.settings}
              onNotify={notify}
            />
          )}

          {activeMenu === 'pengaturan' && (
            <SettingsView
              settings={db.settings}
              onUpdateSettings={handleUpdateSettings}
              onSyncGoogleSheets={handleSyncGoogleSheetsOnly}
              onResetDemoData={handleResetDemoData}
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
    </div>
  );
}
