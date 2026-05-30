import { create } from 'zustand';
import type { Role } from '../types';
import { tokenStorage } from './token-storage';

export interface CurrentUser {
  id: string;
  tenantId: string;
  branchId: string | null;
  email: string;
  name: string;
  role: Role;
}

interface AuthState {
  user: CurrentUser | null;
  hasToken: boolean;
  setUser: (u: CurrentUser | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  hasToken: Boolean(tokenStorage.getAccess()),
  setUser: (u) => set({ user: u }),
  setTokens: (accessToken, refreshToken) => {
    tokenStorage.set(accessToken, refreshToken);
    set({ hasToken: true });
  },
  clear: () => {
    tokenStorage.clear();
    // Wipe stored branch so the next login doesn't inherit a stale branch context.
    try { localStorage.removeItem('skolaris.activeBranchId'); } catch { /* noop */ }
    set({ user: null, hasToken: false });
  },
}));
