import { useMemo, type ReactNode } from 'react';
import { usePageHeader as registerPageHeader } from '@/lib/page-header/use-page-header';

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * Compatibility shim. Existing pages call `<PageHeader title=... />` at the top
 * of their render. With the ERP shell, the actual title + breadcrumb + actions
 * now render in the shell-level BreadcrumbStrip — this component just registers
 * them via the page-header context and renders nothing.
 */
export const PageHeader = ({ title, description, actions }: Props) => {
  const state = useMemo(
    () => ({ title, description, actions, breadcrumb: [{ label: title }] }),
    [title, description, actions],
  );
  registerPageHeader(state);
  return null;
};
