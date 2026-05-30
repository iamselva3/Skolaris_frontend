import { cn } from '@/lib/utils/cn';

const STATUS_TONE: Record<string, string> = {
  LIVE: 'border-success bg-success-soft text-success',
  SCHEDULED: 'border-primary bg-primary-soft text-primary',
  DRAFT: 'border-border bg-subtle text-text-muted',
  CLOSED: 'border-warning bg-warning-soft text-warning',
};

/** Compact ERP status pill matching the questions/exams list aesthetic. */
export const StatusPill = ({ value }: { value: string }) => (
  <span
    className={cn(
      'inline-flex h-[18px] items-center rounded border px-1.5 text-[10px] font-medium uppercase tracking-[0.4px]',
      STATUS_TONE[value] ?? 'border-border bg-subtle text-text-muted',
    )}
  >
    {value}
  </span>
);

const FLAG_LABEL: Record<string, string> = {
  too_easy: 'Too easy',
  too_hard: 'Too hard',
  ambiguous: 'Ambiguous',
  normal: 'Normal',
};

const FLAG_TONE: Record<string, string> = {
  too_easy: 'border-warning bg-warning-soft text-warning',
  too_hard: 'border-danger bg-danger-soft text-danger',
  ambiguous: 'border-primary bg-primary-soft text-primary',
  normal: 'border-border bg-subtle text-text-muted',
};

/** Difficulty/quality flag chip for question analytics. */
export const FlagPill = ({ value }: { value: string }) => (
  <span
    className={cn(
      'inline-flex h-[18px] items-center rounded border px-1.5 text-[10px] font-medium',
      FLAG_TONE[value] ?? FLAG_TONE.normal,
    )}
  >
    {FLAG_LABEL[value] ?? value}
  </span>
);
