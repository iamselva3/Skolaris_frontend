import { cn } from '@/lib/utils/cn';

interface Tab {
  key: string;
  label: string;
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
        className={cn('tabs-tab', t.key === active && 'tabs-tab-active')}
        onClick={() => onChange(t.key)}
      >
        {t.label}
      </button>
    ))}
  </div>
);
