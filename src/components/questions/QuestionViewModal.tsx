import { Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { renderWithMath } from '@/components/ui/render-with-math';
import { cn } from '@/lib/utils/cn';
import type { Question } from '@/lib/api/questions.api';

/**
 * Read-only preview of a single question: the stem (contentHtml, with inline
 * math) plus the type-specific answer key. Driven entirely by the row data the
 * list already holds — no extra fetch. Pass `question={null}` to keep it closed.
 */
export const QuestionViewModal = ({
  question,
  onClose,
}: {
  question: Question | null;
  onClose: () => void;
}) => {
  const payload = (question?.payload ?? {}) as QuestionPayloadView;
  const contentHtml = typeof payload.contentHtml === 'string' ? payload.contentHtml : '';

  return (
    <Modal
      open={!!question}
      title="View question"
      onClose={onClose}
      size="lg"
    >
      {question ? (
        <div className="space-y-4">
          {/* Meta strip */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.4px] text-text-muted">
            <span className="rounded border border-border bg-subtle px-1.5 py-0.5 font-medium">
              {question.type.replace(/_/g, ' ').toLowerCase()}
            </span>
            <span>{question.difficulty}</span>
            {question.subject ? (
              <span className="text-text">
                {question.subject}
                {question.topic ? <span className="text-text-faint"> · {question.topic}</span> : null}
              </span>
            ) : null}
          </div>

          {/* Stem */}
          <div>
            <SectionLabel>Question</SectionLabel>
            {contentHtml ? (
              renderWithMath(contentHtml)
            ) : (
              <p className="text-sm italic text-text-faint">No question text.</p>
            )}
          </div>

          {/* Type-specific answer key */}
          <AnswerKey question={question} payload={payload} />

          {/* Explanation (any type) */}
          {typeof payload.explanation === 'string' && payload.explanation.trim() ? (
            <div>
              <SectionLabel>Explanation</SectionLabel>
              <p className="whitespace-pre-wrap text-sm leading-6 text-text-muted">
                {payload.explanation}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
};

/* ─────────────────────────────────────────── Answer key per type */

const AnswerKey = ({
  question,
  payload,
}: {
  question: Question;
  payload: QuestionPayloadView;
}) => {
  switch (question.type) {
    case 'VISUAL': {
      // The image (rendered in the stem section above) already shows the
      // options; just surface which positional slot is correct.
      const correct = [...question.options]
        .sort((a, b) => a.position - b.position)
        .findIndex((o) => o.isCorrect);
      return (
        <div>
          <SectionLabel>Correct answer</SectionLabel>
          {correct >= 0 ? (
            <span className="inline-flex items-center gap-1 rounded border border-success bg-success-soft px-2 py-0.5 text-sm font-medium text-success">
              <Check size={12} /> Option {correct + 1}
            </span>
          ) : (
            <span className="text-sm italic text-text-faint">No correct option set.</span>
          )}
        </div>
      );
    }

    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE': {
      const options = [...question.options].sort((a, b) => a.position - b.position);
      return (
        <div>
          <SectionLabel>Options</SectionLabel>
          {options.length === 0 ? (
            <p className="text-sm italic text-text-faint">No options.</p>
          ) : (
            <ul className="space-y-1.5">
              {options.map((o, i) => (
                <li
                  key={o.id}
                  className={cn(
                    'flex items-start gap-2 rounded border px-2.5 py-1.5 text-sm',
                    o.isCorrect
                      ? 'border-success bg-success-soft text-text'
                      : 'border-border bg-surface text-text-muted',
                  )}
                >
                  <span className="w-5 shrink-0 font-medium text-text-muted">
                    {String.fromCharCode(65 + i)}.
                  </span>
                  <span className="flex-1">{o.label}</span>
                  {o.isCorrect ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.4px] text-success">
                      <Check size={12} /> Correct
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    case 'TRUE_FALSE':
      return (
        <div>
          <SectionLabel>Answer</SectionLabel>
          <span className="inline-flex items-center gap-1 rounded border border-success bg-success-soft px-2 py-0.5 text-sm font-medium text-success">
            <Check size={12} /> {payload.correct ? 'True' : 'False'}
          </span>
        </div>
      );

    case 'FILL_BLANK':
      return (
        <div>
          <SectionLabel>Accepted answers</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {(payload.accepted ?? []).map((a, i) => (
              <span
                key={i}
                className="rounded border border-border bg-subtle px-2 py-0.5 text-sm text-text"
              >
                {a}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-text-faint">
            {payload.caseSensitive ? 'Case-sensitive' : 'Case-insensitive'}
          </p>
        </div>
      );

    case 'MATCH_FOLLOWING':
      return (
        <div>
          <SectionLabel>Pairs</SectionLabel>
          <ul className="space-y-1">
            {(payload.pairs ?? []).map((p, i) => (
              <li
                key={i}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded border border-border bg-surface px-2.5 py-1.5 text-sm"
              >
                <span className="text-text">{p.left}</span>
                <span className="text-text-faint">↔</span>
                <span className="text-text">{p.right}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case 'DESCRIPTIVE':
      return (
        <div className="space-y-1.5">
          {payload.rubric ? (
            <div>
              <SectionLabel>Rubric</SectionLabel>
              <p className="whitespace-pre-wrap text-sm leading-6 text-text-muted">
                {payload.rubric}
              </p>
            </div>
          ) : null}
          {payload.maxWords ? (
            <p className="text-[11px] text-text-faint">Max words: {payload.maxWords}</p>
          ) : null}
        </div>
      );

    case 'MATRIX_MATCH':
    default:
      return (
        <div>
          <SectionLabel>Answer key</SectionLabel>
          <pre className="overflow-auto rounded border border-border bg-subtle p-2 text-[11px] text-text-muted">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      );
  }
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.5px] text-text-faint">
    {children}
  </p>
);

/* Loose view of the stored payload across all 7 question types. */
interface QuestionPayloadView {
  contentHtml?: string;
  explanation?: string;
  correct?: boolean;
  accepted?: string[];
  caseSensitive?: boolean;
  pairs?: Array<{ left: string; right: string }>;
  rubric?: string;
  maxWords?: number;
}
