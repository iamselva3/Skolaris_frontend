import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, Props>(
  ({ invalid, className, children, ...rest }, ref) => (
    <select
      ref={ref}
      className={cn('form-select', invalid && 'form-input-error', className)}
      {...rest}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
