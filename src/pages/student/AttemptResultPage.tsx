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

  return (
    <>
      <PageHeader title={r.examTitle} description={`Status: ${r.status}`} />
      <Card>
        <CardHeader>Your score</CardHeader>
        <CardBody>
          <p className="text-xl font-semibold">
            {r.score} <span className="text-text-muted">out of {r.totalMarks}</span>{' '}
            <span className="ml-2 text-sm text-text-muted">({pct}%)</span>
          </p>
          {r.autoSubmitted ? <p className="mt-1 text-sm text-warning">Auto-submitted.</p> : null}
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
