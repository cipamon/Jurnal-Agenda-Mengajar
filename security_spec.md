# Security Specification & Payload-First TDD — Portal E-Guru Firestore Rules

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched is denied (`allow read, write: if false`).
2. **Verified Active Membership**: Only verified Google users (`request.auth != null && request.auth.token.email_verified == true`) listed in `memberAccess/{authEmailKey}` with `active == true` (or the bootstrapped admin email) can read or write school records.
3. **Role-Scoped Writes**:
   - Only `admin` can modify `settings/school`, `schoolAssets`, `memberAccess`, `appUserPrivates`, or create/delete `appUsers`.
   - Active `guru` / `wali_kelas` / `admin` can write `journals` and `grades`.
   - Active `guru` / `wali_kelas` / `karyawan` / `admin` can write `students` and `studentContacts`.
   - `kepala_sekolah` is strictly read-only for operational school data (except editing own profile fields).
4. **No Self-Privilege Escalation**: Non-admin users updating their own `appUsers/{userId}` document are strictly constrained via `affectedKeys().hasOnly(...)` and `incoming().role == existing().role && incoming().active == existing().active`.
5. **PII Isolation**: User emails reside in `appUserPrivates/{userId}` (readable only by admins or the matching user); student emails/addresses/phones reside in `studentContacts/{studentId}` (readable only by verified active school members).
6. **Temporal & Structural Integrity**: All `updatedAt` and `createdAt` server-managed timestamps must equal `request.time`, all document IDs must match `^[a-zA-Z0-9_\-]+$`, and all strings/lists have strict `.size()` bounds.

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Read**: `get /students/stu-1` with `auth == null`.
2. **Unverified Email Admin Spoof**: `write /settings/school` with `email: 'wikwikeuy@gmail.com'` and `email_verified: false`.
3. **Unauthorized Stranger Read**: `list /students` as signed-in Google user not registered in `memberAccess`.
4. **Shadow Field Injection**: `create /students/stu-99` with valid fields plus ghost key `isSuperAdmin: true`.
5. **Self Role Escalation**: `update /appUsers/usr-guru-1` by Guru changing `role: 'guru'` -> `'admin'`.
6. **Self Activation Tampering**: `update /appUsers/usr-guru-1` by Guru changing `active: false` -> `true`.
7. **Deactivated Member Write**: `create /journals/jrn-99` by user whose `memberAccess` has `active: false`.
8. **Read-Only Role Mutation**: `create /grades/grd-99` by `kepala_sekolah` or `karyawan`.
9. **ID Poisoning**: `create /students/bad.id..with..dots` or 1.5KB ID string.
10. **String Resource Exhaustion**: `create /journals/jrn-1` with 2MB `topic` string exceeding `size() <= 300`.
11. **Client Timestamp Forgery**: `create /grades/grd-1` with backdated `updatedAt` != `request.time`.
12. **Cross-User PII Scraping**: `get /appUserPrivates/usr-admin-1` by non-admin Guru.
