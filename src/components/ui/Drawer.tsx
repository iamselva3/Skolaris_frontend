import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  width?: number;     // px
  footer?: ReactNode;
  children: ReactNode;
}

export const Drawer = ({ open, title, onClose, width = 480, footer, children }: Props) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        className="drawer"
        style={{ width: `${width}px` }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="drawer-header">
          <span>{title}</span>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X size={14} />
          </Button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-footer">{footer}</div> : null}
      </aside>
    </>
  );
};
