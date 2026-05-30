import { apiClient } from './client';
import type { ApiEnvelope, PaginatedResponse, Role } from '../types';

export interface User {
  id: string;
  tenantId: string;
  branchId: string | null;
  email: string;
  name: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserBody {
  email: string;
  name: string;
  password: string;
  role: Role;
  branchId?: string;
}

export interface UpdateUserBody {
  name?: string;
  branchId?: string | null;
  status?: 'ACTIVE' | 'DISABLED';
}

/** Teachers list is just /users?role=TEACHER. */
export const teachersApi = {
  list: async (params: { branchId?: string; limit?: number; offset?: number } = {}): Promise<PaginatedResponse<User>> => {
    const r = await apiClient.get<PaginatedResponse<User>>('/users', {
      params: { ...params, role: 'TEACHER' },
    });
    return r.data;
  },
  get: async (id: string): Promise<User> => {
    const r = await apiClient.get<ApiEnvelope<User>>(`/users/${id}`);
    return r.data.data;
  },
  create: async (body: CreateUserBody): Promise<User> => {
    const r = await apiClient.post<ApiEnvelope<User>>('/users', body);
    return r.data.data;
  },
  /** SUPER_ADMIN: update a teacher's name, branch assignment, or active status. */
  update: async (id: string, body: UpdateUserBody): Promise<User> => {
    const r = await apiClient.patch<ApiEnvelope<User>>(`/users/${id}`, body);
    return r.data.data;
  },
  disable: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  },
};
