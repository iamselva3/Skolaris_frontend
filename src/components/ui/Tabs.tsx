import { cn } from '@/lib/utils/cn';

import { type ReactNode } from 'react';

interface Tab {
  key: string;
  label: string;
  icon?: ReactNode;
}

interface Props {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export const Tabs = ({ tabs, active, onChange, className }: Props) => (
  <div className={cn('tabs', className)} role="tablist">
    {tabs.map((t) => (
      <button
        key={t.key}
        type="button"
        role="tab"
        aria-selected={t.key === active}
        className={cn('tabs-tab', t.key === active && 'tabs-tab-active', t.icon && 'flex items-center gap-2')}
        onClick={() => onChange(t.key)}
      >
        {t.icon}
        {t.label}
      </button>
    ))}
  </div>
);
