import { Check } from 'lucide-react';
import { Loader } from '@/components/ui/Loader';
import { cn } from '@/lib/utils/cn';
import type {
  BatchFileState,
  OcrBatchProgressSnapshot,
  OcrProgressSnapshot,
  OcrProgressStage,
} from '@/lib/api/ocr.api';

/* ─────────────────────────────────────────── Determinate circular ring */

type Tone = 'primary' | 'success' | 'danger';
const TONE_VAR: Record<Tone, string> = {
  primary: 'var(--primary)',
  success: 'var(--success)',
  danger: 'var(--danger)',
};

/**
 * A determinate progress ring. Colours come from CSS tokens (no palette
 * literals) and it fills smoothly via an inline stroke-dashoffset transition —
 * no spin/keyframe animation, so it stays within the design guardrails.
 */
const ProgressRing = ({
  value,
  tone = 'primary',
  size = 116,
  stroke = 9,
  caption,
}: {
  value: number;
  tone?: Tone;
  size?: number;
  stroke?: number;
  caption?: string;
}) => {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (v / 100) * circ;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          style={{ stroke: 'var(--border)' }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{
            stroke: TONE_VAR[tone],
            strokeDasharray: circ,
            strokeDashoffset: offset,
            transition: 'stroke-dashoffset 600ms cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums text-text">{v}%</span>
        {caption ? (
          <span className="text-[10px] font-medium uppercase tracking-[0.4px] text-text-faint">
            {caption}
          </span>
        ) : null}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────── Small pieces */

const Stat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'muted' | 'success' | 'danger' | 'primary';
}) => (
  <div className="flex-1 rounded border border-border bg-subtle px-2.5 py-1.5">
    <div
      className={cn(
        'text-base font-semibold tabular-nums',
        tone === 'success' && 'text-success',
        tone === 'danger' && 'text-danger',
        tone === 'primary' && 'text-primary',
        (!tone || tone === 'muted') && 'text-text',
      )}
    >
      {value}
    </div>
    <div className="text-[10px] uppercase tracking-[0.4px] text-text-faint">{label}</div>
  </div>
);

/** A thin determinate track+fill bar (page-reading progress). */
const MiniBar = ({ value }: { value: number }) => {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${v}%`, transition: 'width 500ms cubic-bezier(0.4,0,0.2,1)' }}
      />
    </div>
  );
};

const STAGE_STEPS: Array<{ key: OcrProgressStage; label: string }> = [
  { key: 'OCR_PROCESSING', label: 'Reading' },
  { key: 'EXTRACTING', label: 'Extracting' },
  { key: 'GENERATING_DRAFTS', label: 'Drafts' },
  { key: 'COMPLETED', label: 'Done' },
];

const stageCopy = (
  stage: OcrProgressStage | null,
): { title: string; detail: string; index: number } => {
  switch (stage) {
    case 'OCR_PROCESSING':
      return { title: 'Reading pages', detail: 'Running OCR on each page of the document…', index: 0 };
    case 'EXTRACTING':
      return { title: 'Extracting questions', detail: 'Detecting question boundaries and figures…', index: 1 };
    case 'GENERATING_DRAFTS':
      return { title: 'Generating drafts', detail: 'Building reviewable question drafts…', index: 2 };
    case 'COMPLETED':
      return { title: 'Completed', detail: 'All questions extracted.', index: 3 };
    case 'FAILED':
      return { title: 'Failed', detail: 'Something went wrong while processing this file.', index: 0 };
    default:
      return { title: 'Queued for OCR', detail: 'Waiting for a worker to pick up this file…', index: -1 };
  }
};

const StageStepper = ({ activeIndex }: { activeIndex: number }) => (
  <div className="flex items-center gap-1.5">
    {STAGE_STEPS.map((s, i) => {
      const done = i < activeIndex;
      const active = i === activeIndex;
      return (
        <div key={s.key} className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium',
              done && 'bg-success-soft text-success',
              active && 'bg-primary-soft text-primary',
              !done && !active && 'bg-subtle text-text-faint',
            )}
          >
            {done ? <Check size={11} /> : null}
            {s.label}
          </span>
          {i < STAGE_STEPS.length - 1 ? (
            <span className={cn('h-px w-3', done ? 'bg-success' : 'bg-border')} />
          ) : null}
        </div>
      );
    })}
  </div>
);

const ProcessingShell = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded border border-border bg-surface p-5">{children}</div>
);

/* ─────────────────────────────────────────── Single-file processing */

export const SingleOcrProcessing = ({ snapshot }: { snapshot?: OcrProgressSnapshot }) => {
  const stage = snapshot?.ocrStage ?? null;
  const { title, detail, index } = stageCopy(stage === 'PENDING' ? null : stage);
  const overall = snapshot?.progressPercent ?? 5;
  const pageTotal = snapshot?.pageTotal ?? 0;
  const pageProcessed = snapshot?.pageProcessed ?? 0;
  const pagePct = pageTotal > 0 ? Math.round((pageProcessed / pageTotal) * 100) : 0;
  const failed = stage === 'FAILED';

  return (
    <ProcessingShell>
      <div className="flex items-center gap-5">
        <ProgressRing value={failed ? 100 : overall} tone={failed ? 'danger' : 'primary'} caption="overall" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2">
            {failed ? null : <Loader className="h-4 w-4 text-primary" />}
            <span className="text-[15px] font-semibold text-text">{title}</span>
          </div>
          <p className="text-[12px] text-text-muted">{detail}</p>

          {pageTotal > 0 && !failed ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[12px] text-text-muted">
                <span>Reading pages</span>
                <span className="tabular-nums">
                  {pageProcessed} / {pageTotal} · {pagePct}%
                </span>
              </div>
              <MiniBar value={pagePct} />
            </div>
          ) : null}

          <div className="flex gap-2">
            <Stat label="Pages" value={pageTotal > 0 ? `${pageProcessed}/${pageTotal}` : '—'} />
            <Stat label="Questions found" value={snapshot?.draftCount ?? 0} tone="primary" />
          </div>

          {!failed ? <StageStepper activeIndex={index} /> : null}
          {failed && snapshot?.errorMessage ? (
            <p className="text-[12px] text-danger">{snapshot.errorMessage}</p>
          ) : null}
        </div>
      </div>
    </ProcessingShell>
  );
};

/* ─────────────────────────────────────────── Batch processing */

const FILE_STATE_DOT: Record<BatchFileState, string> = {
  QUEUED: 'bg-border-strong',
  PROCESSING: 'bg-primary',
  COMPLETED: 'bg-success',
  FAILED: 'bg-danger',
};
const FILE_STATE_TEXT: Record<BatchFileState, string> = {
  QUEUED: 'text-text-faint',
  PROCESSING: 'text-primary',
  COMPLETED: 'text-success',
  FAILED: 'text-danger',
};

export const BatchOcrProcessing = ({
  snapshot,
  current,
}: {
  snapshot: OcrBatchProgressSnapshot;
  /** Live page-level progress of the in-flight file (polled separately). */
  current?: OcrProgressSnapshot;
}) => {
  const { total, queued, processing, completed, failed, files } = snapshot;
  const allDone = completed + failed >= total;
  // Overall = finished files + the in-flight file's own fraction, over total.
  const currentFraction = current && !allDone ? (current.progressPercent ?? 0) / 100 : 0;
  const overall = total > 0 ? Math.min(100, ((completed + failed + currentFraction) / total) * 100) : 0;
  const cur = snapshot.current;
  const pageTotal = current?.pageTotal ?? 0;
  const pagePct = pageTotal > 0 ? Math.round(((current?.pageProcessed ?? 0) / pageTotal) * 100) : 0;

  return (
    <ProcessingShell>
      <div className="flex items-center gap-5">
        <ProgressRing
          value={allDone ? 100 : overall}
          tone={allDone && failed > 0 ? 'danger' : allDone ? 'success' : 'primary'}
          caption={allDone ? 'done' : 'overall'}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2">
            {allDone ? <Check size={16} className="text-success" /> : <Loader className="h-4 w-4 text-primary" />}
            <span className="text-[15px] font-semibold text-text">
              {allDone
                ? `Batch processed — ${total} file${total === 1 ? '' : 's'}`
                : cur
                  ? `Processing file ${cur.position} of ${total}`
                  : 'Queued for OCR'}
            </span>
          </div>
          {cur && !allDone ? (
            <p className="truncate text-[12px] text-text-muted" title={cur.originalName}>
              {cur.originalName}
            </p>
          ) : null}

          {!allDone && pageTotal > 0 ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[12px] text-text-muted">
                <span>Reading pages</span>
                <span className="tabular-nums">
                  {current?.pageProcessed ?? 0} / {pageTotal} · {pagePct}%
                </span>
              </div>
              <MiniBar value={pagePct} />
            </div>
          ) : null}

          <div className="flex gap-2">
            <Stat label="Queued" value={queued} />
            <Stat label="Processing" value={processing} tone="primary" />
            <Stat label="Completed" value={completed} tone="success" />
            {failed > 0 ? <Stat label="Failed" value={failed} tone="danger" /> : null}
          </div>
        </div>
      </div>

      {/* Per-file detail — one line per file with a live state dot. */}
      <div className="mt-4 space-y-1 border-t border-border-soft pt-3">
        {files.map((f) => (
          <div key={f.uploadId} className="flex items-center gap-2 text-[12px]">
            <span className="w-5 shrink-0 text-right tabular-nums text-text-faint">{f.position}.</span>
            <span className={cn('h-2 w-2 shrink-0 rounded-full', FILE_STATE_DOT[f.state])} />
            <span className="min-w-0 flex-1 truncate text-text">{f.originalName}</span>
            {f.draftCount > 0 ? (
              <span className="shrink-0 tabular-nums text-text-muted">{f.draftCount} Q</span>
            ) : null}
            <span className={cn('w-20 shrink-0 text-right font-medium', FILE_STATE_TEXT[f.state])}>
              {f.state.charAt(0) + f.state.slice(1).toLowerCase()}
            </span>
          </div>
        ))}
      </div>
    </ProcessingShell>
  );
};
