import axios, { AxiosError, type AxiosInstance } from 'axios';
import { tokenStorage } from '../auth/token-storage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccess();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let waitQueue: Array<(token: string | null) => void> = [];

const drainQueue = (token: string | null): void => {
  waitQueue.forEach((cb) => cb(token));
  waitQueue = [];
};

apiClient.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    const status = error.response?.status;

    // 401 on a non-auth request → try refresh exactly once.
    if (
      status === 401 &&
      original &&
      !original._retried &&
      !original.url?.includes('/auth/login') &&
      !original.url?.includes('/auth/refresh')
    ) {
      original._retried = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          waitQueue.push((token) => {
            if (!token) return reject(error);
            original.headers!.Authorization = `Bearer ${token}`;
            resolve(apiClient(original));
          });
        });
      }

      const refreshToken = tokenStorage.getRefresh();
      if (!refreshToken) {
        handleLogout();
        return Promise.reject(error);
      }

      isRefreshing = true;
      try {
        const resp = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken });
        const newAccess = resp.data.data.accessToken as string;
        const newRefresh = resp.data.data.refreshToken as string;
        tokenStorage.set(newAccess, newRefresh);
        drainQueue(newAccess);
        original.headers!.Authorization = `Bearer ${newAccess}`;
        return apiClient(original);
      } catch (refreshErr) {
        drainQueue(null);
        handleLogout();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

const handleLogout = (): void => {
  tokenStorage.clear();
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
};

export const apiErrorMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join(', ') : data.message;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Unknown error';
};
