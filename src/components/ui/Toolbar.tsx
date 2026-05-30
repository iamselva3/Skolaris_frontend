import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface Props {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export const Toolbar = ({ left, right, className }: Props) => (
  <div className={cn('toolbar', className)}>
    <div className="toolbar-left">{left}</div>
    {right ? <div className="toolbar-right">{right}</div> : null}
  </div>
);
