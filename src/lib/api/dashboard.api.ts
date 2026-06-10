import { apiClient } from './client';
import type { ApiEnvelope } from '../types';

/** Backend response shape for GET /dashboard/summary. */
export interface DashboardSummary {
  students: { total: number; newThisWeek: number; weakTopicAlerts: number };
  teachers: { total: number; activeToday: number };
  exams: { liveNow: number; scheduledThisWeek: number };
  questionBank: { totalApproved: number; draftsPending: number };
  uploads: { uploadedToday: number; reviewQueueCount: number };
  createExam: { drafts: number; lastPublishedAt: string | null };
  notifications: { unread: number; totalToday: number };

  ocrReviewQueue: Array<{
    id: string;
    fileName: string;
    program: string | null;
    subject: string | null;
    draftCount: number;
    uploadedAt: string;
  }>;

  todaysExams: Array<{
    id: string;
    program: string | null;
    title: string;
    opensAt: string | null;
    closesAt: string | null;
    status: 'SCHEDULED' | 'LIVE' | 'CLOSED';
    assignedCount: number;
    inProgressCount: number;
  }>;
}

export const dashboardApi = {
  /**
   * KPI summary. Pass the active branch to scope every card to that branch;
   * omit (or null) for tenant-wide "All branches". Teachers are pinned to their
   * own branch server-side regardless of what is sent.
   */
  summary: async (branchId?: string | null): Promise<DashboardSummary> => {
    const r = await apiClient.get<ApiEnvelope<DashboardSummary>>('/dashboard/summary', {
      params: branchId ? { branchId } : undefined,
    });
    return r.data.data;
  },
};
