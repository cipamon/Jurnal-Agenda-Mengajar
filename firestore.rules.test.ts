/**
 * Payload-First Security Test Specification (Reference Verification Suite)
 * Documents the 12 adversarial "Dirty Dozen" assertions for Portal E-Guru Firestore Rules.
 */
export interface SecurityTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated read on students',
    operation: 'get',
    path: 'students/stu-1',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email spoofing admin account',
    operation: 'update',
    path: 'settings/school',
    auth: { uid: 'spoof-uid', email: 'wikwikeuy@gmail.com', email_verified: false },
    payload: { kkm: 80 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Signed-in unregistered stranger listing students',
    operation: 'list',
    path: 'students',
    auth: { uid: 'stranger-uid', email: 'stranger@gmail.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow ghost field injection on student creation',
    operation: 'create',
    path: 'students/stu-99',
    auth: { uid: 'admin-uid', email: 'wikwikeuy@gmail.com', email_verified: true },
    payload: { id: 'stu-99', nis: '9999', name: 'Test', isSuperAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Guru self-escalation of role to admin',
    operation: 'update',
    path: 'appUsers/usr-guru-1',
    auth: { uid: 'guru-uid', email: 'guru@sman1nusantara.sch.id', email_verified: true },
    payload: { role: 'admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Deactivated member re-activating self',
    operation: 'update',
    path: 'appUsers/usr-guru-1',
    auth: { uid: 'guru-uid', email: 'guru@sman1nusantara.sch.id', email_verified: true },
    payload: { active: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Inactive member attempting journal creation',
    operation: 'create',
    path: 'journals/jrn-99',
    auth: { uid: 'disabled-uid', email: 'disabled@sman1nusantara.sch.id', email_verified: true },
    payload: { id: 'jrn-99', className: 'X IPA 1', subject: 'Matematika' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Read-only kepala_sekolah attempting grade write',
    operation: 'create',
    path: 'grades/grd-99',
    auth: { uid: 'kepsek-uid', email: 'kepsek@sman1nusantara.sch.id', email_verified: true },
    payload: { id: 'grd-99', studentId: 'stu-1', score: 95 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Path variable ID poisoning with dots and slashes',
    operation: 'create',
    path: 'students/bad.id.value',
    auth: { uid: 'admin-uid', email: 'wikwikeuy@gmail.com', email_verified: true },
    payload: { id: 'bad.id.value', nis: '123', name: 'Poison' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Oversized topic string resource exhaustion',
    operation: 'create',
    path: 'journals/jrn-big',
    auth: { uid: 'admin-uid', email: 'wikwikeuy@gmail.com', email_verified: true },
    payload: { id: 'jrn-big', topic: 'A'.repeat(2000) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Client-forged backdated updatedAt timestamp',
    operation: 'create',
    path: 'grades/grd-forge',
    auth: { uid: 'admin-uid', email: 'wikwikeuy@gmail.com', email_verified: true },
    payload: { id: 'grd-forge', updatedAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Cross-user PII email scraping on appUserPrivates',
    operation: 'get',
    path: 'appUserPrivates/usr-admin-1',
    auth: { uid: 'guru-uid', email: 'guru@sman1nusantara.sch.id', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
];
