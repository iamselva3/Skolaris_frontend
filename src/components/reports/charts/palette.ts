/**
 * Flat chart palette — every value resolves to a locked design token, so charts
 * rebrand with tokens.css and never introduce gradients/shadows. Used as inline
 * SVG fill/stroke + cell backgrounds (not Tailwind classes), which keeps the
 * data-viz colors out of the (intentionally restrictive) utility palette.
 */
export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'muted';

export const CHART = {
  primary: 'var(--primary)',
  primarySoft: 'var(--primary-soft)',
  success: 'var(--success)',
  successSoft: 'var(--success-soft)',
  warning: 'var(--warning)',
  warningSoft: 'var(--warning-soft)',
  danger: 'var(--danger)',
  dangerSoft: 'var(--danger-soft)',
  muted: 'var(--text-muted)',
  faint: 'var(--text-faint)',
  border: 'var(--border)',
  track: 'var(--bg-hover)',
  surface: 'var(--bg-surface)',
} as const;

export const toneColor = (t: Tone): string => CHART[t];

export const toneSoft = (t: Tone): string => {
  switch (t) {
    case 'success':
      return CHART.successSoft;
    case 'warning':
      return CHART.warningSoft;
    case 'danger':
      return CHART.dangerSoft;
    case 'muted':
      return CHART.track;
    default:
      return CHART.primarySoft;
  }
};

/** Higher score = healthier tone. Drives bars, progress cells, heatmap tiers. */
export const scoreTone = (pct: number): Tone => {
  if (pct >= 75) return 'success';
  if (pct >= 50) return 'primary';
  if (pct >= 30) return 'warning';
  return 'danger';
};

/** Inverse of scoreTone — for "weak share" style metrics where higher = worse. */
export const riskTone = (pct: number): Tone => {
  if (pct >= 60) return 'danger';
  if (pct >= 35) return 'warning';
  if (pct >= 15) return 'primary';
  return 'success';
};
