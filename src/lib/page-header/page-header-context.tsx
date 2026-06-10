/* eslint-disable react-refresh/only-export-components */
import { createContext, useMemo, useState, type ReactNode } from 'react';

export interface Crumb {
  label: string;
  to?: string;
}

export interface PageHeaderState {
  title: string;
  breadcrumb: Crumb[];
  description?: string;
  actions?: ReactNode;
  /**
   * Opaque token a page bumps when its `actions` change in a way that must be
   * republished (e.g. a button's disabled state depends on local state). The
   * republish key intentionally ignores `actions` identity to avoid render
   * loops, so without this a stateful action button would render stale.
   */
  actionsKey?: string;
}

export interface PageHeaderContextValue {
  state: PageHeaderState;
  set: (next: PageHeaderState) => void;
}

export const DEFAULT_PAGE_HEADER: PageHeaderState = { title: '', breadcrumb: [] };

export const PageHeaderCtx = createContext<PageHeaderContextValue | null>(null);

/**
 * Provider mounted at shell level. Pages call `usePageHeader({...})` to
 * populate the breadcrumb strip — no prop drilling.
 */
export const PageHeaderProvider = ({ children }: { children: ReactNode }) => {
  const [state, set] = useState<PageHeaderState>(DEFAULT_PAGE_HEADER);
  // Stable context value: only changes when `state` does (`set` is stable), so
  // consumers don't re-render on unrelated parent renders.
  const value = useMemo<PageHeaderContextValue>(() => ({ state, set }), [state]);
  return <PageHeaderCtx.Provider value={value}>{children}</PageHeaderCtx.Provider>;
};
