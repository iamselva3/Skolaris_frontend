import { useMemo, type ReactNode } from 'react';
import { usePageHeader as registerPageHeader } from '@/lib/page-header/use-page-header';
import { type Crumb } from '@/lib/page-header/page-header-context';

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Bump when `actions` change in a way that must be republished to the shell. */
  actionsKey?: string;
  breadcrumb?: Crumb[];
}

/**
 * Compatibility shim. Existing pages call `<PageHeader title=... />` at the top
 * of their render. With the ERP shell, the actual title + breadcrumb + actions
 * now render in the shell-level BreadcrumbStrip — this component just registers
 * them via the page-header context and renders nothing.
 */
export const PageHeader = ({ title, description, actions, actionsKey, breadcrumb }: Props) => {
  const state = useMemo(
    () => ({ title, description, actions, actionsKey, breadcrumb: breadcrumb ?? [{ label: title }] }),
    [title, description, actions, actionsKey, breadcrumb],
  );
  registerPageHeader(state);
  return null;
};
