import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils/cn';

export interface MegaMenuLink {
  label: string;
  to: string;
  /** Optional live-count pill on the right side of the row. */
  count?: number;
  /** Highlights the row with a warning tint when count > 0. */
  attention?: boolean;
}

export interface MegaMenuColumn {
  header: string;
  links: MegaMenuLink[];
}

interface Props {
  open: boolean;
  columns: MegaMenuColumn[];
  /** Anchor coordinates (left + top) relative to the viewport. */
  anchor: { left: number; top: number };
  onClose: () => void;
}

/**
 * 640px two-column mega-menu. Anchored to its trigger tab, 12px below the
 * header. Esc closes. Outside click closes. Keyboard-navigable rows.
 */
export const MegaMenu = ({ open, columns, anchor, onClose }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // Defer click handler one tick so the trigger click that opened us doesn't immediately close us.
    const t = window.setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="menu"
      aria-orientation="vertical"
      className="fixed z-50 w-[640px] rounded-lg border border-border bg-surface p-5 shadow-xl"
      style={{ left: anchor.left, top: anchor.top }}
    >
      <div className="grid grid-cols-2 gap-x-8 gap-y-6">
        {columns.map((col) => (
          <div key={col.header} className="min-w-0 flex flex-col gap-1">
            <div className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.8px] text-text-muted">
              {col.header}
            </div>
            <div className="flex flex-col gap-0.5 rounded-md border border-border-soft bg-subtle/30 p-1.5">
              {col.links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  role="menuitem"
                  onClick={(e) => {
                    e.preventDefault();
                    onClose();
                    navigate(link.to);
                  }}
                  className={cn(
                    'flex items-center justify-between rounded px-2 py-1.5 text-[13px] font-medium text-text transition-colors hover:bg-surface hover:shadow-sm',
                  )}
                >
                  <span className="truncate">{link.label}</span>
                  {link.count !== undefined ? (
                    <span
                      className={cn(
                        'inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                        link.attention && link.count > 0
                          ? 'bg-warning-soft text-warning'
                          : 'bg-primary-soft text-primary',
                      )}
                    >
                      {link.count}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
