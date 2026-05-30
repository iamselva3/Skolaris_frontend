import { apiClient } from './client';
import type { ApiEnvelope, PaginatedResponse } from '../types';
import type { Student } from './students.api';

export interface Classroom {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  year: string | null;
  section: string | null;
  subject: string | null;
  createdBy: string;
  studentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClassroomBody {
  name: string;
  branchId: string;
  year?: string;
  section?: string;
  subject?: string;
}

export const classroomsApi = {
  list: async (params: { branchId?: string; limit?: number; offset?: number } = {}): Promise<PaginatedResponse<Classroom>> => {
    const r = await apiClient.get<PaginatedResponse<Classroom>>('/classrooms', { params });
    return r.data;
  },
  get: async (id: string): Promise<Classroom> => {
    const r = await apiClient.get<ApiEnvelope<Classroom>>(`/classrooms/${id}`);
    return r.data.data;
  },
  create: async (body: CreateClassroomBody): Promise<Classroom> => {
    const r = await apiClient.post<ApiEnvelope<Classroom>>('/classrooms', body);
    return r.data.data;
  },
  update: async (id: string, body: Partial<CreateClassroomBody>): Promise<Classroom> => {
    const r = await apiClient.patch<ApiEnvelope<Classroom>>(`/classrooms/${id}`, body);
    return r.data.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/classrooms/${id}`);
  },
  addStudents: async (id: string, studentIds: string[]): Promise<{ added: string[]; alreadyMember: string[] }> => {
    const r = await apiClient.post<ApiEnvelope<{ added: string[]; alreadyMember: string[] }>>(
      `/classrooms/${id}/students`,
      { studentIds },
    );
    return r.data.data;
  },
  removeStudent: async (id: string, studentId: string): Promise<void> => {
    await apiClient.delete(`/classrooms/${id}/students/${studentId}`);
  },
  listStudents: async (id: string, params: { limit?: number; offset?: number } = {}): Promise<PaginatedResponse<Student>> => {
    const r = await apiClient.get<PaginatedResponse<Student>>(`/classrooms/${id}/students`, { params });
    return r.data;
  },
};
