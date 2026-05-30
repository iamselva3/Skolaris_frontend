import { useNavigate } from 'react-router-dom';
import type { DashboardModuleCard, DashboardMetric, MetricTone } from '@/lib/dashboard/module-cards.config';
import { cn } from '@/lib/utils/cn';

const TONE_DOT: Record<MetricTone, string> = {
  neutral: 'bg-primary',
  positive: 'bg-success',
  attention: 'bg-warning',
  critical: 'bg-danger',
};

interface Props {
  card: DashboardModuleCard;
  metrics: DashboardMetric[];
  loading: boolean;
}

/**
 * 220px launcher tile. Three-zone vertical layout:
 *  - Top: 56px flat-color icon centered
 *  - Middle: title (15/22 semibold) + subtitle (12/16 muted, 1-line truncate)
 *  - Bottom: 1px divider + a row of `● value label` chips, color-coded by tone
 *
 * Click navigates to card.href. Keyboard: Enter/Space activates.
 */
export const ModuleCard = ({ card, metrics, loading }: Props) => {
  const navigate = useNavigate();
  const go = (): void => navigate(card.href);

  return (
    <button
      type="button"
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      }}
      className={cn(
        'group flex h-module-card w-full flex-col rounded-md border border-border bg-surface p-5 text-center transition-colors',
        'hover:border-primary hover:bg-subtle focus:border-primary focus:outline-none',
      )}
    >
      {/* Icon + title/subtitle — flex-1 so it occupies the middle vertically */}
      <div className="flex flex-1 flex-col items-center justify-center gap-1.5">
        <div className="inline-flex h-14 w-14 items-center justify-center">{card.icon}</div>
        <div className="mt-1 text-md font-semibold leading-tight text-text">{card.title}</div>
        <div className="line-clamp-1 max-w-full text-xs text-text-muted">{card.subtitle}</div>
      </div>

      <div className="mt-3 w-full border-t border-border-soft pt-3">
        {loading ? (
          <div className="flex items-center justify-center gap-3">
            <span className="inline-block h-2.5 w-16 rounded-sm bg-hover" />
            <span className="inline-block h-2.5 w-16 rounded-sm bg-hover" />
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
            {metrics.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', TONE_DOT[m.tone])} />
                <span className="font-semibold text-text">{m.value}</span>
                <span className="text-text-muted">{m.label}</span>
                {i < metrics.length - 1 ? <span className="text-text-faint">•</span> : null}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
};
