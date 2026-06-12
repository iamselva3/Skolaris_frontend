import { apiClient } from './client';
import type { ApiEnvelope, PaginatedResponse, QuestionType, Difficulty } from '../types';

export type OcrDraftStatus = 'PENDING_REVIEW' | 'EDITED' | 'APPROVED' | 'DISCARDED';

/** Pre-filled correct answer mapped from an imported answer key. `correctIndex`
 *  is a 1-based option position (A→1) for MCQ/VISUAL; `correct` is the boolean for
 *  TRUE_FALSE. Exactly one is set. The FE pre-selects it and shows a badge. */
export interface SuggestedAnswer {
  source: 'answer-key';
  raw: string;
  correctIndex?: number;
  correct?: boolean;
}

/** Bulk-assigned, review-time taxonomy defaults. All optional. */
export interface AssignedTaxonomy {
  programId?: string | null;
  subjectId?: string | null;
  topicId?: string | null;
  chapterId?: string | null;
  difficulty?: Difficulty | null;
}

export interface OcrDraft {
  id: string;
  ocrJobId: string;
  position: number;
  text: string;
  detectedType: QuestionType | null;
  options: Array<{ label: string; isCorrect?: boolean }> | null;
  confidence: number | null;
  status: OcrDraftStatus;
  approvedQuestionId: string | null;
  /** Screenshot-first: R2 key of the cropped question-region image. When present
   *  the draft can be approved as a Visual Question (image is the source of truth). */
  questionSnapshotKey?: string | null;
  needsImageReview?: boolean;
  /** Number of answer slots detected on the crop (2..6), seeds the visual radios. */
  optionCount?: number | null;
  /** Detected question number at the top of the crop (reliable count + navigator). */
  questionNumber?: number | null;
  /** True when the crop has no question number/stem/marker (not a real question). */
  invalidCrop?: boolean | null;
  /** Question-region bounding box on the source page { x0, y0, x1, y1 }. */
  sourceCoordinates?: Record<string, number> | null;
  /** Pre-filled answer from an imported answer key; FE pre-selects it. */
  suggestedAnswer?: SuggestedAnswer | null;
  /** Bulk-assigned taxonomy defaults; FE pre-fills the taxonomy selectors. */
  assignedTaxonomy?: AssignedTaxonomy;
  createdAt: string;
  updatedAt: string;
}

export interface OcrJob {
  id: string;
  tenantId: string;
  uploadId: string;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  overallConfidence: number | null;
  providerUsed: string | null;
  errorMessage: string | null;
  draftCounts: Record<string, number>;
}

export interface ApproveDraftBody {
  type?: QuestionType;
  questionSnapshotKey?: string;
  options?: Array<{ label: string; isCorrect: boolean }>;
  correctAnswer?: Record<string, unknown>;
  programId?: string;
  subjectId?: string;
  topicId?: string;
  chapterId?: string;
  subject?: string;
  topic?: string;
  difficulty?: Difficulty;
}

export interface BulkApproveItem extends ApproveDraftBody {
  draftId: string;
}

export interface BulkApproveResultItem {
  draftId: string;
  ok: boolean;
  questionId?: string;
  error?: string;
}

export type OcrProgressStage =
  | 'PENDING'
  | 'OCR_PROCESSING'
  | 'EXTRACTING'
  | 'GENERATING_DRAFTS'
  | 'COMPLETED'
  | 'FAILED';

export interface OcrProgressSnapshot {
  uploadId: string;
  uploadStatus: string;
  ocrStage: OcrProgressStage | null;
  pageProcessed: number;
  pageTotal: number;
  progressPercent: number;
  draftCount: number;
  errorMessage: string | null;
}

/** Body for POST /ocr/jobs/:id/answer-key — supply EITHER `text` (a normalized
 *  "1-A\n2-C" key parsed client-side from paste/TXT/CSV/Excel) OR `storageKey`
 *  (an uploaded answer-key image/PDF the backend OCRs). */
export interface ImportAnswerKeyBody {
  text?: string;
  storageKey?: string;
}

/** Canonical answer-key entry: every format converges to { questionNumber, answer }. */
export interface AnswerKeyEntry {
  questionNumber: number;
  answer:
    | { kind: 'option'; index: number; label: string }
    | { kind: 'boolean'; value: boolean };
  raw: string;
}

/** Full validation report from the ONE canonical backend parser — drives the
 *  mandatory pre-import preview (no rules live in the browser anymore). */
export interface ParseReport {
  entries: AnswerKeyEntry[];
  totalDetected: number;
  startsAtOne: boolean;
  zeroOrNegative: number[];
  missingNumbers: number[];
  duplicates: number[];
  conflicts: number[];
  invalid: Array<{ questionNumber: number | null; raw: string; reason: string }>;
  outOfRange: number[];
  pagesUsed: number[];
  pagesIgnored: Array<{ page: number; reason: string }>;
}

export interface PreviewAnswerKeyResult {
  report: ParseReport;
  /** How many parsed entries would map to a draft if applied. */
  willMatch: number;
  draftCount: number;
}

export interface ImportAnswerKeyResult {
  matched: number;
  keyEntries: number;
  unmatchedKeyNumbers: number[];
  unmatchedDrafts: number;
  conflicts: number[];
  outOfRange: number[];
  /** Same report the preview returned, so the post-import summary is exact. */
  report: ParseReport;
}

/** Body for POST /ocr/jobs/:id/taxonomy — omit/empty `draftIds` → apply to ALL
 *  drafts in the job; a list → apply to selected. Only provided fields are set. */
export interface AssignTaxonomyBody {
  draftIds?: string[];
  programId?: string;
  subjectId?: string;
  topicId?: string;
  chapterId?: string;
  difficulty?: Difficulty;
}

export interface AssignTaxonomyResult {
  updated: number;
  appliedToAll: boolean;
}

/* ── Multi-file OCR batch (orchestration only — single-file flow is unchanged) ── */

export type BatchFileState = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface BatchFileProgress {
  uploadId: string;
  batchOrder: number;
  /** 1-based position for display ("File 2 of 5"). */
  position: number;
  originalName: string;
  state: BatchFileState;
  draftCount: number;
  errorMessage: string | null;
}

export interface OcrBatchProgressSnapshot {
  batchId: string;
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  /** The in-flight file (concurrency 1), else the next queued file, else null. */
  current: { uploadId: string; batchOrder: number; position: number; originalName: string } | null;
  files: BatchFileProgress[];
}

export interface CreateOcrBatchResultFile {
  uploadId: string;
  batchOrder: number;
  dispatched: boolean;
  error?: string;
}

export interface CreateOcrBatchResult {
  batchId: string;
  totalFiles: number;
  files: CreateOcrBatchResultFile[];
}

/** A draft in a batch review: a normal OcrDraft PLUS read-time fields. The
 *  continuous `batchSequence` (1..N across the whole batch) is display-only;
 *  `originalQuestionNumber` mirrors the untouched OCR-detected number. */
export interface OcrBatchDraft extends OcrDraft {
  batchSequence: number;
  originalQuestionNumber: number | null;
  uploadId: string;
  fileOrder: number;
  sourceFileName: string;
}

/** One collapsed batch row for the uploads queue. */
export interface OcrBatchListItem {
  batchId: string;
  totalFiles: number;
  fileCount: number;
  questionCount: number;
  completed: number;
  failed: number;
  processing: boolean;
  firstUploadId: string | null;
  createdAt: string;
}

export const ocrApi = {
  getJob: async (id: string): Promise<OcrJob> => {
    const r = await apiClient.get<ApiEnvelope<OcrJob>>(`/ocr/jobs/${id}`);
    return r.data.data;
  },
  listDrafts: async (jobId: string, params: { limit?: number; offset?: number } = {}): Promise<PaginatedResponse<OcrDraft>> => {
    const r = await apiClient.get<PaginatedResponse<OcrDraft>>(`/ocr/jobs/${jobId}/drafts`, { params });
    return r.data;
  },
  /**
   * Fetch EVERY draft for a job by paging through the API (the endpoint caps
   * `limit` at 200). A NEET/JEE paper can have 100–500 questions, and the review
   * UI needs them all at once, so we accumulate pages until `meta.total` is met.
   */
  listAllDrafts: async (jobId: string, pageSize = 200): Promise<PaginatedResponse<OcrDraft>> => {
    const all: OcrDraft[] = [];
    let offset = 0;
    let total = 0;
    for (;;) {
      const page = await ocrApi.listDrafts(jobId, { limit: pageSize, offset });
      all.push(...page.data);
      total = page.meta?.total ?? all.length;
      offset += pageSize;
      if (page.data.length === 0 || all.length >= total) break;
    }
    return { data: all, meta: { total, limit: all.length, offset: 0 } };
  },
  updateDraft: async (id: string, body: Partial<{ text: string; detectedType: QuestionType; options: Array<{ label: string; isCorrect?: boolean }> }>): Promise<OcrDraft> => {
    const r = await apiClient.patch<ApiEnvelope<OcrDraft>>(`/ocr/drafts/${id}`, body);
    return r.data.data;
  },
  approve: async (id: string, body: ApproveDraftBody): Promise<{ draftId: string; questionId: string }> => {
    const r = await apiClient.post<ApiEnvelope<{ draftId: string; questionId: string }>>(`/ocr/drafts/${id}/approve`, body);
    return r.data.data;
  },
  bulkApprove: async (items: BulkApproveItem[]): Promise<BulkApproveResultItem[]> => {
    const r = await apiClient.post<ApiEnvelope<BulkApproveResultItem[]>>(`/ocr/drafts/bulk-approve`, { items });
    return r.data.data;
  },
  discard: async (id: string): Promise<OcrDraft> => {
    const r = await apiClient.post<ApiEnvelope<OcrDraft>>(`/ocr/drafts/${id}/discard`);
    return r.data.data;
  },
  revert: async (id: string): Promise<void> => {
    await apiClient.post(`/ocr/drafts/${id}/revert`);
  },
  getProgress: async (uploadId: string): Promise<OcrProgressSnapshot> => {
    const r = await apiClient.get<ApiEnvelope<OcrProgressSnapshot>>(`/ocr/progress/${uploadId}`);
    return r.data.data;
  },
  importAnswerKey: async (jobId: string, body: ImportAnswerKeyBody): Promise<ImportAnswerKeyResult> => {
    const r = await apiClient.post<ApiEnvelope<ImportAnswerKeyResult>>(`/ocr/jobs/${jobId}/answer-key`, body);
    return r.data.data;
  },
  /** Stateless parse+validate of raw key text (no job) — one canonical grammar,
   *  used by the multi-file batch path to translate continuous numbering. */
  parseAnswerKey: async (text: string): Promise<ParseReport> => {
    const r = await apiClient.post<ApiEnvelope<ParseReport>>(`/ocr/answer-key/parse`, { text });
    return r.data.data;
  },
  /** Dry-run: parse + validate + (PDF/image) OCR with page selection, returning
   *  the canonical ParseReport WITHOUT applying. Drives preview-before-import. */
  previewAnswerKey: async (jobId: string, body: ImportAnswerKeyBody): Promise<PreviewAnswerKeyResult> => {
    const r = await apiClient.post<ApiEnvelope<PreviewAnswerKeyResult>>(
      `/ocr/jobs/${jobId}/answer-key/preview`,
      body,
    );
    return r.data.data;
  },
  assignTaxonomy: async (jobId: string, body: AssignTaxonomyBody): Promise<AssignTaxonomyResult> => {
    const r = await apiClient.post<ApiEnvelope<AssignTaxonomyResult>>(`/ocr/jobs/${jobId}/taxonomy`, body);
    return r.data.data;
  },
  /** Manual recovery — insert a snipped image as a draft at a question number.
   *  When `correctOption` is set it's approved immediately (no review step). */
  insertDraft: async (
    jobId: string,
    body: {
      storageKey: string;
      questionNumber: number;
      optionCount?: number;
      correctOption?: number;
      solutionHtml?: string;
    },
  ): Promise<OcrDraft> => {
    const r = await apiClient.post<ApiEnvelope<OcrDraft>>(`/ocr/jobs/${jobId}/drafts`, body);
    return r.data.data;
  },
  /** Manual recovery — move a draft to a new question number (drag-reorder). */
  moveDraft: async (draftId: string, toQuestionNumber: number): Promise<void> => {
    await apiClient.patch(`/ocr/drafts/${draftId}/move`, { toQuestionNumber });
  },

  /* ── Multi-file batch (each file still runs through the unchanged pipeline) ── */

  /** Create a batch from already-uploaded files (bytes PUT, status PENDING_UPLOAD).
   *  The backend completes + dispatches them sequentially, one OCR job at a time. */
  createBatch: async (uploadIds: string[]): Promise<CreateOcrBatchResult> => {
    const r = await apiClient.post<ApiEnvelope<CreateOcrBatchResult>>(`/ocr/batches`, { uploadIds });
    return r.data.data;
  },
  /** Aggregate batch progress (total/queued/processing/completed/failed + per-file). */
  getBatchProgress: async (batchId: string): Promise<OcrBatchProgressSnapshot> => {
    const r = await apiClient.get<ApiEnvelope<OcrBatchProgressSnapshot>>(`/ocr/batches/${batchId}`);
    return r.data.data;
  },
  /** List batches for the uploads queue — one collapsed summary row per batch. */
  listBatches: async (
    params: { limit?: number; offset?: number } = {},
  ): Promise<{ data: OcrBatchListItem[]; meta: { total: number; limit: number; offset: number } }> => {
    const r = await apiClient.get<{
      data: OcrBatchListItem[];
      meta: { total: number; limit: number; offset: number };
    }>(`/ocr/batches`, { params });
    return r.data;
  },
  /** All drafts across the batch in file order, with continuous batchSequence. */
  listBatchDrafts: async (
    batchId: string,
  ): Promise<{ data: OcrBatchDraft[]; meta: { total: number; batchId: string } }> => {
    const r = await apiClient.get<{ data: OcrBatchDraft[]; meta: { total: number; batchId: string } }>(
      `/ocr/batches/${batchId}/drafts`,
    );
    return r.data;
  },
};
