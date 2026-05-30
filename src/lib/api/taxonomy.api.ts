import { apiClient } from './client';
import type { ApiEnvelope } from '../types';

/* ────────────────────────── Types ────────────────────────── */

export interface Program {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Subject {
  id: string;
  programId: string;
  program?: { id: string; code: string; name: string };
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  id: string;
  subjectId: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  topicId: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** Convenience: the full {program, subject, topic, chapter} selection. */
export interface TaxonomySelection {
  programId?: string | null;
  subjectId?: string | null;
  topicId?: string | null;
  chapterId?: string | null;
}

/* ────────────────────────── Programs ────────────────────────── */

export const programsApi = {
  list: async (): Promise<Program[]> => {
    const r = await apiClient.get<ApiEnvelope<Program[]>>('/programs');
    return r.data.data;
  },
  get: async (id: string): Promise<Program> => {
    const r = await apiClient.get<ApiEnvelope<Program>>(`/programs/${id}`);
    return r.data.data;
  },
  create: async (body: { code: string; name: string }): Promise<Program> => {
    const r = await apiClient.post<ApiEnvelope<Program>>('/programs', body);
    return r.data.data;
  },
  update: async (id: string, body: { name?: string; isActive?: boolean }): Promise<Program> => {
    const r = await apiClient.patch<ApiEnvelope<Program>>(`/programs/${id}`, body);
    return r.data.data;
  },
};

/* ────────────────────────── Subjects ────────────────────────── */

export const subjectsApi = {
  list: async (params: { programId?: string; isActive?: '0' | '1' } = {}): Promise<Subject[]> => {
    const r = await apiClient.get<ApiEnvelope<Subject[]>>('/subjects', { params });
    return r.data.data;
  },
  get: async (id: string): Promise<Subject> => {
    const r = await apiClient.get<ApiEnvelope<Subject>>(`/subjects/${id}`);
    return r.data.data;
  },
  create: async (body: { programId: string; name: string }): Promise<Subject> => {
    const r = await apiClient.post<ApiEnvelope<Subject>>('/subjects', body);
    return r.data.data;
  },
  update: async (id: string, body: { name?: string; isActive?: boolean }): Promise<Subject> => {
    const r = await apiClient.patch<ApiEnvelope<Subject>>(`/subjects/${id}`, body);
    return r.data.data;
  },
  mySubjects: async (): Promise<Subject[]> => {
    const r = await apiClient.get<ApiEnvelope<Subject[]>>('/me/subjects');
    return r.data.data;
  },
};

/* ────────────────────────── Topics ────────────────────────── */

export const topicsApi = {
  list: async (params: { subjectId?: string } = {}): Promise<Topic[]> => {
    const r = await apiClient.get<ApiEnvelope<Topic[]>>('/topics', { params });
    return r.data.data;
  },
  get: async (id: string): Promise<Topic> => {
    const r = await apiClient.get<ApiEnvelope<Topic>>(`/topics/${id}`);
    return r.data.data;
  },
  create: async (body: { subjectId: string; name: string; position?: number }): Promise<Topic> => {
    const r = await apiClient.post<ApiEnvelope<Topic>>('/topics', body);
    return r.data.data;
  },
  update: async (id: string, body: { name?: string; position?: number }): Promise<Topic> => {
    const r = await apiClient.patch<ApiEnvelope<Topic>>(`/topics/${id}`, body);
    return r.data.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/topics/${id}`);
  },
};

/* ────────────────────────── Chapters ────────────────────────── */

export const chaptersApi = {
  list: async (params: { topicId?: string } = {}): Promise<Chapter[]> => {
    const r = await apiClient.get<ApiEnvelope<Chapter[]>>('/chapters', { params });
    return r.data.data;
  },
  get: async (id: string): Promise<Chapter> => {
    const r = await apiClient.get<ApiEnvelope<Chapter>>(`/chapters/${id}`);
    return r.data.data;
  },
  create: async (body: { topicId: string; name: string; position?: number }): Promise<Chapter> => {
    const r = await apiClient.post<ApiEnvelope<Chapter>>('/chapters', body);
    return r.data.data;
  },
  update: async (id: string, body: { name?: string; position?: number }): Promise<Chapter> => {
    const r = await apiClient.patch<ApiEnvelope<Chapter>>(`/chapters/${id}`, body);
    return r.data.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/chapters/${id}`);
  },
};
