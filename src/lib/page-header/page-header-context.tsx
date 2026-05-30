/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, type ReactNode } from 'react';

export interface Crumb {
  label: string;
  to?: string;
}

export interface PageHeaderState {
  title: string;
  breadcrumb: Crumb[];
  description?: string;
  actions?: ReactNode;
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
  return <PageHeaderCtx.Provider value={{ state, set }}>{children}</PageHeaderCtx.Provider>;
};
