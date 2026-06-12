import { apiClient } from './client';
import type { ApiEnvelope, AttemptStatus, QuestionType, ViolationType } from '../types';

export interface MyExamItem {
  attemptId: string;
  examId: string;
  examTitle: string;
  durationSeconds: number;
  totalMarks: number;
  opensAt: string | null;
  closesAt: string | null;
  status: AttemptStatus;
  score: number | null;
  submittedAt: string | null;
}

export interface AttemptQuestion {
  examQuestionId: string;
  questionId: string;
  type: QuestionType;
  payload: Record<string, unknown>;
  options: Array<{ id: string; label: string; position: number }>;
  marks: number;
  negativeMarks: number;
}

export interface StartAttemptResponse {
  attempt: {
    id: string;
    status: AttemptStatus;
    timeRemainingSeconds: number | null;
    startedAt: string | null;
  };
  questions: AttemptQuestion[];
}

export interface MyAttemptDetail {
  attempt: {
    id: string;
    status: AttemptStatus;
    timeRemainingSeconds: number | null;
    startedAt: string | null;
  };
  answers: Array<{
    examQuestionId: string;
    answerPayload: Record<string, unknown> | null;
    timeSpentSeconds: number;
    isFlaggedByStudent: boolean;
  }>;
}

export interface AttemptResult {
  attemptId: string;
  examId: string;
  examTitle: string;
  score: number;
  totalMarks: number;
  status: AttemptStatus;
  autoSubmitted: boolean;
  descriptivePending: boolean;
  perQuestion: Array<{
    examQuestionId: string;
    questionId: string;
    isCorrect: boolean | null;
    marksAwarded: number | null;
    timeSpentSeconds: number;
  }>;
}

export const attemptsApi = {
  listMyExams: async (): Promise<MyExamItem[]> => {
    const r = await apiClient.get<ApiEnvelope<MyExamItem[]>>('/me/exams');
    return r.data.data;
  },
  getMyExam: async (examId: string): Promise<{
    examId: string;
    title: string;
    description: string | null;
    durationSeconds: number;
    totalMarks: number;
    opensAt: string | null;
    closesAt: string | null;
    status: string;
    attempt: { id: string; status: AttemptStatus; timeRemainingSeconds: number | null };
  }> => {
    const r = await apiClient.get<
      ApiEnvelope<{
        examId: string;
        title: string;
        description: string | null;
        durationSeconds: number;
        totalMarks: number;
        opensAt: string | null;
        closesAt: string | null;
        status: string;
        attempt: { id: string; status: AttemptStatus; timeRemainingSeconds: number | null };
      }>
    >(`/me/exams/${examId}`);
    return r.data.data;
  },
  start: async (examId: string): Promise<StartAttemptResponse> => {
    const r = await apiClient.post<ApiEnvelope<StartAttemptResponse>>(`/me/exams/${examId}/start`);
    return r.data.data;
  },
  getMyAttempt: async (attemptId: string): Promise<MyAttemptDetail> => {
    const r = await apiClient.get<ApiEnvelope<MyAttemptDetail>>(`/me/attempts/${attemptId}`);
    return r.data.data;
  },
  upsertAnswer: async (
    attemptId: string,
    examQuestionId: string,
    body: { answerPayload: Record<string, unknown> | null; timeSpentSeconds?: number; isFlagged?: boolean },
  ): Promise<void> => {
    await apiClient.patch(`/me/attempts/${attemptId}/answers/${examQuestionId}`, body);
  },
  heartbeat: async (
    attemptId: string,
    clientTimeRemainingSeconds: number,
  ): Promise<{ serverTimeRemainingSeconds: number; autoSubmitted: boolean }> => {
    const r = await apiClient.post<
      ApiEnvelope<{ serverTimeRemainingSeconds: number; autoSubmitted: boolean }>
    >(`/me/attempts/${attemptId}/heartbeat`, { clientTimeRemainingSeconds });
    return r.data.data;
  },
  submit: async (attemptId: string): Promise<{ attemptId: string; submittedAt: string | null; status: AttemptStatus }> => {
    const r = await apiClient.post<
      ApiEnvelope<{ attemptId: string; submittedAt: string | null; status: AttemptStatus }>
    >(`/me/attempts/${attemptId}/submit`);
    return r.data.data;
  },
  result: async (attemptId: string): Promise<AttemptResult> => {
    const r = await apiClient.get<ApiEnvelope<AttemptResult>>(`/me/attempts/${attemptId}/result`);
    return r.data.data;
  },
  recordViolations: async (
    attemptId: string,
    events: Array<{ type: ViolationType; clientTimestamp: string; detail?: Record<string, unknown> }>,
  ): Promise<{ inserted: number; totalViolations: number; autoSubmitted: boolean; flagged: boolean }> => {
    const r = await apiClient.post<
      ApiEnvelope<{ inserted: number; totalViolations: number; autoSubmitted: boolean; flagged: boolean }>
    >(`/me/attempts/${attemptId}/violations`, { events });
    return r.data.data;
  },
};
