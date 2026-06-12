import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpRight, CalendarClock, Sparkles, Target, Trophy } from 'lucide-react';
import { attemptsApi, type MyExamItem } from '@/lib/api/attempts.api';
import { analyticsApi } from '@/lib/api/analytics.api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table } from '@/components/ui/Table';
import { KpiStrip } from '@/components/reports/KpiStrip';
import { BarList, DonutChartFlat, LineChartFlat, ProgressBar } from '@/components/reports/charts';
import { scoreTone, toneColor } from '@/components/reports/charts/palette';
import { formatDate, fromNow } from '@/lib/utils/format';

/** Accuracy % for a graded exam, or null when the denominator is unknown. */
const examPct = (e: MyExamItem): number | null =>
  e.score != null && e.totalMarks > 0 ? (e.score / e.totalMarks) * 100 : null;

const isCompleted = (s: string): boolean => s === 'GRADED' || s === 'FLAGGED' || s === 'SUBMITTED';
const isGraded = (s: string): boolean => s === 'GRADED' || s === 'FLAGGED';

export const MyResultsPage = () => {
  const exams = useQuery({ queryKey: ['me', 'exams'], queryFn: attemptsApi.listMyExams });
  const summary = useQuery({ queryKey: ['me', 'summary'], queryFn: analyticsApi.mySummary });
  const subjects = useQuery({ queryKey: ['me', 'subjects'], queryFn: analyticsApi.mySubjects });
  const weak = useQuery({ queryKey: ['me', 'weak'], queryFn: analyticsApi.myWeakTopics });

  const all = exams.data ?? [];

  const derived = useMemo(() => {
    const completed = all.filter((e) => isCompleted(e.status));
    const graded = all
      .filter((e) => isGraded(e.status) && e.submittedAt)
      .sort((a, b) => new Date(a.submittedAt!).getTime() - new Date(b.submittedAt!).getTime());
    const gradedPcts = graded.map(examPct).filter((p): p is number => p != null);
    const best = gradedPcts.length ? Math.max(...gradedPcts) : null;

    const upcoming = all
      .filter((e) => e.status === 'NOT_STARTED')
      .sort((a, b) => {
        const ta = a.opensAt ? new Date(a.opensAt).getTime() : Infinity;
        const tb = b.opensAt ? new Date(b.opensAt).getTime() : Infinity;
        return ta - tb;
      });

    const recent = completed
      .slice()
      .sort(
        (a, b) =>
          new Date(b.submittedAt ?? 0).getTime() - new Date(a.submittedAt ?? 0).getTime(),
      )
      .slice(0, 6);

    // Status mix for the donut.
    const live = all.filter((e) => e.status === 'IN_PROGRESS').length;
    const statusMix = [
      { label: 'Graded', value: all.filter((e) => isGraded(e.status)).length, tone: 'success' as const },
      { label: 'Awaiting result', value: all.filter((e) => e.status === 'SUBMITTED').length, tone: 'primary' as const },
      { label: 'In progress', value: live, tone: 'warning' as const },
      { label: 'Upcoming', value: upcoming.length, tone: 'muted' as const },
    ].filter((s) => s.value > 0);

    // Trend: accuracy % across graded exams in chronological order.
    const trend = graded
      .map((e) => ({ label: `${e.examTitle} · ${formatDate(e.submittedAt)}`, value: examPct(e) }))
      .filter((d): d is { label: string; value: number } => d.value != null)
      .map((d) => ({ label: d.label, value: Math.round(d.value) }));
    const trendDelta =
      trend.length >= 2 ? Math.round(trend[trend.length - 1].value - trend[0].value) : null;

    return { completed, graded, best, upcoming, recent, statusMix, trend, trendDelta };
  }, [all]);

  const subj = subjects.data ?? [];
  const subjectBars = useMemo(
    () =>
      subj
        .slice()
        .sort((a, b) => b.scorePercent - a.scorePercent)
        .map((s) => ({
          label: s.subject,
          value: Math.round(s.scorePercent),
          tone: scoreTone(s.scorePercent),
          hint: `${s.correctCount}/${s.attemptsCount} correct · ${s.topicsCount} topic${s.topicsCount === 1 ? '' : 's'}`,
        })),
    [subj],
  );

  const strongest = subjectBars[0];
  const mastered = subj.filter((s) => s.scorePercent >= 75).length;
  const focusSubject = useMemo(() => {
    const ranked = subj.filter((s) => s.weakCount > 0).sort((a, b) => b.weakCount - a.weakCount);
    return ranked[0];
  }, [subj]);

  const accuracy = summary.data ? Math.round(summary.data.avgScore) : null;
  const weakCount = summary.data?.weakTopicsCount ?? weak.data?.length ?? 0;

  const kpis = [
    {
      label: 'Overall accuracy',
      value:
        accuracy == null ? (
          '—'
        ) : (
          <span style={{ color: toneColor(scoreTone(accuracy)) }}>{accuracy}%</span>
        ),
    },
    { label: 'Exams completed', value: `${derived.completed.length}/${all.length}` },
    {
      label: 'Best score',
      value:
        derived.best == null ? (
          '—'
        ) : (
          <span style={{ color: toneColor(scoreTone(derived.best)) }}>{Math.round(derived.best)}%</span>
        ),
    },
    { label: 'Strong areas', value: mastered, delta: mastered > 0 ? { text: '≥75%', direction: 'up' as const } : undefined },
    { label: 'Topics to revise', value: weakCount, delta: weakCount > 0 ? { text: 'action', direction: 'down' as const } : undefined },
  ];

  // ── Empty state: nothing assigned at all ─────────────────────────────────
  if (exams.isLoading) {
    return (
      <>
        <PageHeader title="My performance" description="Your results, trends and what to revise" />
        <KpiStrip loading />
      </>
    );
  }

  if (all.length === 0) {
    return (
      <>
        <PageHeader title="My performance" description="Your results, trends and what to revise" />
        <Card>
          <CardBody>
            <EmptyState
              title="No results yet"
              message="Your performance dashboard — accuracy trends, subject breakdowns and revision tips — unlocks after your first exam."
              action={
                <Link to="/me/upcoming" className="mt-2 inline-block">
                  <Button variant="primary">View upcoming exams</Button>
                </Link>
              }
            />
          </CardBody>
        </Card>
      </>
    );
  }

  const recentColumns: ColumnDef<MyExamItem>[] = [
    { header: 'Exam', accessorKey: 'examTitle' },
    { header: 'Status', cell: (c) => <StatusBadge value={c.row.original.status} /> },
    {
      header: 'Score',
      cell: (c) => {
        const p = examPct(c.row.original);
        return p == null ? (
          <span className="text-xs text-text-faint">—</span>
        ) : (
          <ProgressBar value={p} />
        );
      },
    },
    {
      header: 'Submitted',
      cell: (c) => (
        <span className="text-xs text-text-muted">
          {c.row.original.submittedAt ? fromNow(c.row.original.submittedAt) : '—'}
        </span>
      ),
    },
    {
      header: '',
      id: 'action',
      cell: (c) => (
        <Link to={`/me/attempts/${c.row.original.attemptId}/result`}>
          <Button size="sm" variant="ghost">
            View <ArrowUpRight size={13} />
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="My performance" description="Your results, trends and what to revise" />

      <KpiStrip items={kpis} />

      {/* Trend + status mix */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>Accuracy trend</CardHeader>
          <CardBody>
            {derived.trend.length > 0 ? (
              <>
                <LineChartFlat data={derived.trend} />
                {derived.trendDelta != null ? (
                  <p className="mt-2 text-xs text-text-muted">
                    {derived.trendDelta >= 0 ? '▲' : '▼'} {Math.abs(derived.trendDelta)}% since your
                    first graded exam.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="py-6 text-center text-[13px] text-text-muted">
                Your accuracy trend appears once your first exam is graded.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>Status mix</CardHeader>
          <CardBody>
            {derived.statusMix.length > 0 ? (
              <DonutChartFlat
                data={derived.statusMix}
                centerValue={all.length}
                centerLabel="exams"
              />
            ) : (
              <p className="py-6 text-center text-[13px] text-text-muted">No exams yet.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Subject performance + weak topics */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>Subject performance</CardHeader>
          <CardBody>
            {subjectBars.length > 0 ? (
              <BarList data={subjectBars} max={100} unit="%" />
            ) : (
              <p className="py-6 text-center text-[13px] text-text-muted">
                Subject breakdown appears after graded exams cover your subjects.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>Topics to revise</CardHeader>
          <CardBody>
            {weak.data && weak.data.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {weak.data.slice(0, 6).map((t) => (
                  <li key={`${t.subject}-${t.topic}`} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-text" title={`${t.subject} · ${t.topic}`}>
                        {t.subject} · {t.topic}
                      </span>
                      <ProgressBar value={t.scorePercent} width={64} />
                    </div>
                    <span className="text-xs text-text-muted">{t.recommendation}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-6 text-center">
                <p className="text-[13px] font-medium text-text">No weak areas flagged 🎯</p>
                <p className="mt-1 text-xs text-text-muted">
                  Topics to revise appear after you complete graded exams.
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Personalized insights */}
      {(strongest || focusSubject || mastered > 0) && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <InsightCard
            icon={<Trophy size={16} className="text-success" />}
            label="Strongest subject"
            value={strongest ? `${strongest.label} · ${strongest.value}%` : '—'}
          />
          <InsightCard
            icon={<Target size={16} className="text-warning" />}
            label="Focus next on"
            value={focusSubject ? `${focusSubject.subject} · ${focusSubject.weakCount} weak topic${focusSubject.weakCount === 1 ? '' : 's'}` : 'Nothing flagged'}
          />
          <InsightCard
            icon={<Sparkles size={16} className="text-primary" />}
            label="Subjects mastered"
            value={`${mastered} of ${subj.length || 0}`}
          />
        </div>
      )}

      {/* Recent + upcoming */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>Recent exams</CardHeader>
          <CardBody>
            <Table
              columns={recentColumns}
              data={derived.recent}
              empty={<span className="text-[13px] text-text-muted">No completed exams yet.</span>}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>Upcoming exams</CardHeader>
          <CardBody>
            {derived.upcoming.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border">
                {derived.upcoming.slice(0, 6).map((e) => (
                  <li key={e.examId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-text" title={e.examTitle}>
                        {e.examTitle}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <CalendarClock size={12} />
                        {e.opensAt ? `Opens ${fromNow(e.opensAt)}` : 'Open now'} ·{' '}
                        {e.totalMarks} marks
                      </div>
                    </div>
                    <Link to="/me/upcoming">
                      <Button size="sm" variant="ghost">
                        Details
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-[13px] text-text-muted">
                No upcoming exams scheduled.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
};

const InsightCard = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="flex items-start gap-3 rounded-md border border-border bg-surface p-3">
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-subtle">
      {icon}
    </div>
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="truncate text-[13px] font-semibold text-text" title={value}>
        {value}
      </div>
    </div>
  </div>
);
