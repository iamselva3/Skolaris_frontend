import { apiClient } from './client';
import type { ApiEnvelope } from '../types';

export interface ExamSummary {
  totalAttempts: number;
  submittedCount: number;
  gradedCount: number;
  avgScore: number;
  distribution: Array<{ bucket: string; count: number }>;
}

export interface ExamQuestionStat {
  examQuestionId: string;
  questionId: string;
  totalAnswered: number;
  correctCount: number;
  avgTimeSeconds: number;
  flag: 'too_easy' | 'too_hard' | 'ambiguous' | 'normal';
}

export interface WeakTopic {
  subject: string;
  topic: string;
  scorePercent: number;
  recommendation: string;
}

export const analyticsApi = {
  examSummary: async (examId: string): Promise<ExamSummary> => {
    const r = await apiClient.get<ApiEnvelope<ExamSummary>>(`/analytics/exams/${examId}/summary`);
    return r.data.data;
  },
  examQuestions: async (examId: string): Promise<ExamQuestionStat[]> => {
    const r = await apiClient.get<ApiEnvelope<ExamQuestionStat[]>>(`/analytics/exams/${examId}/questions`);
    return r.data.data;
  },
  myWeakTopics: async (): Promise<WeakTopic[]> => {
    const r = await apiClient.get<ApiEnvelope<WeakTopic[]>>('/me/reports/weak-topics');
    return r.data.data;
  },
};
