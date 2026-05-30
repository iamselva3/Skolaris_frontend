import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Flag } from 'lucide-react';
import { attemptsApi, type AttemptQuestion } from '@/lib/api/attempts.api';
import type { ViolationType } from '@/lib/types';
import { apiErrorMessage } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import { formatSeconds } from '@/lib/utils/format';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Radio } from '@/components/ui/Radio';
import { Textarea } from '@/components/ui/Textarea';
import { renderWithMath } from '@/components/ui/render-with-math';

const HEARTBEAT_MS = 30_000;
const AUTOSAVE_MS = 800;
const VIOLATION_FLUSH_MS = 5_000;

export const AttemptPage = () => {
  const { examId = '' } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const start = useQuery({
    queryKey: ['start', examId],
    queryFn: () => attemptsApi.start(examId),
    enabled: Boolean(examId),
    retry: false,
    // Don't re-fetch the attempt when the tab regains focus — a student
    // tab-switching mid-exam must not reset/reshuffle their question set.
    refetchOnWindowFocus: false,
  });

  if (start.error) {
    return (
      <div className="attempt-shell items-center justify-center">
        <p className="mt-12 text-sm text-danger">{apiErrorMessage(start.error)}</p>
        <Button className="mt-3" onClick={() => navigate('/me/exams')}>
          Back to My exams
        </Button>
      </div>
    );
  }
  if (!start.data) {
    return <div className="loading-line p-6">Loading attempt…</div>;
  }
  return (
    <AttemptRunner
      attemptId={start.data.attempt.id}
      initialRemaining={start.data.attempt.timeRemainingSeconds ?? 0}
      questions={start.data.questions}
    />
  );
};

interface AnswerState {
  payload: Record<string, unknown> | null;
  flagged: boolean;
  timeSpent: number;
  dirty: boolean;
}

const AttemptRunner = ({
  attemptId,
  initialRemaining,
  questions,
}: {
  attemptId: string;
  initialRemaining: number;
  questions: AttemptQuestion[];
}) => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [autoSubmittedModal, setAutoSubmittedModal] = useState(false);

  const violationsRef = useRef<Array<{ type: ViolationType; clientTimestamp: string; detail?: Record<string, unknown> }>>([]);
  const lastQuestionStartRef = useRef<number>(Date.now());

  /* ----- Local timer (1 Hz). Server reconciles via heartbeat. ----- */
  useEffect(() => {
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  /* ----- Auto Fullscreen ----- */
  useEffect(() => {
    const requestFS = async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        console.warn('Browser blocked auto-fullscreen:', err);
      }
    };
    void requestFS();
  }, []);

  /* ----- Heartbeat every 30s. Reconciles with server-authoritative remaining. ----- */
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await attemptsApi.heartbeat(attemptId, remaining);
        setRemaining(r.serverTimeRemainingSeconds);
        if (r.autoSubmitted) {
          setAutoSubmittedModal(true);
        }
      } catch (err) {
        toast.error(apiErrorMessage(err));
      }
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [attemptId, remaining]);

  /* ----- Auto-submit when timer hits 0 (defence in depth; server cron also does this) ----- */
  useEffect(() => {
    if (remaining > 0) return;
    void (async () => {
      try {
        await attemptsApi.submit(attemptId);
        toast.success('Time up — submitted');
        navigate(`/me/attempts/${attemptId}/result`);
      } catch (err) {
        toast.error(apiErrorMessage(err));
      }
    })();
  }, [remaining, attemptId, navigate]);

  /* ----- Anti-cheat client hooks ----- */
  useEffect(() => {
    const pushViolation = (type: ViolationType, detail?: Record<string, unknown>): void => {
      violationsRef.current.push({
        type,
        clientTimestamp: new Date().toISOString(),
        detail,
      });
    };
    const onVis = (): void => {
      if (document.hidden) pushViolation('TAB_SWITCH');
    };
    const onBlur = (): void => pushViolation('WINDOW_BLUR');
    const onContext = (e: MouseEvent): void => {
      e.preventDefault();
      pushViolation('RIGHT_CLICK');
    };
    const onCopy = (): void => pushViolation('COPY_ATTEMPT');
    const onPaste = (): void => pushViolation('PASTE_ATTEMPT');

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('contextmenu', onContext);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  /* ----- Flush violations every 5s ----- */
  useEffect(() => {
    const id = setInterval(async () => {
      const batch = violationsRef.current.splice(0);
      if (batch.length === 0) return;
      try {
        const r = await attemptsApi.recordViolations(attemptId, batch);
        if (r.autoSubmitted) {
          setAutoSubmittedModal(true);
        } else if (r.flagged) {
          toast.warning('Your attempt has been flagged for review.');
        }
      } catch (err) {
        toast.error(apiErrorMessage(err));
      }
    }, VIOLATION_FLUSH_MS);
    return () => clearInterval(id);
  }, [attemptId]);

  /* ----- Reset per-question timer when switching question ----- */
  useEffect(() => {
    lastQuestionStartRef.current = Date.now();
  }, [current]);

  /* ----- Per-question answer change handler (debounced autosave) ----- */
  const upsertTimer = useRef<number | null>(null);
  const queueSave = useCallback(
    (eqId: string, payload: Record<string, unknown> | null, flagged: boolean) => {
      const elapsed = Math.floor((Date.now() - lastQuestionStartRef.current) / 1000);
      setAnswers((cur) => ({
        ...cur,
        [eqId]: { payload, flagged, timeSpent: (cur[eqId]?.timeSpent ?? 0) + elapsed, dirty: true },
      }));
      lastQuestionStartRef.current = Date.now();

      if (upsertTimer.current) window.clearTimeout(upsertTimer.current);
      upsertTimer.current = window.setTimeout(async () => {
        try {
          const a = answers[eqId];
          await attemptsApi.upsertAnswer(attemptId, eqId, {
            answerPayload: payload,
            timeSpentSeconds: (a?.timeSpent ?? 0) + elapsed,
            isFlagged: flagged,
          });
        } catch (err) {
          toast.error(apiErrorMessage(err));
        }
      }, AUTOSAVE_MS);
    },
    [answers, attemptId],
  );

  const submit = useMutation({
    mutationFn: () => attemptsApi.submit(attemptId),
    onSuccess: () => {
      toast.success('Submitted');
      navigate(`/me/attempts/${attemptId}/result`);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const q = questions[current];
  const state = q ? answers[q.examQuestionId] : undefined;

  const answeredCount = useMemo(
    () =>
      Object.values(answers).filter(
        (a) => a.payload && Object.keys(a.payload).length > 0,
      ).length,
    [answers],
  );

  return (
    <div className="attempt-shell">
      <header className="attempt-topbar">
        <div className="text-sm font-semibold">Attempt</div>
        <div className="timer">{formatSeconds(remaining)}</div>
        <Button variant="primary" onClick={() => setShowSubmitConfirm(true)}>
          Submit
        </Button>
      </header>

      <div className="attempt-body">
        {/* Question navigator */}
        <div className="attempt-navigator">
          {questions.map((qq, i) => {
            const a = answers[qq.examQuestionId];
            return (
              <button
                key={qq.examQuestionId}
                type="button"
                className={cn(
                  'nav-q',
                  a?.payload ? 'nav-q-answered' : '',
                  a?.flagged ? 'nav-q-flagged' : '',
                  i === current ? 'nav-q-current' : '',
                )}
                onClick={() => setCurrent(i)}
                aria-label={`Question ${i + 1}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {/* Current question */}
        <div className="card p-4">
          {q ? (
            <>
              <div className="mb-2 text-xs text-text-muted">
                Question {current + 1} / {questions.length} · {q.marks} marks
              </div>
              <QuestionRenderer
                question={q}
                value={state?.payload ?? null}
                flagged={state?.flagged ?? false}
                onChange={(p) => queueSave(q.examQuestionId, p, state?.flagged ?? false)}
                onFlag={(f) => queueSave(q.examQuestionId, state?.payload ?? null, f)}
              />
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <Button
                  variant="secondary"
                  disabled={current === 0}
                  onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                >
                  Previous
                </Button>
                <Checkbox
                  checked={Boolean(state?.flagged)}
                  onChange={(e) => queueSave(q.examQuestionId, state?.payload ?? null, e.target.checked)}
                  label="Mark for review"
                />
                <Button
                  variant="primary"
                  disabled={current === questions.length - 1}
                  onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
                >
                  Next
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={showSubmitConfirm}
        title="Submit attempt?"
        message={`You've answered ${answeredCount} of ${questions.length} questions. You can't change answers after submitting.`}
        confirmLabel="Submit"
        onCancel={() => setShowSubmitConfirm(false)}
        onConfirm={() => {
          setShowSubmitConfirm(false);
          submit.mutate();
        }}
        loading={submit.isPending}
      />

      <Modal
        open={autoSubmittedModal}
        title="Attempt auto-submitted"
        onClose={() => setAutoSubmittedModal(false)}
        footer={
          <Button
            variant="primary"
            onClick={() => navigate(`/me/attempts/${attemptId}/result`)}
          >
            View result
          </Button>
        }
      >
        <p className="text-sm text-text-muted">
          Your attempt was auto-submitted due to repeated anti-cheating violations or because time expired.
        </p>
        <p className="mt-2 inline-flex items-center gap-2 text-sm">
          <Flag size={14} /> The attempt has been flagged for teacher review.
        </p>
      </Modal>
    </div>
  );
};

/* ------------------------------------------------------------------ Per-type renderer */

interface RendererProps {
  question: AttemptQuestion;
  value: Record<string, unknown> | null;
  flagged: boolean;
  onChange: (payload: Record<string, unknown>) => void;
  onFlag: (f: boolean) => void;
}

const QuestionRenderer = ({ question, value, onChange }: RendererProps) => {
  const stemHtml =
    typeof question.payload.contentHtml === 'string' ? question.payload.contentHtml : '';
  switch (question.type) {
    case 'SINGLE_CHOICE': {
      const selected = (value?.selectedOptionId as string | undefined) ?? '';
      return (
        <Stem html={stemHtml}>
          <ul className="space-y-2">
            {question.options.map((o) => (
              <li key={o.id}>
                <Radio
                  name={`q-${question.examQuestionId}`}
                  value={o.id}
                  checked={selected === o.id}
                  onChange={() => onChange({ selectedOptionId: o.id })}
                  label={o.label}
                />
              </li>
            ))}
          </ul>
        </Stem>
      );
    }
    case 'MULTIPLE_CHOICE': {
      const selected = ((value?.selectedOptionIds as string[] | undefined) ?? []).slice();
      const toggle = (id: string): void => {
        const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
        onChange({ selectedOptionIds: next });
      };
      return (
        <Stem html={stemHtml}>
          <ul className="space-y-2">
            {question.options.map((o) => (
              <li key={o.id}>
                <Checkbox checked={selected.includes(o.id)} onChange={() => toggle(o.id)} label={o.label} />
              </li>
            ))}
          </ul>
        </Stem>
      );
    }
    case 'TRUE_FALSE': {
      const answer = value?.answer as boolean | undefined;
      return (
        <Stem html={stemHtml}>
          <div className="space-y-2">
            <Radio
              name={`q-${question.examQuestionId}`}
              checked={answer === true}
              onChange={() => onChange({ answer: true })}
              label="True"
            />
            <Radio
              name={`q-${question.examQuestionId}`}
              checked={answer === false}
              onChange={() => onChange({ answer: false })}
              label="False"
            />
          </div>
        </Stem>
      );
    }
    case 'FILL_BLANK': {
      const text = (value?.text as string | undefined) ?? '';
      return (
        <Stem html={stemHtml}>
          <Input
            value={text}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder="Your answer"
          />
        </Stem>
      );
    }
    case 'DESCRIPTIVE': {
      const text = (value?.text as string | undefined) ?? '';
      return (
        <Stem html={stemHtml}>
          <Textarea
            value={text}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder="Type your answer…"
            rows={8}
          />
        </Stem>
      );
    }
    case 'MATCH_FOLLOWING': {
      const lefts = (question.payload.lefts as string[] | undefined) ?? [];
      const rights = (question.payload.rights as string[] | undefined) ?? [];
      const matches = ((value?.matches as Array<{ left: string; right: string }> | undefined) ?? []).slice();
      const setRight = (left: string, right: string): void => {
        const filtered = matches.filter((m) => m.left !== left);
        onChange({ matches: [...filtered, { left, right }] });
      };
      return (
        <Stem html={stemHtml}>
          <ul className="space-y-2">
            {lefts.map((l) => (
              <li key={l} className="flex items-center gap-3">
                <span className="w-32 text-sm">{l}</span>
                <select
                  className="form-select max-w-xs"
                  value={matches.find((m) => m.left === l)?.right ?? ''}
                  onChange={(e) => setRight(l, e.target.value)}
                >
                  <option value="">Select…</option>
                  {rights.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </Stem>
      );
    }
    case 'MATRIX_MATCH': {
      const rows = (question.payload.rows as string[] | undefined) ?? [];
      const cols = (question.payload.cols as string[] | undefined) ?? [];
      const selections = (value?.selections as Record<string, string[]> | undefined) ?? {};
      const toggle = (row: string, col: string): void => {
        const cur = selections[row] ?? [];
        const next = cur.includes(col) ? cur.filter((c) => c !== col) : [...cur, col];
        onChange({ selections: { ...selections, [row]: next } });
      };
      return (
        <Stem html={stemHtml}>
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                {cols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r}>
                  <td className="font-medium">{r}</td>
                  {cols.map((c) => (
                    <td key={c}>
                      <input
                        type="checkbox"
                        className="form-checkbox"
                        checked={selections[r]?.includes(c) ?? false}
                        onChange={() => toggle(r, c)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Stem>
      );
    }
    default:
      return <p className="text-sm text-text-muted">Unsupported question type.</p>;
  }
};

const Stem = ({ html, children }: { html: string; children: React.ReactNode }) => {
  // renderWithMath is a hook (uses useMemo) — call it unconditionally.
  const rendered = renderWithMath(html);
  return (
    <div>
      {html ? (
        <div className="mb-3">{rendered}</div>
      ) : (
        <p className="mb-3 text-sm italic text-text-faint">
          (This question has no content yet — ask your teacher to edit it.)
        </p>
      )}
      {children}
    </div>
  );
};
