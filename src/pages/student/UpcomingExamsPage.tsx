import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api/attempts.api';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Clock, ArrowRight } from 'lucide-react';
import { formatDateTime } from '@/lib/utils/format';

export const UpcomingExamsPage = () => {
  const list = useQuery({ queryKey: ['me', 'exams'], queryFn: attemptsApi.listMyExams });
  
  const upcoming = (list.data ?? [])
    .filter((e) => e.status === 'NOT_STARTED')
    .sort((a, b) => {
      if (!a.opensAt && !b.opensAt) return 0;
      if (!a.opensAt) return 1;
      if (!b.opensAt) return -1;
      return new Date(a.opensAt).getTime() - new Date(b.opensAt).getTime();
    });

  return (
    <>
      <PageHeader title="Upcoming Exams" description="Exams scheduled for the future." />

      {list.error ? <ErrorBanner onRetry={() => list.refetch()} /> : null}

      <section className="mt-4 rounded-md border border-border bg-surface">
        <header className="flex h-12 items-center justify-between border-b border-border-soft px-4">
          <span className="flex items-center gap-2 text-base font-semibold text-text">
            <Clock size={18} className="text-text-muted" aria-hidden /> Upcoming ({upcoming.length})
          </span>
        </header>
        <div>
          {upcoming.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-text-muted">Nothing scheduled yet. Your teacher will notify you when an exam is assigned.</p>
          ) : (
            upcoming.map((e) => (
              <Link
                key={e.attemptId}
                to={`/me/exams/${e.examId}/attempt`}
                className="flex h-16 items-center justify-between gap-3 border-b border-border-soft px-4 last:border-0 hover:bg-hover"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-base text-text" title={e.examTitle}>
                      {e.examTitle}
                    </span>
                    <span className="inline-flex shrink-0 items-center rounded border border-border bg-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.4px] text-text-muted">
                      UPCOMING
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-text-muted">
                    {Math.round(e.durationSeconds / 60)} min
                    {e.opensAt ? ` • opens ${formatDateTime(e.opensAt)}` : ''}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium text-primary">
                  Start <ArrowRight size={14} className="ml-1 inline" aria-hidden />
                </span>
              </Link>
            ))
          )}
        </div>
      </section>
    </>
  );
};
