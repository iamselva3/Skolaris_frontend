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
  attemptsCount?: number;
  correctCount?: number;
  recommendation: string;
}

export interface MySummary {
  attemptsTotal: number;
  avgScore: number; // accuracy %, 0-100
  weakTopicsCount: number;
}

export interface SubjectPerformance {
  subject: string;
  scorePercent: number;
  attemptsCount: number;
  correctCount: number;
  topicsCount: number;
  weakCount: number;
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
  mySummary: async (): Promise<MySummary> => {
    const r = await apiClient.get<ApiEnvelope<MySummary>>('/me/reports/summary');
    return r.data.data;
  },
  mySubjects: async (): Promise<SubjectPerformance[]> => {
    const r = await apiClient.get<ApiEnvelope<SubjectPerformance[]>>('/me/reports/subjects');
    return r.data.data;
  },
};
