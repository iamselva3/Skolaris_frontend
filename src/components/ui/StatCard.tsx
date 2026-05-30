import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils/cn';

interface Props {
  label: string;
  value: ReactNode;
  delta?: { text: string; direction?: 'up' | 'down' | 'flat' };
  href?: string;
  className?: string;
}

/**
 * 64px tall, no icon column. Label uppercase ABOVE value.
 * Optional delta text below the value (e.g. "↗ 8 this week").
 */
export const StatCard = ({ label, value, delta, href, className }: Props) => {
  const body = (
    <>
      <div className="stat-card-label">{label}</div>
      <div className="flex items-end justify-between">
        <span className="stat-card-value">{value}</span>
        {delta ? (
          <span
            className={cn(
              'stat-card-delta',
              delta.direction === 'up' && 'stat-card-delta-up',
              delta.direction === 'down' && 'stat-card-delta-down',
            )}
          >
            {delta.text}
          </span>
        ) : null}
      </div>
    </>
  );
  if (href) {
    return (
      <Link to={href} className={cn('stat-card', className)}>
        {body}
      </Link>
    );
  }
  return <div className={cn('stat-card', className)}>{body}</div>;
};
