import { useMemo } from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * A friendlier date-time control than the raw <input type="datetime-local">:
 * a native date picker plus an explicit Hour / Minute / AM·PM selector and
 * optional quick-set presets. Value is the same `YYYY-MM-DDTHH:mm` (local)
 * string the native control produces, so callers don't change their save logic.
 */
export interface DateTimePreset {
  label: string;
  /** Returns a `YYYY-MM-DDTHH:mm` local string. */
  value: () => string;
}

interface Props {
  value: string; // 'YYYY-MM-DDTHH:mm' or ''
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Minimum allowed date (only the date part is enforced on the date input). */
  min?: string;
  presets?: DateTimePreset[];
}

const pad = (n: number): string => String(n).padStart(2, '0');
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 00, 05, … 55
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12

type Parts = { date: string; h12: number; min: number; mer: 'AM' | 'PM' };

const parse = (v: string): Parts => {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return { date: '', h12: 9, min: 0, mer: 'AM' };
  const h = Number(m[2]);
  const mer: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { date: m[1], h12, min: Number(m[3]), mer };
};

const compose = (date: string, h12: number, min: number, mer: 'AM' | 'PM'): string => {
  if (!date) return '';
  let h = h12 % 12;
  if (mer === 'PM') h += 12;
  return `${date}T${pad(h)}:${pad(min)}`;
};

const todayLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const DateTimeField = ({ value, onChange, disabled, min, presets }: Props): JSX.Element => {
  const p = useMemo(() => parse(value), [value]);
  // Snap a parsed minute that isn't a multiple of 5 to the nearest option so the
  // <select> always shows a real value.
  const minOpt = MINUTES.includes(p.min) ? p.min : Math.round(p.min / 5) * 5 % 60;

  const set = (patch: Partial<Parts>): void => {
    const date = (patch.date ?? p.date) || todayLocal(); // default today when a time is set first
    onChange(compose(date, patch.h12 ?? p.h12, patch.min ?? minOpt, patch.mer ?? p.mer));
  };

  const selectCls = 'form-select h-9 rounded-md border border-border bg-surface text-sm text-text disabled:opacity-50';
  const merBtn = (m: 'AM' | 'PM') =>
    cn(
      'h-9 px-3 text-xs font-semibold transition-colors',
      p.mer === m ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:bg-hover',
    );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Date */}
        <div className="relative">
          <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint" />
          <input
            type="date"
            value={p.date}
            min={min?.slice(0, 10)}
            disabled={disabled}
            onChange={(e) => set({ date: e.target.value })}
            className="form-input h-9 rounded-md border border-border bg-surface pl-8 pr-2 text-sm text-text disabled:opacity-50"
          />
        </div>

        {/* Time: hour : minute */}
        <div className="flex items-center gap-1">
          <select aria-label="Hour" value={p.h12} disabled={disabled} onChange={(e) => set({ h12: Number(e.target.value) })} className={selectCls}>
            {HOURS.map((h) => (
              <option key={h} value={h}>{pad(h)}</option>
            ))}
          </select>
          <span className="text-text-muted">:</span>
          <select aria-label="Minute" value={minOpt} disabled={disabled} onChange={(e) => set({ min: Number(e.target.value) })} className={selectCls}>
            {MINUTES.map((m) => (
              <option key={m} value={m}>{pad(m)}</option>
            ))}
          </select>
        </div>

        {/* AM / PM toggle */}
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <button type="button" disabled={disabled} onClick={() => set({ mer: 'AM' })} className={merBtn('AM')}>AM</button>
          <button type="button" disabled={disabled} onClick={() => set({ mer: 'PM' })} className={cn('border-l border-border', merBtn('PM'))}>PM</button>
        </div>
      </div>

      {/* Quick presets */}
      {presets && presets.length > 0 && !disabled ? (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(preset.value())}
              className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] text-text-muted hover:border-primary hover:text-primary"
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
