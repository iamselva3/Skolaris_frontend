import { apiClient } from './client';
import type { ApiEnvelope, Role } from '../types';

export interface User {
  id: string;
  tenantId: string;
  branchId: string | null;
  email: string;
  name: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
}

export interface UpdateUserBody {
  name?: string;
  password?: string;
  branchId?: string | null;
  status?: 'ACTIVE' | 'DISABLED';
}

export const usersApi = {
  update: async (id: string, body: UpdateUserBody): Promise<User> => {
    const r = await apiClient.patch<ApiEnvelope<User>>(`/users/${id}`, body);
    return r.data.data;
  },
};
