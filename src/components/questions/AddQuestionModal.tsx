import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Scissors } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { SnippingTool } from '@/components/ui/SnippingTool';
import { apiErrorMessage } from '@/lib/api/client';
import { ocrApi } from '@/lib/api/ocr.api';
import { blobToDataUrl, buildStorageUrl, uploadImageBlob } from '@/lib/uploads/upload-image';

const MIN_OPTS = 2;
const MAX_OPTS = 6;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Manual recovery — add a question OCR missed: snip the region straight from the
 * uploaded PDF/image, choose the question number to insert at, and the backend
 * renumbers the rest (answers ride along). Used by the navigator's "Add" button
 * and by clicking a 🔴 Missing cell (which pre-fills that number).
 */
export const AddQuestionModal = ({
  open,
  jobId,
  upload,
  defaultNumber,
  onClose,
  onInserted,
}: {
  open: boolean;
  jobId: string;
  upload: { storageKey: string; mimeType: string; originalName: string };
  defaultNumber: number | null;
  onClose: () => void;
  onInserted: () => void;
}) => {
  const [snipOpen, setSnipOpen] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [number, setNumber] = useState(defaultNumber ?? 1);
  const [optionCount, setOptionCount] = useState(4);
  const [correctOption, setCorrectOption] = useState(0);
  const [solution, setSolution] = useState('');

  useEffect(() => {
    if (open) {
      setNumber(defaultNumber ?? 1);
      setBlob(null);
      setPreviewUrl(null);
      setCorrectOption(0);
      setSolution('');
    }
  }, [open, defaultNumber]);

  const insert = useMutation({
    mutationFn: async () => {
      if (!blob) throw new Error('Snip a question region first');
      if (correctOption < 1) throw new Error('Pick the correct option');
      // 'question-images' so completing the upload does NOT trigger a separate
      // OCR job — the snip is inserted directly as a draft, never re-OCR'd.
      const { storageKey } = await uploadImageBlob(blob, {
        category: 'question-images',
        filename: `snip-q${number}.png`,
      });
      return ocrApi.insertDraft(jobId, {
        storageKey,
        questionNumber: number,
        optionCount,
        correctOption,
        solutionHtml: solution || undefined,
      });
    },
    onSuccess: () => {
      toast.success(`Inserted question ${number}`);
      onInserted();
      onClose();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <>
      <Modal
        open={open}
        title={defaultNumber != null ? `Add question ${defaultNumber}` : 'Add question'}
        onClose={onClose}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!blob || correctOption < 1}
              loading={insert.isPending}
              onClick={() => insert.mutate()}
              title={correctOption < 1 ? 'Pick the correct option first' : `Insert at ${number}`}
            >
              Insert at {number}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px] text-text-muted">
            Snip the question from the document. It's inserted at the chosen number and the following
            questions renumber automatically.
          </p>

          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Snipped question"
              className="max-h-64 w-full rounded border border-border bg-subtle object-contain"
            />
          ) : (
            <button
              type="button"
              onClick={() => setSnipOpen(true)}
              className="flex w-full flex-col items-center gap-1.5 rounded border border-dashed border-border bg-subtle px-4 py-6 text-[12px] text-text-muted hover:border-primary hover:text-primary"
            >
              <Scissors size={18} /> Snip a question from the document
            </button>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-0.5 block text-[10px] uppercase tracking-[0.4px] text-text-faint">
                Insert at question #
              </label>
              <Input
                type="number"
                min={1}
                value={number}
                onChange={(e) => setNumber(Math.max(1, Number(e.target.value) || 1))}
                className="h-8 w-24 text-[13px]"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] uppercase tracking-[0.4px] text-text-faint">Options</label>
              <div className="flex h-8 items-center rounded border border-border">
                <button
                  type="button"
                  disabled={optionCount <= MIN_OPTS}
                  onClick={() => {
                    const next = clamp(optionCount - 1, MIN_OPTS, MAX_OPTS);
                    setOptionCount(next);
                    if (correctOption > next) setCorrectOption(0);
                  }}
                  className="px-2 text-sm text-text-muted hover:bg-hover disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-7 text-center text-sm font-medium tabular-nums">{optionCount}</span>
                <button
                  type="button"
                  disabled={optionCount >= MAX_OPTS}
                  onClick={() => setOptionCount((c) => clamp(c + 1, MIN_OPTS, MAX_OPTS))}
                  className="px-2 text-sm text-text-muted hover:bg-hover disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
            {previewUrl ? (
              <Button variant="ghost" size="sm" onClick={() => setSnipOpen(true)}>
                Re-snip
              </Button>
            ) : null}
          </div>

          {/* Correct answer — required so the added question is complete (no review). */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-[0.4px] text-text-faint">Correct option</label>
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
                    name="add-question-correct"
                    className="sr-only"
                    checked={correctOption === n}
                    onChange={() => setCorrectOption(n)}
                  />
                  {n}
                </label>
              ))}
            </div>
          </div>

          <Textarea
            value={solution}
            onChange={(e) => setSolution(e.target.value)}
            placeholder="Solution / explanation (optional)"
            rows={2}
          />
        </div>
      </Modal>

      <SnippingTool
        open={snipOpen}
        onClose={() => setSnipOpen(false)}
        source={{
          kind: 'url',
          url: buildStorageUrl(upload.storageKey),
          mime: upload.mimeType,
          name: upload.originalName,
        }}
        title="Snip question"
        onCropped={async (b) => {
          setBlob(b);
          setPreviewUrl(await blobToDataUrl(b));
        }}
      />
    </>
  );
};
