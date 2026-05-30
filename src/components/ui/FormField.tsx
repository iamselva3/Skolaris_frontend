import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface Props {
  label: string;
  htmlFor?: string;
  help?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

export const FormField = ({ label, htmlFor, help, error, className, children }: Props) => (
  <div className={cn('field', className)}>
    <label htmlFor={htmlFor} className="form-label">
      {label}
    </label>
    {children}
    {error ? <p className="form-error">{error}</p> : help ? <p className="form-help">{help}</p> : null}
  </div>
);
