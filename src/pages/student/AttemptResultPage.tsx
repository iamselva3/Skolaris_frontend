import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api/attempts.api';
import { analyticsApi } from '@/lib/api/analytics.api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table } from '@/components/ui/Table';
import { DonutChartFlat } from '@/components/reports/charts';
import { scoreTone, toneColor } from '@/components/reports/charts/palette';
import { formatSeconds } from '@/lib/utils/format';

export const AttemptResultPage = () => {
  const { attemptId = '' } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const result = useQuery({
    queryKey: ['attempt', attemptId, 'result'],
    queryFn: () => attemptsApi.result(attemptId),
    retry: (failureCount, err) => {
      // 425 = grading still in progress; keep retrying.
      const status = (err as { response?: { status?: number } } | undefined)?.response?.status;
      return status === 425 && failureCount < 30;
    },
    retryDelay: 2000,
  });
  const weak = useQuery({ queryKey: ['me', 'weak'], queryFn: analyticsApi.myWeakTopics, enabled: result.isSuccess });

  useEffect(() => {
    if (!attemptId) navigate('/me/exams');
  }, [attemptId, navigate]);

  if (result.isLoading) {
    return <p className="loading-line">Grading… checking back automatically.</p>;
  }
  if (!result.data) {
    return <p className="loading-line text-danger">Could not load result.</p>;
  }
  const r = result.data;
  const pct = r.totalMarks === 0 ? 0 : Math.round((r.score / r.totalMarks) * 100);

  const correct = r.perQuestion.filter((q) => q.isCorrect === true).length;
  const incorrect = r.perQuestion.filter((q) => q.isCorrect === false).length;
  const pending = r.perQuestion.filter((q) => q.isCorrect === null).length;
  const graded = correct + incorrect;
  const accuracy = graded > 0 ? Math.round((correct / graded) * 100) : null;
  const totalTime = r.perQuestion.reduce((a, q) => a + q.timeSpentSeconds, 0);
  const avgTime = r.perQuestion.length > 0 ? Math.round(totalTime / r.perQuestion.length) : 0;

  const donut = [
    { label: 'Correct', value: correct, tone: 'success' as const },
    { label: 'Incorrect', value: incorrect, tone: 'danger' as const },
    { label: 'Pending', value: pending, tone: 'muted' as const },
  ].filter((s) => s.value > 0);

  return (
    <>
      <PageHeader title={r.examTitle} description={`Status: ${r.status}`} />
      <Card>
        <CardHeader>Your score</CardHeader>
        <CardBody>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-3xl font-semibold" style={{ color: toneColor(scoreTone(pct)) }}>
                {pct}%
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {r.score} out of {r.totalMarks} marks
              </p>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-4">
                <ScoreStat label="Correct" value={correct} className="text-success" />
                <ScoreStat label="Incorrect" value={incorrect} className="text-danger" />
                {accuracy != null ? <ScoreStat label="Accuracy" value={`${accuracy}%`} /> : null}
                <ScoreStat label="Avg / question" value={formatSeconds(avgTime)} />
              </div>
            </div>
            {donut.length > 0 ? (
              <DonutChartFlat data={donut} centerValue={`${pct}%`} centerLabel="score" />
            ) : null}
          </div>
          {r.autoSubmitted ? <p className="mt-3 text-sm text-warning">Auto-submitted.</p> : null}
          {r.descriptivePending ? (
            <p className="mt-1 text-sm text-text-muted">
              Descriptive answers are pending teacher grading — your final score may update.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="mt-6">
        <Card>
          <CardHeader>Per-question breakdown</CardHeader>
          <CardBody>
            <Table
              columns={[
                {
                  header: 'Question',
                  cell: (c) => `Q${c.row.index + 1}`,
                },
                {
                  header: 'Correct',
                  cell: (c) =>
                    c.row.original.isCorrect === null ? (
                      <StatusBadge value="PENDING" />
                    ) : c.row.original.isCorrect ? (
                      <span className="text-success">Yes</span>
                    ) : (
                      <span className="text-danger">No</span>
                    ),
                },
                { header: 'Marks', cell: (c) => c.row.original.marksAwarded ?? '—' },
                { header: 'Time (s)', accessorKey: 'timeSpentSeconds' },
              ]}
              data={r.perQuestion}
            />
          </CardBody>
        </Card>
      </div>

      {weak.data && weak.data.length > 0 ? (
        <div className="mt-6">
          <Card>
            <CardHeader>Topics to revisit</CardHeader>
            <CardBody>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {weak.data.map((t) => (
                  <li key={`${t.subject}-${t.topic}`}>{t.recommendation}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <div className="mt-6">
        <Button onClick={() => navigate('/me/exams')}>Back to My exams</Button>
      </div>
    </>
  );
};

const ScoreStat = ({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) => (
  <div>
    <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
    <div className={`font-mono text-sm font-semibold tabular-nums ${className ?? 'text-text'}`}>
      {value}
    </div>
  </div>
);
