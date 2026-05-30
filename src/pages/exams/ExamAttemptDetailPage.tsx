import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { examsApi } from '@/lib/api/exams.api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDateTime } from '@/lib/utils/format';

export const ExamAttemptDetailPage = () => {
  const { id = '', attemptId = '' } = useParams<{ id: string; attemptId: string }>();
  const q = useQuery({
    queryKey: ['exam', id, 'attempt', attemptId],
    queryFn: () => examsApi.getAttempt(id, attemptId),
    enabled: Boolean(id && attemptId),
  });

  if (!q.data) return <p className="loading-line">Loading…</p>;
  const { attempt, answers, violations } = q.data;

  return (
    <>
      <PageHeader
        title={`Attempt ${attempt.id.slice(0, 8)}…`}
        description={`Score: ${attempt.score ?? '—'} · Violations: ${attempt.violationCount}`}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge value={attempt.status} />
        {attempt.autoSubmitted ? <StatusBadge value="AUTO_SUBMIT" /> : null}
        {attempt.descriptivePending ? <StatusBadge value="DESCRIPTIVE_PENDING" /> : null}
        <span className="text-text-muted">Submitted: {formatDateTime(attempt.submittedAt)}</span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>Answers ({answers.length})</CardHeader>
          <CardBody>
            <ul className="divide-y divide-border">
              {answers.map((a) => (
                <li key={a.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">{a.examQuestionId.slice(0, 8)}…</span>
                    <span className="text-text-muted">{a.timeSpentSeconds}s</span>
                  </div>
                  <pre className="mt-1 overflow-x-auto rounded border border-border bg-surface-muted p-2 text-xs">
{JSON.stringify(a.answerPayload, null, 2)}
                  </pre>
                  <div className="mt-1 flex items-center gap-3">
                    {a.isCorrect === true ? (
                      <span className="text-success">Correct</span>
                    ) : a.isCorrect === false ? (
                      <span className="text-danger">Incorrect</span>
                    ) : (
                      <span className="text-text-muted">Pending</span>
                    )}
                    <span>Marks: {a.marksAwarded ?? '—'}</span>
                    {a.isFlaggedByStudent ? <span className="text-warning">Flagged</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>Violations</CardHeader>
          <CardBody>
            {violations.length === 0 ? (
              <p className="text-sm text-text-muted">No violations.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {violations.map((v) => (
                  <li key={v.id} className="border-l-2 border-warning pl-3">
                    <div className="font-medium">{v.type.replace(/_/g, ' ').toLowerCase()}</div>
                    <div className="text-text-muted">{formatDateTime(v.serverTimestamp)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
};
