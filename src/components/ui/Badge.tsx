import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClass: Record<BadgeTone, string> = {
  default: '',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
};

export const Badge = ({ tone = 'default', className, ...rest }: Props) => (
  <span className={cn('badge', toneClass[tone], className)} {...rest} />
);
