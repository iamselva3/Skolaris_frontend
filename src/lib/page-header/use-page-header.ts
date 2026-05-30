import { useContext, useEffect } from 'react';
import {
  DEFAULT_PAGE_HEADER,
  PageHeaderCtx,
  type PageHeaderState,
} from './page-header-context';

/** Read the current header state (for the BreadcrumbStrip). */
export const useReadPageHeader = (): PageHeaderState => {
  const ctx = useContext(PageHeaderCtx);
  return ctx ? ctx.state : DEFAULT_PAGE_HEADER;
};

/**
 * Page-side hook. Call once at the top of a routed component:
 *   usePageHeader({ title: 'Question bank', breadcrumb: [{ label: 'Question bank' }] });
 *
 * Re-runs when deps change. Cleans up on unmount so back-nav stale state
 * never bleeds through.
 */
export const usePageHeader = (next: PageHeaderState): void => {
  const ctx = useContext(PageHeaderCtx);
  useEffect(() => {
    if (!ctx) return;
    ctx.set(next);
    return () => ctx.set(DEFAULT_PAGE_HEADER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next.title, next.description, JSON.stringify(next.breadcrumb), next.actions]);
};
