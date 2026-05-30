import { apiClient } from './client';
import type {
  ApiEnvelope,
  AttemptStatus,
  ExamStatus,
  PaginatedResponse,
} from '../types';

export interface AntiCheatConfig {
  requireFullscreen: boolean;
  blockCopyPaste: boolean;
  blockRightClick: boolean;
  tabSwitchThreshold: number;
  totalViolationThreshold: number;
  flagAtViolationCount: number;
}

export interface Exam {
  id: string;
  tenantId: string;
  createdBy: string;
  title: string;
  description: string | null;
  durationSeconds: number;
  totalMarks: number;
  defaultNegativeMarks: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  status: ExamStatus;
  opensAt: string | null;
  closesAt: string | null;
  testMode: 'ONLINE' | 'OFFLINE_PRINT';
  publishedAt: string | null;
  antiCheatConfig: AntiCheatConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ExamSection {
  id: string;
  name: string;
  position: number;
  timeLimitSeconds: number | null;
}

export interface ExamQuestion {
  id: string;
  questionId: string;
  sectionId: string | null;
  position: number;
  marks: number;
  negativeMarks: number;
}

export interface ExamAssignment {
  id: string;
  classroomId: string | null;
  studentId: string | null;
}

export interface ExamDetail extends Exam {
  sections: ExamSection[];
  questions: ExamQuestion[];
  assignments: ExamAssignment[];
}

export interface ExamAttemptSummary {
  id: string;
  examId: string;
  studentId: string;
  status: AttemptStatus;
  startedAt: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  score: number | null;
  autoSubmitted: boolean;
  violationCount: number;
  descriptivePending: boolean;
}

export interface CreateExamBody {
  title: string;
  description?: string;
  durationSeconds: number;
  defaultNegativeMarks?: number;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  opensAt?: string;
  closesAt?: string;
  testMode?: 'ONLINE' | 'OFFLINE_PRINT';
  antiCheatConfig?: Partial<AntiCheatConfig>;
}

export interface AddExamQuestionItem {
  questionId: string;
  sectionId?: string;
  position: number;
  marks: number;
  negativeMarks?: number;
}

export const examsApi = {
  list: async (params: {
    status?: ExamStatus;
    createdBy?: string;
    q?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<PaginatedResponse<Exam>> => {
    const r = await apiClient.get<PaginatedResponse<Exam>>('/exams', { params });
    return r.data;
  },
  get: async (id: string): Promise<ExamDetail> => {
    const r = await apiClient.get<ApiEnvelope<ExamDetail>>(`/exams/${id}`);
    return r.data.data;
  },
  create: async (body: CreateExamBody): Promise<Exam> => {
    const r = await apiClient.post<ApiEnvelope<Exam>>('/exams', body);
    return r.data.data;
  },
  update: async (id: string, body: Partial<CreateExamBody>): Promise<Exam> => {
    const r = await apiClient.patch<ApiEnvelope<Exam>>(`/exams/${id}`, body);
    return r.data.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/exams/${id}`);
  },
  addQuestions: async (id: string, items: AddExamQuestionItem[]): Promise<ExamQuestion[]> => {
    const r = await apiClient.post<ApiEnvelope<ExamQuestion[]>>(`/exams/${id}/questions`, { items });
    return r.data.data;
  },
  removeQuestion: async (examId: string, examQuestionId: string): Promise<void> => {
    await apiClient.delete(`/exams/${examId}/questions/${examQuestionId}`);
  },
  assign: async (id: string, body: { classroomIds?: string[]; studentIds?: string[] }): Promise<unknown> => {
    const r = await apiClient.post(`/exams/${id}/assign`, body);
    return r.data;
  },
  publish: async (id: string): Promise<{ exam: Exam; attemptsCreated: number; notificationsCreated: number }> => {
    const r = await apiClient.post<ApiEnvelope<{ exam: Exam; attemptsCreated: number; notificationsCreated: number }>>(
      `/exams/${id}/publish`,
    );
    return r.data.data;
  },
  close: async (id: string): Promise<{ exam: Exam; attemptsAutoSubmitted: number }> => {
    const r = await apiClient.post<ApiEnvelope<{ exam: Exam; attemptsAutoSubmitted: number }>>(`/exams/${id}/close`);
    return r.data.data;
  },
  listAttempts: async (id: string, params: { limit?: number; offset?: number } = {}): Promise<PaginatedResponse<ExamAttemptSummary>> => {
    const r = await apiClient.get<PaginatedResponse<ExamAttemptSummary>>(`/exams/${id}/attempts`, { params });
    return r.data;
  },
  getAttempt: async (examId: string, attemptId: string): Promise<{
    attempt: ExamAttemptSummary;
    answers: Array<{
      id: string;
      examQuestionId: string;
      answerPayload: Record<string, unknown> | null;
      isCorrect: boolean | null;
      marksAwarded: number | null;
      timeSpentSeconds: number;
      isFlaggedByStudent: boolean;
    }>;
    violations: Array<{
      id: string;
      type: string;
      detail: Record<string, unknown> | null;
      clientTimestamp: string;
      serverTimestamp: string;
    }>;
  }> => {
    const r = await apiClient.get<
      ApiEnvelope<{
        attempt: ExamAttemptSummary;
        answers: Array<{
          id: string;
          examQuestionId: string;
          answerPayload: Record<string, unknown> | null;
          isCorrect: boolean | null;
          marksAwarded: number | null;
          timeSpentSeconds: number;
          isFlaggedByStudent: boolean;
        }>;
        violations: Array<{
          id: string;
          type: string;
          detail: Record<string, unknown> | null;
          clientTimestamp: string;
          serverTimestamp: string;
        }>;
      }>
    >(`/exams/${examId}/attempts/${attemptId}`);
    return r.data.data;
  },
};
