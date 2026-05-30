import { apiClient } from './client';
import type { ApiEnvelope, Role } from '../types';
import type { CurrentUser } from '../auth/auth-store';

export interface LoginInput {
  email: string;
  password: string;
  tenantSlug?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

interface MeResponse {
  id: string;
  tenantId: string;
  branchId: string | null;
  email: string;
  name: string;
  role: Role;
}

export const authApi = {
  login: async (input: LoginInput): Promise<AuthTokens> => {
    const r = await apiClient.post<ApiEnvelope<AuthTokens>>('/auth/login', input);
    return r.data.data;
  },
  me: async (): Promise<CurrentUser> => {
    const r = await apiClient.get<ApiEnvelope<MeResponse>>('/auth/me');
    return r.data.data;
  },
  logout: async (refreshToken: string | null): Promise<void> => {
    await apiClient.post('/auth/logout', refreshToken ? { refreshToken } : {});
  },
};
