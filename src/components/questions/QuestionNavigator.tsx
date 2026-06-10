import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Grid3x3, HelpCircle, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { OcrDraft } from '@/lib/api/ocr.api';
import { draftQuestionNumber } from '@/lib/ocr/question-number';

type TileStatus = 'mapped' | 'pending' | 'needsReview' | 'missing';

const STATUS_CLASS: Record<TileStatus, string> = {
  mapped: 'bg-success-soft text-success',
  pending: 'bg-subtle text-text-muted',
  needsReview: 'bg-warning-soft text-warning',
  missing: 'border border-danger bg-danger-soft text-danger',
};

const STATUS_ICON: Record<TileStatus, typeof Check> = {
  mapped: Check,
  pending: HelpCircle,
  needsReview: AlertTriangle,
  missing: X,
};

const LEGEND: Array<{ status: TileStatus; label: string }> = [
  { status: 'mapped', label: 'Answer mapped' },
  { status: 'pending', label: 'Pending' },
  { status: 'needsReview', label: 'Needs review' },
  { status: 'missing', label: 'Missing' },
];

/** A draft already has an answer — from the key, a marked option, or approval. */
const hasAnswer = (d: OcrDraft): boolean =>
  d.status === 'APPROVED' ||
  d.suggestedAnswer?.correctIndex != null ||
  d.suggestedAnswer?.correct != null ||
  (d.options ?? []).some((o) => o.isCorrect);

const tileStatusOf = (d: OcrDraft): TileStatus => {
  if (d.invalidCrop || draftQuestionNumber(d) == null) return 'missing';
  if (d.status === 'APPROVED') return 'mapped';
  if (d.needsImageReview) return 'needsReview';
  if (hasAnswer(d)) return 'mapped';
  return 'pending';
};

/**
 * Question Navigator — renders EXACTLY the review-list dataset: one tile per
 * draft, same order, same count. It does NOT filter, hide, or invent a 1..N
 * range (that caused the count to disagree with the review list). Each tile shows
 * its question number + an answer-status badge (✓ mapped / ? pending / ! needs
 * review / ✕ missing). Click → detail modal; drag → reorder; Add → snip a new one.
 */
export const QuestionNavigator = ({
  drafts,
  activeId,
  onSelect,
  onAddMissing,
  onReorder,
}: {
  drafts: OcrDraft[];
  activeId: string | null;
  /** Open the detail modal for a draft (no list scrolling). */
  onSelect: (draftId: string) => void;
  /** Add a question at a number (snip → insert). */
  onAddMissing?: (questionNumber: number) => void;
  /** Drag-reorder: move a draft to a target question number. */
  onReorder?: (draftId: string, toQuestionNumber: number) => void;
}) => {
  const [open, setOpen] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);

  const { tiles, counts, addDefault } = useMemo(() => {
    // One tile per draft — the SAME ordered collection the review list renders.
    const t = drafts.map((d) => ({
      draft: d,
      num: draftQuestionNumber(d),
      status: tileStatusOf(d),
    }));
    const c = { mapped: 0, pending: 0, needsReview: 0, missing: 0 };
    let maxNum = 0;
    for (const x of t) {
      c[x.status] += 1;
      if (x.num != null && x.num > maxNum) maxNum = x.num;
    }
    return { tiles: t, counts: c, addDefault: maxNum + 1 || drafts.length + 1 };
  }, [drafts]);

  if (tiles.length === 0) return null;

  return (
    <div className="rounded border border-border bg-surface">
      <div className="flex w-full items-center justify-between px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-text">
            <Grid3x3 size={14} className="text-primary" /> Question navigator
            <span className="font-normal text-text-faint">
              · {tiles.length} questions · {counts.mapped} mapped · {counts.pending} pending ·{' '}
              {counts.needsReview} review · {counts.missing} missing
            </span>
          </span>
        </button>
        <div className="flex items-center gap-1">
          {onAddMissing ? (
            <button
              type="button"
              onClick={() => onAddMissing(addDefault)}
              title="Add a question (snip from the document)"
              className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-text-muted hover:bg-hover hover:text-primary"
            >
              <Plus size={12} /> Add
            </button>
          ) : null}
          <button type="button" onClick={() => setOpen((v) => !v)} className="rounded p-0.5 text-text-muted hover:bg-hover">
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border-soft p-3">
          <div className="flex flex-wrap gap-1">
            {tiles.map(({ draft, num, status }) => {
              const Icon = STATUS_ICON[status];
              const draggable = Boolean(onReorder && num != null);
              return (
                <button
                  key={draft.id}
                  type="button"
                  draggable={draggable}
                  onClick={() => onSelect(draft.id)}
                  onDragStart={() => setDragId(draft.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropId(null);
                  }}
                  onDragOver={(e) => {
                    if (dragId && onReorder && num != null) {
                      e.preventDefault();
                      setDropId(draft.id);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId && onReorder && dragId !== draft.id && num != null) onReorder(dragId, num);
                    setDragId(null);
                    setDropId(null);
                  }}
                  title={`${num != null ? `Question ${num}` : 'Unnumbered'} — ${status}${draggable ? ' (drag to reorder)' : ''}`}
                  className={cn(
                    'inline-flex h-7 min-w-[2.6rem] items-center justify-center gap-0.5 rounded px-1.5 text-[11px] font-medium tabular-nums transition-shadow',
                    STATUS_CLASS[status],
                    'cursor-pointer hover:ring-1 hover:ring-primary',
                    draft.id === activeId && 'ring-2 ring-primary',
                    dropId === draft.id && dragId && 'ring-2 ring-primary',
                  )}
                >
                  <Icon size={10} />
                  {num != null ? num : '—'}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-border-soft pt-2">
            {LEGEND.map((l) => {
              const Icon = STATUS_ICON[l.status];
              return (
                <span key={l.status} className="inline-flex items-center gap-1 text-[10px] text-text-muted">
                  <span className={cn('inline-flex h-3.5 w-3.5 items-center justify-center rounded', STATUS_CLASS[l.status])}>
                    <Icon size={9} />
                  </span>{' '}
                  {l.label}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};
