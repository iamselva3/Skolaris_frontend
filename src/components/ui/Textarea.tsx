import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(
  ({ invalid, className, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cn('form-textarea', invalid && 'form-input-error', className)}
      {...rest}
    />
  ),
);
Textarea.displayName = 'Textarea';
