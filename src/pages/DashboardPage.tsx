import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api/dashboard.api';
import { attemptsApi, type MyExamItem } from '@/lib/api/attempts.api';
import { getModuleCardsForRole } from '@/lib/dashboard/module-cards.config';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { useActiveBranch } from '@/lib/hooks/use-active-branch';
import { usePageHeader } from '@/lib/page-header/use-page-header';
import { ModuleCardGrid } from '@/components/dashboard/ModuleCardGrid';
import { OcrReviewQueuePanel } from '@/components/dashboard/OcrReviewQueuePanel';
import { TodaysExamsPanel } from '@/components/dashboard/TodaysExamsPanel';
import { StatCard } from '@/components/ui/StatCard';
import { Activity } from 'lucide-react';

const computeStats = (items: MyExamItem[]) => {
  const completedItems = items.filter(
    (e) => e.status === 'SUBMITTED' || e.status === 'GRADED' || e.status === 'FLAGGED',
  );
  const scored = completedItems.filter((e) => typeof e.score === 'number');
  const avg = scored.length > 0 ? scored.reduce((s, e) => s + (e.score ?? 0), 0) / scored.length : null;
  const best = scored.length > 0 ? Math.max(...scored.map((e) => e.score ?? 0)) : null;
  return {
    total: items.length,
    completed: completedItems.length,
    pending: items.filter((e) => e.status === 'NOT_STARTED' || e.status === 'IN_PROGRESS').length,
    avgScore: avg,
    bestScore: best,
  };
};

export const DashboardPage = () => {
  const { user } = useCurrentUser();

  usePageHeader(
    useMemo(
      () => ({ title: 'Dashboard', breadcrumb: [{ label: 'Dashboard' }] }),
      [],
    ),
  );

  const isStudent = user?.role === 'STUDENT';

  // Scope KPIs to the active branch. Including it in the key makes the query
  // refetch automatically whenever the branch picker changes.
  const activeBranchId = useActiveBranch();

  const summary = useQuery({
    queryKey: ['dashboard', 'summary', activeBranchId],
    queryFn: () => dashboardApi.summary(activeBranchId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const studentExams = useQuery({
    queryKey: ['me', 'exams'],
    queryFn: attemptsApi.listMyExams,
    enabled: isStudent,
  });

  const data = useMemo(() => {
    if (isStudent) {
      return { summary: summary.data ?? null, studentExams: studentExams.data ?? null };
    }
    return summary.data ?? null;
  }, [summary.data, studentExams.data, isStudent]);

  const stats = useMemo(() => isStudent ? computeStats(studentExams.data ?? []) : null, [isStudent, studentExams.data]);
  const pct = stats && stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  if (!user) return null;

  const cards = getModuleCardsForRole(user.role);
  const loading = summary.isLoading || (isStudent && studentExams.isLoading);

  return (
    <>
      {isStudent && stats && (
        <div className="mb-8 space-y-6">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Assigned" value={stats.total} />
            <StatCard
              label="Pending"
              value={stats.pending}
              delta={stats.pending > 0 ? { text: 'action needed', direction: 'down' } : undefined}
            />
            <StatCard label="Completed" value={stats.completed} />
            <StatCard label="Average score" value={stats.avgScore !== null ? stats.avgScore.toFixed(1) : '—'} />
            <StatCard label="Best score" value={stats.bestScore !== null ? stats.bestScore.toFixed(1) : '—'} />
          </section>

          <section className="rounded-md border border-border bg-surface">
            <header className="flex h-12 items-center justify-between border-b border-border-soft px-4">
              <span className="flex items-center gap-2 text-lg font-semibold text-text">
                <Activity size={18} className="text-primary" aria-hidden /> Overall completion
              </span>
            </header>
            <div className="p-6">
              <div className="mb-2 flex items-baseline justify-between text-sm text-text-muted">
                <span>Progress bar</span>
                <span className="font-mono tabular-nums text-text">
                  {stats.completed}/{stats.total} • {pct}%
                </span>
              </div>
              <div className="h-4 w-full overflow-hidden rounded-full bg-subtle">
                <div className="h-4 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </section>
        </div>
      )}

      <ModuleCardGrid cards={cards} data={data} loading={loading} />

      {!isStudent && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {user.role !== 'STUDENT' ? (
            <OcrReviewQueuePanel items={summary.data?.ocrReviewQueue ?? []} />
          ) : null}
          <TodaysExamsPanel items={summary.data?.todaysExams ?? []} />
        </div>
      )}
    </>
  );
};
