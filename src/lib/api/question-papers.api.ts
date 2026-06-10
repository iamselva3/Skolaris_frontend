import { apiClient } from './client';
import type { ApiEnvelope, PaginatedResponse, QuestionType, Difficulty } from '../types';

export type PaperStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** A standalone Question Paper (its own entity, decoupled from Exam). */
export interface QuestionPaper {
  id: string;
  title: string;
  description: string | null;
  programId: string | null;
  subjectId: string | null;
  durationSeconds: number;
  defaultNegativeMarks: number;
  totalMarks: number;
  status: PaperStatus;
  questionCount: number;
  subjects: string[];
  createdBy: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One question on a paper, joined with its bank Question for preview. */
export interface PaperQuestion {
  id: string;
  questionId: string;
  position: number;
  marks: number;
  negativeMarks: number;
  type: QuestionType;
  difficulty: Difficulty;
  subject: string | null;
  topic: string | null;
  payload: Record<string, unknown>;
  options: Array<{ id: string; label: string; isCorrect: boolean; position: number }>;
}

export interface QuestionPaperDetail extends QuestionPaper {
  questions: PaperQuestion[];
}

export interface QuestionPapersSummary {
  total: number;
  draft: number;
  published: number;
  archived: number;
}

export interface CreateQuestionPaperBody {
  title: string;
  description?: string;
  programId?: string;
  subjectId?: string;
  durationSeconds: number;
  defaultNegativeMarks?: number;
}

export type UpdateQuestionPaperBody = Partial<CreateQuestionPaperBody> & {
  status?: 'DRAFT' | 'PUBLISHED';
};

export interface GenerateRule {
  subjectId?: string;
  chapterId?: string;
  topicId?: string;
  difficulty?: Difficulty;
  count: number;
}

export const questionPapersApi = {
  list: async (
    params: {
      status?: PaperStatus;
      programId?: string;
      subjectId?: string;
      q?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<PaginatedResponse<QuestionPaper>> => {
    const r = await apiClient.get<PaginatedResponse<QuestionPaper>>('/question-papers', { params });
    return r.data;
  },
  summary: async (): Promise<QuestionPapersSummary> => {
    const r = await apiClient.get<ApiEnvelope<QuestionPapersSummary>>('/question-papers/summary');
    return r.data.data;
  },
  get: async (id: string): Promise<QuestionPaperDetail> => {
    const r = await apiClient.get<ApiEnvelope<QuestionPaperDetail>>(`/question-papers/${id}`);
    return r.data.data;
  },
  create: async (body: CreateQuestionPaperBody): Promise<QuestionPaper> => {
    const r = await apiClient.post<ApiEnvelope<QuestionPaper>>('/question-papers', body);
    return r.data.data;
  },
  update: async (id: string, body: UpdateQuestionPaperBody): Promise<QuestionPaper> => {
    const r = await apiClient.patch<ApiEnvelope<QuestionPaper>>(`/question-papers/${id}`, body);
    return r.data.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/question-papers/${id}`);
  },
  clone: async (id: string): Promise<QuestionPaper> => {
    const r = await apiClient.post<ApiEnvelope<QuestionPaper>>(`/question-papers/${id}/clone`);
    return r.data.data;
  },
  archive: async (id: string): Promise<QuestionPaper> => {
    const r = await apiClient.post<ApiEnvelope<QuestionPaper>>(`/question-papers/${id}/archive`);
    return r.data.data;
  },
  unarchive: async (id: string): Promise<QuestionPaper> => {
    const r = await apiClient.post<ApiEnvelope<QuestionPaper>>(`/question-papers/${id}/unarchive`);
    return r.data.data;
  },
  addQuestions: async (
    id: string,
    items: Array<{ questionId: string; marks?: number; negativeMarks?: number }>,
  ): Promise<QuestionPaper> => {
    const r = await apiClient.post<ApiEnvelope<QuestionPaper>>(`/question-papers/${id}/questions`, {
      items,
    });
    return r.data.data;
  },
  removeQuestion: async (id: string, questionId: string): Promise<QuestionPaper> => {
    const r = await apiClient.delete<ApiEnvelope<QuestionPaper>>(
      `/question-papers/${id}/questions/${questionId}`,
    );
    return r.data.data;
  },
  reorder: async (
    id: string,
    order: Array<{ questionId: string; position: number }>,
  ): Promise<QuestionPaperDetail> => {
    const r = await apiClient.patch<ApiEnvelope<QuestionPaperDetail>>(
      `/question-papers/${id}/questions/reorder`,
      { order },
    );
    return r.data.data;
  },
  generate: async (id: string, rules: GenerateRule[]): Promise<QuestionPaper> => {
    const r = await apiClient.post<ApiEnvelope<QuestionPaper>>(`/question-papers/${id}/generate`, {
      rules,
    });
    return r.data.data;
  },
};
