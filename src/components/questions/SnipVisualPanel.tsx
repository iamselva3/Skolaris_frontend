import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Scissors, Sparkles, X } from 'lucide-react';
import { SnippingTool } from '@/components/ui/SnippingTool';
import { buildStorageUrl, blobToDataUrl, uploadInlineImages } from '@/lib/uploads/upload-image';
import { questionsApi } from '@/lib/api/questions.api';
import { apiErrorMessage } from '@/lib/api/client';
import type { Difficulty } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { CourseSelector } from '@/components/ui/CourseSelector';
import type { TaxonomySelection } from '@/lib/api/taxonomy.api';

const MIN_OPTS = 2;
const MAX_OPTS = 6;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Screenshot-first review: instead of rendering (often garbage) OCR text, the
 * teacher snips each question region straight from the source PDF/image — just
 * like the snipping tool in the question form — and the crop becomes a Visual
 * Question. They only pick the correct option (2..6, default 4) + optional
 * solution. OCR text is never shown or used here.
 */
export const SnipVisualPanel = ({
  upload,
  onCreated,
}: {
  upload: { storageKey: string; mimeType: string; originalName: string };
  onCreated?: () => void;
}) => {
  const [snipOpen, setSnipOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [optionCount, setOptionCount] = useState(4);
  const [correctOption, setCorrectOption] = useState(0);
  const [solution, setSolution] = useState('');
  const [taxonomy, setTaxonomy] = useState<TaxonomySelection>({});
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [createdCount, setCreatedCount] = useState(0);

  const reset = (): void => {
    setDataUrl(null);
    setCorrectOption(0);
    setSolution('');
  };

  const create = useMutation({
    mutationFn: async () => {
      // Deferred-upload the snipped crop, then persist as a VISUAL question.
      const contentHtml = await uploadInlineImages(
        `<p><img src="${dataUrl}" alt="Question image" class="max-w-full rounded border border-border my-2" /></p>`,
        {
          category: 'question-images',
          programId: taxonomy.programId ?? undefined,
          subjectId: taxonomy.subjectId ?? undefined,
        },
      );
      return questionsApi.create({
        type: 'VISUAL',
        payload: { contentHtml, explanation: solution, optionCount },
        options: Array.from({ length: optionCount }, (_, i) => ({
          label: String(i + 1),
          isCorrect: i + 1 === correctOption,
        })),
        programId: taxonomy.programId ?? undefined,
        subjectId: taxonomy.subjectId ?? undefined,
        topicId: taxonomy.topicId ?? undefined,
        chapterId: taxonomy.chapterId ?? undefined,
        difficulty,
      });
    },
    onSuccess: () => {
      setCreatedCount((c) => c + 1);
      toast.success('Visual question created');
      reset();
      onCreated?.();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const setCount = (next: number): void => {
    const c = clamp(next, MIN_OPTS, MAX_OPTS);
    setOptionCount(c);
    if (correctOption > c) setCorrectOption(0);
  };

  return (
    <div className="rounded-md border border-primary/30 bg-primary-soft/20 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-text">Screenshot-first: snip questions</h4>
          <p className="mt-1 text-xs text-text-muted">
            Snip each question region from the document — the crop becomes a Visual Question. No OCR
            text needed; just pick the correct option and (optionally) add a solution.
          </p>
          {createdCount > 0 ? (
            <p className="mt-1 text-[11px] font-medium text-success">
              <Check size={11} className="mr-0.5 inline" /> {createdCount} visual question
              {createdCount === 1 ? '' : 's'} created from this document.
            </p>
          ) : null}

          {!dataUrl ? (
            <Button variant="primary" size="sm" className="mt-3" onClick={() => setSnipOpen(true)}>
              <Scissors size={14} className="mr-1" /> Snip a question
            </Button>
          ) : (
            <div className="mt-3 space-y-3 rounded-md border border-border bg-surface p-3">
              <div className="relative inline-block">
                <img
                  src={dataUrl}
                  alt="Snipped question"
                  className="max-h-72 rounded border border-border bg-subtle object-contain"
                />
                <button
                  type="button"
                  onClick={reset}
                  title="Discard snip"
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-danger"
                >
                  <X size={14} />
                </button>
              </div>

              <CourseSelector value={taxonomy} onChange={setTaxonomy} size="sm" />

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Options</span>
                  <div className="flex items-center rounded border border-border">
                    <button
                      type="button"
                      disabled={optionCount <= MIN_OPTS}
                      onClick={() => setCount(optionCount - 1)}
                      className="px-2 py-0.5 text-sm text-text-muted hover:bg-hover disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-7 text-center text-sm font-medium tabular-nums">{optionCount}</span>
                    <button
                      type="button"
                      disabled={optionCount >= MAX_OPTS}
                      onClick={() => setCount(optionCount + 1)}
                      className="px-2 py-0.5 text-sm text-text-muted hover:bg-hover disabled:opacity-30"
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
                          'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded border text-sm font-medium ' +
                          (correctOption === n
                            ? 'border-success bg-success-soft text-success'
                            : 'border-border bg-surface text-text-muted hover:bg-hover')
                        }
                      >
                        <input
                          type="radio"
                          name="snip-visual-correct"
                          className="sr-only"
                          checked={correctOption === n}
                          onChange={() => setCorrectOption(n)}
                        />
                        {n}
                      </label>
                    ))}
                  </div>
                </div>
                <Select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  className="h-8 w-28 text-xs"
                >
                  <option value="EASY">EASY</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HARD">HARD</option>
                </Select>
              </div>

              <Textarea
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                placeholder="Solution / explanation (optional)"
                rows={2}
              />

              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSnipOpen(true)}>
                  Re-snip
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={create.isPending}
                  disabled={correctOption === 0}
                  onClick={() => create.mutate()}
                  title={correctOption === 0 ? 'Pick the correct option first' : 'Create visual question'}
                >
                  <Check size={14} className="mr-1" /> Create &amp; snip next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <SnippingTool
        open={snipOpen}
        onClose={() => setSnipOpen(false)}
        source={{
          kind: 'url',
          url: buildStorageUrl(upload.storageKey),
          mime: upload.mimeType,
          name: upload.originalName,
        }}
        onCropped={async (blob) => {
          const url = await blobToDataUrl(blob);
          setDataUrl(url);
        }}
        title="Snip → Visual Question"
      />
    </div>
  );
};
