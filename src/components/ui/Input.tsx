import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ invalid, className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn('form-input', invalid && 'form-input-error', className)}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';
