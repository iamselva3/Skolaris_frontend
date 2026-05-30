import { Link, useSearchParams } from 'react-router-dom';
import type { UploadStatus } from '@/lib/api/uploads.api';
import { cn } from '@/lib/utils/cn';

type Filter = '' | UploadStatus;

interface Tab {
  value: Filter;
  label: string;
  /** Tone for the active underline + the count pill background. */
  tone?: 'neutral' | 'attention' | 'positive' | 'critical';
}

const TABS: Tab[] = [
  { value: '', label: 'All' },
  { value: 'PROCESSING', label: 'Processing', tone: 'neutral' },
  { value: 'READY_FOR_REVIEW', label: 'Ready for review', tone: 'attention' },
  { value: 'APPROVED', label: 'Approved', tone: 'positive' },
  { value: 'FAILED', label: 'Failed', tone: 'critical' },
  { value: 'PENDING_UPLOAD', label: 'Pending', tone: 'neutral' },
];

interface Props {
  active: Filter;
  /** Optional per-tab counts; renders a soft pill on the right of the tab label. */
  counts?: Partial<Record<Filter, number>>;
}

const TONE_PILL: Record<NonNullable<Tab['tone']>, string> = {
  neutral: 'bg-hover text-text-muted',
  attention: 'bg-warning-soft text-warning',
  positive: 'bg-success-soft text-success',
  critical: 'bg-danger-soft text-danger',
};

/**
 * Horizontal status filter tabs sitting above the uploads queue table.
 * Renders as plain links that mutate the `?status=` query param so deep
 * links survive a refresh; the consumer reads `searchParams` to drive the
 * underlying list query.
 */
export const StatusTabs = ({ active, counts }: Props) => {
  const [params] = useSearchParams();

  const hrefFor = (value: Filter): string => {
    const next = new URLSearchParams(params);
    if (value) next.set('status', value);
    else next.delete('status');
    // Reset pagination on tab switch so the user lands on page 1 of the new filter.
    next.delete('offset');
    const q = next.toString();
    return q ? `?${q}` : '?';
  };

  return (
    <nav
      aria-label="Status filter"
      className="mb-3 flex flex-wrap items-center gap-1 border-b border-border-soft"
    >
      {TABS.map((t) => {
        const isActive = t.value === active;
        const count = counts?.[t.value];
        return (
          <Link
            key={t.value || 'all'}
            to={hrefFor(t.value)}
            replace
            className={cn(
              '-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-3 text-base text-text-muted transition-colors',
              isActive && 'border-primary font-semibold text-text',
              !isActive && 'hover:text-text',
            )}
          >
            {t.label}
            {typeof count === 'number' ? (
              <span
                className={cn(
                  'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-medium',
                  t.tone ? TONE_PILL[t.tone] : 'bg-hover text-text-muted',
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
};
