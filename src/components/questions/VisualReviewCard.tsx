import { useEffect, useRef, useState } from 'react';
import { Check, Image as ImageIcon, Pencil, Scissors, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { toast } from 'sonner';
import { SnippingTool } from '@/components/ui/SnippingTool';
import { uploadImageBlob } from '@/lib/uploads/upload-image';
import { apiErrorMessage } from '@/lib/api/client';
import { buildSnapshotUrl } from '@/lib/uploads/storage-url';
import { indexToLabel } from '@/lib/ocr/answer-key-parse';
import type { AnswerMeta } from '@/components/questions/QuestionOverviewSidebar';
import type { OcrDraft } from '@/lib/api/ocr.api';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export type VisualAnswerMode = 'MCQ' | 'TRUE_FALSE' | 'DESCRIPTIVE';

export interface VisualApprovePayload {
  mode: VisualAnswerMode;
  /** MCQ only */
  optionCount: number;
  /** MCQ only — 1-based correct option */
  correctOption: number;
  /** TRUE_FALSE only */
  correctBool: boolean | null;
  solutionHtml: string;
  /** When the teacher re-cropped the image, the `<img>` HTML that should REPLACE
   *  the server-generated snapshot stem. Undefined = keep the auto-crop. */
  contentHtmlOverride?: string;
  /** The new snapshot storage key. Passed to the backend so the draft updates its key. */
  questionSnapshotKeyOverride?: string;
}

/** Same <img> markup the backend builds for a snapshot stem (keeps content
 *  identical whether the crop came from auto-segmentation or a teacher re-snip). */
const imageStemHtml = (url: string): string =>
  `<p><img src="${url}" alt="Question image" class="max-w-full rounded border border-border my-2" /></p>`;

/**
 * Screenshot-first OCR review for one draft: the cropped question image is the
 * source of truth. The teacher only picks how many options the image shows
 * (2..6) and which one is correct, optionally adds a solution, then approves —
 * no text reconstruction. Falls back to "Convert to editable" for the rare case
 * the teacher wants the legacy text editor.
 */
export const VisualReviewCard = ({
  draft,
  payloadRef,
  onApprove,
  onConvertToText,
  onAnswerChange,
  onAnswerPersist,
  isApproving,
}: {
  draft: OcrDraft;
  /** Kept current with the live answer payload so a parent that renders its OWN
   *  Save Answer / Approve buttons below this card can read the pick on click.
   *  When provided WITHOUT onApprove, no internal Approve button is rendered. */
  payloadRef?: { current: VisualApprovePayload | null };
  /** Auto-persist the answer the moment the teacher changes the pick (no Save
   *  button). Fires only on user changes, never on the initial seed. */
  onAnswerPersist?: (payload: VisualApprovePayload) => void;
  /** Legacy/self-contained mode: when provided, the card renders its own Approve
   *  (and optional Convert) button. The UploadReviewPage path omits this and uses
   *  payloadRef + external buttons instead. */
  onApprove?: (payload: VisualApprovePayload) => void;
  onConvertToText?: () => void;
  /** Report the current answer pick up to the page so the overview updates live. */
  onAnswerChange?: (meta: AnswerMeta) => void;
  isApproving?: boolean;
}) => {
  // Pre-selection precedence: a previously SAVED answer (persisted as draft
  // options with one isCorrect) → an imported answer key (numeric index → MCQ
  // option, boolean → True/False) → nothing. Saved options let the pick survive
  // navigation; the teacher can still change it (clears the badge).
  const suggested = draft.suggestedAnswer ?? null;
  const savedCorrectIdx = (draft.options ?? []).findIndex((o) => o.isCorrect); // 0-based, -1 = none
  const [mode, setMode] = useState<VisualAnswerMode>(() =>
    savedCorrectIdx >= 0
      ? 'MCQ'
      : suggested?.correct !== undefined && suggested.correct !== null
        ? 'TRUE_FALSE'
        : 'MCQ',
  );
  // Default to at least 4 option slots — the analyzer sometimes detects only 2
  // when the image clearly shows 4. The teacher can still adjust with −/+.
  const [optionCount, setOptionCount] = useState(() =>
    clamp(
      Math.max(draft.options?.length ?? 0, draft.optionCount ?? 4, suggested?.correctIndex ?? 0, 4),
      MIN_OPTIONS,
      MAX_OPTIONS,
    ),
  );
  const [correctOption, setCorrectOption] = useState(() =>
    savedCorrectIdx >= 0
      ? savedCorrectIdx + 1
      : suggested?.correctIndex && suggested.correctIndex >= 1
        ? suggested.correctIndex
        : 0,
  );
  const [correctBool, setCorrectBool] = useState<boolean | null>(() =>
    suggested?.correct !== undefined && suggested.correct !== null ? suggested.correct : null,
  );
  const [solution, setSolution] = useState('');
  // The current pick still equals the key's suggestion (drives the badge).
  const hasSuggestion = Boolean(suggested && (suggested.correctIndex || suggested.correct !== undefined));
  const [touched, setTouched] = useState(false);
  const autoMapped = hasSuggestion && !touched;
  const [snipOpen, setSnipOpen] = useState(false);
  // Teacher re-crop: a fresh image URL + its stem HTML override (replaces the
  // auto-crop on approve). Null until the teacher re-snips.
  const [overrideUrl, setOverrideUrl] = useState<string | null>(null);
  const [overrideHtml, setOverrideHtml] = useState<string | undefined>(undefined);
  const [overrideKey, setOverrideKey] = useState<string | undefined>(undefined);

  const imageKey = draft.questionSnapshotKey?.trim();
  const displayUrl = overrideUrl ?? (imageKey ? buildSnapshotUrl(imageKey) : null);

  // Upload the re-cropped blob, then preview it + remember its stem override.
  const handleRecropped = async (blob: Blob): Promise<void> => {
    try {
      // 'question-images' (NOT 'ocr-papers') so completing the upload does NOT
      // kick off a fresh OCR job — a re-crop edits this draft's image in place,
      // it must never spawn a separate upload that waits for review.
      const { url, storageKey } = await uploadImageBlob(blob, {
        category: 'question-images',
        filename: `recrop-${draft.id}-${Date.now()}.png`,
      });
      setOverrideUrl(url);
      setOverrideHtml(imageStemHtml(url));
      setOverrideKey(storageKey);
      toast.success('Image updated — approve to save the new crop');
    } catch (e) {
      toast.error(apiErrorMessage(e));
      throw e; // keep the snip modal open so the teacher can retry
    }
  };

  // Answer is set once the mode's pick is made (Descriptive needs none).
  const answerReady =
    mode === 'DESCRIPTIVE' ||
    (mode === 'MCQ' && correctOption > 0) ||
    (mode === 'TRUE_FALSE' && correctBool !== null);

  const setCount = (next: number): void => {
    const count = clamp(next, MIN_OPTIONS, MAX_OPTIONS);
    setOptionCount(count);
    setTouched(true);
    if (correctOption > count) setCorrectOption(0);
  };
  const pickMode = (m: VisualAnswerMode): void => {
    setMode(m);
    setTouched(true);
  };
  const pickOption = (n: number): void => {
    setCorrectOption(n);
    setTouched(true);
  };
  const pickBool = (val: boolean): void => {
    setCorrectBool(val);
    setTouched(true);
  };

  // Report the current pick up to the page (overview live-updates). Callback is
  // held in a ref so an inline parent prop can't retrigger the effect every render.
  const cbRef = useRef(onAnswerChange);
  cbRef.current = onAnswerChange;
  useEffect(() => {
    const mapped =
      mode === 'DESCRIPTIVE' ||
      (mode === 'MCQ' && correctOption > 0) ||
      (mode === 'TRUE_FALSE' && correctBool !== null);
    const label =
      mode === 'MCQ'
        ? correctOption > 0
          ? indexToLabel(correctOption)
          : undefined
        : mode === 'TRUE_FALSE'
          ? correctBool === null
            ? undefined
            : correctBool
              ? 'True'
              : 'False'
          : 'Desc';
    cbRef.current?.({ mapped, label, source: autoMapped ? 'answer-key' : 'manual' });
  }, [mode, correctOption, correctBool, autoMapped]);

  // Auto-persist the answer the moment the teacher changes the pick (no Save
  // button). Held in a ref so an inline parent prop doesn't retrigger the effect
  // each render; gated on `touched` so the initial seed — including an OCR /
  // answer-key preselect — is never re-written, only genuine user changes.
  const persistRef = useRef(onAnswerPersist);
  persistRef.current = onAnswerPersist;
  useEffect(() => {
    if (!touched) return;
    persistRef.current?.({
      mode,
      optionCount,
      correctOption,
      correctBool,
      solutionHtml: solution,
      contentHtmlOverride: overrideHtml,
      questionSnapshotKeyOverride: overrideKey,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touched, mode, optionCount, correctOption, correctBool]);

  // Keep the live answer payload available to the parent, which renders the Save
  // Answer / Approve buttons below this card (assigning a ref during render is the
  // same pattern as cbRef above and never triggers a re-render).
  if (payloadRef) {
    payloadRef.current = {
      mode,
      optionCount,
      correctOption,
      correctBool,
      solutionHtml: solution,
      contentHtmlOverride: overrideHtml,
      questionSnapshotKeyOverride: overrideKey,
    };
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-primary">
        <ImageIcon size={12} /> Visual question
      </div>

      {/* The image IS the question — teacher can re-crop it if the auto-crop is off. */}
      {displayUrl ? (
        <div className="relative">
          <img
            src={displayUrl}
            alt="Cropped question"
            className="max-h-[420px] w-full rounded border border-border bg-subtle object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <button
            type="button"
            onClick={() => setSnipOpen(true)}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded border border-border bg-surface/90 px-2 py-1 text-[11px] font-medium text-text shadow-sm backdrop-blur hover:bg-surface"
            title="Re-crop this question from the source"
          >
            <Scissors size={12} /> Re-crop
          </button>
          {overrideUrl ? (
            <span className="absolute left-2 top-2 rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success">
              Edited
            </span>
          ) : null}
        </div>
      ) : (
        <p className="rounded border border-dashed border-border bg-subtle p-3 text-xs text-text-muted">
          No cropped image is attached to this draft yet, so it can't be approved as a visual
          question. Use “Convert to editable” to review it as text instead.
        </p>
      )}

      <SnippingTool
        open={snipOpen}
        onClose={() => setSnipOpen(false)}
        source={imageKey ? { kind: 'url', url: buildSnapshotUrl(imageKey), mime: 'image/png' } : null}
        allowSourcePicker
        title="Re-crop question"
        onCropped={handleRecropped}
      />

      {/* Auto-mapped badge — shown while the pick still matches the imported key. */}
      {autoMapped ? (
        <div className="inline-flex items-center gap-1.5 rounded bg-primary-soft px-2 py-1 text-[11px] font-medium text-primary">
          <Sparkles size={12} /> Auto-mapped from Answer Key
          {suggested?.correctIndex ? ` · Option ${indexToLabel(suggested.correctIndex)}` : ''}
          {suggested?.correct !== undefined && suggested?.correct !== null
            ? ` · ${suggested.correct ? 'True' : 'False'}`
            : ''}
        </div>
      ) : null}

      {/* Answer mode — the image already shows everything; just pick the shape. */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted">Answer</span>
        <div className="flex rounded border border-border-soft bg-subtle p-0.5">
          {([
            ['MCQ', 'Options'],
            ['TRUE_FALSE', 'True / False'],
            ['DESCRIPTIVE', 'Descriptive'],
          ] as Array<[VisualAnswerMode, string]>).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => pickMode(m)}
              className={
                'rounded px-2.5 py-0.5 text-[11px] font-medium transition-colors ' +
                (mode === m ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text')
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'MCQ' ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Options</span>
            <div className="flex items-center rounded border border-border">
              <button
                type="button"
                disabled={optionCount <= MIN_OPTIONS}
                onClick={() => setCount(optionCount - 1)}
                className="px-2 py-0.5 text-sm text-text-muted hover:bg-hover disabled:opacity-30"
                aria-label="Fewer options"
              >
                −
              </button>
              <span className="w-7 text-center text-sm font-medium tabular-nums">{optionCount}</span>
              <button
                type="button"
                disabled={optionCount >= MAX_OPTIONS}
                onClick={() => setCount(optionCount + 1)}
                className="px-2 py-0.5 text-sm text-text-muted hover:bg-hover disabled:opacity-30"
                aria-label="More options"
              >
                +
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Correct</span>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: optionCount }, (_, i) => i + 1).map((n) => (
                <label
                  key={n}
                  className={
                    'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded border text-sm font-medium transition-colors ' +
                    (correctOption === n
                      ? 'border-success bg-success-soft text-success'
                      : 'border-border bg-surface text-text-muted hover:bg-hover')
                  }
                >
                  <input
                    type="radio"
                    name={`visual-correct-${draft.id}`}
                    className="sr-only"
                    checked={correctOption === n}
                    onChange={() => pickOption(n)}
                  />
                  {n}
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : mode === 'TRUE_FALSE' ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Correct</span>
          {([
            [true, 'True'],
            [false, 'False'],
          ] as Array<[boolean, string]>).map(([val, label]) => (
            <label
              key={label}
              className={
                'inline-flex h-8 cursor-pointer items-center rounded border px-3 text-sm font-medium transition-colors ' +
                (correctBool === val
                  ? 'border-success bg-success-soft text-success'
                  : 'border-border bg-surface text-text-muted hover:bg-hover')
              }
            >
              <input
                type="radio"
                name={`visual-tf-${draft.id}`}
                className="sr-only"
                checked={correctBool === val}
                onChange={() => pickBool(val)}
              />
              {label}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-muted">
          Descriptive — no options. Add a solution / answer key below.
        </p>
      )}

      {/* Optional solution */}
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-text-faint">
          Solution / explanation (optional)
        </p>
        <Textarea
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          placeholder="Shown after a student submits."
          rows={2}
        />
      </div>

      {/* Self-contained mode (e.g. OcrAssistPanel): render the Approve/Convert
      buttons here. The UploadReviewPage path omits onApprove and renders its own
      Save Answer / Approve buttons below the card (reading payloadRef). */}
      {onApprove ? (
        <div className="flex items-center justify-between gap-2">
          {onConvertToText ? (
            <Button variant="ghost" size="sm" onClick={onConvertToText} disabled={isApproving}>
              <Pencil size={13} className="mr-1" /> Convert to editable
            </Button>
          ) : (
            <span />
          )}
          <Button
            variant="primary"
            size="sm"
            loading={isApproving}
            disabled={!displayUrl || !answerReady}
            onClick={() =>
              onApprove({
                mode,
                optionCount,
                correctOption,
                correctBool,
                solutionHtml: solution,
                contentHtmlOverride: overrideHtml,
                questionSnapshotKeyOverride: overrideKey,
              })
            }
            title={!answerReady ? 'Set the correct answer first' : 'Approve as a visual question'}
          >
            <Check size={14} className="mr-1" /> Approve
          </Button>
        </div>
      ) : null}
    </div>
  );
};
