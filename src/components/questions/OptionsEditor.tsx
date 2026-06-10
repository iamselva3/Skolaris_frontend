import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import type { QuestionType } from '@/lib/types';

export interface ChoiceOption {
  label: string;
  isCorrect: boolean;
}

export interface QuestionPayload {
  /** Choice types use this; everything else stores type-specific shapes. */
  options?: ChoiceOption[];
  /** TRUE_FALSE answer. */
  correct?: boolean;
  /** FILL_BLANK accepted answers (case-insensitive by default). */
  accepted?: string[];
  caseSensitive?: boolean;
  /** DESCRIPTIVE rubric. */
  rubric?: string;
  maxWords?: number;
  /** MATCH_FOLLOWING pairs (left, right). */
  pairs?: Array<{ left: string; right: string }>;
  /** VISUAL: number of positional answer slots shown (2..6). */
  optionCount?: number;
  /** VISUAL: 1-based index of the correct option. */
  correctOption?: number;
  /** Free-form explanation shown after submit. */
  explanation?: string;
}

interface Props {
  type: QuestionType;
  payload: QuestionPayload;
  onChange: (next: QuestionPayload) => void;
  disabled?: boolean;
}

/**
 * Per-type body editor. Renders the input UI appropriate to the question type
 * and emits a uniformly-shaped payload back to the parent form.
 *
 * Implemented in v1: SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE, FILL_BLANK,
 * DESCRIPTIVE, MATCH_FOLLOWING.
 * MATRIX_MATCH renders a "not yet supported" notice.
 */
export const OptionsEditor = ({ type, payload, onChange, disabled }: Props) => {
  switch (type) {
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE':
      return <ChoiceEditor type={type} payload={payload} onChange={onChange} disabled={disabled} />;
    case 'TRUE_FALSE':
      return <TrueFalseEditor payload={payload} onChange={onChange} disabled={disabled} />;
    case 'FILL_BLANK':
      return <FillBlankEditor payload={payload} onChange={onChange} disabled={disabled} />;
    case 'DESCRIPTIVE':
      return <DescriptiveEditor payload={payload} onChange={onChange} disabled={disabled} />;
    case 'MATCH_FOLLOWING':
      return <MatchEditor payload={payload} onChange={onChange} disabled={disabled} />;
    case 'VISUAL':
      return <VisualEditor payload={payload} onChange={onChange} disabled={disabled} />;
    case 'MATRIX_MATCH':
    default:
      return (
        <p className="rounded border border-dashed border-border bg-subtle p-3 text-xs text-text-muted">
          Matrix-match editor not yet implemented. Add via the legacy JSON API or wait
          for the next release.
        </p>
      );
  }
};

/* ─────────────────────────────────────────── SINGLE / MULTIPLE CHOICE */

const ChoiceEditor = ({
  type,
  payload,
  onChange,
  disabled,
}: {
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
  payload: QuestionPayload;
  onChange: (next: QuestionPayload) => void;
  disabled?: boolean;
}) => {
  const options = payload.options ?? [
    { label: '', isCorrect: false },
    { label: '', isCorrect: false },
  ];

  const setOptions = (next: ChoiceOption[]): void => {
    onChange({ ...payload, options: next });
  };

  const toggle = (i: number): void => {
    if (type === 'SINGLE_CHOICE') {
      setOptions(options.map((o, j) => ({ ...o, isCorrect: i === j })));
    } else {
      setOptions(options.map((o, j) => (i === j ? { ...o, isCorrect: !o.isCorrect } : o)));
    }
  };

  return (
    <div className="space-y-1.5">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          {type === 'SINGLE_CHOICE' ? (
            <input
              type="radio"
              name="single-correct"
              className="form-checkbox rounded-full"
              checked={o.isCorrect}
              disabled={disabled}
              onChange={() => toggle(i)}
              aria-label={`Mark option ${String.fromCharCode(65 + i)} correct`}
            />
          ) : (
            <input
              type="checkbox"
              className="form-checkbox"
              checked={o.isCorrect}
              disabled={disabled}
              onChange={() => toggle(i)}
              aria-label={`Mark option ${String.fromCharCode(65 + i)} correct`}
            />
          )}
          <span className="w-5 text-xs font-medium text-text-muted">
            {String.fromCharCode(65 + i)}.
          </span>
          <Input
            value={o.label}
            disabled={disabled}
            onChange={(e) =>
              setOptions(options.map((x, j) => (i === j ? { ...x, label: e.target.value } : x)))
            }
            className="flex-1"
            placeholder={`Option ${String.fromCharCode(65 + i)}`}
          />
          <button
            type="button"
            title="Remove option"
            disabled={disabled || options.length <= 2}
            onClick={() => setOptions(options.filter((_, j) => j !== i))}
            className="rounded p-1 text-text-faint hover:text-danger disabled:opacity-30"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled || options.length >= 8}
        onClick={() => setOptions([...options, { label: '', isCorrect: false }])}
      >
        <Plus size={12} /> Add option
      </Button>
    </div>
  );
};

/* ─────────────────────────────────────────── TRUE / FALSE */

const TrueFalseEditor = ({
  payload,
  onChange,
  disabled,
}: {
  payload: QuestionPayload;
  onChange: (next: QuestionPayload) => void;
  disabled?: boolean;
}) => {
  const correct = payload.correct ?? true;
  return (
    <div className="flex items-center gap-4">
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="tf"
          className="form-checkbox rounded-full"
          checked={correct === true}
          disabled={disabled}
          onChange={() => onChange({ ...payload, correct: true })}
        />
        True
      </label>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="tf"
          className="form-checkbox rounded-full"
          checked={correct === false}
          disabled={disabled}
          onChange={() => onChange({ ...payload, correct: false })}
        />
        False
      </label>
    </div>
  );
};

/* ─────────────────────────────────────────── FILL BLANK */

const FillBlankEditor = ({
  payload,
  onChange,
  disabled,
}: {
  payload: QuestionPayload;
  onChange: (next: QuestionPayload) => void;
  disabled?: boolean;
}) => {
  const accepted = payload.accepted ?? [''];
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-text-muted">
        Accepted answers (any match is correct). Use one per row.
      </p>
      {accepted.map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={a}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...payload,
                accepted: accepted.map((x, j) => (i === j ? e.target.value : x)),
              })
            }
            className="flex-1"
            placeholder="Accepted answer"
          />
          <button
            type="button"
            title="Remove"
            disabled={disabled || accepted.length <= 1}
            onClick={() =>
              onChange({ ...payload, accepted: accepted.filter((_, j) => j !== i) })
            }
            className="rounded p-1 text-text-faint hover:text-danger disabled:opacity-30"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange({ ...payload, accepted: [...accepted, ''] })}
        >
          <Plus size={12} /> Add accepted answer
        </Button>
        <label className="inline-flex items-center gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            className="form-checkbox"
            checked={!!payload.caseSensitive}
            disabled={disabled}
            onChange={(e) => onChange({ ...payload, caseSensitive: e.target.checked })}
          />
          Case-sensitive
        </label>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────── DESCRIPTIVE */

const DescriptiveEditor = ({
  payload,
  onChange,
  disabled,
}: {
  payload: QuestionPayload;
  onChange: (next: QuestionPayload) => void;
  disabled?: boolean;
}) => (
  <div className="space-y-2">
    <Textarea
      value={payload.rubric ?? ''}
      onChange={(e) => onChange({ ...payload, rubric: e.target.value })}
      placeholder="Grading rubric — what gets full marks, what gets partial."
      rows={3}
      disabled={disabled}
    />
    <div className="flex items-center gap-2 text-xs">
      <span className="text-text-muted">Max words:</span>
      <Input
        type="number"
        value={payload.maxWords ?? 100}
        min={10}
        max={2000}
        disabled={disabled}
        onChange={(e) => onChange({ ...payload, maxWords: Number(e.target.value) || 100 })}
        className="w-20"
      />
    </div>
  </div>
);

/* ─────────────────────────────────────────── MATCH FOLLOWING */

const MatchEditor = ({
  payload,
  onChange,
  disabled,
}: {
  payload: QuestionPayload;
  onChange: (next: QuestionPayload) => void;
  disabled?: boolean;
}) => {
  const pairs = payload.pairs ?? [
    { left: '', right: '' },
    { left: '', right: '' },
  ];
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-text-muted">Match each LEFT with its correct RIGHT.</p>
      {pairs.map((p, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
          <Input
            value={p.left}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...payload,
                pairs: pairs.map((x, j) => (i === j ? { ...x, left: e.target.value } : x)),
              })
            }
            placeholder="Left"
          />
          <span className="text-xs text-text-faint">↔</span>
          <Input
            value={p.right}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...payload,
                pairs: pairs.map((x, j) => (i === j ? { ...x, right: e.target.value } : x)),
              })
            }
            placeholder="Right"
          />
          <button
            type="button"
            title="Remove pair"
            disabled={disabled || pairs.length <= 2}
            onClick={() =>
              onChange({ ...payload, pairs: pairs.filter((_, j) => j !== i) })
            }
            className="rounded p-1 text-text-faint hover:text-danger disabled:opacity-30"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => onChange({ ...payload, pairs: [...pairs, { left: '', right: '' }] })}
      >
        <Plus size={12} /> Add pair
      </Button>
    </div>
  );
};

/* ─────────────────────────────────────────── VISUAL */

const MIN_VISUAL_OPTIONS = 2;
const MAX_VISUAL_OPTIONS = 6;

/**
 * Answer picker for a Visual Question. The image already shows the options, so
 * there is no option text — the teacher only chooses how many answer slots the
 * image has (2..6) and which one is correct.
 */
const VisualEditor = ({
  payload,
  onChange,
  disabled,
}: {
  payload: QuestionPayload;
  onChange: (next: QuestionPayload) => void;
  disabled?: boolean;
}) => {
  const optionCount = clamp(payload.optionCount ?? 4, MIN_VISUAL_OPTIONS, MAX_VISUAL_OPTIONS);
  const correctOption =
    payload.correctOption && payload.correctOption <= optionCount ? payload.correctOption : 0;

  const setCount = (next: number): void => {
    const count = clamp(next, MIN_VISUAL_OPTIONS, MAX_VISUAL_OPTIONS);
    onChange({
      ...payload,
      optionCount: count,
      // Drop a correct pick that no longer exists after shrinking.
      correctOption: correctOption > count ? 0 : correctOption,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted">Number of options</span>
        <div className="flex items-center rounded border border-border">
          <button
            type="button"
            disabled={disabled || optionCount <= MIN_VISUAL_OPTIONS}
            onClick={() => setCount(optionCount - 1)}
            className="px-2 py-0.5 text-sm text-text-muted hover:bg-hover disabled:opacity-30"
            aria-label="Fewer options"
          >
            −
          </button>
          <span className="w-8 text-center text-sm font-medium tabular-nums">{optionCount}</span>
          <button
            type="button"
            disabled={disabled || optionCount >= MAX_VISUAL_OPTIONS}
            onClick={() => setCount(optionCount + 1)}
            className="px-2 py-0.5 text-sm text-text-muted hover:bg-hover disabled:opacity-30"
            aria-label="More options"
          >
            +
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs text-text-muted">
          Correct answer (as numbered in the image)
        </p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: optionCount }, (_, i) => i + 1).map((n) => (
            <label
              key={n}
              className={
                'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border text-sm font-medium transition-colors ' +
                (correctOption === n
                  ? 'border-success bg-success-soft text-success'
                  : 'border-border bg-surface text-text-muted hover:bg-hover')
              }
            >
              <input
                type="radio"
                name="visual-correct"
                className="sr-only"
                checked={correctOption === n}
                disabled={disabled}
                onChange={() => onChange({ ...payload, optionCount, correctOption: n })}
              />
              {n}
            </label>
          ))}
        </div>
        {correctOption === 0 ? (
          <p className="mt-1.5 text-[11px] text-warning">Select which option is correct.</p>
        ) : null}
      </div>
    </div>
  );
};

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
