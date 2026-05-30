import { apiClient } from './client';
import type { ApiEnvelope } from '../types';

export interface Notification {
  id: string;
  channel: 'IN_APP' | 'EMAIL';
  subject: string;
  body: string;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationsPage {
  data: Notification[];
  meta: { total: number; unread: number; limit: number; offset: number };
}

export const notificationsApi = {
  list: async (params: { limit?: number; offset?: number } = {}): Promise<NotificationsPage> => {
    const r = await apiClient.get<NotificationsPage>('/dashboard/teacher/notifications', { params });
    return r.data;
  },
  markRead: async (id: string): Promise<void> => {
    await apiClient.post<ApiEnvelope<{ id: string; readAt: string | null }>>(
      `/dashboard/teacher/notifications/${id}/read`,
    );
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/dashboard/teacher/notifications/${id}`);
  },
  clearAll: async (): Promise<void> => {
    await apiClient.delete('/dashboard/teacher/notifications');
  },
};
