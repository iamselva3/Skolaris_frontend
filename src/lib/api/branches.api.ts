import { apiClient } from './client';
import type { ApiEnvelope, PaginatedResponse } from '../types';

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const branchesApi = {
  list: async (params: { limit?: number; offset?: number } = {}): Promise<PaginatedResponse<Branch>> => {
    const r = await apiClient.get<PaginatedResponse<Branch>>('/branches', { params });
    return r.data;
  },
  get: async (id: string): Promise<Branch> => {
    const r = await apiClient.get<ApiEnvelope<Branch>>(`/branches/${id}`);
    return r.data.data;
  },
  create: async (data: { name: string }): Promise<Branch> => {
    const r = await apiClient.post<ApiEnvelope<Branch>>('/branches', data);
    return r.data.data;
  },
  update: async (id: string, data: { name: string }): Promise<Branch> => {
    const r = await apiClient.patch<ApiEnvelope<Branch>>(`/branches/${id}`, data);
    return r.data.data;
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/branches/${id}`);
  },
};
