import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const sizeClass: Record<NonNullable<Props['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[95vw]',
};

export const Modal = ({ open, title, onClose, children, footer, size = 'md' }: Props) => {
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
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`modal ${sizeClass[size]}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{title}</span>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
};
