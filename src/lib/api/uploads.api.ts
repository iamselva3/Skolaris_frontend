import { apiClient } from './client';
import type { ApiEnvelope, PaginatedResponse } from '../types';

export type UploadStatus =
  | 'PENDING_UPLOAD'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'FAILED';

export interface Upload {
  id: string;
  tenantId: string;
  uploadedBy: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number | null;
  storageKey: string;
  status: UploadStatus;
  errorMessage: string | null;
  programId: string | null;
  subjectId: string | null;
  /** OCR drafts attached to this upload's job. null when there's no OCR job yet. */
  draftCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SignedUpload extends Upload {
  signedUrl: string;
  expiresAt: string;
  /**
   * HTTP method the client must use to upload bytes. 'PUT' for real GCS/S3
   * v4 signed URLs; 'POST' for the fake-gcs-server emulator. The frontend
   * uploader MUST honour this field.
   */
  httpMethod: 'PUT' | 'POST';
  requiredHeaders?: Record<string, string>;
}

export interface UploadDetail extends Upload {
  ocrJob: {
    id: string;
    queuedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    overallConfidence: number | null;
    providerUsed: string | null;
    errorMessage: string | null;
    draftCounts: Record<string, number>;
  } | null;
}

export const uploadsApi = {
  list: async (params: { status?: UploadStatus; limit?: number; offset?: number; q?: string; uploadedBy?: string } = {}): Promise<PaginatedResponse<Upload>> => {
    const r = await apiClient.get<PaginatedResponse<Upload>>('/uploads', { params });
    return r.data;
  },
  get: async (id: string): Promise<UploadDetail> => {
    const r = await apiClient.get<ApiEnvelope<UploadDetail>>(`/uploads/${id}`);
    return r.data.data;
  },
  create: async (body: {
    originalName: string;
    mimeType: string;
    sizeBytes?: number;
    programId?: string;
    subjectId?: string;
    /** Storage folder: 'question-images' | 'ocr-papers' | 'uploads' (default). */
    category?: 'question-images' | 'ocr-papers' | 'uploads';
  }): Promise<SignedUpload> => {
    const r = await apiClient.post<ApiEnvelope<SignedUpload>>('/uploads', body);
    return r.data.data;
  },
  complete: async (id: string): Promise<Upload> => {
    const r = await apiClient.post<ApiEnvelope<Upload>>(`/uploads/${id}/complete`);
    return r.data.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/uploads/${id}`);
  },
};
