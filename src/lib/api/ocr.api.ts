import { apiClient } from './client';
import type { ApiEnvelope, PaginatedResponse, QuestionType, Difficulty } from '../types';

export type OcrDraftStatus = 'PENDING_REVIEW' | 'EDITED' | 'APPROVED' | 'DISCARDED';

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

export const ocrApi = {
  getJob: async (id: string): Promise<OcrJob> => {
    const r = await apiClient.get<ApiEnvelope<OcrJob>>(`/ocr/jobs/${id}`);
    return r.data.data;
  },
  listDrafts: async (jobId: string, params: { limit?: number; offset?: number } = {}): Promise<PaginatedResponse<OcrDraft>> => {
    const r = await apiClient.get<PaginatedResponse<OcrDraft>>(`/ocr/jobs/${jobId}/drafts`, { params });
    return r.data;
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
};
