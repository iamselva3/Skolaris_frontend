import { apiClient } from './client';
import type {
  ApiEnvelope,
  Difficulty,
  PaginatedResponse,
  QuestionType,
} from '../types';

export interface QuestionOption {
  id: string;
  label: string;
  isCorrect: boolean;
  position: number;
}

export interface Question {
  id: string;
  tenantId: string;
  createdBy: string;
  sourceUploadId: string | null;
  type: QuestionType;
  payload: Record<string, unknown>;
  programId: string | null;
  subjectId: string | null;
  topicId: string | null;
  chapterId: string | null;
  /** Denormalized for analytics; auto-populated from Subject.name when subjectId is set. */
  subject: string | null;
  /** Denormalized for analytics; auto-populated from Topic.name when topicId is set. */
  topic: string | null;
  difficulty: Difficulty;
  isActive: boolean;
  options: QuestionOption[];
  createdAt: string;
  updatedAt: string;
}

export interface ListQuestionsQuery {
  programId?: string;
  subjectId?: string;
  topicId?: string;
  chapterId?: string;
  subject?: string;
  topic?: string;
  difficulty?: Difficulty;
  type?: QuestionType;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface CreateQuestionBody {
  type: QuestionType;
  payload: Record<string, unknown>;
  options?: Array<{ label: string; isCorrect: boolean }>;
  programId?: string;
  subjectId?: string;
  topicId?: string;
  chapterId?: string;
  subject?: string;
  topic?: string;
  difficulty?: Difficulty;
}

export const questionsApi = {
  list: async (params: ListQuestionsQuery = {}): Promise<PaginatedResponse<Question>> => {
    const r = await apiClient.get<PaginatedResponse<Question>>('/questions', { params });
    return r.data;
  },
  get: async (id: string): Promise<Question> => {
    const r = await apiClient.get<ApiEnvelope<Question>>(`/questions/${id}`);
    return r.data.data;
  },
  create: async (body: CreateQuestionBody): Promise<Question> => {
    const r = await apiClient.post<ApiEnvelope<Question>>('/questions', body);
    return r.data.data;
  },
  update: async (id: string, body: Partial<CreateQuestionBody>): Promise<Question> => {
    const r = await apiClient.patch<ApiEnvelope<Question>>(`/questions/${id}`, body);
    return r.data.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/questions/${id}`);
  },
};
