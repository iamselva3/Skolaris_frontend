import { apiClient } from './client';

export type DeliveryChannel = 'EMAIL' | 'SMS' | 'PUSH' | 'WHATSAPP' | 'IN_APP';

export type CommunicationType =
  | 'EXAM_ALERT'
  | 'REPORT_PUBLISHED'
  | 'ATTENDANCE_ALERT'
  | 'FEE_REMINDER'
  | 'CIRCULAR'
  | 'ANNOUNCEMENT'
  | 'GENERAL';

export type CommunicationStatus = 'SENT' | 'FAILED' | 'SCHEDULED' | 'PARTIAL';

export interface Communication {
  id: string;
  title: string;
  body: string;
  type: CommunicationType;
  channel: DeliveryChannel;
  status: CommunicationStatus;
  audience: string | null;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  sentById: string | null;
  sentByName: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationsPage {
  data: Communication[];
  meta: { total: number; limit: number; offset: number };
}

export interface ListCommunicationsParams {
  q?: string;
  type?: CommunicationType;
  channel?: DeliveryChannel;
  status?: CommunicationStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export const communicationsApi = {
  list: async (params: ListCommunicationsParams = {}): Promise<CommunicationsPage> => {
    const r = await apiClient.get<CommunicationsPage>('/communications', { params });
    return r.data;
  },
  get: async (id: string): Promise<Communication> => {
    const r = await apiClient.get<{ data: Communication }>(`/communications/${id}`);
    return r.data.data;
  },
};
