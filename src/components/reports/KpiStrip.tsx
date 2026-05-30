import type { ReactNode } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { cn } from '@/lib/utils/cn';

export interface KpiItem {
  label: string;
  value: ReactNode;
  delta?: { text: string; direction?: 'up' | 'down' | 'flat' };
  href?: string;
}

/**
 * Row of KPI tiles (reuses the operational StatCard). Auto-fits to width via
 * the locked `stats-5` grid template.
 */
export const KpiStrip = ({
  items,
  loading,
  placeholders = 5,
  className,
}: {
  items?: KpiItem[];
  loading?: boolean;
  placeholders?: number;
  className?: string;
}) => {
  if (loading) {
    return (
      <div className={cn('grid grid-cols-stats-5 gap-3', className)}>
        {Array.from({ length: placeholders }).map((_, i) => (
          <div key={i} className="stat-card">
            <div className="stat-card-label text-text-faint">—</div>
            <div className="stat-card-value text-text-faint">…</div>
          </div>
        ))}
      </div>
    );
  }
  if (!items || items.length === 0) return null;
  return (
    <div className={cn('grid grid-cols-stats-5 gap-3', className)}>
      {items.map((k) => (
        <StatCard key={k.label} label={k.label} value={k.value} delta={k.delta} href={k.href} />
      ))}
    </div>
  );
};
