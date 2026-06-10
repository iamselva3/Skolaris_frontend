import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { examsApi } from '@/lib/api/exams.api';
import { questionsApi } from '@/lib/api/questions.api';
import { studentsApi } from '@/lib/api/students.api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { renderWithMath } from '@/components/ui/render-with-math';
import { cn } from '@/lib/utils/cn';
import { formatDateTime } from '@/lib/utils/format';

type AttemptAnswer = {
  id: string;
  examQuestionId: string;
  answerPayload: Record<string, unknown> | null;
  isCorrect: boolean | null;
  marksAwarded: number | null;
  timeSpentSeconds: number;
  isFlaggedByStudent: boolean;
};

export const ExamAttemptDetailPage = () => {
  const { id = '', attemptId = '' } = useParams<{ id: string; attemptId: string }>();

  const q = useQuery({
    queryKey: ['exam', id, 'attempt', attemptId],
    queryFn: () => examsApi.getAttempt(id, attemptId),
    enabled: Boolean(id && attemptId),
  });

  // Exam detail maps examQuestionId → the underlying bank questionId + position,
  // so we can fetch and render the real question for each answer.
  const exam = useQuery({
    queryKey: ['exam', id],
    queryFn: () => examsApi.get(id),
    enabled: Boolean(id),
  });
  const eqMap = useMemo(
    () => new Map((exam.data?.questions ?? []).map((eq) => [eq.id, eq])),
    [exam.data],
  );

  const studentId = q.data?.attempt.studentId;
  const student = useQuery({
    queryKey: ['student', studentId],
    queryFn: () => studentsApi.get(studentId!),
    enabled: Boolean(studentId),
    staleTime: 5 * 60 * 1000,
  });

  if (!q.data) return <p className="loading-line">Loading…</p>;
  const { attempt, answers, violations } = q.data;

  // Show answers in the exam's question order when we know it.
  const ordered = [...answers].sort(
    (a, b) => (eqMap.get(a.examQuestionId)?.position ?? 0) - (eqMap.get(b.examQuestionId)?.position ?? 0),
  );

  return (
    <>
      <PageHeader
        title={student.data?.name ?? `Attempt ${attempt.id.slice(0, 8)}…`}
        description={
          (student.data?.email ? `${student.data.email} · ` : '') +
          `Score: ${attempt.score ?? '—'} · Violations: ${attempt.violationCount}`
        }
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
            {ordered.length === 0 ? (
              <p className="text-sm text-text-muted">No answers recorded.</p>
            ) : (
              <ul className="divide-y divide-border">
                {ordered.map((a) => (
                  <AnswerReviewItem
                    key={a.id}
                    index={eqMap.get(a.examQuestionId)?.position}
                    questionId={eqMap.get(a.examQuestionId)?.questionId}
                    answer={a}
                  />
                ))}
              </ul>
            )}
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

/* ─────────────────────────── One reviewed answer (real question + response) */

const AnswerReviewItem = ({
  index,
  questionId,
  answer,
}: {
  index?: number;
  questionId?: string;
  answer: AttemptAnswer;
}) => {
  const q = useQuery({
    queryKey: ['question', questionId],
    queryFn: () => questionsApi.get(questionId!),
    enabled: Boolean(questionId),
    staleTime: 5 * 60 * 1000,
  });
  const question = q.data;
  const stemHtml =
    typeof question?.payload?.contentHtml === 'string'
      ? (question.payload.contentHtml as string)
      : '';
  // renderWithMath is a hook — call unconditionally.
  const stem = renderWithMath(stemHtml);

  const payload = answer.answerPayload ?? {};
  const selectedIds = new Set<string>();
  if (typeof payload.selectedOptionId === 'string') selectedIds.add(payload.selectedOptionId);
  if (Array.isArray(payload.selectedOptionIds)) {
    for (const s of payload.selectedOptionIds) if (typeof s === 'string') selectedIds.add(s);
  }

  return (
    <li className="py-4 text-sm first:pt-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-subtle px-1.5 text-xs font-bold text-text">
            {index !== undefined ? index + 1 : '?'}
          </span>
          {question ? <StatusBadge value={question.type} /> : null}
        </span>
        <span className="flex items-center gap-3 text-xs">
          {answer.isCorrect === true ? (
            <span className="font-medium text-success">Correct</span>
          ) : answer.isCorrect === false ? (
            <span className="font-medium text-danger">Incorrect</span>
          ) : (
            <span className="text-text-muted">Pending</span>
          )}
          <span className="text-text-muted">Marks: {answer.marksAwarded ?? '—'}</span>
          <span className="text-text-faint">{answer.timeSpentSeconds}s</span>
          {answer.isFlaggedByStudent ? <span className="text-warning">Flagged</span> : null}
        </span>
      </div>

      {/* Question stem (text, images, math, tables) */}
      {q.isLoading ? (
        <p className="text-xs text-text-faint">Loading question…</p>
      ) : !question ? (
        <p className="text-xs text-text-faint">Question unavailable.</p>
      ) : stemHtml ? (
        <div className="mb-2">{stem}</div>
      ) : (
        <p className="mb-2 text-xs italic text-text-faint">(No question content.)</p>
      )}

      {/* Response */}
      {question ? <ResponseView question={question} selectedIds={selectedIds} payload={payload} /> : null}
    </li>
  );
};

const ResponseView = ({
  question,
  selectedIds,
  payload,
}: {
  question: { type: string; options: Array<{ id: string; label: string; isCorrect: boolean }>; payload: Record<string, unknown> };
  selectedIds: Set<string>;
  payload: Record<string, unknown>;
}) => {
  // Choice-style questions (SINGLE / MULTIPLE / VISUAL): show the real options,
  // mark the student's choice and the correct answer(s).
  if (question.options.length > 0) {
    return (
      <ul className="space-y-1">
        {question.options.map((o, i) => {
          const chosen = selectedIds.has(o.id);
          return (
            <li
              key={o.id}
              className={cn(
                'flex items-center gap-2 rounded border px-2 py-1.5',
                o.isCorrect
                  ? 'border-success bg-success-soft'
                  : chosen
                    ? 'border-danger bg-danger-soft'
                    : 'border-border-soft bg-surface',
              )}
            >
              <span className="font-mono text-xs text-text-muted">{String.fromCharCode(65 + i)}.</span>
              <span className="flex-1">{o.label}</span>
              {chosen ? <span className="text-[11px] font-semibold text-text">Chosen</span> : null}
              {o.isCorrect ? <span className="text-[11px] font-semibold text-success">Correct</span> : null}
            </li>
          );
        })}
      </ul>
    );
  }

  if (question.type === 'TRUE_FALSE') {
    const given = payload.answer as boolean | undefined;
    const correct = question.payload.correct as boolean | undefined;
    return (
      <p className="text-sm">
        <span className="text-text-muted">Answered: </span>
        <span className="font-medium">{given === undefined ? '—' : given ? 'True' : 'False'}</span>
        {correct !== undefined ? (
          <span className="ml-3 text-success">Correct: {correct ? 'True' : 'False'}</span>
        ) : null}
      </p>
    );
  }

  // Fill-blank / numerical / descriptive: show the typed answer.
  const text = typeof payload.text === 'string' ? payload.text : '';
  const accepted = (question.payload.accepted as string[] | undefined) ?? [];
  return (
    <div className="space-y-1">
      <div className="rounded border border-border-soft bg-surface px-2 py-1.5">
        <span className="text-text-muted">Answer: </span>
        {text ? <span className="font-medium">{text}</span> : <span className="text-text-faint">— (not answered)</span>}
      </div>
      {accepted.length > 0 ? (
        <p className="text-xs text-success">Accepted: {accepted.join(', ')}</p>
      ) : null}
    </div>
  );
};
