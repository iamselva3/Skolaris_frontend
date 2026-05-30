import { format, formatDistanceToNow, parseISO } from 'date-fns';

export const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  return format(parseISO(iso), 'dd MMM yyyy, HH:mm');
};

export const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  return format(parseISO(iso), 'dd MMM yyyy');
};

export const fromNow = (iso: string | null): string => {
  if (!iso) return '—';
  return formatDistanceToNow(parseISO(iso), { addSuffix: true });
};

export const formatSeconds = (s: number | null): string => {
  if (s === null || s < 0) return '00:00';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

export const formatNumber = (n: number | null | undefined, digits = 0): string => {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
};
