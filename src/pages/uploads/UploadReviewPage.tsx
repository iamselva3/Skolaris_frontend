import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Check, KeyRound } from 'lucide-react';
import { uploadsApi } from '@/lib/api/uploads.api';
import {
  ocrApi,
  type OcrDraft,
  type OcrBatchDraft,
  type AssignTaxonomyBody,
  type ImportAnswerKeyResult,
} from '@/lib/api/ocr.api';
import type { Difficulty, QuestionType } from '@/lib/types';
import { apiErrorMessage } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { CourseSelector } from '@/components/ui/CourseSelector';
import type { TaxonomySelection } from '@/lib/api/taxonomy.api';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/layout/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Textarea } from '@/components/ui/Textarea';
import {
  VisualReviewCard,
  type VisualApprovePayload,
} from '@/components/questions/VisualReviewCard';
import { AnswerKeyImportModal } from '@/components/questions/AnswerKeyImportModal';
import { BulkTaxonomyPanel } from '@/components/questions/BulkTaxonomyPanel';
import { QuestionNavigator } from '@/components/questions/QuestionNavigator';
import { BatchOcrProcessing, SingleOcrProcessing } from '@/components/uploads/OcrProcessingPanel';
import { type AnswerMeta } from '@/components/questions/QuestionOverviewSidebar';
import { AddQuestionModal } from '@/components/questions/AddQuestionModal';
import { buildSnapshotUrl } from '@/lib/uploads/storage-url';
import { indexToLabel } from '@/lib/ocr/answer-key-parse';
import { draftQuestionNumber, questionLabel } from '@/lib/ocr/question-number';
import { cn } from '@/lib/utils/cn';

/** Server-derived answer status for a draft — the baseline the overview shows
 *  before (or without) a live in-card edit. */
const serverAnswerMeta = (d: OcrDraft): AnswerMeta => {
  if (d.status === 'APPROVED') {
    const correct = (d.options ?? []).find((o) => o.isCorrect);
    return { mapped: true, label: correct?.label ?? '✓' };
  }
  if (d.suggestedAnswer) {
    const sa = d.suggestedAnswer;
    const label =
      sa.correctIndex != null
        ? indexToLabel(sa.correctIndex)
        : sa.correct != null
          ? sa.correct
            ? 'True'
            : 'False'
          : undefined;
    return { mapped: true, label, source: 'answer-key' };
  }
  const correct = (d.options ?? []).find((o) => o.isCorrect);
  if (correct) return { mapped: true, label: correct.label, source: 'manual' };
  return { mapped: false };
};

/**
 * Taxonomy completeness — INDEPENDENT of approval/answer/review status. A draft
 * is "taxonomy complete" only when all mandatory taxonomy fields (Program,
 * Subject, Topic, Chapter) are assigned. This is what drives the Bulk Taxonomy
 * pending count, NOT the draft's review status — an approved question with no
 * taxonomy is still taxonomy-pending. Mirrors the approve-modal's isValidTaxonomy.
 */
const isTaxonomyComplete = (d: OcrDraft): boolean => {
  const t = d.assignedTaxonomy;
  return Boolean(t?.programId && t?.subjectId && t?.topicId && t?.chapterId);
};

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
  // ONE review screen for one file or many. A `?batchId` ONLY swaps the draft
  // SOURCE (the batch endpoint) and numbers questions continuously (batchSequence)
  // so e.g. 22 + 25 read as a single 47-question session — the navigator,
  // counters, selection, bulk taxonomy/approve, answer-key import, add-question
  // and per-draft actions all behave identically. Single-file is unchanged.
  const [searchParams] = useSearchParams();
  const batchId = searchParams.get('batchId') ?? '';
  const batchMode = Boolean(batchId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [answerKeyOpen, setAnswerKeyOpen] = useState(false);
  // Lifted UI state so the overview, selection, and jump all stay in sync.
  const [localAnswers, setLocalAnswers] = useState<Record<string, AnswerMeta>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addAtNumber, setAddAtNumber] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // The authoritative question count comes from the imported answer key (it knows
  // the real total), not the OCR-derived draft numbers. Null until a key is imported.
  const [answerKeyTotal, setAnswerKeyTotal] = useState<number | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const registerCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);
  const handleAnswerChange = useCallback((id: string, meta: AnswerMeta) => {
    setLocalAnswers((cur) => {
      const prev = cur[id];
      if (
        prev &&
        prev.mapped === meta.mapped &&
        prev.label === meta.label &&
        prev.source === meta.source
      ) {
        return cur; // no-op — avoids a needless re-render
      }
      return { ...cur, [id]: meta };
    });
  }, []);
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }, []);
  const openAddQuestion = useCallback((num: number) => {
    setAddAtNumber(num);
    setAddOpen(true);
  }, []);
  const reorder = useMutation({
    mutationFn: ({ draftId, toNumber }: { draftId: string; toNumber: number }) =>
      ocrApi.moveDraft(draftId, toNumber),
    onSuccess: () => {
      toast.success('Reordered');
      qc.invalidateQueries({ queryKey: ['drafts', jobId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

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
    queryFn: () => ocrApi.listAllDrafts(jobId!),
    enabled: !batchMode && Boolean(jobId),
  });

  // ── Batch mode: drafts + aggregate progress come from the batch endpoints. ──
  const batchDraftsQuery = useQuery({
    queryKey: ['batch-drafts', batchId],
    queryFn: () => ocrApi.listBatchDrafts(batchId),
    enabled: batchMode,
  });
  const batchProgress = useQuery({
    queryKey: ['batch-progress', batchId],
    queryFn: () => ocrApi.getBatchProgress(batchId),
    enabled: batchMode,
    refetchInterval: (q) => {
      const s = q.state.data;
      if (!s) return 1_500;
      return s.completed + s.failed < s.total ? 1_500 : false; // poll until all terminal
    },
  });

  // Live page-level progress of the file currently being OCR'd in the batch, so
  // the loading panel can show "reading page X of Y" for the in-flight file.
  const batchCurrentUploadId = batchMode ? batchProgress.data?.current?.uploadId : undefined;
  const batchCurrentProgress = useQuery({
    queryKey: ['ocr-progress', batchCurrentUploadId],
    queryFn: () => ocrApi.getProgress(batchCurrentUploadId!),
    enabled: batchMode && Boolean(batchCurrentUploadId),
    refetchInterval: 1_000,
  });

  const batchRows = useMemo<OcrBatchDraft[]>(
    () => (batchMode ? (batchDraftsQuery.data?.data ?? []) : []),
    [batchMode, batchDraftsQuery.data],
  );
  const batchRowById = useMemo(() => new Map(batchRows.map((r) => [r.id, r])), [batchRows]);

  // Refetch batch drafts as each file finishes (its drafts become available).
  const batchDoneRef = useRef<number>(-1);
  useEffect(() => {
    if (!batchMode) return;
    const s = batchProgress.data;
    if (!s) return;
    const done = s.completed + s.failed;
    if (done !== batchDoneRef.current) {
      batchDoneRef.current = done;
      qc.invalidateQueries({ queryKey: ['batch-drafts', batchId] });
    }
  }, [batchMode, batchProgress.data, qc, batchId]);

  // Invalidate the active draft source after any mutation (single or batch).
  const invalidateDrafts = useCallback(() => {
    if (batchMode) qc.invalidateQueries({ queryKey: ['batch-drafts', batchId] });
    else if (jobId) qc.invalidateQueries({ queryKey: ['drafts', jobId] });
  }, [batchMode, batchId, jobId, qc]);

  // Patch a draft into the cache IN PLACE (no refetch) so a keyed DraftCard
  // remount on navigation re-seeds the latest answer. Used both optimistically
  // (the instant an option is picked) and after a server save. Merges over the
  // existing row, preserving batch-only fields (batchSequence, etc.).
  const patchDraftCache = useCallback(
    (draftId: string, patch: Partial<OcrDraft>) => {
      if (batchMode) {
        qc.setQueryData<{ data: OcrBatchDraft[]; meta: { total: number; batchId: string } }>(
          ['batch-drafts', batchId],
          (old) =>
            old
              ? { ...old, data: old.data.map((d) => (d.id === draftId ? { ...d, ...patch } : d)) }
              : old,
        );
      } else if (jobId) {
        qc.setQueryData<{ data: OcrDraft[]; meta?: { total: number } }>(['drafts', jobId], (old) =>
          old
            ? { ...old, data: old.data.map((d) => (d.id === draftId ? { ...d, ...patch } : d)) }
            : old,
        );
      }
    },
    [batchMode, batchId, jobId, qc],
  );

  // Bulk taxonomy across a batch: taxonomy is denormalized per draft, so group the
  // target draftIds by their file's OcrJob and apply per job — one logical
  // "apply to all/selected" spanning files. No backend/pipeline change.
  const assignTaxonomyBatch = useCallback(
    async (body: AssignTaxonomyBody): Promise<{ updated: number }> => {
      const byJob = new Map<string, string[]>();
      for (const id of body.draftIds ?? []) {
        const job = batchRowById.get(id)?.ocrJobId;
        if (!job) continue;
        const arr = byJob.get(job) ?? [];
        arr.push(id);
        byJob.set(job, arr);
      }
      let updated = 0;
      for (const [job, draftIds] of byJob) {
        const r = await ocrApi.assignTaxonomy(job, { ...body, draftIds });
        updated += r.updated;
      }
      return { updated };
    },
    [batchRowById],
  );

  // Answer-key across a batch: the parsed key is continuous (1..N = batchSequence).
  // Translate each entry back to its file's ORIGINAL question number and apply per
  // job. Image keys can't be split per file, so they're rejected in batch mode.
  const applyKeyBatch = useCallback(
    async (input: { text?: string; storageKey?: string }): Promise<ImportAnswerKeyResult> => {
      if (input.storageKey || !input.text) {
        throw new Error(
          'Image/PDF answer keys aren’t supported for multi-file batches — use a text, CSV or Excel key.',
        );
      }
      const bySeq = new Map<number, OcrBatchDraft>();
      for (const r of batchRows) bySeq.set(r.batchSequence, r);
      const perJob = new Map<string, string[]>();
      for (const line of input.text.split(/\r?\n/)) {
        const m = line.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
        if (!m) continue;
        const row = bySeq.get(Number(m[1]));
        if (!row || row.originalQuestionNumber == null) continue;
        const arr = perJob.get(row.ocrJobId) ?? [];
        arr.push(`${row.originalQuestionNumber}-${Number(m[2])}`);
        perJob.set(row.ocrJobId, arr);
      }
      const agg: ImportAnswerKeyResult = {
        matched: 0,
        keyEntries: 0,
        unmatchedKeyNumbers: [],
        unmatchedDrafts: 0,
        conflicts: [],
        outOfRange: [],
      };
      for (const [job, lines] of perJob) {
        const r = await ocrApi.importAnswerKey(job, { text: lines.join('\n') });
        agg.matched += r.matched;
        agg.keyEntries += r.keyEntries;
        agg.unmatchedDrafts += r.unmatchedDrafts;
        agg.unmatchedKeyNumbers.push(...r.unmatchedKeyNumbers);
        agg.conflicts.push(...r.conflicts);
        agg.outOfRange.push(...r.outOfRange);
      }
      return agg;
    },
    [batchRows],
  );

  // Phase 2 — Live OCR progress. Polls /ocr/progress/:uploadId at 1s while
  // the upload is in flight, auto-stops once the backend reports a terminal
  // stage. The polled snapshot also drives the StageChip + progress bar.
  const progress = useQuery({
    queryKey: ['ocr-progress', uploadId],
    queryFn: () => ocrApi.getProgress(uploadId),
    enabled: !batchMode && Boolean(uploadId),
    refetchInterval: (q) => {
      const s = q.state.data;
      if (!s) return 1_000;
      if (s.uploadStatus === 'READY_FOR_REVIEW' || s.uploadStatus === 'APPROVED') return false;
      if (s.uploadStatus === 'FAILED' || s.ocrStage === 'FAILED') return false;
      if (s.ocrStage === 'COMPLETED') return false;
      return 1_000;
    },
  });

  // When the backend flips to a terminal stage, invalidate the parent
  // upload + drafts queries so the review UI flips over without F5.
  const lastStageRef = useRef<string | null>(null);
  useEffect(() => {
    const stage = progress.data?.ocrStage ?? null;
    if (stage && stage !== lastStageRef.current) {
      lastStageRef.current = stage;
      if (stage === 'COMPLETED' || stage === 'FAILED') {
        qc.invalidateQueries({ queryKey: ['upload', uploadId] });
        if (jobId) qc.invalidateQueries({ queryKey: ['drafts', jobId] });
      }
    }
  }, [progress.data?.ocrStage, qc, uploadId, jobId]);

  // The unified review dataset. In batch mode the DISPLAYED question number is the
  // continuous batchSequence (so 22 + 25 files read as one 47-question paper);
  // the original OCR number is preserved on the row as originalQuestionNumber and
  // never mutated server-side.
  const draftList = useMemo<OcrDraft[]>(() => {
    if (batchMode) return batchRows.map((d) => ({ ...d, questionNumber: d.batchSequence }));
    return drafts.data?.data ?? [];
  }, [batchMode, batchRows, drafts.data]);

  useEffect(() => {
    if (activeId === null && draftList.length > 0) {
      setActiveId(draftList[0].id);
    }
  }, [activeId, draftList]);

  // Add-question in batch targets the file you're viewing (its OcrJob + storageKey).
  const activeBatchRow = batchMode && activeId ? batchRowById.get(activeId) : undefined;
  const activeUpload = useQuery({
    queryKey: ['upload', activeBatchRow?.uploadId],
    queryFn: () => uploadsApi.get(activeBatchRow!.uploadId),
    enabled: batchMode && Boolean(activeBatchRow?.uploadId),
  });

  const counts = useMemo(() => {
    return {
      pending: draftList.filter((d) => d.status === 'PENDING_REVIEW' || d.status === 'EDITED')
        .length,
      approved: draftList.filter((d) => d.status === 'APPROVED').length,
      discarded: draftList.filter((d) => d.status === 'DISCARDED').length,
    };
  }, [draftList]);

  // Bulk Taxonomy pending = drafts still MISSING mandatory taxonomy, regardless of
  // approval/answer/review status (a discarded draft needs no taxonomy, so it's
  // excluded). This is deliberately decoupled from counts.pending (which is review
  // status) so approving a question without taxonomy does NOT clear it here.
  const taxonomyPendingIds = useMemo(
    () =>
      draftList
        .filter((d) => d.status !== 'DISCARDED' && !isTaxonomyComplete(d))
        .map((d) => d.id),
    [draftList],
  );

  // Overview state = server baseline per draft, overridden by any live in-card pick.
  const answerState = useMemo(() => {
    const merged: Record<string, AnswerMeta> = {};
    for (const d of draftList) merged[d.id] = localAnswers[d.id] ?? serverAnswerMeta(d);
    return merged;
  }, [draftList, localAnswers]);

  // Question numbers with no draft — the only valid targets for assigning an
  // invalid crop (fills a gap, never duplicates). Uses the SAME total the
  // navigator shows (answer-key total, else the largest claimed number CAPPED at
  // distinct-count + 8) so a single mis-numbered draft can't balloon this to 200+.
  const missingNumbers = useMemo(() => {
    const claimed = new Set(
      draftList.map((d) => draftQuestionNumber(d)).filter((n): n is number => n != null),
    );
    const distinctCount = claimed.size;
    const maxClaimed = distinctCount ? Math.max(...claimed) : 0;
    const total =
      answerKeyTotal && answerKeyTotal > 0
        ? answerKeyTotal
        : Math.min(maxClaimed, distinctCount + 8) || maxClaimed;
    const out: number[] = [];
    for (let n = 1; n <= total; n += 1) if (!claimed.has(n)) out.push(n);
    return out;
  }, [draftList, answerKeyTotal]);

  // Drop selections that no longer point at a pending draft (e.g. after approve).
  useEffect(() => {
    const selectable = new Set(
      draftList
        .filter((d) => d.status === 'PENDING_REVIEW' || d.status === 'EDITED')
        .map((d) => d.id),
    );
    setSelectedIds((cur) => {
      const next = cur.filter((id) => selectable.has(id));
      return next.length === cur.length ? cur : next;
    });
  }, [draftList]);

  const deleteUpload = useMutation({
    mutationFn: () => uploadsApi.remove(uploadId),
    onSuccess: () => {
      toast.success('Upload deleted');
      navigate('/uploads');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  if (!upload.data) return <p className="loading-line">Loading…</p>;

  const bp = batchProgress.data;
  const batchAllDone = bp ? bp.completed + bp.failed >= bp.total : false;
  const isProcessing = batchMode
    ? !batchAllDone
    : upload.data.status === 'PROCESSING' || upload.data.status === 'UPLOADED';

  const activeDraft = activeId ? draftList.find((d) => d.id === activeId) : null;
  // A draft always knows its own OcrJob, so per-draft + per-file actions work in
  // both modes by reading it off the draft (in single mode it equals jobId).
  const activeJobId = activeDraft?.ocrJobId ?? jobId;
  const addJobId = batchMode ? activeBatchRow?.ocrJobId : jobId;
  const addUpload = batchMode ? activeUpload.data : upload.data;

  return (
    <>
      <PageHeader
        title={batchMode ? 'Batch review' : upload.data.originalName}
        description={
          batchMode
            ? bp
              ? `${bp.total} files · ${draftList.length} questions`
              : 'Loading batch…'
            : `Status: ${upload.data.status}`
        }
        actions={
          <>
            <Link to="/uploads">
              <Button variant="secondary">
                <ArrowLeft size={14} /> Back
              </Button>
            </Link>
            {!batchMode &&
            (upload.data.status === 'PENDING_UPLOAD' || upload.data.status === 'FAILED') ? (
              <Button variant="destructive" onClick={() => setConfirmDiscard(true)}>
                Discard upload
              </Button>
            ) : null}
            <Button
              variant="secondary"
              disabled={!(jobId || batchMode)}
              onClick={() => setAnswerKeyOpen(true)}
            >
              <KeyRound size={14} /> Import answer key
            </Button>
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

      {/* OCR loading/processing — aesthetic, detailed progress for the in-flight
          file(s). A failed file doesn't stop the batch queue. */}
      {batchMode && isProcessing && bp ? (
        <BatchOcrProcessing snapshot={bp} current={batchCurrentProgress.data} />
      ) : null}

      {!batchMode && isProcessing ? <SingleOcrProcessing snapshot={progress.data} /> : null}

      <div className="mt-2 flex items-center gap-3 text-[12px] text-text-muted">
        <span>{counts.pending} pending</span>
        <span>·</span>
        <span>{counts.approved} approved</span>
        <span>·</span>
        <span>{counts.discarded} discarded</span>
      </div>

      <div
        className={cn(
          'mt-3 grid gap-4',
          'lg:grid-cols-[550px_1fr]',
        )}
      >
        {/* Left — Main Review Area */}
        <div className="flex flex-col gap-4 overflow-y-auto pb-4 pr-2 lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] lg:self-start">
          {/* Main Review Area */}
          {activeDraft && activeJobId && (
            <div className="rounded-lg shadow-sm flex shrink-0 flex-col overflow-hidden border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border-soft bg-subtle px-4 py-3">
                <h3 className="text-lg font-semibold text-text">
                  Reviewing: {questionLabel(activeDraft)}
                </h3>
              </div>
              <div className="p-4">
                <DraftNumberAssigner
                  key={`assigner-${activeDraft.id}`}
                  draft={activeDraft}
                  missingNumbers={missingNumbers}
                  onSaved={invalidateDrafts}
                />
                {/* key by draft id so switching the active question REMOUNTS the
                card — its internal answer/option/taxonomy state is seeded from
                props once, so without a key React reuses the instance and the
                previous question's selection bleeds into the next one. */}
                <DraftCard
                  key={activeDraft.id}
                  draft={activeDraft}
                  jobId={activeJobId}
                  selected={selectedIds.includes(activeDraft.id)}
                  onToggleSelect={() => toggleSelect(activeDraft.id)}
                  onAnswerChange={(meta) => handleAnswerChange(activeDraft.id, meta)}
                  onChanged={invalidateDrafts}
                  onLocalPatch={patchDraftCache}
                />
              </div>
            </div>
          )}

        </div>

        {/* Right — file preview + navigator + bulk taxonomy + drafts list */}
        <div className="flex min-w-0 flex-col gap-3">
          {!batchMode ? (
            <div className="rounded border border-border-soft bg-subtle p-2">
              <FilePreview
                originalName={upload.data.originalName}
                mimeType={upload.data.mimeType}
                storageKey={upload.data.storageKey}
              />
            </div>
          ) : null}
          {draftList.length > 0 ? (
            <QuestionNavigator
              drafts={draftList}
              activeId={activeId}
              onSelect={(id) => {
                setActiveId(id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onAddMissing={jobId || batchMode ? openAddQuestion : undefined}
              onReorder={
                // Reorder maps to a question number within ONE job; that's ambiguous
                // across files, so it's single-file only (drag disabled in batch).
                !batchMode && jobId
                  ? (draftId, toNumber) => reorder.mutate({ draftId, toNumber })
                  : undefined
              }
            />
          ) : null}
          {(jobId || batchMode) && taxonomyPendingIds.length > 0 ? (
            <BulkTaxonomyPanel
              jobId={batchMode ? undefined : jobId}
              assign={batchMode ? assignTaxonomyBatch : undefined}
              totalCount={taxonomyPendingIds.length}
              pendingIds={taxonomyPendingIds}
              selectedIds={selectedIds}
              onApplied={invalidateDrafts}
            />
          ) : null}

          {draftList.length > 0 && (
            <details className="group mt-4">
              <summary className="cursor-pointer select-none rounded border border-border bg-subtle px-4 py-2.5 text-[15px] font-semibold transition-colors hover:bg-hover">
                Question List (All Drafts)
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                {draftList.map((d) => (
                  <div
                    key={d.id}
                    ref={(el) => registerCardRef(d.id, el)}
                    onFocusCapture={() => setActiveId(d.id)}
                    className="scroll-mt-2"
                  >
                    <DraftCard
                      draft={d}
                      jobId={d.ocrJobId}
                      selected={selectedIds.includes(d.id)}
                      onToggleSelect={() => toggleSelect(d.id)}
                      onAnswerChange={(meta) => handleAnswerChange(d.id, meta)}
                      onChanged={invalidateDrafts}
                      onLocalPatch={patchDraftCache}
                    />
                  </div>
                ))}
              </div>
            </details>
          )}

          {(batchMode ? batchDraftsQuery.data : drafts.data) && draftList.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-[13px] text-text-muted">
                  {batchMode && !batchAllDone
                    ? 'Drafts will appear here as each file finishes processing.'
                    : 'No OCR drafts yet. They appear after the OCR microservice callback fires.'}
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      {jobId || batchMode ? (
        <AnswerKeyImportModal
          open={answerKeyOpen}
          jobId={batchMode ? undefined : jobId}
          applyKey={batchMode ? applyKeyBatch : undefined}
          draftCount={draftList.length}
          draftNumbers={draftList
            .map((d) => d.questionNumber ?? null)
            .filter((n): n is number => n != null)}
          onClose={() => setAnswerKeyOpen(false)}
          onImported={(r) => {
            setAnswerKeyTotal(r.keyEntries);
            invalidateDrafts();
          }}
        />
      ) : null}

      {addJobId && addUpload ? (
        <AddQuestionModal
          open={addOpen}
          jobId={addJobId}
          upload={{
            storageKey: addUpload.storageKey,
            mimeType: addUpload.mimeType,
            originalName: addUpload.originalName,
          }}
          defaultNumber={addAtNumber}
          onClose={() => setAddOpen(false)}
          onInserted={invalidateDrafts}
        />
      ) : null}

      <BulkApproveModal
        open={bulkOpen}
        drafts={draftList}
        answerState={answerState}
        onClose={() => setBulkOpen(false)}
        onApproved={() => {
          invalidateDrafts();
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
  storageKey,
}: {
  originalName: string;
  mimeType: string;
  storageKey: string;
}) => {
  const host = import.meta.env.VITE_GCS_PUBLIC_HOST ?? 'http://localhost:4443';
  const previewUrl = `${host}/storage/v1/b/skolaris-uploads/o/${encodeURIComponent(
    storageKey,
  )}?alt=media`;

  return (
    <div className="pt-2">
      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
      >
        Open {originalName} in new tab ↗
      </a>
    </div>
  );
};

/* ─────────────────────────────────────────── Single draft card */

const DraftCard = ({
  draft,
  jobId,
  selected,
  onToggleSelect,
  onAnswerChange,
  onChanged,
  onLocalPatch,
}: {
  draft: OcrDraft;
  jobId: string;
  selected: boolean;
  onToggleSelect: () => void;
  onAnswerChange: (meta: AnswerMeta) => void;
  onChanged: () => void;
  /** Patch this draft in the query cache (no refetch) so navigating away and back
   *  re-seeds the latest answer — used the instant an option is picked AND after a
   *  server save, so a selection survives navigation without Save/Approve. */
  onLocalPatch: (draftId: string, patch: Partial<OcrDraft>) => void;
}) => {
  const [text, setText] = useState(draft.text);
  const [type, setType] = useState<QuestionType>(() =>
    draft.suggestedAnswer?.correct != null ? 'TRUE_FALSE' : (draft.detectedType ?? 'SINGLE_CHOICE'),
  );
  // Pre-select the imported answer key's option (1-based correctIndex) for a
  // choice-type text draft when nothing is marked correct yet.
  const [options, setOptions] = useState<Array<{ label: string; isCorrect: boolean }>>(() => {
    const base = (draft.options ?? []).map((o) => ({
      label: o.label,
      isCorrect: Boolean(o.isCorrect),
    }));
    let mapped = base;
    const idx = draft.suggestedAnswer?.correctIndex;
    if (idx && idx >= 1 && idx <= base.length && !base.some((o) => o.isCorrect)) {
      mapped = base.map((o, i) => ({ ...o, isCorrect: i === idx - 1 }));
    }
    while (mapped.length < 4) {
      mapped.push({ label: String.fromCharCode(65 + mapped.length), isCorrect: false });
    }
    return mapped;
  });
  // Seed taxonomy from a bulk assignment so the selectors arrive pre-filled.
  const [taxonomy, setTaxonomy] = useState<TaxonomySelection>(() => {
    const a = draft.assignedTaxonomy ?? {};
    return {
      programId: a.programId ?? undefined,
      subjectId: a.subjectId ?? undefined,
      topicId: a.topicId ?? undefined,
      chapterId: a.chapterId ?? undefined,
    };
  });
  const [difficulty, setDifficulty] = useState<Difficulty>(
    () => (draft.assignedTaxonomy?.difficulty as Difficulty | null) ?? 'MEDIUM',
  );
  const [answerTouched, setAnswerTouched] = useState(false);
  // Screenshot-first: a draft that carries a cropped image is ALWAYS reviewed as
  // a Visual Question — the screenshot is the source of truth, with no text
  // escape hatch. Only snapshot-less drafts (legacy OCR_TEXT_RECONSTRUCTION) use
  // the text editor.
  const visualMode = Boolean(draft.questionSnapshotKey?.trim());
  const saveTimer = useRef<number | null>(null);
  // Visual question: the answer payload lives inside VisualReviewCard. It keeps
  // this ref current so the Save Answer / Approve buttons (rendered here, below
  // the card) can read the live pick on click; visualReady mirrors whether an
  // answer is set, to enable those buttons.
  const visualPayloadRef = useRef<VisualApprovePayload | null>(null);
  const [visualReady, setVisualReady] = useState(false);

  const isFinal = draft.status === 'APPROVED' || draft.status === 'DISCARDED';

  const update = useMutation({
    mutationFn: () =>
      ocrApi.updateDraft(draft.id, {
        text,
        detectedType: type,
        options: options.length > 0 ? options : undefined,
      }),
    // Keep the drafts cache in sync with what was just persisted. This card is
    // keyed by draft id, so switching questions REMOUNTS it and re-seeds state
    // from the cached draft — without this patch the cache stays stale and a
    // saved answer appears to vanish when you navigate back. setQueryData patches
    // in place (no refetch), so the debounced autosave causes no fetch churn.
    onSuccess: (saved) => onLocalPatch(saved.id, saved),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  // Persist an answer-option change the INSTANT the teacher makes it — answer
  // persistence is independent of Save/Approve. We patch the query cache
  // synchronously so navigating away and back (which remounts this keyed card)
  // re-seeds the selection immediately, regardless of network timing; the
  // debounced autosave below then writes it through to the server. Only the
  // discrete isCorrect toggle goes through here — option-label typing stays on
  // the debounce so it never spams the network.
  const persistOptions = (next: Array<{ label: string; isCorrect: boolean }>) => {
    setAnswerTouched(true);
    setOptions(next);
    onLocalPatch(draft.id, { detectedType: type, options: next });
  };

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
  const revert = useMutation({
    mutationFn: () => ocrApi.revert(draft.id),
    onSuccess: () => {
      onChanged();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  // Approve a draft as a Visual Question — the cropped image becomes the stem
  // (built server-side from questionSnapshotKey) and the teacher's positional
  // pick becomes the answer. Taxonomy/difficulty come from this card's state
  // (program/subject also inherit from the upload server-side when omitted).
  const approveVisual = useMutation({
    mutationFn: (p: VisualApprovePayload) => {
      const taxo = {
        programId: taxonomy.programId ?? undefined,
        subjectId: taxonomy.subjectId ?? undefined,
        topicId: taxonomy.topicId ?? undefined,
        chapterId: taxonomy.chapterId ?? undefined,
        difficulty,
      };
      const explanation = p.solutionHtml || undefined;
      // A teacher re-crop overrides the server-built snapshot stem (sent via
      // correctAnswer.contentHtml, which the approve use-case merges last).
      const recrop = p.contentHtmlOverride ? { contentHtml: p.contentHtmlOverride } : {};
      // The cropped image is the content (built server-side from the snapshot);
      // the answer mode determines the question type + answer payload.
      if (p.mode === 'TRUE_FALSE') {
        return ocrApi.approve(draft.id, {
          type: 'TRUE_FALSE',
          correctAnswer: { correct: p.correctBool, explanation, ...recrop },
          ...(p.questionSnapshotKeyOverride ? { questionSnapshotKey: p.questionSnapshotKeyOverride } : {}),
          ...taxo,
        });
      }
      if (p.mode === 'DESCRIPTIVE') {
        return ocrApi.approve(draft.id, {
          type: 'DESCRIPTIVE',
          correctAnswer: { rubric: p.solutionHtml || '', explanation, ...recrop },
          ...(p.questionSnapshotKeyOverride ? { questionSnapshotKey: p.questionSnapshotKeyOverride } : {}),
          ...taxo,
        });
      }
      return ocrApi.approve(draft.id, {
        type: 'VISUAL',
        options: Array.from({ length: p.optionCount }, (_, i) => ({
          label: String(i + 1),
          isCorrect: i + 1 === p.correctOption,
        })),
        correctAnswer: { ...(explanation ? { explanation } : {}), ...recrop },
        ...(p.questionSnapshotKeyOverride ? { questionSnapshotKey: p.questionSnapshotKeyOverride } : {}),
        ...taxo,
      });
    },
    onSuccess: () => {
      toast.success('Approved');
      onChanged();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  // Save a visual question's answer WITHOUT approving. The positional MCQ pick is
  // persisted as draft options (isCorrect at the chosen slot) so it re-seeds when
  // you navigate away and back; the cache is patched in place. The question stays
  // in review — only Approve moves it to the question bank. (True/False and
  // Descriptive carry no draft options to persist, so the pick holds for the
  // session only.)
  const saveVisualAnswer = () => {
    const p = visualPayloadRef.current;
    if (!p) return;
    if (p.mode === 'MCQ' && p.correctOption > 0) {
      const opts = Array.from({ length: p.optionCount }, (_, i) => ({
        label: String(i + 1),
        isCorrect: i + 1 === p.correctOption,
      }));
      ocrApi
        .updateDraft(draft.id, { options: opts })
        .then((saved) => {
          onLocalPatch(saved.id, saved);
          toast.success('Answer saved');
        })
        .catch((err) => toast.error(apiErrorMessage(err)));
    } else {
      toast.success('Answer saved');
    }
  };

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

  // When a Bulk Taxonomy apply lands (draft.assignedTaxonomy refreshes after
  // refetch), fill any taxonomy fields the teacher hasn't set on this card so the
  // approve gate reflects the bulk assignment — without clobbering in-progress
  // manual picks (fill-empties only).
  useEffect(() => {
    const a = draft.assignedTaxonomy;
    if (!a) return;
    setTaxonomy((cur) => ({
      programId: cur.programId ?? a.programId ?? undefined,
      subjectId: cur.subjectId ?? a.subjectId ?? undefined,
      topicId: cur.topicId ?? a.topicId ?? undefined,
      chapterId: cur.chapterId ?? a.chapterId ?? undefined,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draft.assignedTaxonomy?.programId,
    draft.assignedTaxonomy?.subjectId,
    draft.assignedTaxonomy?.topicId,
    draft.assignedTaxonomy?.chapterId,
  ]);

  // Report this card's current answer to the page so the overview live-updates.
  // Visual drafts report from VisualReviewCard instead; final drafts use the
  // server baseline. (onAnswerChange is a stable useCallback in the page.)
  useEffect(() => {
    if (isFinal || draft.questionSnapshotKey?.trim()) return;
    const choice = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
    if (choice) {
      const i = options.findIndex((o) => o.isCorrect);
      onAnswerChange(
        i >= 0
          ? {
              mapped: true,
              label: indexToLabel(i + 1),
              source: draft.suggestedAnswer && !answerTouched ? 'answer-key' : 'manual',
            }
          : { mapped: false },
      );
    } else {
      // True/False, Fill-blank and Descriptive need no option pick to be ready.
      const label = type === 'TRUE_FALSE' ? 'T/F' : type === 'DESCRIPTIVE' ? 'Desc' : 'Fill';
      onAnswerChange({ mapped: true, label });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, options, answerTouched]);

  if (isFinal) {
    const isChoiceFinal = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
    return (
      <Card className="opacity-70">
        <div className="flex items-center justify-between border-b border-border-soft px-3 py-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text">{questionLabel(draft)}</span>
            <StatusBadge value={draft.status} />
            {draft.status === 'APPROVED' && <Check size={14} className="text-success" />}
          </div>
          {draft.approvedQuestionId ? (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="h-6 px-2 text-[11px]"
                loading={revert.isPending}
                onClick={() => revert.mutate()}
              >
                Edit Question
              </Button>
              <Link
                to={`/questions/${draft.approvedQuestionId}`}
                className="font-mono text-[11px] font-medium text-text-muted hover:text-primary"
              >
                ID: Q{draft.approvedQuestionId.slice(-4).toUpperCase()}
              </Link>
            </div>
          ) : null}
        </div>
        <CardBody>
          {draft.questionSnapshotKey?.trim() ? (
            // Screenshot-first: the cropped image is the question — never the
            // OCR text — even in the finalized read-only summary.
            <img
              src={buildSnapshotUrl(draft.questionSnapshotKey)}
              alt="Question screenshot"
              className="mb-3 max-h-[320px] w-full rounded border border-border object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="mb-3 whitespace-pre-wrap text-[13px] text-text">{draft.text}</div>
          )}
          {isChoiceFinal ? (
            <ul className="space-y-1.5">
              {(draft.options ?? []).map((o, i) => (
                <li key={i} className="flex items-center gap-2 text-[13px]">
                  {type === 'SINGLE_CHOICE' ? (
                    <input
                      type="radio"
                      disabled
                      checked={o.isCorrect}
                      className="form-checkbox rounded-full"
                    />
                  ) : (
                    <input
                      type="checkbox"
                      disabled
                      checked={o.isCorrect}
                      className="form-checkbox"
                    />
                  )}
                  <span className={o.isCorrect ? 'font-medium text-text' : 'text-text-muted'}>
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
  // Approval requires complete taxonomy (Program/Subject/Topic/Chapter) — same
  // rule the backend now enforces. Until then the card only SAVES the answer and
  // the draft stays in review, waiting for per-question or Bulk Taxonomy.
  const taxonomyComplete = Boolean(
    taxonomy.programId && taxonomy.subjectId && taxonomy.topicId && taxonomy.chapterId,
  );

  return (
    <Card className={cn(selected && 'ring-1 ring-primary')}>
      <div className="flex items-center justify-between border-b border-border-soft px-3 py-1.5 text-[11px]">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="form-checkbox"
            checked={selected}
            onChange={onToggleSelect}
            title="Select for bulk taxonomy"
          />
          <span className="text-text-muted">
            <span className="font-medium text-text">{questionLabel(draft)}</span> ·{' '}
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
        </label>
        <StatusBadge value={draft.status} />
      </div>
      <CardBody>
        {visualMode ? (
          <div className="space-y-3">
            <VisualReviewCard
              draft={draft}
              payloadRef={visualPayloadRef}
              onAnswerChange={(meta) => {
                setVisualReady(Boolean(meta.mapped));
                onAnswerChange(meta);
              }}
            />

            {/* Save the selected answer WITHOUT approving — keeps the question in
            review and in the pending count; only Approve (below) moves it on. */}
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                disabled={!visualReady}
                onClick={saveVisualAnswer}
                title="Save the selected answer and keep this question in review"
              >
                Save Answer
              </Button>
            </div>

            <div className="space-y-2">
              <CourseSelector value={taxonomy} onChange={setTaxonomy} size="sm" />
              <Select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                className="h-7 text-xs"
              >
                <option value="EASY">EASY</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HARD">HARD</option>
              </Select>
            </div>

            {/* Final review actions — Approve is the TERMINAL step and requires both
            a saved answer and complete taxonomy (Program/Subject/Topic/Chapter);
            when taxonomy is missing it is blocked with a validation message. */}
            <div className="flex items-center justify-between gap-2 border-t border-border-soft pt-3">
              <Button variant="destructive" size="sm" onClick={() => discard.mutate()}>
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!visualReady}
                loading={approveVisual.isPending}
                onClick={() => {
                  if (!taxonomyComplete) {
                    toast.error(
                      'Assign Program, Subject, Topic & Chapter — on this question or via Bulk Taxonomy — before approving.',
                    );
                    return;
                  }
                  const p = visualPayloadRef.current;
                  if (!p) return;
                  approveVisual.mutate(p);
                }}
                title={
                  taxonomyComplete
                    ? 'Approve this question'
                    : 'Requires a saved answer and complete taxonomy (Program, Subject, Topic, Chapter)'
                }
              >
                Approve →
              </Button>
            </div>
          </div>
        ) : (
          <>
            {draft.questionSnapshotKey?.trim() ? (
              <div className="bg-surface-muted mb-3 rounded-md border border-warning p-3">
                <div className="mb-2 text-[12px] font-medium text-warning">
                  {draft.needsImageReview
                    ? 'Visual content — review original (OCR may be incomplete)'
                    : 'Source snapshot'}
                </div>
                <img
                  src={buildSnapshotUrl(draft.questionSnapshotKey)}
                  alt="Original snippet"
                  className="max-h-[420px] w-full rounded object-contain"
                  onError={(e) => {
                    // No broken-image icon for a missing/unreachable snapshot.
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            ) : null}
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
                          persistOptions(options.map((x, j) => ({ ...x, isCorrect: i === j })))
                        }
                      />
                    ) : (
                      <input
                        type="checkbox"
                        className="form-checkbox"
                        checked={o.isCorrect}
                        onChange={() =>
                          persistOptions(
                            options.map((x, j) => (i === j ? { ...x, isCorrect: !x.isCorrect } : x)),
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

            {/* Save the selected answer WITHOUT approving. Answer persistence and
            approval are separate actions: this keeps the question in review and in
            the pending count — only Approve (below) moves it to the question bank. */}
            <div className="mt-3 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                disabled={!hasCorrect || update.isPending}
                loading={update.isPending}
                onClick={() =>
                  update.mutate(undefined, { onSuccess: () => toast.success('Answer saved') })
                }
                title="Save the selected answer and keep this question in review"
              >
                Save Answer
              </Button>
            </div>

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

            {/* Final review actions. Approve is the TERMINAL step and requires both a
            saved answer and complete taxonomy (Program/Subject/Topic/Chapter); when
            taxonomy is missing it is blocked with a validation message. */}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-soft pt-3">
              <Button variant="destructive" size="sm" onClick={() => discard.mutate()}>
                Discard
              </Button>
              <div className="flex items-center gap-2">
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
                  onClick={() => {
                    if (!taxonomyComplete) {
                      toast.error(
                        'Assign Program, Subject, Topic & Chapter — on this question or via Bulk Taxonomy — before approving.',
                      );
                      return;
                    }
                    approve.mutate();
                  }}
                  title={
                    taxonomyComplete
                      ? 'Approve this question'
                      : 'Requires a saved answer and complete taxonomy (Program, Subject, Topic, Chapter)'
                  }
                >
                  Approve →
                </Button>
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
};

const buildAnswerForType = (type: QuestionType, text: string): Record<string, unknown> => {
  switch (type) {
    case 'TRUE_FALSE':
      return { correct: true }; // teacher can override before final approve; defensive default
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
  answerState,
  onClose,
  onApproved,
}: {
  open: boolean;
  drafts: OcrDraft[];
  answerState: Record<string, AnswerMeta>;
  onClose: () => void;
  onApproved: () => void;
}) => {
  const eligible = drafts.filter((d) => {
    if (d.status !== 'PENDING_REVIEW' && d.status !== 'EDITED') return false;
    return answerState[d.id]?.mapped === true;
  });

  const isValidTaxonomy = (d: OcrDraft) => {
    const t = d.assignedTaxonomy;
    return Boolean(t?.programId && t?.subjectId && t?.topicId && t?.chapterId);
  };
  const allTaxonomyValid = eligible.length > 0 && eligible.every(isValidTaxonomy);

  const run = useMutation({
    mutationFn: async () => {
      let ok = 0;
      let failed = 0;
      for (const d of eligible) {
        try {
          const visualMode = Boolean(d.questionSnapshotKey?.trim());
          const meta = answerState[d.id];

          let type = d.detectedType;
          if (visualMode) type = 'VISUAL';
          else if (!type) type = 'SINGLE_CHOICE';

          const isChoice =
            type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE' || type === 'VISUAL';

          let correctAnswer;
          if (!isChoice) {
            if (type === 'TRUE_FALSE')
              correctAnswer = { correct: d.suggestedAnswer?.correct ?? true };
            else if (type === 'FILL_BLANK')
              correctAnswer = { accepted: [d.text], caseSensitive: false };
            else if (type === 'DESCRIPTIVE') correctAnswer = { rubric: d.text };
          }

          let options;
          if (isChoice) {
            if (visualMode) {
              const optCount = Math.max(d.optionCount || 4, 4);
              const correctIdx = meta?.label
                ? meta.label.charCodeAt(0) - 64
                : (d.suggestedAnswer?.correctIndex ?? 1);
              options = Array.from({ length: optCount }, (_, i) => ({
                label: String(i + 1),
                isCorrect: i + 1 === correctIdx,
              }));
            } else {
              options =
                d.options?.map((o, idx) => {
                  let isCorrect = Boolean(o.isCorrect);
                  if (meta?.source === 'manual' && meta?.label) {
                    isCorrect = String.fromCharCode(65 + idx) === meta.label;
                  } else if (
                    !d.options?.some((x) => x.isCorrect) &&
                    d.suggestedAnswer?.correctIndex === idx + 1
                  ) {
                    isCorrect = true;
                  }
                  return { label: o.label, isCorrect };
                }) || [];
              while (options.length < 4) {
                options.push({ label: String.fromCharCode(65 + options.length), isCorrect: false });
              }
            }
          }

          await ocrApi.approve(d.id, {
            type,
            options: isChoice ? options : undefined,
            correctAnswer,
            programId: d.assignedTaxonomy?.programId ?? undefined,
            subjectId: d.assignedTaxonomy?.subjectId ?? undefined,
            topicId: d.assignedTaxonomy?.topicId ?? undefined,
            chapterId: d.assignedTaxonomy?.chapterId ?? undefined,
            difficulty: (d.assignedTaxonomy?.difficulty as Difficulty) ?? 'MEDIUM',
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
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={eligible.length === 0 || !allTaxonomyValid}
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
      </p>
      {!allTaxonomyValid && eligible.length > 0 && (
        <p className="mt-2 text-[12px] font-medium text-danger">
          Some eligible drafts are missing taxonomy. Please assign Program, Subject, Topic, and
          Chapter to all drafts (individually or via the Bulk Taxonomy panel) before approving.
        </p>
      )}
    </Modal>
  );
};

/* ─────────────────────────────────────────── Draft Number Assigner */

const DraftNumberAssigner = ({
  draft,
  missingNumbers,
  onSaved,
}: {
  draft: OcrDraft;
  missingNumbers: number[];
  onSaved: () => void;
}) => {
  const [numberInput, setNumberInput] = useState('');

  useEffect(() => {
    setNumberInput(draft.questionNumber != null ? String(draft.questionNumber) : '');
  }, [draft.id, draft.questionNumber]);

  const setNumber = useMutation({
    mutationFn: () => {
      const n = Number(numberInput);
      if (!Number.isInteger(n) || n < 1) throw new Error('Enter a valid question number');
      return ocrApi.moveDraft(draft.id, n);
    },
    onSuccess: () => {
      toast.success('Question number assigned');
      onSaved();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (draft.questionNumber != null) return null;

  return (
    <div className="border-warning/30 bg-warning-soft/30 mb-4 flex flex-wrap items-end gap-2 rounded border p-3">
      <div>
        <label className="text-warning-strong mb-1 block text-[11px] font-semibold uppercase tracking-[0.4px]">
          Unnumbered Draft (Assign to a missing slot)
        </label>
        <Select
          value={numberInput}
          onChange={(e) => setNumberInput(e.target.value)}
          className="w-56 h-8 bg-surface text-[13px]"
        >
          <option value="">
            {missingNumbers.length ? 'Assign to a missing #…' : 'No missing numbers'}
          </option>
          {missingNumbers.map((n) => (
            <option key={n} value={n}>
              Question {n}
            </option>
          ))}
        </Select>
      </div>
      <Button
        variant="primary"
        size="sm"
        loading={setNumber.isPending}
        disabled={!numberInput}
        onClick={() => setNumber.mutate()}
      >
        Assign Number
      </Button>
    </div>
  );
};
