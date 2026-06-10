import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, FilePlus, X, Zap, Sparkles, UploadCloud, Image as ImageIcon, FileText, Trash2, Scissors } from 'lucide-react';
import { uploadsApi } from '@/lib/api/uploads.api';
import { resolveMimeType, ALLOWED_UPLOAD_MIMES } from '@/lib/uploads/upload-helpers';
import { appendImageHtml, buildStorageUrl, blobToDataUrl, uploadInlineImages } from '@/lib/uploads/upload-image';
import { normalizeStorageUrls } from '@/lib/uploads/storage-url';
import { SnippingTool, type SnipSource } from '@/components/ui/SnippingTool';
import { questionsApi } from '@/lib/api/questions.api';
import { ocrApi } from '@/lib/api/ocr.api';
import type { TaxonomySelection } from '@/lib/api/taxonomy.api';
import { apiErrorMessage } from '@/lib/api/client';
import type { Difficulty, QuestionType } from '@/lib/types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { CourseSelector } from '@/components/ui/CourseSelector';
import { Input } from '@/components/ui/Input';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { Select } from '@/components/ui/Select';
import {
  OptionsEditor,
  type QuestionPayload,
} from '@/components/questions/OptionsEditor';
// import { OcrAssistPanel, type AppliedDraftInfo } from '@/components/questions/OcrAssistPanel';
import { cn } from '@/lib/utils/cn';

const TYPES: QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'FILL_BLANK',
  'MATCH_FOLLOWING',
  'MATRIX_MATCH',
  'DESCRIPTIVE',
  'VISUAL',
];
const DIFFS: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

/* ─────────────────────────────────────────── Form state */

interface FormState {
  type: QuestionType;
  difficulty: Difficulty;
  taxonomy: TaxonomySelection;
  contentHtml: string;
  solutionHtml: string;
  payload: QuestionPayload;
  marks: number;
  negativeMarks: number;
}

const DEFAULT_STATE: FormState = {
  type: 'SINGLE_CHOICE',
  difficulty: 'MEDIUM',
  taxonomy: {},
  contentHtml: '',
  solutionHtml: '',
  payload: {
    options: [
      { label: '', isCorrect: false },
      { label: '', isCorrect: false },
    ],
  },
  marks: 1,
  negativeMarks: 0,
};

const STORAGE_PREFIX = 'skolaris.question-draft.';
const AUTOSAVE_MS = 5000;

/* ─────────────────────────────────────────── Page */

export const QuestionFormPage = ({
  questionId: propQuestionId,
  onClose,
}: {
  questionId?: string;
  onClose?: () => void;
} = {}) => {
  const { id: paramId } = useParams<{ id?: string }>();
  const editId = propQuestionId || paramId;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  /*
  // Capture the OCR panel state and selection reactively
  const [ocrInfo, setOcrInfo] = useState<{
    stateKind: 'idle' | 'uploading' | 'processing' | 'drafts' | 'imported' | 'failed';
    selectedCount: number;
    draftsCount: number;
    isImporting: boolean;
    triggerBulkImport: () => void;
  } | null>(null);

  const isOcrRunning = ocrInfo?.stateKind === 'uploading' || ocrInfo?.stateKind === 'processing';
  */

  // Snipping tool / Image mode states
  const [inputMode, setInputMode] = useState<'text' | 'image' | 'snip'>('text');
  const [dragOver, setDragOver] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Snipping Tool (crop a region from a PDF/image into question or solution).
  const [snipOpen, setSnipOpen] = useState(false);
  const [snipTarget, setSnipTarget] = useState<'content' | 'solution'>('content');
  const [snipSource, setSnipSource] = useState<SnipSource | null>(null);
  const openSnip = (target: 'content' | 'solution', src: SnipSource | null = null): void => {
    setSnipTarget(target);
    setSnipSource(src);
    setSnipOpen(true);
  };



  const handleImageUpload = async (file: File) => {
    const mime = resolveMimeType(file);
    if (!mime) {
      toast.error(`Could not determine file type for ${file.name}`);
      return;
    }
    if (!ALLOWED_UPLOAD_MIMES.has(mime) || !mime.startsWith('image/')) {
      toast.error('Unsupported file type. Please upload a JPG, PNG, WebP, or HEIC image.');
      return;
    }
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error('Image too large (max 10 MB)');
      return;
    }

    // Deferred upload: embed the image locally now; it's pushed to storage once,
    // on Save. Instant, and an unsaved+refreshed image never reaches the bucket.
    try {
      const dataUrl = await blobToDataUrl(file);
      setState((prev) => ({
        ...prev,
        contentHtml: `<p><img src="${dataUrl}" alt="Question image" class="max-w-full rounded border border-border my-2" /></p>`,
      }));
      setInputMode('image');
      toast.success('Image added — it uploads when you Save');
    } catch {
      toast.error('Could not read the image file');
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => {
    setDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleImageUpload(file);
    }
  };
  const onContainerPaste = (e: React.ClipboardEvent) => {
    const item = e.clipboardData.items[0];
    if (item && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        handleImageUpload(file);
      }
    }
  };

  // Effective {draftId, jobId} = internal state (set when the teacher clicks
  // "Use in form" on an OCR draft) OR URL params (UploadsReviewPage deep-link).
  // Internal wins so the panel can swap drafts into the form without a
  // navigation. When set, Save routes through ocrApi.approve (atomic
  // create-question + mark-draft-approved). The panel ALSO offers bulk import
  // straight to the Question Bank, bypassing this form.
  const [internalDraftId, setInternalDraftId] = useState<string | null>(null);
  const [internalJobId, setInternalJobId] = useState<string | null>(null);
  const draftId = internalDraftId ?? params.get('draftId');
  const jobId = internalJobId ?? params.get('jobId');

  // localStorage key — unique per mode so drafts don't bleed across routes.
  const storageKey = useMemo(() => {
    if (editId) return `${STORAGE_PREFIX}edit-${editId}`;
    if (draftId) return `${STORAGE_PREFIX}draft-${draftId}`;
    return `${STORAGE_PREFIX}new`;
  }, [editId, draftId]);

  const [state, setState] = useState<FormState>(() => readLocalDraft(storageKey) ?? DEFAULT_STATE);

  // Extract embedded image URL from contentHtml if it exists. Repoint a stale
  // host (e.g. content authored when VITE_GCS_PUBLIC_HOST still defaulted to the
  // retired fake-gcs) to the current read host so the preview resolves.
  const uploadedImageUrl = useMemo(() => {
    if (!state.contentHtml) return null;
    const match = state.contentHtml.match(/<img[^>]+src="([^">]+)"/);
    return match ? normalizeStorageUrls(match[1]) : null;
  }, [state.contentHtml]);

  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // OCR prefill: when ?draftId+?jobId provided, fetch the draft and seed state.
  const ocrPrefill = useQuery({
    queryKey: ['ocr-draft', jobId, draftId],
    queryFn: async () => {
      if (!jobId || !draftId) return null;
      const page = await ocrApi.listDrafts(jobId, { limit: 200 });
      return page.data.find((d) => d.id === draftId) ?? null;
    },
    enabled: !!(jobId && draftId && !readLocalDraft(storageKey)),
    staleTime: 60_000,
  });

  // Existing-question prefill (edit mode).
  const existing = useQuery({
    queryKey: ['question', editId],
    queryFn: () => questionsApi.get(editId!),
    enabled: !!editId && !readLocalDraft(storageKey),
  });

  // Apply OCR prefill once.
  useEffect(() => {
    const d = ocrPrefill.data;
    if (!d) return;
    setState((prev) => ({
      ...prev,
      type: d.detectedType ?? prev.type,
      contentHtml: textToHtml(d.text),
      payload: d.options
        ? { options: d.options.map((o) => ({ label: o.label, isCorrect: !!o.isCorrect })) }
        : prev.payload,
    }));
  }, [ocrPrefill.data]);

  // Apply existing-question prefill once.
  useEffect(() => {
    const q = existing.data;
    if (!q) return;
    const content = (q.payload as { contentHtml?: string }).contentHtml ?? textToHtml('');
    setState({
      type: q.type,
      difficulty: q.difficulty,
      taxonomy: {
        programId: q.programId,
        subjectId: q.subjectId,
        topicId: q.topicId,
        chapterId: q.chapterId,
      },
      contentHtml: content,
      solutionHtml: (q.payload as { explanation?: string }).explanation ?? '',
      payload: {
        ...(q.payload as Record<string, unknown>),
        options: q.options.map((o) => ({ label: o.label, isCorrect: o.isCorrect })),
      },
      marks: 1,
      negativeMarks: 0,
    });
    // Image-only legacy snips open in image mode; text+image opens in the rich
    // editor so both render together.
    setInputMode(isImageOnly(content) ? 'image' : 'text');
  }, [existing.data]);

  // Resolve the original OCR document (PDF/image) so the Snipping Tool can crop
  // straight from it during OCR review: jobId → job.uploadId → upload.storageKey.
  const ocrOriginal = useQuery({
    queryKey: ['ocr-original-source', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const job = await ocrApi.getJob(jobId);
      if (!job?.uploadId) return null;
      const up = await uploadsApi.get(job.uploadId);
      return { url: buildStorageUrl(up.storageKey), mime: up.mimeType, name: up.originalName };
    },
    enabled: !!jobId,
    staleTime: 60_000,
  });

  // Attach a cropped snip. Deferred upload: the crop is embedded locally as a
  // data: URL (instant — no backend round-trip) and pushed to storage once, on
  // Save. So refreshing before Save simply drops it; nothing is orphaned in S3.
  const attachSnip = async (blob: Blob): Promise<void> => {
    try {
      const dataUrl = await blobToDataUrl(blob);
      if (snipTarget === 'solution') {
        setState((p) => ({ ...p, solutionHtml: appendImageHtml(p.solutionHtml, dataUrl, 'Solution image') }));
      } else {
        setState((p) => ({ ...p, contentHtml: appendImageHtml(p.contentHtml, dataUrl, 'Question image') }));
        setInputMode('image');
      }
      toast.success('Snip added — it uploads when you Save');
    } catch (err) {
      toast.error(apiErrorMessage(err));
      throw err; // keep the Snipping Tool open so the user can retry
    }
  };

  // Remove ALL images from the question stem or the solution. contentHtml /
  // solutionHtml are the only sources of truth for question images (there is no
  // separate imageRefs array), so stripping the <img> here clears the form
  // state, the payload built from it, and the autosaved draft at once. We persist
  // synchronously so a refresh before the 5s autosave can't restore the image.
  const removeImages = (target: 'content' | 'solution'): void => {
    setState((p) => {
      const next =
        target === 'solution'
          ? { ...p, solutionHtml: stripImageTags(p.solutionHtml) }
          : { ...p, contentHtml: stripImageTags(p.contentHtml) };
      writeLocalDraft(storageKey, next);
      return next;
    });
  };

  /* ─── Autosave to localStorage ─── */
  const autosaveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      writeLocalDraft(storageKey, state);
    }, AUTOSAVE_MS);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [state, storageKey]);

  /* ─── Save mutations ─── */

  const submit = useMutation({
    mutationFn: async ({ addAnother }: { addAnother: boolean }) => {
      if (draftId && jobId) {
        // OCR path: approve atomically (creates Question + flips draft APPROVED).
        const r = await ocrApi.approve(draftId, {
          type: state.type,
          options: isChoice(state.type) ? state.payload.options : undefined,
          correctAnswer: nonChoicePayload(state),
          programId: state.taxonomy.programId ?? undefined,
          subjectId: state.taxonomy.subjectId ?? undefined,
          topicId: state.taxonomy.topicId ?? undefined,
          chapterId: state.taxonomy.chapterId ?? undefined,
          difficulty: state.difficulty,
        });
        return { id: r.questionId, addAnother };
      }

      // Deferred-image upload happens HERE, once: push any embedded data: images
      // to storage and swap them for real read URLs before persisting the question.
      const uploadOpts = {
        category: 'question-images' as const,
        programId: state.taxonomy.programId ?? undefined,
        subjectId: state.taxonomy.subjectId ?? undefined,
      };
      const contentHtml = await uploadInlineImages(state.contentHtml, uploadOpts);
      const solutionHtml = await uploadInlineImages(state.solutionHtml, uploadOpts);
      const body = buildCreateBody({ ...state, contentHtml, solutionHtml });

      if (editId) {
        await questionsApi.update(editId, body);
        return { id: editId, addAnother };
      }
      const q = await questionsApi.create(body);
      return { id: q.id, addAnother };
    },
    onSuccess: ({ id, addAnother }) => {
      clearLocalDraft(storageKey);
      setSavedAt(new Date());

      // OCR single-approval path: keep them on the page to review/approve the rest!
      if (draftId && jobId) {
        setInternalDraftId(null);
        // Do NOT clear internalJobId so the job remains active in the panel
        qc.invalidateQueries({ queryKey: ['ocr-assist-drafts'] });
        toast.success('Question approved and added to Bank.');
        return;
      }

      toast.success(editId ? 'Question updated' : 'Question saved');
      setInternalDraftId(null);
      setInternalJobId(null);
      if (addAnother) {
        // Preserve taxonomy for fast bulk entry — clear content/options only.
        setState((prev) => ({
          ...DEFAULT_STATE,
          taxonomy: prev.taxonomy,
          difficulty: prev.difficulty,
          type: prev.type,
        }));
        if (onClose) onClose();
        else navigate('/questions/new', { replace: true });
      } else {
        if (onClose) onClose();
        else navigate(`/questions?highlight=${id}`);
      }
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  /* ─── Keyboard shortcuts: Cmd+S draft / Cmd+Enter publish / Cmd+D add-another ─── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        submit.mutate({ addAnother: false });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submit.mutate({ addAnother: false });
      } else if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        submit.mutate({ addAnother: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, storageKey]);

  const isOcrMode = !!(draftId && jobId);

  /*
  // "Use in form": seed the form fields from a (possibly inline-edited) OCR
  // draft and switch Save into approve-mode. Both editors are controlled
  // (RichTextEditor resyncs on value change; OptionsEditor renders from
  // payload), so a single setState injects content + options + type cleanly.
  const applyOcrDraft = (info: AppliedDraftInfo): void => {
    setInternalDraftId(info.draftId);
    setInternalJobId(info.jobId);
    const nextType = info.detectedType;
    const choice = isChoice(nextType);
    setState((prev) => ({
      ...prev,
      type: nextType,
      contentHtml: textToHtml(info.text),
      payload: choice
        ? {
            options: info.options.map((o) => ({ label: o.label, isCorrect: !!o.isCorrect })),
            explanation: prev.payload.explanation,
          }
        : resetPayloadFor(nextType, prev.payload),
    }));
    toast.success('Draft loaded — review, edit, then Save to approve.');
  };
  */

  return (
    <>
      <PageHeader
        title={editId ? 'Edit question' : isOcrMode ? 'Approve OCR draft' : 'Add question'}
        description={
          savedAt
            ? `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Autosaved locally every 5s'
        }
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => onClose ? onClose() : navigate('/questions')}
              disabled={submit.isPending}
            >
              <X size={14} /> Cancel
            </Button>
            <Button
              variant="secondary"
              loading={submit.isPending}
              onClick={() => submit.mutate({ addAnother: true })}
              title="Save and add another (Ctrl+D)"
            >
              <FilePlus size={14} /> Save &amp; add another
            </Button>
            <Button
              variant="primary"
              loading={submit.isPending}
              onClick={() => submit.mutate({ addAnother: false })}
              title="Save (Ctrl+S / Ctrl+Enter)"
            >
              <Save size={14} /> Save
            </Button>

            {/* 
            {ocrInfo?.stateKind === 'drafts' && ocrInfo.draftsCount > 0 ? (
              <>
                {isOcrMode && (
                  <Button
                    variant="secondary"
                    loading={submit.isPending}
                    disabled={ocrInfo.isImporting || isOcrRunning}
                    onClick={() => submit.mutate({ addAnother: false })}
                    title="Approve and save only this active question to the Bank"
                  >
                    <Save size={14} /> Save Current
                  </Button>
                )}
                <Button
                  variant="primary"
                  loading={ocrInfo.isImporting}
                  disabled={ocrInfo.selectedCount === 0 || submit.isPending}
                  onClick={ocrInfo.triggerBulkImport}
                  className="bg-primary hover:bg-primary/90 text-text-on-primary font-semibold shadow-md"
                  title="Bulk-create Question Bank entries for every selected draft"
                >
                  <Zap size={14} className="mr-1.5 inline-block text-yellow-300" />
                  Import {ocrInfo.selectedCount} Questions to Bank
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  loading={submit.isPending}
                  disabled={isOcrRunning}
                  onClick={() => submit.mutate({ addAnother: true })}
                  title="Save and add another (Ctrl+D)"
                >
                  <FilePlus size={14} /> Save &amp; add another
                </Button>
                <Button
                  variant="primary"
                  loading={submit.isPending}
                  disabled={isOcrRunning}
                  onClick={() => submit.mutate({ addAnother: false })}
                  title="Save (Ctrl+S / Ctrl+Enter)"
                >
                  <Save size={14} /> Save
                </Button>
              </>
            )}
            */}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Left sticky metadata panel */}
        <aside className="lg:sticky lg:top-[calc(var(--topbar-height)+var(--breadcrumb-height)+16px)] lg:self-start">
          <div className="space-y-4 rounded-md border border-border bg-surface p-4">
            <Section title="Taxonomy">
              <CourseSelector
                value={state.taxonomy}
                onChange={(t) => setState((p) => ({ ...p, taxonomy: t }))}
                direction="vertical"
                size="sm"
              />
            </Section>

            <Section title="Classification">
              <FieldLabel>Type</FieldLabel>
              <Select
                value={state.type}
                onChange={(e) => {
                  const next = e.target.value as QuestionType;
                  setState((p) => ({ ...p, type: next, payload: resetPayloadFor(next, p.payload) }));
                }}
                className="h-8 text-xs"
                disabled={isOcrMode}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ').toLowerCase()}
                  </option>
                ))}
              </Select>
              <FieldLabel>Difficulty</FieldLabel>
              <Select
                value={state.difficulty}
                onChange={(e) => setState((p) => ({ ...p, difficulty: e.target.value as Difficulty }))}
                className="h-8 text-xs"
              >
                {DIFFS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Section>

            <Section title="Marking">
              <FieldLabel>Marks</FieldLabel>
              <Input
                type="number"
                value={state.marks}
                min={0}
                step={0.5}
                onChange={(e) =>
                  setState((p) => ({ ...p, marks: Number(e.target.value) || 0 }))
                }
                className="h-8 text-xs"
              />
              <FieldLabel>Negative marks</FieldLabel>
              <Input
                type="number"
                value={state.negativeMarks}
                min={0}
                step={0.25}
                onChange={(e) =>
                  setState((p) => ({ ...p, negativeMarks: Number(e.target.value) || 0 }))
                }
                className="h-8 text-xs"
              />
            </Section>

            <Section title="Source">
              <p className="text-xs text-text-muted">
                {isOcrMode
                  ? 'OCR draft → approving creates a Question.'
                  : editId
                    ? 'Editing existing question.'
                    : 'Manual entry.'}
              </p>
              {isOcrMode ? (
                <p className="mt-1 text-[11px] text-text-faint">
                  Job <code className="font-mono">{jobId?.slice(0, 8)}…</code> · Draft{' '}
                  <code className="font-mono">{draftId?.slice(0, 8)}…</code>
                </p>
              ) : null}
            </Section>

            <p className="text-[11px] text-text-faint">
              Keyboard: <kbd className="rounded border border-border px-1">Ctrl+S</kbd> save ·{' '}
              <kbd className="rounded border border-border px-1">Ctrl+D</kbd> save &amp; add another
            </p>
          </div>
        </aside>

        {/* Right work area */}
        <main className="space-y-4">
          {/* OCR assist (Add Question only). Two connected workflows:
              · "Use in form" loads one draft into THIS editor (review → Save
                 approves it atomically).
              · Bulk import sends all selected drafts straight to the Question
                 Bank, bypassing the form.
              Stays mounted while a draft is applied so the teacher can swap
              drafts or switch to bulk. */}
          {/*
          // OCR Banner guidance
          {ocrInfo?.stateKind === 'drafts' && ocrInfo.draftsCount > 0 && (
            <div className="relative overflow-hidden rounded-md border border-primary/20 bg-gradient-to-r from-primary-soft/40 to-hover/30 p-4 shadow-sm">
              <div className="absolute right-0 top-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-primary/5 blur-xl pointer-events-none" />
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles size={16} className="animate-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-text">
                    OCR Complete: {ocrInfo.draftsCount} Question{ocrInfo.draftsCount === 1 ? '' : 's'} Extracted!
                  </h4>
                  <p className="mt-1 text-xs text-text-muted leading-relaxed">
                    We found multiple questions in your document. You can review, edit, or deselect questions in the list below. 
                    Once ready, click the primary <strong className="text-primary">"Import {ocrInfo.selectedCount} Questions to Bank"</strong> button at the top-right to import the entire batch at once.
                  </p>
                  {isOcrMode && (
                    <p className="mt-1.5 text-[11px] font-medium text-primary flex items-center gap-1">
                      <Sparkles size={12} className="shrink-0" />
                      Tip: You are currently reviewing a single question in the editor below. Saving it will instantly advance you to the next question!
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          // OCR assist (Add Question only). Two connected workflows:
          //    · "Use in form" loads one draft into THIS editor (review → Save
          //       approves it atomically).
          //    · Bulk import sends all selected drafts straight to the Question
          //       Bank, bypassing the form.
          //    Stays mounted while a draft is applied so the teacher can swap
          //    drafts or switch to bulk.
          {!editId ? (
            <OcrAssistPanel
              taxonomy={state.taxonomy}
              appliedDraftId={draftId}
              onApplyDraft={applyOcrDraft}
              onOcrStateChange={setOcrInfo}
              onImported={(ids) => {
                if (ids.length > 0) navigate(`/questions?highlight=${ids[0]}`);
              }}
            />
          ) : null}
          */}

          <section className="rounded-md border border-border bg-surface overflow-hidden">
            <header className="flex items-center justify-between border-b border-border-soft bg-surface px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.6px] text-text-faint">
                Question content
              </span>
              
              {/* Tab Switcher */}
              <div className="flex rounded bg-subtle p-0.5 border border-border-soft">
                <button
                  type="button"
                  onClick={() => setInputMode('text')}
                  className={cn(
                    "flex items-center gap-1 rounded px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    inputMode === 'text'
                      ? "bg-surface text-primary shadow-sm font-semibold"
                      : "text-text-muted hover:text-text"
                  )}
                >
                  <FileText size={11} />
                  Write Text
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('image')}
                  className={cn(
                    "flex items-center gap-1 rounded px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    inputMode === 'image'
                      ? "bg-surface text-primary shadow-sm font-semibold"
                      : "text-text-muted hover:text-text"
                  )}
                >
                  <ImageIcon size={11} />
                  Upload Snip
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('snip')}
                  className={cn(
                    "flex items-center gap-1 rounded px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    inputMode === 'snip'
                      ? "bg-surface text-primary shadow-sm font-semibold"
                      : "text-text-muted hover:text-text"
                  )}
                >
                  <Scissors size={11} />
                  Snipping Tool
                </button>
              </div>
            </header>
            
            <div className="p-3">
              {inputMode === 'text' ? (
                <RichTextEditor
                  value={normalizeStorageUrls(state.contentHtml)}
                  onChange={(html) => setState((p) => ({ ...p, contentHtml: html }))}
                  placeholder="Type the question. Use $…$ for inline math (rendered with KaTeX in the preview)."
                  minHeight={160}
                />
              ) : inputMode === 'image' ? (
                /* Dropzone and Paste area */
                <div>
                  {uploadedImageUrl ? (
                    <div className="space-y-3">
                      <div className="relative group rounded-md border border-border-soft overflow-hidden bg-subtle p-2 max-w-full inline-block">
                        <img
                          src={uploadedImageUrl}
                          alt="Uploaded question snip"
                          className="max-h-80 object-contain rounded border border-border bg-surface"
                          onError={(e) => {
                            // Don't show a broken-image icon; hide it. The
                            // Replace/Remove controls below stay usable.
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImages('content');
                          }}
                          className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white shadow-sm hover:bg-danger transition-colors"
                          title="Remove image"
                          aria-label="Remove image"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-success font-medium flex items-center gap-1">
                          <Sparkles size={12} /> Image added — uploads on Save
                        </span>
                        <button
                          type="button"
                          onClick={() => imageInputRef.current?.click()}
                          className="text-primary hover:underline font-medium"
                        >
                          Choose another file
                        </button>
                        <span className="text-text-faint">|</span>
                        <button
                          type="button"
                          onClick={() => removeImages('content')}
                          className="text-danger hover:underline font-medium"
                        >
                          Clear Image
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => imageInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          imageInputRef.current?.click();
                        }
                      }}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      onPaste={onContainerPaste}
                      className={cn(
                        "flex flex-col items-center justify-center cursor-pointer rounded-md border border-dashed p-8 text-center transition-all focus:outline-none focus:ring-1 focus:ring-primary",
                        dragOver
                          ? "border-primary bg-primary-soft/40"
                          : "border-border hover:border-primary hover:bg-hover"
                      )}
                    >
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <UploadCloud size={24} />
                      </div>
                      <div className="text-sm font-medium text-text">
                        Drop a question snip or <span className="text-primary underline">browse local file</span>
                      </div>
                      <p className="mt-1 text-xs text-text-muted max-w-sm leading-relaxed">
                        Drag &amp; drop a JPG/PNG/WebP/HEIC file, or click to choose from your device.
                      </p>

                      <div className="mt-3 inline-flex items-center gap-1.5 rounded bg-primary-soft/30 px-3 py-1 text-[11px] font-medium text-primary">
                        <Zap size={11} className="text-yellow-500 animate-pulse" />
                        <span>Take a snip (`Win+Shift+S`) and press `Ctrl+V` to paste here!</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Snipping Tool launcher */
                <div className="space-y-3">
                  <div className="rounded-md border border-dashed border-border p-6 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <Scissors size={22} />
                    </div>
                    <div className="text-sm font-medium text-text">Snip from a PDF or image</div>
                    <p className="mx-auto mt-1 max-w-md text-xs text-text-muted leading-relaxed">
                      Upload a PDF or image, drag a box over the exact region — graph, formula,
                      diagram, table, map or handwriting — and crop it straight into the question.
                      No external snipping tools needed.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                      <Button variant="primary" size="sm" onClick={() => openSnip('content')}>
                        <Scissors size={14} className="mr-1" /> Open Snipping Tool
                      </Button>
                      {ocrOriginal.data ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            openSnip('content', {
                              kind: 'url',
                              url: ocrOriginal.data!.url,
                              mime: ocrOriginal.data!.mime,
                              name: ocrOriginal.data!.name,
                            })
                          }
                          title="Crop directly from the document this OCR draft came from"
                        >
                          <FileText size={14} className="mr-1" /> Snip from original document
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {uploadedImageUrl ? (
                    <p className="text-xs text-text-muted">
                      Tip: switch to <strong>Write Text</strong> to see snipped images inline with
                      your text.
                    </p>
                  ) : null}
                </div>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleImageUpload(file);
                  }
                }}
              />
            </div>
          </section>

          <PanelSection title={optionsLabelFor(state.type)}>
            <OptionsEditor
              type={state.type}
              payload={state.payload}
              onChange={(payload) => setState((p) => ({ ...p, payload }))}
            />
          </PanelSection>

          <PanelSection title="Solution / explanation">
            <div className="mb-2 flex justify-end gap-2">
              {/<img/i.test(state.solutionHtml) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeImages('solution')}
                  title="Remove image(s) from the solution"
                >
                  <Trash2 size={13} className="mr-1" /> Remove image
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openSnip('solution')}
                title="Crop a region from a PDF/image into the solution"
              >
                <Scissors size={13} className="mr-1" /> Snip image
              </Button>
            </div>
            <RichTextEditor
              value={normalizeStorageUrls(state.solutionHtml)}
              onChange={(html) => setState((p) => ({ ...p, solutionHtml: html }))}
              placeholder="Optional. Shown after a student submits."
              minHeight={100}
            />
          </PanelSection>

          {isOcrMode ? (
            <p className="text-xs text-text-muted">
              When you press Save, this OCR draft is marked APPROVED and a Question row is
              created atomically. To skip without approving,{' '}
              <Link to="/uploads" className="btn-link">
                return to Uploads
              </Link>
              .
            </p>
          ) : null}
        </main>
      </div>

      <SnippingTool
        open={snipOpen}
        onClose={() => setSnipOpen(false)}
        source={snipSource}
        onCropped={attachSnip}
        title={snipTarget === 'solution' ? 'Snip → Solution' : 'Snip → Question'}
      />
    </>
  );
};

/* ─────────────────────────────────────────── small helpers */

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.6px] text-text-faint">
      {title}
    </h3>
    {children}
  </div>
);

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.4px] text-text-muted">
    {children}
  </div>
);

const PanelSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-md border border-border bg-surface">
    <header className="border-b border-border-soft px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.6px] text-text-faint">
      {title}
    </header>
    <div className="p-3">{children}</div>
  </section>
);

const optionsLabelFor = (t: QuestionType): string => {
  switch (t) {
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE':
      return 'Options';
    case 'TRUE_FALSE':
      return 'Correct answer';
    case 'FILL_BLANK':
      return 'Accepted answers';
    case 'DESCRIPTIVE':
      return 'Grading';
    case 'MATCH_FOLLOWING':
      return 'Pairs';
    case 'MATRIX_MATCH':
    default:
      return 'Body';
  }
};

const isChoice = (t: QuestionType): boolean =>
  t === 'SINGLE_CHOICE' || t === 'MULTIPLE_CHOICE';

const resetPayloadFor = (t: QuestionType, prev: QuestionPayload): QuestionPayload => {
  if (isChoice(t)) {
    return {
      options:
        prev.options && prev.options.length >= 2
          ? prev.options
          : [
              { label: '', isCorrect: false },
              { label: '', isCorrect: false },
            ],
      explanation: prev.explanation,
    };
  }
  if (t === 'TRUE_FALSE') return { correct: prev.correct ?? true, explanation: prev.explanation };
  if (t === 'FILL_BLANK')
    return { accepted: prev.accepted ?? [''], caseSensitive: !!prev.caseSensitive };
  if (t === 'DESCRIPTIVE') return { rubric: prev.rubric ?? '', maxWords: prev.maxWords ?? 100 };
  if (t === 'MATCH_FOLLOWING')
    return {
      pairs: prev.pairs ?? [
        { left: '', right: '' },
        { left: '', right: '' },
      ],
    };
  if (t === 'VISUAL') return { optionCount: prev.optionCount ?? 4, correctOption: prev.correctOption ?? 0 };
  return {};
};

/** Build the server payload. Choice types pass `options` separately; others embed answer in `payload`. */
const buildCreateBody = (s: FormState) => {
  const taxonomy = {
    programId: s.taxonomy.programId ?? undefined,
    subjectId: s.taxonomy.subjectId ?? undefined,
    topicId: s.taxonomy.topicId ?? undefined,
    chapterId: s.taxonomy.chapterId ?? undefined,
  };
  if (isChoice(s.type)) {
    return {
      type: s.type,
      difficulty: s.difficulty,
      ...taxonomy,
      payload: { contentHtml: s.contentHtml, explanation: s.solutionHtml },
      options: (s.payload.options ?? []).map((o) => ({
        label: o.label,
        isCorrect: o.isCorrect,
      })),
    };
  }
  if (s.type === 'VISUAL') {
    const count = s.payload.optionCount ?? 4;
    const correct = s.payload.correctOption ?? 0;
    return {
      type: s.type,
      difficulty: s.difficulty,
      ...taxonomy,
      payload: {
        contentHtml: s.contentHtml,
        explanation: s.solutionHtml,
        optionCount: count,
      },
      options: Array.from({ length: count }, (_, i) => ({
        label: String(i + 1),
        isCorrect: i + 1 === correct,
      })),
    };
  }

  return {
    type: s.type,
    difficulty: s.difficulty,
    ...taxonomy,
    payload: {
      contentHtml: s.contentHtml,
      explanation: s.solutionHtml,
      ...nonChoicePayload(s),
    },
  };
};

const nonChoicePayload = (s: FormState): Record<string, unknown> => {
  switch (s.type) {
    case 'TRUE_FALSE':
      return { correct: !!s.payload.correct };
    case 'FILL_BLANK':
      return { accepted: s.payload.accepted ?? [], caseSensitive: !!s.payload.caseSensitive };
    case 'DESCRIPTIVE':
      return { rubric: s.payload.rubric ?? '', maxWords: s.payload.maxWords ?? 100 };
    case 'MATCH_FOLLOWING':
      return { pairs: s.payload.pairs ?? [] };
    default:
      return {};
  }
};

/** Remove every <img> (and any wrapper <p> left empty by it) from an HTML
 *  string, preserving surrounding text. Single source of truth for "remove
 *  image" so no broken ref survives in question/solution content. */
const stripImageTags = (html: string): string =>
  (html ?? '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<p>(?:\s|&nbsp;)*<\/p>/gi, '')
    .trim();

/** Remove only DEFERRED (data:) images. Used when persisting the autosave draft
 *  so an unsaved snip is dropped on refresh (it was never uploaded → no S3
 *  orphan). Already-uploaded real URLs are kept. */
const stripDataImages = (html: string): string =>
  (html ?? '')
    .replace(/<img[^>]+src="data:[^"]*"[^>]*>/gi, '')
    .replace(/<p>(?:\s|&nbsp;)*<\/p>/gi, '');

/** True when the HTML contains an <img> and no meaningful text — a legacy
 *  image-only snip, which should open in "Upload Snip" mode. Text+image content
 *  returns false so it opens in the rich editor where both render. */
const isImageOnly = (html: string): boolean => {
  if (!/<img/i.test(html)) return false;
  const text = html
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return text.length === 0;
};

const textToHtml = (text: string): string => {
  if (!text) return '';
  // Naive: wrap each non-empty line in <p>.
  return text
    .split(/\n+/)
    .filter((l) => l.trim().length > 0)
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join('');
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const readLocalDraft = (key: string): FormState | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FormState;
    if (parsed && !TYPES.includes(parsed.type)) {
      parsed.type = 'SINGLE_CHOICE';
      parsed.payload = resetPayloadFor('SINGLE_CHOICE', parsed.payload);
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeLocalDraft = (key: string, state: FormState): void => {
  try {
    // Never persist deferred (data:) images — they upload on Save, so an unsaved
    // image must not survive a refresh.
    const persist: FormState = {
      ...state,
      contentHtml: stripDataImages(state.contentHtml),
      solutionHtml: stripDataImages(state.solutionHtml),
    };
    localStorage.setItem(key, JSON.stringify(persist));
  } catch {
    /* quota or private mode — ignore */
  }
};

const clearLocalDraft = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};
