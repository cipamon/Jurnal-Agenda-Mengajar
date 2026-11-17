import { AttendanceStatus, RowMarkerColor } from '../types';

export function generateId(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const BULAN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function formatTanggalID(isoDate: string): string {
  if (!isoDate) return '-';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  const monthIdx = Number(m) - 1;
  return `${Number(d)} ${BULAN_ID[monthIdx] || m} ${y}`;
}

export function formatTanggalShort(isoDate: string): string {
  if (!isoDate) return '-';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [, m, d] = parts;
  return `${d}/${m}`;
}

export function formatTanggalMedium(isoDate: string): string {
  if (!isoDate) return '-';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  const monthIdx = Number(m) - 1;
  return `${Number(d)} ${BULAN_SHORT[monthIdx] || m} ${y}`;
}

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMonthRange(offsetMonths = 0): { start: string; end: string } {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0);
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return { start: fmt(target), end: fmt(lastDay) };
}

export const ATTENDANCE_META: Record<
  AttendanceStatus,
  { label: string; shortLabel: string; textClass: string; bgClass: string; borderClass: string }
> = {
  H: {
    label: 'Hadir',
    shortLabel: 'H',
    textClass: 'text-emerald-700',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-300',
  },
  S: {
    label: 'Sakit',
    shortLabel: 'S',
    textClass: 'text-amber-700',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-300',
  },
  I: {
    label: 'Izin',
    shortLabel: 'I',
    textClass: 'text-blue-700',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-300',
  },
  A: {
    label: 'Alpha',
    shortLabel: 'A',
    textClass: 'text-rose-700',
    bgClass: 'bg-rose-50',
    borderClass: 'border-rose-300',
  },
  D: {
    label: 'Dispen',
    shortLabel: 'D',
    textClass: 'text-violet-700',
    bgClass: 'bg-violet-50',
    borderClass: 'border-violet-300',
  },
};

export const ROW_MARKER_META: Record<
  RowMarkerColor,
  { label: string; dotClass: string; rowBgClass: string; textClass: string }
> = {
  neutral: {
    label: 'Netral',
    dotClass: 'bg-slate-400',
    rowBgClass: 'bg-white',
    textClass: 'text-slate-600',
  },
  green: {
    label: 'Tuntas',
    dotClass: 'bg-emerald-500',
    rowBgClass: 'bg-emerald-50/70',
    textClass: 'text-emerald-700',
  },
  yellow: {
    label: 'Remedial',
    dotClass: 'bg-amber-400',
    rowBgClass: 'bg-amber-50/70',
    textClass: 'text-amber-800',
  },
  red: {
    label: 'Perhatian',
    dotClass: 'bg-rose-500',
    rowBgClass: 'bg-rose-50/70',
    textClass: 'text-rose-700',
  },
  blue: {
    label: 'Pengayaan',
    dotClass: 'bg-blue-500',
    rowBgClass: 'bg-blue-50/70',
    textClass: 'text-blue-700',
  },
};
