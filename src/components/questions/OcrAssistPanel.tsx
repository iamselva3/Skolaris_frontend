import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRightToLine,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';
import { ocrApi, type BulkApproveItem, type OcrDraft } from '@/lib/api/ocr.api';
import type { TaxonomySelection } from '@/lib/api/taxonomy.api';
import { uploadsApi } from '@/lib/api/uploads.api';
import { apiErrorMessage } from '@/lib/api/client';
import {
  ALLOWED_UPLOAD_MIMES,
  logUploadError,
  logUploadStep,
  resolveMimeType,
  sendBytes,
} from '@/lib/uploads/upload-helpers';
import type { Difficulty, QuestionType } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils/cn';

const MAX_BYTES = 25 * 1024 * 1024;

export interface AppliedDraftInfo {
  draftId: string;
  jobId: string;
  text: string;
  detectedType: QuestionType;
  options: Array<{ label: string; isCorrect: boolean }>;
}

interface Props {
  /** Taxonomy inherited by every imported question. */
  taxonomy: TaxonomySelection;
  /** Called once a bulk import succeeds. Parent typically refreshes the
   *  Question Bank or navigates with `?highlight=`. */
  onImported?: (questionIds: string[]) => void;
  /** Called when the teacher clicks "Use in form" on a single draft. The
   *  parent seeds its form state from the (inline-edited) draft content. When
   *  provided, each row shows a primary "Use in form" action; bulk import
   *  remains available via the toolbar. */
  onApplyDraft?: (info: AppliedDraftInfo) => void;
  /** Draft currently loaded into the parent form, for the "Applied" indicator. */
  appliedDraftId?: string | null;
  /** Callback for OCR state updates and exposing bulk action methods to parent */
  onOcrStateChange?: (info: {
    stateKind: PanelState['kind'];
    selectedCount: number;
    draftsCount: number;
    isImporting: boolean;
    triggerBulkImport: () => void;
  } | null) => void;
}

type PanelState =
  | { kind: 'idle' }
  | { kind: 'uploading'; file: File; progress: number; startedAt: number }
  | { kind: 'processing'; uploadId: string; jobId: string | null; startedAt: number }
  | { kind: 'drafts'; uploadId: string; jobId: string; startedAt: number; finishedAt: number }
  | { kind: 'imported'; createdIds: string[]; failed: number; uploadId: string }
  | { kind: 'failed'; message: string };

const TYPES: QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'FILL_BLANK',
  'DESCRIPTIVE',
];
const DIFFICULTIES: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

interface DraftEdits {
  text: string;
  detectedType: QuestionType;
  options: Array<{ label: string; isCorrect: boolean }>;
}

const pollCadence = (attempts: number): number => (attempts < 8 ? 600 : 2000);

/**
 * Bulk OCR-assisted question ingestion. Teachers upload a paper (image or
 * multi-page PDF); the backend extracts question drafts; this panel lets them
 * select, inline-edit, and bulk-import the entire batch into the Question Bank
 * in one operation. Designed for coaching-centre workflows where a single
 * paper produces 10–50+ questions that would be prohibitive to enter manually.
 *
 * Lifecycle:
 *   idle → uploading → processing → drafts(bulk review) → imported(success)
 *                                                     ↘ failed (errors per item)
 *
 * "Apply to form" (the pre-bulk workflow) is intentionally gone — bulk import
 * is the canonical path. The single-draft URL-param flow (`?draftId=&jobId=`)
 * used by UploadsReviewPage continues to work via QuestionFormPage directly.
 */
export const OcrAssistPanel = ({
  taxonomy,
  onImported,
  onApplyDraft,
  appliedDraftId,
  onOcrStateChange,
}: Props): JSX.Element => {
  const qc = useQueryClient();
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAutoApplied = useRef(false);

  // Auto-advance draft: reset auto-applied flag when parent clears the active draft.
  const prevAppliedDraftId = useRef<string | null>(null);
  useEffect(() => {
    if (prevAppliedDraftId.current && !appliedDraftId && state.kind === 'drafts') {
      hasAutoApplied.current = false;
    }
    prevAppliedDraftId.current = appliedDraftId ?? null;
  }, [appliedDraftId, state.kind]);

  /* ── Local edit & selection state, keyed by draftId ────────────────────── */
  const [edits, setEdits] = useState<Record<string, DraftEdits>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [discarded, setDiscarded] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [batchDifficulty, setBatchDifficulty] = useState<Difficulty>('MEDIUM');

  /* ── 1) Upload + complete ──────────────────────────────────────────────── */
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const mime = resolveMimeType(file);
      logUploadStep('[ocr-assist] [1/3] requesting signed URL', { mime, size: file.size });
      const signed = await uploadsApi.create({
        originalName: file.name,
        mimeType: mime,
        sizeBytes: file.size,
        programId: taxonomy.programId ?? undefined,
        subjectId: taxonomy.subjectId ?? undefined,
        category: 'ocr-papers',
      });
      logUploadStep('[ocr-assist] [2/3] PUT/POST bytes', {
        method: signed.httpMethod,
        host: new URL(signed.signedUrl).host,
      });
      await sendBytes(signed.signedUrl, signed.httpMethod ?? 'PUT', file, mime, (pct) =>
        setState((prev) =>
          prev.kind === 'uploading' ? { ...prev, progress: pct } : prev,
        ),
      );
      logUploadStep('[ocr-assist] [3/3] /complete → enqueue OCR', { uploadId: signed.id });
      await uploadsApi.complete(signed.id);
      return signed.id;
    },
    onSuccess: (uploadId) => {
      setState((prev) => ({
        kind: 'processing',
        uploadId,
        jobId: null,
        startedAt: prev.kind === 'uploading' ? prev.startedAt : Date.now(),
      }));
    },
    onError: (err) => {
      const msg = apiErrorMessage(err);
      logUploadError('[ocr-assist] upload failed', err);
      setState({ kind: 'failed', message: msg });
      toast.error(msg);
    },
  });

  const onPick = useCallback(
    (f: File | null) => {
      if (!f) return;
      const mime = resolveMimeType(f);
      if (!mime) {
        toast.error(`Could not determine file type for ${f.name}`);
        return;
      }
      if (!ALLOWED_UPLOAD_MIMES.has(mime)) {
        toast.error(`Unsupported file type: ${mime}`);
        return;
      }
      if (f.size > MAX_BYTES) {
        toast.error('File too large (max 25 MB)');
        return;
      }
      setState({ kind: 'uploading', file: f, progress: 0, startedAt: Date.now() });
      upload.mutate(f);
    },
    [upload],
  );

  /* ── 2) Poll /uploads/:id while PROCESSING ─────────────────────────────── */
  const polledUploadId =
    state.kind === 'processing' || state.kind === 'drafts' ? state.uploadId : null;

  const uploadStatus = useQuery({
    queryKey: ['ocr-assist-upload', polledUploadId],
    queryFn: () => uploadsApi.get(polledUploadId!),
    enabled: !!polledUploadId,
    refetchInterval: (q) => {
      const u = q.state.data;
      if (u && (u.status === 'READY_FOR_REVIEW' || u.status === 'FAILED' || u.status === 'APPROVED')) {
        return false;
      }
      return pollCadence(q.state.dataUpdateCount);
    },
  });

  useEffect(() => {
    const u = uploadStatus.data;
    if (!u) return;
    if (state.kind === 'processing') {
      if (u.status === 'READY_FOR_REVIEW' && u.ocrJob) {
        setState({
          kind: 'drafts',
          uploadId: u.id,
          jobId: u.ocrJob.id,
          startedAt: state.startedAt,
          finishedAt: Date.now(),
        });
      } else if (u.status === 'FAILED') {
        setState({
          kind: 'failed',
          message: u.errorMessage ?? 'OCR extraction failed. Please retry.',
        });
      }
    }
  }, [uploadStatus.data, state]);

  /* ── 3) Load drafts once READY_FOR_REVIEW ──────────────────────────────── */
  const draftsJobId = state.kind === 'drafts' ? state.jobId : null;
  const drafts = useQuery({
    queryKey: ['ocr-assist-drafts', draftsJobId],
    queryFn: () => ocrApi.listDrafts(draftsJobId!, { limit: 200 }),
    enabled: !!draftsJobId,
    staleTime: 5_000,
  });

  // Reset hasAutoApplied when not in drafts mode
  useEffect(() => {
    if (state.kind !== 'drafts') {
      hasAutoApplied.current = false;
    }
  }, [state.kind]);



  // Seed local edits/selection from fresh draft list. Defaults: every
  // non-finalized draft is pre-selected so "Import all" is the one-click path.
  useEffect(() => {
    const list = drafts.data?.data;
    if (!list) return;
    const seededEdits: Record<string, DraftEdits> = {};
    const seededSelected = new Set<string>();
    for (const d of list) {
      const type = (d.detectedType ?? 'DESCRIPTIVE') as QuestionType;
      let options = (d.options ?? []).map((o) => ({
        label: o.label,
        isCorrect: !!o.isCorrect,
      }));
      // OCR can't infer the correct answer. Backend requires exactly one
      // correct for SINGLE_CHOICE and ≥1 for MULTIPLE_CHOICE, so we
      // default-mark option A so bulk-import doesn't 100% fail. Teachers
      // re-mark inline before importing if they care about answer keys
      // upfront, or fix later via Edit on each Question Bank entry.
      const isChoice = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
      if (isChoice && options.length > 0 && !options.some((o) => o.isCorrect)) {
        options = options.map((o, i) => ({ ...o, isCorrect: i === 0 }));
      }
      seededEdits[d.id] = { text: d.text, detectedType: type, options };
      if (d.status !== 'APPROVED' && d.status !== 'DISCARDED') {
        seededSelected.add(d.id);
      }
    }
    setEdits(seededEdits);
    setSelected(seededSelected);
    setDiscarded(new Set());
    setExpanded(new Set());

    // Auto-apply the first available parsed question directly into the form fields below
    if (!hasAutoApplied.current && state.kind === 'drafts') {
      const firstDraft = list.find((d) => d.status !== 'APPROVED' && d.status !== 'DISCARDED');
      if (firstDraft && onApplyDraft) {
        hasAutoApplied.current = true;
        const type = (firstDraft.detectedType ?? 'DESCRIPTIVE') as QuestionType;
        let options = (firstDraft.options ?? []).map((o) => ({
          label: o.label,
          isCorrect: !!o.isCorrect,
        }));
        const isChoice = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
        if (isChoice && options.length > 0 && !options.some((o) => o.isCorrect)) {
          options = options.map((o, i) => ({ ...o, isCorrect: i === 0 }));
        }
        onApplyDraft({
          draftId: firstDraft.id,
          jobId: state.jobId,
          text: firstDraft.text,
          detectedType: type,
          options,
        });
      }
    }
  }, [drafts.data, onApplyDraft, state]);

  /* ── 4) Bulk import ───────────────────────────────────────────────────── */
  const bulkImport = useMutation({
    mutationFn: async () => {
      const items: BulkApproveItem[] = Array.from(selected)
        .filter((id) => !discarded.has(id))
        .map((id) => {
          const e = edits[id];
          const isChoice =
            e.detectedType === 'SINGLE_CHOICE' || e.detectedType === 'MULTIPLE_CHOICE';
          return {
            draftId: id,
            type: e.detectedType,
            options: isChoice ? e.options : undefined,
            correctAnswer: isChoice ? undefined : {},
            programId: taxonomy.programId ?? undefined,
            subjectId: taxonomy.subjectId ?? undefined,
            topicId: taxonomy.topicId ?? undefined,
            chapterId: taxonomy.chapterId ?? undefined,
            difficulty: batchDifficulty,
          };
        });
      if (items.length === 0) throw new Error('No drafts selected');
      return ocrApi.bulkApprove(items);
    },
    onSuccess: (results) => {
      const ok = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        toast.error(
          `${ok.length} imported, ${failed.length} failed. First error: ${failed[0].error ?? 'unknown'}`,
        );
      } else {
        toast.success(`Imported ${ok.length} question${ok.length === 1 ? '' : 's'} to the Question Bank`);
      }
      const createdIds = ok.map((r) => r.questionId!).filter(Boolean);
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['ocr-assist-drafts'] });
      if (state.kind === 'drafts') {
        setState({
          kind: 'imported',
          createdIds,
          failed: failed.length,
          uploadId: state.uploadId,
        });
      }
      onImported?.(createdIds);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  // Reactive state callback to parent page
  useEffect(() => {
    if (!onOcrStateChange) return;

    if (state.kind !== 'drafts') {
      onOcrStateChange({
        stateKind: state.kind,
        selectedCount: 0,
        draftsCount: 0,
        isImporting: bulkImport.isPending,
        triggerBulkImport: () => {},
      });
      return;
    }

    const list = drafts.data?.data ?? [];
    const activeList = list.filter((d) => !discarded.has(d.id));
    const selectedCount = Array.from(selected).filter((id) => !discarded.has(id)).length;

    onOcrStateChange({
      stateKind: 'drafts',
      selectedCount,
      draftsCount: activeList.length,
      isImporting: bulkImport.isPending,
      triggerBulkImport: () => bulkImport.mutate(),
    });
  }, [
    state.kind,
    selected,
    discarded,
    drafts.data,
    bulkImport.isPending,
    onOcrStateChange,
  ]);

  // Cleanup callback on unmount
  useEffect(() => {
    return () => {
      onOcrStateChange?.(null);
    };
  }, [onOcrStateChange]);

  /* ── Reset to idle ────────────────────────────────────────────────────── */
  const retry = (): void => {
    setState({ kind: 'idle' });
    setEdits({});
    setSelected(new Set());
    setDiscarded(new Set());
    setExpanded(new Set());
    qc.removeQueries({ queryKey: ['ocr-assist-upload'] });
    qc.removeQueries({ queryKey: ['ocr-assist-drafts'] });
  };

  const removeUpload = useMutation({
    mutationFn: (uploadId: string) => uploadsApi.remove(uploadId),
    onSuccess: () => {
      retry();
      toast.success('Upload removed');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  /* ── Render branches ──────────────────────────────────────────────────── */

  if (state.kind === 'idle') {
    return (
      <DropzoneStrip
        dragOver={dragOver}
        onDragOver={(v) => setDragOver(v)}
        onPick={onPick}
        onClickBrowse={() => inputRef.current?.click()}
        inputRef={inputRef}
      />
    );
  }

  if (state.kind === 'uploading') {
    return (
      <PanelShell>
        <PanelHeader title="Uploading paper" subtitle={state.file.name}>
          <Button variant="ghost" size="sm" onClick={retry}>
            <X size={12} /> Cancel
          </Button>
        </PanelHeader>
        <div className="px-4 pb-3 pt-2 text-xs text-text-muted">
          <div className="flex items-center justify-between">
            <span>Sending bytes…</span>
            <span className="font-mono tabular-nums">{state.progress}%</span>
          </div>
          <ProgressBar pct={state.progress} />
        </div>
      </PanelShell>
    );
  }

  if (state.kind === 'processing') {
    const u = uploadStatus.data;
    return (
      <PanelShell>
        <PanelHeader title="Extracting questions" subtitle={u?.originalName ?? '…'}>
          <ElapsedChip since={state.startedAt} live />
          <Button variant="ghost" size="sm" onClick={() => removeUpload.mutate(state.uploadId)}>
            <X size={12} /> Cancel
          </Button>
        </PanelHeader>
        <div className="flex items-center gap-3 px-4 pb-3 pt-2 text-xs text-text-muted">
          <Loader />
          <span>
            OCR running. Backend status:{' '}
            <span className="font-medium text-text">{u?.status ?? 'PROCESSING'}</span>.
            PDFs take ~1–2s per page; single images finish in 1–3s.
          </span>
        </div>
      </PanelShell>
    );
  }

  if (state.kind === 'failed') {
    return (
      <PanelShell tone="danger">
        <PanelHeader title="OCR extraction failed" subtitle={state.message}>
          <Button variant="secondary" size="sm" onClick={retry}>
            <RotateCcw size={12} /> Retry
          </Button>
        </PanelHeader>
      </PanelShell>
    );
  }

  if (state.kind === 'imported') {
    return (
      <PanelShell tone="success">
        <PanelHeader
          title={`Imported ${state.createdIds.length} question${state.createdIds.length === 1 ? '' : 's'}`}
          subtitle={
            state.failed > 0
              ? `${state.failed} draft(s) failed — check toasts for details.`
              : 'All selected drafts approved and added to the Question Bank.'
          }
        >
          <Button variant="secondary" size="sm" onClick={retry}>
            <UploadCloud size={12} /> Upload another paper
          </Button>
        </PanelHeader>
      </PanelShell>
    );
  }

  // state.kind === 'drafts'
  const list = drafts.data?.data ?? [];
  const activeList = list.filter((d) => !discarded.has(d.id));
  const selectedCount = Array.from(selected).filter((id) => !discarded.has(id)).length;
  const allSelected = activeList.length > 0 && activeList.every((d) => selected.has(d.id));
  const u = uploadStatus.data;

  const toggleSelect = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = (): void => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(activeList.map((d) => d.id)));
    }
  };
  const toggleExpand = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const discard = (id: string): void => {
    setDiscarded((prev) => new Set(prev).add(id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };
  const updateEdit = (id: string, patch: Partial<DraftEdits>): void => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  return (
    <PanelShell>
      <PanelHeader
        title={`${list.length} extracted question${list.length === 1 ? '' : 's'}`}
        subtitle={u?.originalName ?? ''}
      >
        <ElapsedChip since={state.startedAt} until={state.finishedAt} />
        <Button variant="ghost" size="sm" onClick={retry}>
          <RotateCcw size={12} /> Upload another
        </Button>
      </PanelHeader>

      {/* Bulk toolbar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-soft bg-subtle px-4 py-2 text-xs">
        <button
          type="button"
          onClick={toggleSelectAll}
          className="inline-flex items-center gap-1.5 font-medium text-text"
        >
          {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
        <span className="text-text-muted">
          <span className="font-mono tabular-nums text-text">{selectedCount}</span>{' '}
          of {activeList.length} selected
          {discarded.size > 0 ? (
            <span className="ml-1 text-text-faint">({discarded.size} discarded)</span>
          ) : null}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-text-muted">
          Default difficulty
          <Select
            value={batchDifficulty}
            onChange={(e) => setBatchDifficulty(e.target.value as Difficulty)}
            className="h-7 text-xs"
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </span>
        <Button
          variant="primary"
          size="sm"
          loading={bulkImport.isPending}
          disabled={selectedCount === 0}
          onClick={() => bulkImport.mutate()}
          title="Bulk-create Question Bank entries for every selected draft"
        >
          <Zap size={12} /> Import {selectedCount || ''} to Question Bank
        </Button>
      </div>

      <div className="border-t border-border-soft">
        {drafts.isLoading ? (
          <p className="px-4 py-3 text-xs text-text-muted">Loading drafts…</p>
        ) : list.length === 0 ? (
          <p className="px-4 py-3 text-xs text-text-muted">
            OCR finished but no drafts were extracted. Try uploading a clearer scan.
          </p>
        ) : (
          <ul className="divide-y divide-border-soft">
            {list.map((d) => {
              if (discarded.has(d.id)) return null;
              const e = edits[d.id];
              if (!e) return null;
              return (
                <DraftRow
                  key={d.id}
                  draft={d}
                  edits={e}
                  selected={selected.has(d.id)}
                  expanded={expanded.has(d.id)}
                  applied={appliedDraftId === d.id}
                  onToggleSelect={() => toggleSelect(d.id)}
                  onToggleExpand={() => toggleExpand(d.id)}
                  onDiscard={() => discard(d.id)}
                  onChange={(patch) => updateEdit(d.id, patch)}
                  onApply={
                    onApplyDraft
                      ? () =>
                          onApplyDraft({
                            draftId: d.id,
                            jobId: state.jobId,
                            text: e.text,
                            detectedType: e.detectedType,
                            options: e.options,
                          })
                      : undefined
                  }
                />
              );
            })}
          </ul>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-border-soft px-4 py-2 text-[11px] text-text-faint">
        <span>
          Job <code className="font-mono">{state.jobId.slice(0, 8)}…</code> ·{' '}
          {onApplyDraft
            ? '“Use in form” loads one draft into the editor below, or bulk-import all selected.'
            : 'Edit inline, then bulk-import all selected.'}
        </span>
        <span>
          <Sparkles size={11} className="mr-1 inline" aria-hidden />
          Bulk OCR ingestion
        </span>
      </footer>
    </PanelShell>
  );
};

/* ─────────────────────────────────────────── Subcomponents */

const DropzoneStrip = ({
  dragOver,
  onDragOver,
  onPick,
  onClickBrowse,
  inputRef,
}: {
  dragOver: boolean;
  onDragOver: (v: boolean) => void;
  onPick: (f: File | null) => void;
  onClickBrowse: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) => (
  <div
    role="button"
    tabIndex={0}
    onClick={onClickBrowse}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClickBrowse();
      }
    }}
    onDragOver={(e) => {
      e.preventDefault();
      onDragOver(true);
    }}
    onDragLeave={() => onDragOver(false)}
    onDrop={(e) => {
      e.preventDefault();
      onDragOver(false);
      onPick(e.dataTransfer.files[0] ?? null);
    }}
    className={cn(
      'flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border bg-subtle px-4 py-3 transition-colors',
      dragOver ? 'border-primary bg-primary-soft' : 'hover:border-primary hover:bg-hover',
    )}
  >
    <UploadCloud size={16} className="shrink-0 text-text-muted" />
    <div className="min-w-0 flex-1">
      <div className="text-base font-medium text-text">
        Drop a question paper or{' '}
        <span className="text-primary underline">click to browse</span>
      </div>
      <div className="text-xs text-text-muted">
        Multi-page PDFs supported — every page is rasterized and OCR'd. Bulk-import
        the entire batch into the Question Bank in one click. JPG / PNG / WebP / HEIC
        / PDF, max 25 MB.
      </div>
    </div>
    <span className="hidden shrink-0 rounded-sm bg-primary-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.4px] text-primary sm:inline">
      <Sparkles size={10} className="mr-1 inline" aria-hidden /> Bulk OCR ingest
    </span>
    <input
      ref={inputRef}
      type="file"
      accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/jpeg,image/png,image/webp,image/heic"
      className="sr-only"
      onChange={(e) => onPick(e.target.files?.[0] ?? null)}
    />
  </div>
);

const DraftRow = ({
  draft,
  edits,
  selected,
  expanded,
  applied,
  onToggleSelect,
  onToggleExpand,
  onDiscard,
  onChange,
  onApply,
}: {
  draft: OcrDraft;
  edits: DraftEdits;
  selected: boolean;
  expanded: boolean;
  applied: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onDiscard: () => void;
  onChange: (patch: Partial<DraftEdits>) => void;
  onApply?: () => void;
}) => {
  const finalized = draft.status === 'APPROVED' || draft.status === 'DISCARDED';
  const conf = draft.confidence ?? null;
  const isChoice =
    edits.detectedType === 'SINGLE_CHOICE' || edits.detectedType === 'MULTIPLE_CHOICE';

  return (
    <li
      className={cn(
        'px-4 py-3 transition-colors',
        selected ? 'bg-primary-soft/30' : 'bg-transparent',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggleSelect}
          disabled={finalized}
          className="mt-0.5 shrink-0 text-text"
          aria-label={selected ? 'Deselect' : 'Select'}
        >
          {selected ? <CheckSquare size={16} /> : <Square size={16} />}
        </button>

        <ConfidenceDot value={conf} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span className="font-mono tabular-nums">#{draft.position + 1}</span>
            <StatusBadge value={edits.detectedType} />
            {conf !== null ? (
              <span className={confidenceClass(conf)}>{Math.round(conf * 100)}%</span>
            ) : null}
            {finalized ? <StatusBadge value={draft.status} /> : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-text">{edits.text}</p>
          {isChoice && edits.options.length > 0 && !expanded ? (
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-muted">
              {edits.options.slice(0, 6).map((o, i) => (
                <li key={i} className={o.isCorrect ? 'text-success' : undefined}>
                  <span className="font-mono">{String.fromCharCode(65 + i)}.</span>{' '}
                  {o.label || <em className="text-text-faint">(empty)</em>}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {onApply ? (
            applied ? (
              <span
                className="inline-flex items-center gap-1 rounded-sm border border-success bg-success-soft px-1.5 py-0.5 text-[11px] font-medium text-success"
                title="Loaded into the form below"
              >
                <Check size={12} /> In form
              </span>
            ) : (
              <button
                type="button"
                onClick={onApply}
                disabled={finalized}
                className="inline-flex items-center gap-1 rounded-sm border border-primary bg-primary-soft px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary hover:text-text-on-primary disabled:opacity-40"
                title="Load this question into the Add Question form below for editing"
              >
                <ArrowRightToLine size={12} /> Use in form
              </button>
            )
          ) : null}
          <button
            type="button"
            onClick={onToggleExpand}
            className="rounded-sm border border-border-soft px-1.5 py-0.5 text-[11px] text-text-muted hover:bg-hover"
            title={expanded ? 'Collapse' : 'Edit inline'}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Collapse' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={finalized}
            className="rounded-sm border border-border-soft px-1.5 py-0.5 text-[11px] text-text-muted hover:bg-danger-soft hover:text-danger"
            title="Discard this draft (won't be imported)"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-3 space-y-2 rounded-md border border-border-soft bg-subtle p-3">
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span>Type</span>
            <Select
              value={edits.detectedType}
              onChange={(e) => onChange({ detectedType: e.target.value as QuestionType })}
              className="h-7 text-xs"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ').toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-[0.4px] text-text-faint">
              Question stem
            </label>
            <textarea
              value={edits.text}
              onChange={(e) => onChange({ text: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
            />
          </div>
          {isChoice ? (
            <div>
              <label className="text-[11px] font-medium uppercase tracking-[0.4px] text-text-faint">
                Options (check the correct one{edits.detectedType === 'MULTIPLE_CHOICE' ? '(s)' : ''})
              </label>
              <ul className="mt-1 space-y-1">
                {edits.options.map((o, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <input
                      type={edits.detectedType === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio'}
                      name={`correct-${draft.id}`}
                      checked={o.isCorrect}
                      onChange={() => {
                        const next = edits.options.map((opt, j) =>
                          edits.detectedType === 'MULTIPLE_CHOICE'
                            ? j === i
                              ? { ...opt, isCorrect: !opt.isCorrect }
                              : opt
                            : { ...opt, isCorrect: j === i },
                        );
                        onChange({ options: next });
                      }}
                    />
                    <span className="w-4 font-mono text-[11px] text-text-muted">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <input
                      type="text"
                      value={o.label}
                      onChange={(e) => {
                        const next = edits.options.map((opt, j) =>
                          j === i ? { ...opt, label: e.target.value } : opt,
                        );
                        onChange({ options: next });
                      }}
                      className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ options: edits.options.filter((_, j) => j !== i) })
                      }
                      className="text-text-faint hover:text-danger"
                      aria-label={`Remove option ${i + 1}`}
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    options: [...edits.options, { label: '', isCorrect: false }],
                  })
                }
                className="mt-1 text-[11px] text-primary hover:underline"
              >
                + Add option
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
};

const ConfidenceDot = ({ value }: { value: number | null }) => {
  const tone =
    value === null ? 'bg-border' : value >= 0.9 ? 'bg-success' : value >= 0.7 ? 'bg-primary' : 'bg-warning';
  return (
    <span
      className={cn('mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full', tone)}
      aria-hidden
    />
  );
};

const confidenceClass = (v: number): string =>
  v >= 0.9
    ? 'text-success'
    : v >= 0.7
      ? 'text-text-muted'
      : 'text-warning';

const PanelShell = ({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'danger' | 'success';
}) => (
  <section
    className={cn(
      'rounded-md border bg-surface',
      tone === 'danger' ? 'border-danger' : tone === 'success' ? 'border-success' : 'border-border',
    )}
  >
    {children}
  </section>
);

const PanelHeader = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) => (
  <header className="flex items-center justify-between gap-3 px-4 py-2">
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-base font-semibold text-text">
        <Sparkles size={14} className="text-primary" aria-hidden /> {title}
      </div>
      {subtitle ? <div className="truncate text-xs text-text-muted">{subtitle}</div> : null}
    </div>
    {children ? <div className="flex shrink-0 items-center gap-1">{children}</div> : null}
  </header>
);

const ProgressBar = ({ pct }: { pct: number }) => (
  <div className="mt-1 h-px w-full bg-subtle">
    <div className="h-px bg-primary transition-all" style={{ width: `${pct}%` }} />
  </div>
);

const ElapsedChip = ({
  since,
  until,
  live,
}: {
  since: number;
  until?: number;
  live?: boolean;
}) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [live]);
  const ms = (until ?? now) - since;
  const secs = (ms / 1000).toFixed(1);
  return (
    <span
      className="inline-flex h-6 items-center rounded-sm border border-border-soft bg-subtle px-2 font-mono text-[11px] tabular-nums text-text-muted"
      title={until ? `Finished in ${ms}ms` : 'Elapsed since upload started'}
    >
      {secs}s
    </span>
  );
};

export type { OcrDraft, QuestionType };
