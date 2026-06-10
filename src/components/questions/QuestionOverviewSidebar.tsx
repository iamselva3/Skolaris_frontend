import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { draftQuestionNumber } from '@/lib/ocr/question-number';
import type { OcrDraft } from '@/lib/api/ocr.api';

/** Per-draft answer snapshot the page lifts so the overview updates live as the
 *  teacher picks answers — before approve. */
export interface AnswerMeta {
  /** A correct answer is chosen (manually, or pre-filled from the key). */
  mapped: boolean;
  /** Short answer label for the row ("A", "True", "—"). */
  label?: string;
  source?: 'answer-key' | 'manual';
}

const typeLabel = (d: OcrDraft): string => {
  if (d.questionSnapshotKey?.trim()) return 'Visual';
  switch (d.detectedType) {
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE':
      return 'MCQ';
    case 'TRUE_FALSE':
      return 'True/False';
    case 'DESCRIPTIVE':
      return 'Descriptive';
    case 'FILL_BLANK':
      return 'Fill blank';
    default:
      return d.detectedType ? d.detectedType.replace(/_/g, ' ') : '—';
  }
};

interface RowState {
  draft: OcrDraft;
  meta: AnswerMeta;
  done: boolean; // APPROVED
  discarded: boolean;
  pending: boolean;
}

const rowStateOf = (draft: OcrDraft, meta: AnswerMeta | undefined): RowState => {
  const m = meta ?? { mapped: false };
  return {
    draft,
    meta: m,
    done: draft.status === 'APPROVED',
    discarded: draft.status === 'DISCARDED',
    pending: draft.status === 'PENDING_REVIEW' || draft.status === 'EDITED',
  };
};

export const QuestionOverviewSidebar = ({
  drafts,
  answerState,
  activeId,
  collapsed,
  onToggle,
  onJump,
  filePreview,
}: {
  drafts: OcrDraft[];
  answerState: Record<string, AnswerMeta>;
  activeId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onJump: (draftId: string) => void;
  filePreview: ReactNode;
}) => {
  const rows = drafts.map((d) => rowStateOf(d, answerState[d.id]));
  const total = rows.length;
  const mapped = rows.filter((r) => r.done || r.meta.mapped).length;
  const pending = rows.filter((r) => r.pending).length;
  const missing = rows.filter((r) => r.pending && !r.meta.mapped).length;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Show question overview"
        className="flex h-full w-9 flex-col items-center gap-2 rounded border border-border bg-surface py-2 text-text-muted hover:bg-hover"
      >
        <ChevronRight size={16} />
        <span className="rotate-180 text-[11px] font-medium [writing-mode:vertical-rl]">Overview</span>
        <span className="mt-1 rounded bg-primary-soft px-1 py-0.5 text-[10px] font-semibold text-primary">{total}</span>
      </button>
    );
  }

  return (
    <aside className="flex max-h-[calc(100vh-120px)] flex-col gap-3 rounded border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-text">Answer Key overview</h2>
        <button type="button" onClick={onToggle} title="Collapse" className="rounded p-1 text-text-muted hover:bg-hover">
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* File preview lives here, beside the overview, per the review layout. */}
      <div className="rounded border border-border-soft bg-subtle p-2">{filePreview}</div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-1.5">
        <StatTile label="Total" value={total} />
        <StatTile label="Mapped" value={mapped} tone="ok" />
        <StatTile label="Pending" value={pending} tone={pending ? 'warn' : undefined} />
        <StatTile label="Missing" value={missing} tone={missing ? 'danger' : undefined} />
      </div>

      {/* Jump list — handles 100–500 rows in a scroll container. */}
      <div className="-mx-1 flex-1 overflow-auto px-1">
        <ul className="space-y-0.5">
          {rows.map((r) => {
            const answerText = r.discarded
              ? 'Discarded'
              : r.meta.mapped
                ? r.meta.label ?? '✓'
                : r.done
                  ? '✓'
                  : 'Pending';
            return (
              <li key={r.draft.id}>
                <button
                  type="button"
                  onClick={() => onJump(r.draft.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] transition-colors',
                    activeId === r.draft.id ? 'bg-primary-soft text-primary' : 'hover:bg-hover',
                    r.discarded && 'opacity-50',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass(r))} />
                  <span className="w-9 shrink-0 font-mono tabular-nums text-text-muted">
                    {draftQuestionNumber(r.draft) != null ? `Q${draftQuestionNumber(r.draft)}` : '—'}
                  </span>
                  <span className="w-16 shrink-0 truncate text-[11px] text-text-faint">{typeLabel(r.draft)}</span>
                  <span
                    className={cn(
                      'ml-auto truncate text-[11px] font-medium',
                      r.done ? 'text-success' : r.meta.mapped ? 'text-text' : 'text-text-faint',
                    )}
                  >
                    {answerText}
                    {r.meta.source === 'answer-key' && !r.done ? (
                      <span className="ml-1 rounded bg-primary-soft px-1 text-[9px] font-semibold text-primary">key</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {rows.length === 0 ? <p className="px-2 py-3 text-[12px] text-text-muted">No drafts yet.</p> : null}
      </div>
    </aside>
  );
};

const dotClass = (r: RowState): string => {
  if (r.done) return 'bg-success';
  if (r.discarded) return 'bg-text-faint';
  if (r.meta.mapped) return 'bg-primary';
  return 'bg-warning';
};

const StatTile = ({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'danger' }) => (
  <div className="rounded border border-border bg-subtle px-2 py-1.5">
    <div
      className={cn(
        'text-[16px] font-semibold tabular-nums',
        tone === 'ok' && 'text-success',
        tone === 'warn' && 'text-warning',
        tone === 'danger' && 'text-danger',
        !tone && 'text-text',
      )}
    >
      {value}
    </div>
    <div className="text-[10px] uppercase tracking-[0.4px] text-text-faint">{label}</div>
  </div>
);
