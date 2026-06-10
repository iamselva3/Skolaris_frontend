import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { examsApi, type ExamAttemptSummary } from '@/lib/api/exams.api';
import { studentsApi } from '@/lib/api/students.api';
import { analyticsApi } from '@/lib/api/analytics.api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { formatDateTime } from '@/lib/utils/format';

export const ExamDetailPage = () => {
  const { id = '' } = useParams<{ id: string }>();
  const [tab, setTab] = useState<'overview' | 'attempts' | 'analytics'>('overview');

  const exam = useQuery({ queryKey: ['exam', id], queryFn: () => examsApi.get(id) });
  const attempts = useQuery({
    queryKey: ['exam', id, 'attempts'],
    queryFn: () => examsApi.listAttempts(id, { limit: 200 }),
    enabled: tab === 'attempts',
  });
  // Resolve studentId → name/email for the attempts table (the attempts API
  // returns only studentId). Existing endpoint, display-only. The list endpoint
  // caps `limit` at 200, so page through to cover larger student bodies.
  const students = useQuery({
    queryKey: ['students', 'for-attempts'],
    queryFn: async () => {
      const PAGE = 200;
      const all: Awaited<ReturnType<typeof studentsApi.list>>['data'] = [];
      for (let offset = 0; ; offset += PAGE) {
        const page = await studentsApi.list({ limit: PAGE, offset });
        all.push(...page.data);
        if (page.data.length < PAGE || all.length >= page.meta.total) break;
      }
      return all;
    },
    enabled: tab === 'attempts',
    staleTime: 5 * 60 * 1000,
  });
  const studentMap = useMemo(
    () => new Map((students.data ?? []).map((s) => [s.id, s])),
    [students.data],
  );
  const summary = useQuery({
    queryKey: ['exam', id, 'summary'],
    queryFn: () => analyticsApi.examSummary(id),
    enabled: tab === 'analytics',
  });

  const columns: ColumnDef<ExamAttemptSummary>[] = [
    {
      header: 'Student',
      cell: (c) => {
        const s = studentMap.get(c.row.original.studentId);
        return (
          <Link
            className="text-primary hover:underline"
            to={`/exams/${id}/attempts/${c.row.original.id}`}
          >
            {s?.name ?? `${c.row.original.studentId.slice(0, 8)}…`}
          </Link>
        );
      },
    },
    {
      header: 'Email',
      cell: (c) => studentMap.get(c.row.original.studentId)?.email ?? '—',
    },
    { header: 'Status', cell: (c) => <StatusBadge value={c.row.original.status} /> },
    { header: 'Score', cell: (c) => c.row.original.score ?? '—' },
    { header: 'Violations', accessorKey: 'violationCount' },
    { header: 'Auto-submit', cell: (c) => (c.row.original.autoSubmitted ? 'yes' : 'no') },
    { header: 'Submitted', cell: (c) => formatDateTime(c.row.original.submittedAt) },
  ];

  if (exam.error) return <ErrorBanner onRetry={() => exam.refetch()} />;
  if (!exam.data) return <p className="loading-line">Loading…</p>;

  return (
    <>
      <PageHeader
        title={exam.data.title}
        description={`Status: ${exam.data.status}`}
        actions={
          <Link to={`/exams/${id}/compose`}>
            <Button variant="secondary">Compose</Button>
          </Link>
        }
      />
      <Tabs
        active={tab}
        onChange={(k) => setTab(k as 'overview' | 'attempts' | 'analytics')}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'attempts', label: 'Attempts' },
          { key: 'analytics', label: 'Analytics' },
        ]}
      />
      {tab === 'overview' && (
        <Card>
          <CardHeader>Exam configuration</CardHeader>
          <CardBody>
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-text-muted">Duration</dt>
                <dd>{Math.round(exam.data.durationSeconds / 60)} min</dd>
              </div>
              <div>
                <dt className="text-text-muted">Total marks</dt>
                <dd>{exam.data.totalMarks}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Questions</dt>
                <dd>{exam.data.questions.length}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Opens</dt>
                <dd>{formatDateTime(exam.data.opensAt)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Closes</dt>
                <dd>{formatDateTime(exam.data.closesAt)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Negative marks (default)</dt>
                <dd>{exam.data.defaultNegativeMarks}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      )}
      {tab === 'attempts' && (
        <Table
          columns={columns}
          data={attempts.data?.data ?? []}
          empty={<>No attempts yet.</>}
        />
      )}
      {tab === 'analytics' && (
        <>
          <div className="grid grid-cols-stats-5 gap-3">
            <StatCard label="Total attempts" value={summary.data?.totalAttempts ?? '—'} />
            <StatCard label="Submitted"      value={summary.data?.submittedCount ?? '—'} />
            <StatCard label="Graded"         value={summary.data?.gradedCount ?? '—'} />
            <StatCard label="Avg score"      value={summary.data?.avgScore.toFixed(1) ?? '—'} />
          </div>
          <div className="mt-4">
            <Card>
              <CardHeader>Score distribution</CardHeader>
              <CardBody>
                <ul className="space-y-2">
                  {summary.data?.distribution.map((b) => (
                    <li key={b.bucket} className="flex items-center gap-3 text-sm">
                      <span className="w-16 text-text-muted">{b.bucket}%</span>
                      <span className="h-2 flex-1 rounded bg-surface-muted">
                        <span
                          className="block h-full rounded bg-primary"
                          style={{
                            width: `${
                              summary.data.totalAttempts === 0
                                ? 0
                                : (b.count / Math.max(1, summary.data.totalAttempts)) * 100
                            }%`,
                          }}
                        />
                      </span>
                      <span className="w-10 text-right">{b.count}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </>
  );
};
