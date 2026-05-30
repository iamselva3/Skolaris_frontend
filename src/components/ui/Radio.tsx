import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Radio = forwardRef<HTMLInputElement, Props>(
  ({ label, className, id, ...rest }, ref) => {
    const inputId = id ?? `${rest.name}-${rest.value}`;
    return (
      <label htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-2 text-sm">
        <input
          ref={ref}
          id={inputId}
          type="radio"
          className={cn('form-checkbox rounded-full', className)}
          {...rest}
        />
        {label ? <span>{label}</span> : null}
      </label>
    );
  },
);
Radio.displayName = 'Radio';
