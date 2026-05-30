import type { ReactNode } from 'react';

interface Props {
  title: string;
  message?: string;
  action?: ReactNode;
}

export const EmptyState = ({ title, message, action }: Props) => (
  <div className="empty-state">
    <p className="text-sm font-medium text-text">{title}</p>
    {message ? <p className="text-sm">{message}</p> : null}
    {action}
  </div>
);
