import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eraser,
  Flag,
  ListChecks,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  SkipForward,
  X,
  ZoomIn,
} from 'lucide-react';
import { attemptsApi, type AttemptQuestion } from '@/lib/api/attempts.api';
import type { QuestionType, ViolationType } from '@/lib/types';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { apiErrorMessage } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import { formatSeconds } from '@/lib/utils/format';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
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
  const { user } = useCurrentUser();

  const start = useQuery({
    queryKey: ['start', examId],
    queryFn: () => attemptsApi.start(examId),
    enabled: Boolean(examId),
    retry: false,
    // Don't re-fetch the attempt when the tab regains focus — a student
    // tab-switching mid-exam must not reset/reshuffle their question set.
    refetchOnWindowFocus: false,
  });

  // Read-only exam metadata for the header (title / duration / total marks).
  // Display only — does not affect start/save/submit. Uses the existing endpoint.
  const examMeta = useQuery({
    queryKey: ['my-exam', examId],
    queryFn: () => attemptsApi.getMyExam(examId),
    enabled: Boolean(examId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (start.error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-app text-text">
        <p className="mt-12 text-sm text-danger">{apiErrorMessage(start.error)}</p>
        <Button className="mt-3" onClick={() => navigate('/me/exams')}>
          Back to My exams
        </Button>
      </div>
    );
  }
  if (!start.data) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-app text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading attempt…
      </div>
    );
  }
  return (
    <AttemptRunner
      attemptId={start.data.attempt.id}
      initialRemaining={start.data.attempt.timeRemainingSeconds ?? 0}
      questions={start.data.questions}
      examTitle={examMeta.data?.title ?? null}
      durationSeconds={examMeta.data?.durationSeconds ?? null}
      totalMarksFromExam={examMeta.data?.totalMarks ?? null}
      candidateName={user?.name ?? null}
      candidateEmail={user?.email ?? null}
    />
  );
};

interface AnswerState {
  payload: Record<string, unknown> | null;
  flagged: boolean;
  timeSpent: number;
  dirty: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Derived per-question status used by the navigator + progress + summary. */
type QStatus = 'not-visited' | 'visited' | 'answered' | 'marked' | 'answered-marked';

const isAnswered = (a?: AnswerState): boolean =>
  Boolean(a?.payload && Object.keys(a.payload).length > 0);

const statusOf = (a: AnswerState | undefined, visited: boolean): QStatus => {
  const answered = isAnswered(a);
  const flagged = Boolean(a?.flagged);
  if (answered && flagged) return 'answered-marked';
  if (answered) return 'answered';
  if (flagged) return 'marked';
  if (visited) return 'visited';
  return 'not-visited';
};

type NavFilter = 'all' | 'answered' | 'unanswered' | 'marked' | 'visited';

const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'Single choice',
  MULTIPLE_CHOICE: 'Multiple choice',
  TRUE_FALSE: 'True / False',
  FILL_BLANK: 'Numerical / Fill',
  DESCRIPTIVE: 'Descriptive',
  MATCH_FOLLOWING: 'Match the following',
  MATRIX_MATCH: 'Matrix match',
  VISUAL: 'Visual',
};

const AttemptRunner = ({
  attemptId,
  initialRemaining,
  questions,
  examTitle,
  durationSeconds,
  totalMarksFromExam,
  candidateName,
  candidateEmail,
}: {
  attemptId: string;
  initialRemaining: number;
  questions: AttemptQuestion[];
  examTitle: string | null;
  durationSeconds: number | null;
  totalMarksFromExam: number | null;
  candidateName: string | null;
  candidateEmail: string | null;
}) => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [autoSubmittedModal, setAutoSubmittedModal] = useState(false);

  // ── UI-only presentation state (no effect on save/timer/submit logic) ──
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  const [navFilter, setNavFilter] = useState<NavFilter>('all');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const violationsRef = useRef<
    Array<{ type: ViolationType; clientTimestamp: string; detail?: Record<string, unknown> }>
  >([]);
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

  const [violationWarning, setViolationWarning] = useState<string | null>(null);

  /* ----- Anti-cheat client hooks ----- */
  useEffect(() => {
    const pushViolation = (type: ViolationType, detail?: Record<string, unknown>): void => {
      violationsRef.current.push({
        type,
        clientTimestamp: new Date().toISOString(),
        detail,
      });

      // Show user-friendly warning
      const messages: Record<string, string> = {
        TAB_SWITCH:
          'You switched tabs or minimized the window. This action is prohibited during the exam.',
        WINDOW_BLUR: 'You clicked outside the exam window. Please keep focus on the exam.',
        RIGHT_CLICK: 'Right-clicking is disabled during the exam.',
        COPY_ATTEMPT: 'Copying text is prohibited during the exam.',
        PASTE_ATTEMPT: 'Pasting text is prohibited during the exam.',
      };
      if (messages[type]) {
        setViolationWarning(messages[type]);
      }
    };
    const onVis = (): void => {
      if (document.hidden) pushViolation('TAB_SWITCH');
    };
    const onBlur = (): void => pushViolation('WINDOW_BLUR');
    const onContext = (e: MouseEvent): void => {
      e.preventDefault();
      pushViolation('RIGHT_CLICK');
    };
    const onCopy = (e: ClipboardEvent): void => {
      e.preventDefault();
      pushViolation('COPY_ATTEMPT');
    };
    const onPaste = (e: ClipboardEvent): void => {
      e.preventDefault();
      pushViolation('PASTE_ATTEMPT');
    };

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

  /* ----- Reset per-question timer + mark visited when switching question ----- */
  useEffect(() => {
    lastQuestionStartRef.current = Date.now();
    setVisited((v) => (v.has(current) ? v : new Set(v).add(current)));
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
      setSaveStatus('saving');

      if (upsertTimer.current) window.clearTimeout(upsertTimer.current);
      upsertTimer.current = window.setTimeout(async () => {
        try {
          const a = answers[eqId];
          await attemptsApi.upsertAnswer(attemptId, eqId, {
            answerPayload: payload,
            timeSpentSeconds: (a?.timeSpent ?? 0) + elapsed,
            isFlagged: flagged,
          });
          setSaveStatus('saved');
        } catch (err) {
          setSaveStatus('error');
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

  /* ----- Derived counts (memoized) ----- */
  const counts = useMemo(() => {
    let answered = 0;
    let marked = 0;
    for (let i = 0; i < questions.length; i++) {
      const a = answers[questions[i].examQuestionId];
      if (isAnswered(a)) answered++;
      if (a?.flagged) marked++;
    }
    const total = questions.length;
    return {
      total,
      answered,
      marked,
      unanswered: total - answered,
      pct: total ? Math.round((answered / total) * 100) : 0,
    };
  }, [answers, questions]);

  const totalMarks = useMemo(
    () => totalMarksFromExam ?? questions.reduce((s, x) => s + (x.marks ?? 0), 0),
    [totalMarksFromExam, questions],
  );

  /* ----- Action handlers — all reuse the existing queueSave / setCurrent ----- */
  const goPrev = (): void => setCurrent((c) => Math.max(0, c - 1));
  const goNext = (): void => setCurrent((c) => Math.min(questions.length - 1, c + 1));
  const jumpTo = (i: number): void => {
    setCurrent(i);
    setMobileNavOpen(false);
  };
  const saveNow = (): void => {
    if (q) queueSave(q.examQuestionId, state?.payload ?? null, state?.flagged ?? false);
  };
  const clearAnswer = (): void => {
    if (q) queueSave(q.examQuestionId, null, state?.flagged ?? false);
  };
  const toggleMark = (): void => {
    if (q) queueSave(q.examQuestionId, state?.payload ?? null, !(state?.flagged ?? false));
  };
  const saveAndNext = (): void => {
    saveNow();
    goNext();
  };
  const saveAndMark = (): void => {
    if (q) queueSave(q.examQuestionId, state?.payload ?? null, true);
    goNext();
  };

  const isLast = current === questions.length - 1;
  const isFirst = current === 0;

  return (
    <div className="flex min-h-screen flex-col bg-app text-text">
      <HeaderBar
        examTitle={examTitle}
        candidateName={candidateName}
        candidateEmail={candidateEmail}
        durationSeconds={durationSeconds}
        remaining={remaining}
        total={counts.total}
        totalMarks={totalMarks}
        answered={counts.answered}
        unanswered={counts.unanswered}
        saveStatus={saveStatus}
        onSubmit={() => setShowSubmitConfirm(true)}
        onToggleNav={() => setMobileNavOpen((o) => !o)}
        mobileNavOpen={mobileNavOpen}
      />

      <div className="mx-auto grid w-full max-w-[1500px] flex-1 gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ───── Main question + answer ───── */}
        <main className="flex min-w-0 flex-col">
          <section className="rounded-lg shadow-sm flex flex-1 flex-col border border-border bg-surface">
            {q ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-primary px-2 text-sm font-bold text-text-on-primary">
                      {current + 1}
                    </span>
                    <span className="text-sm font-medium text-text">
                      Question {current + 1}
                      <span className="text-text-faint"> / {questions.length}</span>
                    </span>
                    <span className="rounded bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-text-muted">
                      {TYPE_LABEL[q.type] ?? q.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="rounded bg-success-soft px-1.5 py-0.5 font-medium text-success">
                      +{q.marks}
                    </span>
                    {q.negativeMarks > 0 ? (
                      <span className="rounded bg-danger-soft px-1.5 py-0.5 font-medium text-danger">
                        −{q.negativeMarks}
                      </span>
                    ) : null}
                    {state?.flagged ? (
                      <span className="bg-[#7c3aed]/12 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-[#7c3aed]">
                        <Flag size={11} /> Marked
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex-1 overflow-auto px-4 py-4 sm:px-6">
                  <QuestionRenderer
                    question={q}
                    value={state?.payload ?? null}
                    flagged={state?.flagged ?? false}
                    onChange={(p) => queueSave(q.examQuestionId, p, state?.flagged ?? false)}
                    onFlag={(f) => queueSave(q.examQuestionId, state?.payload ?? null, f)}
                    onPreviewImage={setPreview}
                  />
                </div>

                <ActionBar
                  isFirst={isFirst}
                  isLast={isLast}
                  answered={isAnswered(state)}
                  flagged={Boolean(state?.flagged)}
                  onPrev={goPrev}
                  onSave={saveNow}
                  onClear={clearAnswer}
                  onMark={toggleMark}
                  onSaveNext={saveAndNext}
                  onSaveMark={saveAndMark}
                  onSkip={goNext}
                />
              </>
            ) : (
              <p className="p-6 text-sm text-text-muted">No questions in this attempt.</p>
            )}
          </section>
        </main>

        {/* ───── Desktop sidebar: progress + navigator ───── */}
        <aside className="hidden flex-col gap-4 lg:flex">
          <ProgressPanel counts={counts} />
          <QuestionNavigator
            questions={questions}
            answers={answers}
            visited={visited}
            current={current}
            navFilter={navFilter}
            setNavFilter={setNavFilter}
            onJump={jumpTo}
          />
        </aside>
      </div>

      {/* ───── Mobile navigator drawer ───── */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <div className="shadow-xl absolute right-0 top-0 flex h-full w-[min(88vw,360px)] flex-col gap-3 overflow-auto bg-app p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Questions</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close"
                onClick={() => setMobileNavOpen(false)}
              >
                <X size={16} />
              </Button>
            </div>
            <ProgressPanel counts={counts} />
            <QuestionNavigator
              questions={questions}
              answers={answers}
              visited={visited}
              current={current}
              navFilter={navFilter}
              setNavFilter={setNavFilter}
              onJump={jumpTo}
            />
          </div>
        </div>
      ) : null}

      <Modal
        open={showSubmitConfirm}
        title="Submit attempt?"
        onClose={() => setShowSubmitConfirm(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowSubmitConfirm(false)}
              disabled={submit.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={submit.isPending}
              onClick={() => {
                setShowSubmitConfirm(false);
                submit.mutate();
              }}
            >
              Submit now
            </Button>
          </>
        }
      >
        <SubmitSummary counts={counts} />
      </Modal>

      <Modal
        open={autoSubmittedModal}
        title="Attempt auto-submitted"
        onClose={() => setAutoSubmittedModal(false)}
        footer={
          <Button variant="primary" onClick={() => navigate(`/me/attempts/${attemptId}/result`)}>
            View result
          </Button>
        }
      >
        <p className="text-sm text-text-muted">
          Your attempt was auto-submitted due to repeated anti-cheating violations or because time
          expired.
        </p>
        <p className="mt-2 inline-flex items-center gap-2 text-sm">
          <Flag size={14} /> The attempt has been flagged for teacher review.
        </p>
      </Modal>

      <Modal
        open={violationWarning !== null}
        title="Action Prohibited"
        onClose={() => setViolationWarning(null)}
        footer={
          <Button variant="primary" onClick={() => setViolationWarning(null)}>
            I understand
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning">
            <AlertTriangle size={24} />
          </div>
          <p className="text-sm font-medium text-text">Warning Recorded</p>
          <p className="text-sm text-text-muted">{violationWarning}</p>
          <p className="mt-2 rounded-md bg-subtle p-2 text-xs text-text-muted">
            Repeated violations may result in auto-submission and flagging of your attempt.
          </p>
        </div>
      </Modal>

      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            aria-label="Close image preview"
            onClick={() => setPreview(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <X size={18} />
          </button>
          <img
            src={preview}
            alt="Question image enlarged"
            className="max-h-[92vh] max-w-[95vw] rounded object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
};

/* ─────────────────────────────────────────────── Header */

const HeaderBar = ({
  examTitle,
  candidateName,
  candidateEmail,
  durationSeconds,
  remaining,
  total,
  totalMarks,
  answered,
  unanswered,
  saveStatus,
  onSubmit,
  onToggleNav,
  mobileNavOpen,
}: {
  examTitle: string | null;
  candidateName: string | null;
  candidateEmail: string | null;
  durationSeconds: number | null;
  remaining: number;
  total: number;
  totalMarks: number;
  answered: number;
  unanswered: number;
  saveStatus: SaveStatus;
  onSubmit: () => void;
  onToggleNav: () => void;
  mobileNavOpen: boolean;
}) => {
  const tone = remaining <= 60 ? 'danger' : remaining <= 300 ? 'warning' : 'normal';
  return (
    <header className="shadow-sm sticky top-0 z-30 border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-2 px-3 py-2 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Identity */}
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold leading-tight text-text">
            {examTitle ?? 'Examination'}
          </h1>
          <p className="truncate text-xs text-text-muted">
            {candidateName ? (
              <span className="font-medium text-text">{candidateName}</span>
            ) : (
              'Candidate'
            )}
            {candidateEmail ? <span className="text-text-faint"> · {candidateEmail}</span> : null}
          </p>
        </div>

        {/* Stat chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Stat label="Questions" value={total} />
          <Stat label="Marks" value={totalMarks} />
          <Stat label="Attempted" value={answered} tone="success" />
          <Stat label="Left" value={unanswered} tone="muted" />
          {durationSeconds ? (
            <Stat label="Duration" value={`${Math.round(durationSeconds / 60)}m`} />
          ) : null}
        </div>

        {/* Timer + save + submit */}
        <div className="flex items-center justify-between gap-2 lg:justify-end">
          <SaveIndicator status={saveStatus} />
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-base font-bold tabular-nums',
              tone === 'danger'
                ? 'animate-pulse border-danger bg-danger-soft text-danger'
                : tone === 'warning'
                  ? 'border-warning bg-warning-soft text-warning'
                  : 'border-border bg-subtle text-text',
            )}
            role="timer"
            aria-live="off"
            aria-label="Time remaining"
            title="Time remaining"
          >
            <Clock size={16} aria-hidden /> {formatSeconds(remaining)}
          </div>
          <Button variant="primary" onClick={onSubmit}>
            Submit
          </Button>
          <button
            type="button"
            onClick={onToggleNav}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-muted hover:bg-hover lg:hidden"
            aria-label={mobileNavOpen ? 'Hide question palette' : 'Show question palette'}
          >
            {mobileNavOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
};

const Stat = ({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'success' | 'muted';
}) => (
  <span
    className={cn(
      'inline-flex items-baseline gap-1 rounded-md border px-2 py-1 text-xs',
      tone === 'success'
        ? 'border-success/30 bg-success-soft text-success'
        : tone === 'muted'
          ? 'border-border bg-subtle text-text-muted'
          : 'border-border bg-surface text-text',
    )}
  >
    <span className="font-semibold tabular-nums">{value}</span>
    <span className="text-[10px] uppercase tracking-[0.4px] opacity-70">{label}</span>
  </span>
);

const SaveIndicator = ({ status }: { status: SaveStatus }) => {
  if (status === 'idle') return null;
  const map = {
    saving: {
      icon: <Loader2 size={12} className="animate-spin" />,
      text: 'Saving…',
      cls: 'text-text-muted',
    },
    saved: { icon: <Check size={12} />, text: 'Saved', cls: 'text-success' },
    error: { icon: <AlertTriangle size={12} />, text: 'Save failed', cls: 'text-danger' },
  }[status];
  return (
    <span
      className={cn('hidden items-center gap-1 text-[11px] font-medium sm:inline-flex', map.cls)}
      aria-live="polite"
    >
      {map.icon} {map.text}
    </span>
  );
};

/* ─────────────────────────────────────────────── Progress */

const ProgressPanel = ({
  counts,
}: {
  counts: { total: number; answered: number; unanswered: number; marked: number; pct: number };
}) => (
  <div className="rounded-lg shadow-sm border border-border bg-surface p-3">
    <div className="mb-2 flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-text-faint">
        <ListChecks size={13} /> Progress
      </span>
      <span className="text-xs font-semibold text-text">{counts.pct}%</span>
    </div>
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-subtle"
      role="progressbar"
      aria-valuenow={counts.pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${counts.pct}%` }}
      />
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-center">
      <Metric value={counts.answered} label="Attempted" tone="success" />
      <Metric value={counts.unanswered} label="Remaining" tone="muted" />
      <Metric value={counts.marked} label="Marked" tone="purple" />
      <Metric value={counts.total} label="Total" />
    </div>
  </div>
);

const Metric = ({
  value,
  label,
  tone = 'default',
}: {
  value: number;
  label: string;
  tone?: 'default' | 'success' | 'muted' | 'purple';
}) => (
  <div
    className={cn(
      'rounded-md border px-2 py-1.5',
      tone === 'success'
        ? 'border-success/30 bg-success-soft'
        : tone === 'purple'
          ? 'bg-[#7c3aed]/12 border-[#7c3aed]/30'
          : 'border-border bg-subtle',
    )}
  >
    <div
      className={cn(
        'text-lg font-bold tabular-nums leading-none',
        tone === 'success' ? 'text-success' : tone === 'purple' ? 'text-[#7c3aed]' : 'text-text',
      )}
    >
      {value}
    </div>
    <div className="mt-0.5 text-[10px] uppercase tracking-[0.4px] text-text-muted">{label}</div>
  </div>
);

/* ─────────────────────────────────────────────── Navigator */

const STATUS_DOT: Record<QStatus, string> = {
  'not-visited': 'border border-border bg-surface text-text-muted',
  visited: 'border border-danger bg-danger-soft text-danger',
  answered: 'border border-success bg-success text-white',
  marked: 'border border-[#7c3aed] bg-[#7c3aed] text-white',
  'answered-marked': 'border border-[#7c3aed] bg-[#7c3aed] text-white',
};

const FILTERS: Array<{ key: NavFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'answered', label: 'Answered' },
  { key: 'unanswered', label: 'Unanswered' },
  { key: 'marked', label: 'Marked' },
  { key: 'visited', label: 'Visited' },
];

const matchesFilter = (s: QStatus, f: NavFilter): boolean => {
  switch (f) {
    case 'all':
      return true;
    case 'answered':
      return s === 'answered' || s === 'answered-marked';
    case 'unanswered':
      return s === 'not-visited' || s === 'visited' || s === 'marked';
    case 'marked':
      return s === 'marked' || s === 'answered-marked';
    case 'visited':
      return s !== 'not-visited';
  }
};

const QuestionNavigator = ({
  questions,
  answers,
  visited,
  current,
  navFilter,
  setNavFilter,
  onJump,
}: {
  questions: AttemptQuestion[];
  answers: Record<string, AnswerState>;
  visited: Set<number>;
  current: number;
  navFilter: NavFilter;
  setNavFilter: (f: NavFilter) => void;
  onJump: (i: number) => void;
}) => {
  const items = useMemo(
    () =>
      questions.map((qq, i) => ({
        i,
        status: statusOf(answers[qq.examQuestionId], visited.has(i)),
      })),
    [questions, answers, visited],
  );
  const filtered = items.filter((it) => matchesFilter(it.status, navFilter));

  return (
    <div className="rounded-lg shadow-sm flex min-h-0 flex-col border border-border bg-surface">
      <div className="border-b border-border-soft px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-text-faint">
          Question palette
        </span>
        <div className="mt-2 flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setNavFilter(f.key)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                navFilter === f.key
                  ? 'border-primary bg-primary text-text-on-primary'
                  : 'border-border bg-surface text-text-muted hover:bg-hover',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[46vh] flex-1 overflow-auto p-3 lg:max-h-[calc(100vh-360px)]">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-muted">
            No questions match this filter.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-2">
            {filtered.map(({ i, status }) => (
              <button
                key={i}
                type="button"
                onClick={() => onJump(i)}
                aria-label={`Question ${i + 1}, ${status.replace('-', ' & ')}`}
                aria-current={i === current ? 'true' : undefined}
                className={cn(
                  'relative flex h-9 items-center justify-center rounded-md text-xs font-semibold tabular-nums transition-transform hover:scale-105',
                  STATUS_DOT[status],
                  i === current && 'ring-2 ring-primary ring-offset-1 ring-offset-surface',
                )}
              >
                {i + 1}
                {status === 'answered-marked' ? (
                  <span className="h-3.5 w-3.5 absolute -right-1 -top-1 flex items-center justify-center rounded-full border border-white bg-success">
                    <Check size={9} className="text-white" />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border-soft px-3 py-2.5 text-[11px] text-text-muted">
        <Legend cls={STATUS_DOT.answered} label="Answered" />
        <Legend cls={STATUS_DOT.visited} label="Not answered" />
        <Legend cls={STATUS_DOT.marked} label="Marked" />
        <Legend cls={STATUS_DOT['not-visited']} label="Not visited" />
        <Legend cls={STATUS_DOT['answered-marked']} label="Answered + marked" dot />
      </div>
    </div>
  );
};

const Legend = ({ cls, label, dot }: { cls: string; label: string; dot?: boolean }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={cn('relative flex h-4 w-4 items-center justify-center rounded', cls)}>
      {dot ? (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white bg-success" />
      ) : null}
    </span>
    {label}
  </span>
);

/* ─────────────────────────────────────────────── Action bar */

const ActionBar = ({
  isFirst,
  isLast,
  answered,
  flagged,
  onPrev,
  onSave,
  onClear,
  onMark,
  onSaveNext,
  onSaveMark,
  onSkip,
}: {
  isFirst: boolean;
  isLast: boolean;
  answered: boolean;
  flagged: boolean;
  onPrev: () => void;
  onSave: () => void;
  onClear: () => void;
  onMark: () => void;
  onSaveNext: () => void;
  onSaveMark: () => void;
  onSkip: () => void;
}) => (
  <div className="bg-surface/95 sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5 backdrop-blur sm:px-4">
    <Button variant="secondary" size="sm" disabled={isFirst} onClick={onPrev}>
      <ChevronLeft size={14} /> Previous
    </Button>

    <Button
      variant="ghost"
      size="sm"
      disabled={!answered}
      onClick={onClear}
      title="Clear this answer"
    >
      <Eraser size={14} className="mr-1" /> Clear
    </Button>

    <Button variant="ghost" size="sm" onClick={onMark} title="Toggle mark for review">
      <Flag size={14} className={cn('mr-1', flagged && 'fill-[#7c3aed] text-[#7c3aed]')} />
      {flagged ? 'Unmark' : 'Mark for review'}
    </Button>

    {!isLast ? (
      <Button variant="secondary" size="sm" onClick={onSkip} title="Skip without answering">
        <SkipForward size={14} className="mr-1" /> Skip
      </Button>
    ) : null}

    <div className="ml-auto flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" onClick={onSave} title="Save this answer">
        Save
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={onSaveMark}
        disabled={isLast}
        title="Save & mark for review"
      >
        Save &amp; mark
      </Button>
      {!isLast ? (
        <Button variant="primary" size="sm" onClick={onSaveNext}>
          Save &amp; Next <ChevronRight size={14} />
        </Button>
      ) : (
        <Button variant="primary" size="sm" onClick={onSave}>
          <CheckCircle2 size={14} className="mr-1" /> Save
        </Button>
      )}
    </div>
  </div>
);

/* ─────────────────────────────────────────────── Submit summary */

const SubmitSummary = ({
  counts,
}: {
  counts: { total: number; answered: number; unanswered: number; marked: number; pct: number };
}) => (
  <div className="space-y-3">
    <p className="text-sm text-text">
      You can't change answers after submitting. Please review your progress:
    </p>
    <div className="grid grid-cols-2 gap-2">
      <SummaryCell value={counts.total} label="Total questions" />
      <SummaryCell value={counts.answered} label="Attempted" tone="success" />
      <SummaryCell value={counts.unanswered} label="Unattempted" tone="danger" />
      <SummaryCell value={counts.marked} label="Marked for review" tone="purple" />
    </div>
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-text-muted">
        <span>Completion</span>
        <span className="font-semibold text-text">{counts.pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full bg-primary" style={{ width: `${counts.pct}%` }} />
      </div>
    </div>
    {counts.unanswered > 0 ? (
      <p className="inline-flex items-center gap-1.5 text-xs text-warning">
        <AlertTriangle size={13} /> {counts.unanswered} question{counts.unanswered === 1 ? '' : 's'}{' '}
        still unanswered.
      </p>
    ) : null}
  </div>
);

const SummaryCell = ({
  value,
  label,
  tone = 'default',
}: {
  value: number;
  label: string;
  tone?: 'default' | 'success' | 'danger' | 'purple';
}) => (
  <div
    className={cn(
      'rounded-md border px-3 py-2',
      tone === 'success'
        ? 'border-success/30 bg-success-soft'
        : tone === 'danger'
          ? 'border-danger/30 bg-danger-soft'
          : tone === 'purple'
            ? 'bg-[#7c3aed]/12 border-[#7c3aed]/30'
            : 'border-border bg-subtle',
    )}
  >
    <div
      className={cn(
        'text-xl font-bold tabular-nums',
        tone === 'success'
          ? 'text-success'
          : tone === 'danger'
            ? 'text-danger'
            : tone === 'purple'
              ? 'text-[#7c3aed]'
              : 'text-text',
      )}
    >
      {value}
    </div>
    <div className="text-[11px] text-text-muted">{label}</div>
  </div>
);

/* ─────────────────────────────────────────────── Per-type renderer (logic unchanged) */

interface RendererProps {
  question: AttemptQuestion;
  value: Record<string, unknown> | null;
  flagged: boolean;
  onChange: (payload: Record<string, unknown>) => void;
  onFlag: (f: boolean) => void;
  onPreviewImage: (src: string) => void;
}

const QuestionRenderer = ({ question, value, onChange, onPreviewImage }: RendererProps) => {
  const stemHtml =
    typeof question.payload.contentHtml === 'string' ? question.payload.contentHtml : '';
  switch (question.type) {
    // VISUAL renders exactly like SINGLE_CHOICE: the image stem (contentHtml)
    // plus positional radios whose labels are the option numbers (1..N). The
    // image itself shows what each number means; the answer payload is the
    // selected option id, same as single-choice.
    case 'VISUAL':
    case 'SINGLE_CHOICE': {
      const selected = (value?.selectedOptionId as string | undefined) ?? '';
      return (
        <Stem html={stemHtml} onPreviewImage={onPreviewImage}>
          <ul className="space-y-2">
            {question.options.map((o) => (
              <li key={o.id}>
                <OptionShell selected={selected === o.id}>
                  <Radio
                    name={`q-${question.examQuestionId}`}
                    value={o.id}
                    checked={selected === o.id}
                    onChange={() => onChange({ selectedOptionId: o.id })}
                    label={o.label}
                  />
                </OptionShell>
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
        <Stem html={stemHtml} onPreviewImage={onPreviewImage}>
          <ul className="space-y-2">
            {question.options.map((o) => (
              <li key={o.id}>
                <OptionShell selected={selected.includes(o.id)}>
                  <Checkbox
                    checked={selected.includes(o.id)}
                    onChange={() => toggle(o.id)}
                    label={o.label}
                  />
                </OptionShell>
              </li>
            ))}
          </ul>
        </Stem>
      );
    }
    case 'TRUE_FALSE': {
      const answer = value?.answer as boolean | undefined;
      return (
        <Stem html={stemHtml} onPreviewImage={onPreviewImage}>
          <div className="space-y-2">
            <OptionShell selected={answer === true}>
              <Radio
                name={`q-${question.examQuestionId}`}
                checked={answer === true}
                onChange={() => onChange({ answer: true })}
                label="True"
              />
            </OptionShell>
            <OptionShell selected={answer === false}>
              <Radio
                name={`q-${question.examQuestionId}`}
                checked={answer === false}
                onChange={() => onChange({ answer: false })}
                label="False"
              />
            </OptionShell>
          </div>
        </Stem>
      );
    }
    case 'FILL_BLANK': {
      const text = (value?.text as string | undefined) ?? '';
      return (
        <Stem html={stemHtml} onPreviewImage={onPreviewImage}>
          <Input
            value={text}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder="Your answer"
            className="max-w-md"
          />
        </Stem>
      );
    }
    case 'DESCRIPTIVE': {
      const text = (value?.text as string | undefined) ?? '';
      return (
        <Stem html={stemHtml} onPreviewImage={onPreviewImage}>
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
      const matches = (
        (value?.matches as Array<{ left: string; right: string }> | undefined) ?? []
      ).slice();
      const setRight = (left: string, right: string): void => {
        const filtered = matches.filter((m) => m.left !== left);
        onChange({ matches: [...filtered, { left, right }] });
      };
      return (
        <Stem html={stemHtml} onPreviewImage={onPreviewImage}>
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
        <Stem html={stemHtml} onPreviewImage={onPreviewImage}>
          <div className="overflow-auto">
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
          </div>
        </Stem>
      );
    }
    default:
      return <p className="text-sm text-text-muted">Unsupported question type.</p>;
  }
};

/** Subtle selectable wrapper for choice options (visual only). */
const OptionShell = ({ selected, children }: { selected: boolean; children: React.ReactNode }) => (
  <div
    className={cn(
      'rounded-md border px-3 py-2 transition-colors',
      selected ? 'bg-primary-soft/50 border-primary' : 'border-border bg-surface hover:bg-hover',
    )}
  >
    {children}
  </div>
);

const Stem = ({
  html,
  children,
  onPreviewImage,
}: {
  html: string;
  children: React.ReactNode;
  onPreviewImage?: (src: string) => void;
}) => {
  // renderWithMath is a hook (uses useMemo) — call it unconditionally.
  const rendered = renderWithMath(html);
  return (
    <div>
      {html ? (
        <div
          className="exam-stem mb-4 [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded [&_img]:border [&_img]:border-border"
          onClick={(e) => {
            const t = e.target as HTMLElement;
            if (t.tagName === 'IMG' && onPreviewImage) {
              onPreviewImage((t as HTMLImageElement).currentSrc || (t as HTMLImageElement).src);
            }
          }}
        >
          {rendered}
          <span className="pointer-events-none mt-1 inline-flex items-center gap-1 text-[11px] text-text-faint">
            <ZoomIn size={11} /> Tap an image to enlarge
          </span>
        </div>
      ) : (
        <p className="mb-3 text-sm italic text-text-faint">
          (This question has no content yet — ask your teacher to edit it.)
        </p>
      )}
      {children}
    </div>
  );
};
