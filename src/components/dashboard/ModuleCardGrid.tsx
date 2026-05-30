import type { DashboardModuleCard } from '@/lib/dashboard/module-cards.config';
import { cn } from '@/lib/utils/cn';
import { ModuleCard } from './ModuleCard';

interface Props {
  cards: DashboardModuleCard[];
  data: any;
  loading: boolean;
}

/**
 * Outer launcher panel. White surface with 1px border. Grid responsively
 * collapses 5/3 → 3 → 2 → 1 columns at lg / md / sm.
 */
export const ModuleCardGrid = ({ cards, data, loading }: Props) => {
  const cols = cards.length === 3 ? 'lg:grid-cols-modules-3' : 'lg:grid-cols-modules-5';
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3', cols)}>
        {cards.map((card) => (
          <ModuleCard key={card.id} card={card} metrics={card.metrics(data)} loading={loading} />
        ))}
      </div>
    </section>
  );
};
