import type { LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export const Label = ({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn('form-label', className)} {...rest} />
);
