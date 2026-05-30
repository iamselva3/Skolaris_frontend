import { apiClient } from './client';
import type { AttemptStatus, PaginatedResponse } from '../types';

export interface AttemptRow {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  status: AttemptStatus;
  score: number | null;
  autoSubmitted: boolean;
  violationCount: number;
  startedAt: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
}

export interface ListAttemptsParams {
  examId?: string;
  studentId?: string;
  status?: AttemptStatus;
  from?: string;
  to?: string;
  hasViolations?: boolean;
  limit?: number;
  offset?: number;
}

export const attemptsAdminApi = {
  list: async (params: ListAttemptsParams = {}): Promise<PaginatedResponse<AttemptRow>> => {
    const r = await apiClient.get<PaginatedResponse<AttemptRow>>('/attempts', {
      params: {
        examId: params.examId,
        studentId: params.studentId,
        status: params.status,
        from: params.from,
        to: params.to,
        hasViolations: params.hasViolations ? 'true' : undefined,
        limit: params.limit,
        offset: params.offset,
      },
    });
    return r.data;
  },
};
