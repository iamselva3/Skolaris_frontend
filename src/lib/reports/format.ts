import type { ReportFilterValue } from '@/components/reports/ReportFilterBar';

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export const avg = (xs: number[]): number =>
  xs.length === 0 ? 0 : Math.round((sum(xs) / xs.length) * 10) / 10;

export const pctText = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : `${Math.round(n * 10) / 10}%`;

export const numText = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : String(n);

/** Seconds → compact "m:ss" (or "Ns" under a minute). */
export const durationText = (seconds: number | null | undefined): string => {
  if (!seconds || seconds <= 0) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
};

/** Human one-liner of the active filters — used as the PDF subtitle. */
export const filterSubtitle = (f: ReportFilterValue): string => {
  const parts: string[] = [];
  if (f.dateFrom || f.dateTo) parts.push(`Date: ${f.dateFrom ?? '…'} → ${f.dateTo ?? '…'}`);
  if (f.q) parts.push(`Search: "${f.q}"`);
  if (f.programId) parts.push('Program filter');
  if (f.subjectId) parts.push('Subject filter');
  if (f.topicId) parts.push('Topic filter');
  if (f.branchId) parts.push('Branch filter');
  if (f.classroomId) parts.push('Class filter');
  return parts.length ? parts.join('  ·  ') : 'All data (no filters)';
};
