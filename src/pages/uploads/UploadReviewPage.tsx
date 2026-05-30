import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Check } from 'lucide-react';
import { uploadsApi } from '@/lib/api/uploads.api';
import { ocrApi, type OcrDraft } from '@/lib/api/ocr.api';
import type { Difficulty, QuestionType } from '@/lib/types';
import { apiErrorMessage } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { CourseSelector } from '@/components/ui/CourseSelector';
import type { TaxonomySelection } from '@/lib/api/taxonomy.api';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Loader } from '@/components/ui/Loader';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/layout/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/utils/cn';

const ALL_TYPES: QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'FILL_BLANK',
  'MATCH_FOLLOWING',
  'MATRIX_MATCH',
  'DESCRIPTIVE',
];

export const UploadReviewPage = () => {
  const { uploadId = '' } = useParams<{ uploadId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const upload = useQuery({
    queryKey: ['upload', uploadId],
    queryFn: () => uploadsApi.get(uploadId),
    enabled: Boolean(uploadId),
    refetchInterval: (q) =>
      q.state.data && (q.state.data.status === 'PROCESSING' || q.state.data.status === 'UPLOADED')
        ? 5_000
        : false,
  });

  const jobId = upload.data?.ocrJob?.id;
  const drafts = useQuery({
    queryKey: ['drafts', jobId],
    queryFn: () => ocrApi.listDrafts(jobId!, { limit: 200 }),
    enabled: Boolean(jobId),
  });

  const counts = useMemo(() => {
    const list = drafts.data?.data ?? [];
    return {
      pending: list.filter((d) => d.status === 'PENDING_REVIEW' || d.status === 'EDITED').length,
      approved: list.filter((d) => d.status === 'APPROVED').length,
      discarded: list.filter((d) => d.status === 'DISCARDED').length,
    };
  }, [drafts.data]);

  const deleteUpload = useMutation({
    mutationFn: () => uploadsApi.remove(uploadId),
    onSuccess: () => {
      toast.success('Upload deleted');
      navigate('/uploads');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  if (!upload.data) return <p className="loading-line">Loading…</p>;

  const isProcessing =
    upload.data.status === 'PROCESSING' || upload.data.status === 'UPLOADED';

  return (
    <>
      <PageHeader
        title={upload.data.originalName}
        description={`Status: ${upload.data.status}`}
        actions={
          <>
            <Link to="/uploads">
              <Button variant="secondary">
                <ArrowLeft size={14} /> Back
              </Button>
            </Link>
            {(upload.data.status === 'PENDING_UPLOAD' || upload.data.status === 'FAILED') ? (
              <Button variant="destructive" onClick={() => setConfirmDiscard(true)}>
                Discard upload
              </Button>
            ) : null}
            <Button
              variant="primary"
              disabled={counts.pending === 0 || isProcessing}
              onClick={() => setBulkOpen(true)}
            >
              Bulk approve ({counts.pending})
            </Button>
          </>
        }
      />

      {isProcessing ? (
        <Card>
          <CardBody>
            <p className="inline-flex items-center gap-2 text-[13px] text-text-muted">
              <Loader /> OCR processing this upload. The page will auto-refresh every 5 seconds.
            </p>
          </CardBody>
        </Card>
      ) : null}

      <div className="mt-2 flex items-center gap-3 text-[12px] text-text-muted">
        <span>{counts.pending} pending</span>
        <span>·</span>
        <span>{counts.approved} approved</span>
        <span>·</span>
        <span>{counts.discarded} discarded</span>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[2fr_3fr]">
        {/* Left — file preview */}
        <Card>
          <CardBody>
            <FilePreview
              originalName={upload.data.originalName}
              mimeType={upload.data.mimeType}
              storageKey={upload.data.storageKey}
            />
          </CardBody>
        </Card>

        {/* Right — drafts list */}
        <div className="flex flex-col gap-3">
          {drafts.data?.data.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              // `drafts` only fetches when jobId is set (enabled: Boolean(jobId)),
              // so the assertion is safe at the .map site.
              jobId={jobId!}
              onChanged={() => qc.invalidateQueries({ queryKey: ['drafts', jobId] })}
            />
          ))}
          {drafts.data && drafts.data.data.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-[13px] text-text-muted">
                  No OCR drafts yet. They appear after the OCR microservice callback fires.
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <BulkApproveModal
        open={bulkOpen}
        drafts={drafts.data?.data ?? []}
        onClose={() => setBulkOpen(false)}
        onApproved={() => {
          qc.invalidateQueries({ queryKey: ['drafts', jobId] });
          setBulkOpen(false);
        }}
      />

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard upload?"
        message="The file and its OCR drafts will be removed. This cannot be undone."
        variant="destructive"
        confirmLabel="Discard"
        loading={deleteUpload.isPending}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => deleteUpload.mutate()}
      />
    </>
  );
};

/* ─────────────────────────────────────────── File preview (PDF / image) */

const FilePreview = ({
  originalName,
  mimeType,
  storageKey,
}: {
  originalName: string;
  mimeType: string;
  storageKey: string;
}) => {
  // Best-effort preview URL pointing at the fake-gcs public host (dev) or signed
  // GET would be required in prod. For now we surface a link + inline preview
  // for images. PDF.js integration is a Phase 4 polish item.
  const host = import.meta.env.VITE_GCS_PUBLIC_HOST ?? 'http://localhost:4443';
  const previewUrl = `${host}/storage/v1/b/skolaris-uploads/o/${encodeURIComponent(
    storageKey,
  )}?alt=media`;

  if (mimeType.startsWith('image/')) {
    return (
      <div className="space-y-2">
        <img
          src={previewUrl}
          alt={originalName}
          className="w-full rounded border border-border"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        <p className="text-[11px] text-text-muted">{originalName}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex h-80 items-center justify-center rounded border border-dashed border-border text-[12px] text-text-muted">
        PDF preview opens in a new tab.
      </div>
      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer"
        className="btn-link"
      >
        Open {originalName} →
      </a>
    </div>
  );
};

/* ─────────────────────────────────────────── Single draft card */

const DraftCard = ({
  draft,
  jobId,
  onChanged,
}: {
  draft: OcrDraft;
  jobId: string;
  onChanged: () => void;
}) => {
  const [text, setText] = useState(draft.text);
  const [type, setType] = useState<QuestionType>(draft.detectedType ?? 'SINGLE_CHOICE');
  const [options, setOptions] = useState<Array<{ label: string; isCorrect: boolean }>>(() =>
    (draft.options ?? []).map((o) => ({ label: o.label, isCorrect: Boolean(o.isCorrect) })),
  );
  const [taxonomy, setTaxonomy] = useState<TaxonomySelection>({});
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const saveTimer = useRef<number | null>(null);

  const isFinal = draft.status === 'APPROVED' || draft.status === 'DISCARDED';

  const update = useMutation({
    mutationFn: () =>
      ocrApi.updateDraft(draft.id, {
        text,
        detectedType: type,
        options: options.length > 0 ? options : undefined,
      }),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const approve = useMutation({
    mutationFn: () => {
      const isChoice = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
      return ocrApi.approve(draft.id, {
        type,
        options: isChoice ? options : undefined,
        correctAnswer: !isChoice ? buildAnswerForType(type, text) : { explanation: undefined },
        programId: taxonomy.programId ?? undefined,
        subjectId: taxonomy.subjectId ?? undefined,
        topicId: taxonomy.topicId ?? undefined,
        chapterId: taxonomy.chapterId ?? undefined,
        difficulty,
      });
    },
    onSuccess: () => {
      toast.success('Approved');
      onChanged();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const discard = useMutation({
    mutationFn: () => ocrApi.discard(draft.id),
    onSuccess: () => {
      toast.success('Discarded');
      onChanged();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  // Debounced autosave on text/type/options changes (only while still editable).
  useEffect(() => {
    if (isFinal) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => update.mutate(), 500);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, type, options]);

  if (isFinal) {
    const isChoiceFinal = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
    return (
      <Card className="opacity-70">
        <div className="flex items-center justify-between border-b border-border-soft px-3 py-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-text-muted">#{draft.position}</span>
            <StatusBadge value={draft.status} />
            {draft.status === 'APPROVED' && <Check size={14} className="text-success" />}
          </div>
          {draft.approvedQuestionId ? (
            <Link
              to={`/questions/${draft.approvedQuestionId}`}
              className="font-mono text-[11px] font-medium text-text-muted hover:text-primary"
            >
              Question ID: Q{draft.approvedQuestionId.slice(-4).toUpperCase()}
            </Link>
          ) : null}
        </div>
        <CardBody>
          <div className="mb-3 whitespace-pre-wrap text-[13px] text-text">
            {draft.text}
          </div>
          {isChoiceFinal ? (
            <ul className="space-y-1.5">
              {(draft.options ?? []).map((o, i) => (
                <li key={i} className="flex items-center gap-2 text-[13px]">
                  {type === 'SINGLE_CHOICE' ? (
                    <input type="radio" disabled checked={o.isCorrect} className="form-checkbox rounded-full" />
                  ) : (
                    <input type="checkbox" disabled checked={o.isCorrect} className="form-checkbox" />
                  )}
                  <span className={o.isCorrect ? "font-medium text-text" : "text-text-muted"}>
                    {o.label}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  const isChoice = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
  const hasCorrect = isChoice
    ? options.some((o) => o.isCorrect)
    : type === 'TRUE_FALSE' || type === 'FILL_BLANK' || type === 'DESCRIPTIVE';

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border-soft px-3 py-1.5 text-[11px]">
        <span className="text-text-muted">
          #{draft.position} ·{' '}
          {draft.confidence !== null ? (
            <span
              className={cn(
                draft.confidence >= 0.9 && 'text-success',
                draft.confidence < 0.7 && 'text-warning',
              )}
            >
              Confidence: {draft.confidence.toFixed(2)}
            </span>
          ) : (
            'no confidence'
          )}
        </span>
        <StatusBadge value={draft.status} />
      </div>
      <CardBody>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="text-[13px]"
        />

        {isChoice ? (
          <ul className="mt-3 space-y-1.5">
            {options.map((o, i) => (
              <li key={i} className="flex items-center gap-2">
                {type === 'SINGLE_CHOICE' ? (
                  <input
                    type="radio"
                    name={`correct-${draft.id}`}
                    className="form-checkbox rounded-full"
                    checked={o.isCorrect}
                    onChange={() =>
                      setOptions((cur) =>
                        cur.map((x, j) => ({ ...x, isCorrect: i === j })),
                      )
                    }
                  />
                ) : (
                  <input
                    type="checkbox"
                    className="form-checkbox"
                    checked={o.isCorrect}
                    onChange={() =>
                      setOptions((cur) =>
                        cur.map((x, j) => (i === j ? { ...x, isCorrect: !x.isCorrect } : x)),
                      )
                    }
                  />
                )}
                <Input
                  value={o.label}
                  onChange={(e) =>
                    setOptions((cur) =>
                      cur.map((x, j) => (i === j ? { ...x, label: e.target.value } : x)),
                    )
                  }
                  className="text-[13px]"
                />
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 space-y-2">
          <CourseSelector value={taxonomy} onChange={setTaxonomy} size="sm" />
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className="h-7 text-xs"
            >
              <option value="EASY">EASY</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HARD">HARD</option>
            </Select>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as QuestionType)}
              className="h-7 text-xs"
            >
              {ALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ').toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <Button variant="destructive" size="sm" onClick={() => discard.mutate()}>
            Discard
          </Button>
          {/* Open the full editor with this draft prefilled. Saving from there
              uses ocrApi.approve (atomic) — same outcome as the inline button,
              just with TipTap + the per-type editor for complex edits. */}
          <Link
            to={`/questions/new?draftId=${draft.id}&jobId=${jobId}`}
            className="btn-link"
            title="Open the full editor with this draft prefilled"
          >
            Edit &amp; approve →
          </Link>
          <Button
            variant="primary"
            size="sm"
            disabled={!hasCorrect}
            loading={approve.isPending}
            onClick={() => approve.mutate()}
          >
            Quick approve →
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};

const buildAnswerForType = (type: QuestionType, text: string): Record<string, unknown> => {
  switch (type) {
    case 'TRUE_FALSE':
      return { correct: true };  // teacher can override before final approve; defensive default
    case 'FILL_BLANK':
      return { accepted: [text], caseSensitive: false };
    case 'DESCRIPTIVE':
      return { rubric: text };
    default:
      return {};
  }
};

/* ─────────────────────────────────────────── Bulk-approve modal */

const BulkApproveModal = ({
  open,
  drafts,
  onClose,
  onApproved,
}: {
  open: boolean;
  drafts: OcrDraft[];
  onClose: () => void;
  onApproved: () => void;
}) => {
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [bulkTaxonomy, setBulkTaxonomy] = useState<TaxonomySelection>({});

  const eligible = drafts.filter(
    (d) =>
      (d.status === 'PENDING_REVIEW' || d.status === 'EDITED') &&
      (d.options?.some((o) => o.isCorrect) ?? d.detectedType === 'TRUE_FALSE'),
  );

  const run = useMutation({
    mutationFn: async () => {
      let ok = 0;
      let failed = 0;
      for (const d of eligible) {
        try {
          await ocrApi.approve(d.id, {
            type: d.detectedType ?? 'SINGLE_CHOICE',
            options: d.options?.map((o) => ({ label: o.label, isCorrect: Boolean(o.isCorrect) })),
            programId: bulkTaxonomy.programId ?? undefined,
            subjectId: bulkTaxonomy.subjectId ?? undefined,
            topicId: bulkTaxonomy.topicId ?? undefined,
            chapterId: bulkTaxonomy.chapterId ?? undefined,
            difficulty,
          });
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      return { ok, failed };
    },
    onSuccess: ({ ok, failed }) => {
      toast.success(`Bulk approve: ${ok} approved, ${failed} failed`);
      onApproved();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Modal
      open={open}
      title="Bulk approve eligible drafts"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={eligible.length === 0}
            loading={run.isPending}
            onClick={() => run.mutate()}
          >
            Approve {eligible.length}
          </Button>
        </>
      }
    >
      <p className="text-[13px] text-text-muted">
        Eligible drafts: ones still pending review with a correct option already marked.
        These defaults apply unless overridden:
      </p>
      <div className="mt-3 space-y-3">
        <div>
          <label className="form-label">Taxonomy</label>
          <CourseSelector value={bulkTaxonomy} onChange={setBulkTaxonomy} size="sm" />
        </div>
        <div>
          <label className="form-label">Difficulty</label>
          <Select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
          >
            <option value="EASY">EASY</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HARD">HARD</option>
          </Select>
        </div>
      </div>
    </Modal>
  );
};
