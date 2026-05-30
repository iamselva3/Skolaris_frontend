import type { ReactNode } from 'react';

interface Props<T> {
  items: T[];
  renderPrimary: (item: T) => ReactNode;
  renderMeta: (item: T) => ReactNode;
  renderAction?: (item: T) => ReactNode;
  empty?: string;
}

/**
 * Uniform two-line list pattern used by dashboard panels:
 *
 *   Primary text (13px)
 *   Meta text (11px muted)             Action →
 */
export function RecentList<T>({
  items,
  renderPrimary,
  renderMeta,
  renderAction,
  empty = 'Nothing here yet.',
}: Props<T>): JSX.Element {
  if (items.length === 0) {
    return <p className="px-1 py-2 text-[13px] text-text-muted">{empty}</p>;
  }
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i} className="recent-row">
          <div className="min-w-0 flex-1">
            <div className="recent-primary truncate">{renderPrimary(item)}</div>
            <div className="recent-meta">{renderMeta(item)}</div>
          </div>
          {renderAction ? <div className="shrink-0">{renderAction(item)}</div> : null}
        </li>
      ))}
    </ul>
  );
}
