import { Link } from 'react-router-dom';
import type { DashboardSummary } from '@/lib/api/dashboard.api';
import { cn } from '@/lib/utils/cn';

const formatTime = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

const STATUS_CLS: Record<'SCHEDULED' | 'LIVE' | 'CLOSED', string> = {
  SCHEDULED: 'border-border bg-subtle text-text-muted',
  LIVE: 'border-primary bg-primary-soft text-primary',
  CLOSED: 'border-border bg-subtle text-text-faint',
};

/**
 * Operational panel. 6 max rows of today's exams (SCHEDULED or LIVE intersecting
 * today). Status pill on the right.
 */
export const TodaysExamsPanel = ({ items }: { items: DashboardSummary['todaysExams'] }) => (
  <section className="rounded-md border border-border bg-surface">
    <header className="flex h-8 items-center justify-between border-b border-border-soft px-4">
      <span className="text-base font-semibold">Today's Exams</span>
      <Link to="/exams" className="text-xs font-medium text-primary hover:underline">
        View all →
      </Link>
    </header>
    <div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-text-muted">No exams scheduled today.</p>
      ) : (
        items.map((e) => (
          <Link
            key={e.id}
            to={`/exams/${e.id}`}
            className="flex h-14 flex-col justify-center border-b border-border-soft px-4 last:border-0 hover:bg-hover"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-base text-text">
                {e.program ? `${e.program} · ` : ''}
                {e.title}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-sm border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.4px]',
                  STATUS_CLS[e.status],
                )}
              >
                {e.status}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-text-muted">
              {formatTime(e.opensAt)} → {formatTime(e.closesAt)}
              {' • '}
              {e.assignedCount} assigned
              {e.inProgressCount > 0 ? ` • ${e.inProgressCount} in progress` : ''}
            </div>
          </Link>
        ))
      )}
    </div>
  </section>
);
