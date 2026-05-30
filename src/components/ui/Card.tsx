import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const Card = ({ className, ...rest }: CardProps) => (
  <div className={cn('card', className)} {...rest} />
);

export const CardHeader = ({ className, ...rest }: CardProps) => (
  <div className={cn('card-header', className)} {...rest} />
);

export const CardBody = ({ className, ...rest }: CardProps) => (
  <div className={cn('card-body', className)} {...rest} />
);
