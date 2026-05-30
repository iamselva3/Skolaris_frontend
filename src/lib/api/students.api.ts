import { apiClient } from './client';
import type { ApiEnvelope, PaginatedResponse } from '../types';

export interface Student {
  id: string;
  tenantId: string;
  userId: string;
  branchId: string | null;
  email: string;
  name: string;
  classLabel: string | null;
  rollNo: string | null;
  parentContact: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  updatedAt: string;
}

export interface ListStudentsQuery {
  branchId?: string;
  classroomId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface CreateStudentBody {
  email: string;
  name: string;
  password: string;
  branchId: string;
  classLabel?: string;
  rollNo?: string;
  parentContact?: string;
}

export interface UpdateStudentProfileBody {
  classLabel?: string | null;
  rollNo?: string | null;
  parentContact?: string | null;
  branchId?: string;
}

export interface UpdateStudentUserBody {
  name?: string;
  status?: 'ACTIVE' | 'DISABLED';
  branchId?: string | null;
}

export const studentsApi = {
  list: async (params: ListStudentsQuery = {}): Promise<PaginatedResponse<Student>> => {
    const r = await apiClient.get<PaginatedResponse<Student>>('/students', { params });
    return r.data;
  },
  get: async (id: string): Promise<Student> => {
    const r = await apiClient.get<ApiEnvelope<Student>>(`/students/${id}`);
    return r.data.data;
  },
  create: async (body: CreateStudentBody): Promise<Student> => {
    const r = await apiClient.post<ApiEnvelope<Student>>('/students', body);
    return r.data.data;
  },
  /** Update student-profile fields (classLabel, rollNo, parentContact, branchId). */
  update: async (id: string, body: UpdateStudentProfileBody): Promise<Student> => {
    const r = await apiClient.patch<ApiEnvelope<Student>>(`/students/${id}`, body);
    return r.data.data;
  },
  /**
   * Update the underlying user record for a student (name, status, branchId).
   * Calls PATCH /users/:userId — requires SUPER_ADMIN.
   */
  updateUser: async (userId: string, body: UpdateStudentUserBody): Promise<void> => {
    await apiClient.patch(`/users/${userId}`, body);
  },
  disable: async (id: string): Promise<void> => {
    await apiClient.delete(`/students/${id}`);
  },
};
