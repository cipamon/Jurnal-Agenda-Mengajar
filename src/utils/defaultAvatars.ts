import { Student, UserRole } from '../types';

export const DUMMY_STUDENT_MALE_PHOTO = '/assets/aistudio/image_9cd8fe77.png';
export const DUMMY_STUDENT_FEMALE_PHOTO = '/assets/aistudio/image_a9207469.png';

export const DUMMY_TEACHER_MALE_PHOTO = '/assets/aistudio/image_75beabf3.png';
export const DUMMY_TEACHER_FEMALE_PHOTO = '/assets/aistudio/image_05c5b30c.png';

export const DUMMY_STAFF_MALE_PHOTO = '/assets/aistudio/image_a36e2763.png';
export const DUMMY_STAFF_FEMALE_PHOTO = '/assets/aistudio/image_05f16c00.png';

const DUMMY_ASSET_SET = new Set([
  DUMMY_STUDENT_MALE_PHOTO,
  DUMMY_STUDENT_FEMALE_PHOTO,
  DUMMY_TEACHER_MALE_PHOTO,
  DUMMY_TEACHER_FEMALE_PHOTO,
  DUMMY_STAFF_MALE_PHOTO,
  DUMMY_STAFF_FEMALE_PHOTO,
]);

export const DEFAULT_WEB_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#4f46e5"/>
  <path d="M18 22 C18 19 20 17 23 17 H30 V45 H23 C20 45 18 47 18 47 Z" fill="#ffffff" opacity="0.95"/>
  <path d="M46 22 C46 19 44 17 41 17 H34 V45 H41 C44 45 46 47 46 47 Z" fill="#c7d2fe"/>
  <circle cx="48" cy="16" r="6" fill="#10b981"/>
</svg>`);

/**
 * Normalizes uploaded/linked photo URLs (trims whitespace, ignores placeholders like "-",
 * and converts Google Drive / Dropbox sharing links into direct image URLs).
 */
export function normalizePhotoUrl(raw?: string): string {
  const clean = (raw || '').trim();
  if (!clean) return '';

  const lower = clean.toLowerCase();
  if (
    lower === '-' ||
    lower === '--' ||
    lower === 'none' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'kosong' ||
    lower === 'n/a'
  ) {
    return '';
  }

  // Google Drive: https://drive.google.com/file/d/<ID>/view...
  const driveFileMatch = clean.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (driveFileMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${driveFileMatch[1]}&sz=w1000`;
  }

  // Google Drive: https://drive.google.com/open?id=<ID> or uc?id=<ID> or thumbnail?id=<ID>
  const driveIdMatch = clean.match(/drive\.google\.com\/(?:open|uc|thumbnail)\?[^#]*[?&]?id=([a-zA-Z0-9_-]+)/i);
  if (driveIdMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${driveIdMatch[1]}&sz=w1000`;
  }

  // Dropbox sharing link ?dl=0 -> ?raw=1
  if (clean.includes('dropbox.com/') && clean.includes('dl=0')) {
    return clean.replace('dl=0', 'raw=1');
  }

  return clean;
}

/**
 * Returns true strictly when a genuine uploaded/linked photo is present
 * (never when empty or pointing to one of the dummy fallback portraits).
 */
export function hasRealPhoto(photoDataUrl?: string): boolean {
  const normalized = normalizePhotoUrl(photoDataUrl);
  return Boolean(normalized) && !DUMMY_ASSET_SET.has(normalized);
}

export function getStudentPhotoUrl(student: Pick<Student, 'photoDataUrl' | 'gender'>): string {
  const realUrl = normalizePhotoUrl(student.photoDataUrl);
  if (realUrl) {
    return realUrl;
  }
  return student.gender === 'P' ? DUMMY_STUDENT_FEMALE_PHOTO : DUMMY_STUDENT_MALE_PHOTO;
}

export function getUserPhotoUrl(user: {
  photoDataUrl?: string;
  role: UserRole;
  gender?: 'L' | 'P';
}): string {
  const realUrl = normalizePhotoUrl(user.photoDataUrl);
  if (realUrl) {
    return realUrl;
  }
  const isFemale = user.gender === 'P';
  if (user.role === 'admin' || user.role === 'karyawan') {
    return isFemale ? DUMMY_STAFF_FEMALE_PHOTO : DUMMY_STAFF_MALE_PHOTO;
  }
  return isFemale ? DUMMY_TEACHER_FEMALE_PHOTO : DUMMY_TEACHER_MALE_PHOTO;
}
