import { create } from 'zustand';

const STORAGE_KEY = 'skolaris.activeBranchId';

interface BranchState {
  activeBranchId: string | null;
  setActiveBranchId: (id: string | null) => void;
}

export const useBranchStore = create<BranchState>((set) => ({
  activeBranchId: (() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  })(),
  setActiveBranchId: (id) => {
    try {
      if (id === null || id === '') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, id);
      }
    } catch {
      // ignore
    }
    set({ activeBranchId: id || null });
  },
}));
