import { Student, UserRole } from '../types';

export const DUMMY_STUDENT_MALE_PHOTO = '/assets/aistudio/image_9cd8fe77.png';
export const DUMMY_STUDENT_FEMALE_PHOTO = '/assets/aistudio/image_a9207469.png';

export const DUMMY_TEACHER_MALE_PHOTO = '/assets/aistudio/image_75beabf3.png';
export const DUMMY_TEACHER_FEMALE_PHOTO = '/assets/aistudio/image_05c5b30c.png';

export const DUMMY_STAFF_MALE_PHOTO = '/assets/aistudio/image_a36e2763.png';
export const DUMMY_STAFF_FEMALE_PHOTO = '/assets/aistudio/image_05f16c00.png';

export const DEFAULT_WEB_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#4f46e5"/>
  <path d="M18 22 C18 19 20 17 23 17 H30 V45 H23 C20 45 18 47 18 47 Z" fill="#ffffff" opacity="0.95"/>
  <path d="M46 22 C46 19 44 17 41 17 H34 V45 H41 C44 45 46 47 46 47 Z" fill="#c7d2fe"/>
  <circle cx="48" cy="16" r="6" fill="#10b981"/>
</svg>`);

export function getStudentPhotoUrl(student: Pick<Student, 'photoDataUrl' | 'gender'>): string {
  if (student.photoDataUrl && student.photoDataUrl.trim()) {
    return student.photoDataUrl;
  }
  return student.gender === 'P' ? DUMMY_STUDENT_FEMALE_PHOTO : DUMMY_STUDENT_MALE_PHOTO;
}

export function getUserPhotoUrl(user: {
  photoDataUrl?: string;
  role: UserRole;
  gender?: 'L' | 'P';
}): string {
  if (user.photoDataUrl && user.photoDataUrl.trim()) {
    return user.photoDataUrl;
  }
  const isFemale = user.gender === 'P';
  if (user.role === 'admin' || user.role === 'karyawan') {
    return isFemale ? DUMMY_STAFF_FEMALE_PHOTO : DUMMY_STAFF_MALE_PHOTO;
  }
  return isFemale ? DUMMY_TEACHER_FEMALE_PHOTO : DUMMY_TEACHER_MALE_PHOTO;
}
