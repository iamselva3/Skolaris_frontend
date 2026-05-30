import { cn } from '@/lib/utils/cn';
import { CHART, scoreTone, toneColor, toneSoft, type Tone } from './palette';

const ChartEmpty = ({ label = 'No data for the current filters' }: { label?: string }) => (
  <div className="flex h-24 items-center justify-center text-xs text-text-faint">{label}</div>
);

/* ───────────────────────────── Horizontal bar list ─────────────────────────
 * Compact ranked bars (avg score by topic/class, weak-student counts, …).      */
export interface BarDatum {
  label: string;
  value: number;
  tone?: Tone;
  hint?: string;
}

export const BarList = ({
  data,
  max,
  unit = '',
  labelWidth = 132,
  className,
  format,
}: {
  data: BarDatum[];
  max?: number;
  unit?: string;
  labelWidth?: number;
  className?: string;
  format?: (v: number) => string;
}) => {
  if (data.length === 0) return <ChartEmpty />;
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  const fmt = format ?? ((v: number) => `${v}${unit}`);
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {data.map((d) => {
        const tone = d.tone ?? 'primary';
        const w = Math.max(0, Math.min(100, (d.value / top) * 100));
        return (
          <div
            key={d.label}
            className="grid items-center gap-2"
            style={{ gridTemplateColumns: `${labelWidth}px 1fr 56px` }}
            title={d.hint}
          >
            <span className="truncate text-xs text-text" title={d.label}>
              {d.label}
            </span>
            <span className="relative block h-2.5 rounded-sm" style={{ background: CHART.track }}>
              <span
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{ width: `${w}%`, background: toneColor(tone) }}
              />
            </span>
            <span className="text-right font-mono text-xs tabular-nums text-text-muted">
              {fmt(d.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/* ───────────────────────────── Vertical column chart ───────────────────────
 * Distributions (score buckets). SVG, scales to container width.               */
export const ColumnChartFlat = ({
  data,
  height = 150,
  unit = '',
  className,
}: {
  data: BarDatum[];
  height?: number;
  unit?: string;
  className?: string;
}) => {
  if (data.length === 0) return <ChartEmpty />;
  const n = data.length;
  const W = Math.max(260, n * 56);
  const padTop = 18;
  const padBottom = 22;
  const top = Math.max(1, ...data.map((d) => d.value));
  const slot = W / n;
  const barW = Math.min(40, slot * 0.55);
  const plotH = height - padTop - padBottom;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
    >
      <line x1={0} y1={height - padBottom} x2={W} y2={height - padBottom} stroke={CHART.border} strokeWidth={1} />
      {data.map((d, i) => {
        const tone = d.tone ?? 'primary';
        const h = top === 0 ? 0 : (d.value / top) * plotH;
        const x = i * slot + (slot - barW) / 2;
        const yTop = height - padBottom - h;
        return (
          <g key={d.label}>
            <rect x={x} y={yTop} width={barW} height={h} rx={2} fill={toneColor(tone)} />
            <text x={x + barW / 2} y={yTop - 5} textAnchor="middle" fontSize="9" fill={CHART.muted}>
              {d.value}
            </text>
            <text
              x={x + barW / 2}
              y={height - padBottom + 13}
              textAnchor="middle"
              fontSize="9"
              fill={CHART.faint}
            >
              {d.label}
              {unit}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/* ───────────────────────────── Line chart (trend) ──────────────────────────
 * Score progression across attempts. SVG, scales to container width.          */
export const LineChartFlat = ({
  data,
  height = 160,
  max = 100,
  unit = '%',
  className,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  max?: number;
  unit?: string;
  className?: string;
}) => {
  if (data.length === 0) return <ChartEmpty label="No graded attempts yet" />;
  const W = Math.max(320, data.length * 64);
  const padL = 30;
  const padR = 12;
  const padTop = 12;
  const padBottom = 24;
  const plotW = W - padL - padR;
  const plotH = height - padTop - padBottom;
  const x = (i: number) =>
    padL + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => padTop + plotH - (Math.max(0, Math.min(max, v)) / max) * plotH;
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const gridLines = [0, 50, 100].filter((g) => g <= max);

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
    >
      {gridLines.map((g) => (
        <g key={g}>
          <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke={CHART.border} strokeWidth={0.5} />
          <text x={4} y={y(g) + 3} fontSize="8" fill={CHART.faint}>
            {g}
          </text>
        </g>
      ))}
      {data.length > 1 ? (
        <polyline points={pts} fill="none" stroke={CHART.primary} strokeWidth={1.5} />
      ) : null}
      {data.map((d, i) => (
        <g key={`${d.label}-${i}`}>
          <circle cx={x(i)} cy={y(d.value)} r={2.5} fill={toneColor(scoreTone(d.value))} />
          <title>{`${d.label}: ${d.value}${unit}`}</title>
        </g>
      ))}
    </svg>
  );
};

/* ───────────────────────────── Donut chart ─────────────────────────────────
 * Status / completion distribution with a flat legend.                         */
export interface DonutSlice {
  label: string;
  value: number;
  tone?: Tone;
}

export const DonutChartFlat = ({
  data,
  size = 132,
  centerLabel,
  centerValue,
  className,
}: {
  data: DonutSlice[];
  size?: number;
  centerLabel?: string;
  centerValue?: string | number;
  className?: string;
}) => {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (total === 0) return <ChartEmpty />;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fallback: Tone[] = ['primary', 'success', 'warning', 'danger', 'muted'];
  let offset = 0;

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={CHART.track} strokeWidth={stroke} />
          {data.map((s, i) => {
            const frac = s.value / total;
            const dash = frac * c;
            const seg = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={toneColor(s.tone ?? fallback[i % fallback.length])}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return seg;
          })}
        </g>
        {centerValue !== undefined ? (
          <text x={size / 2} y={size / 2 - 1} textAnchor="middle" fontSize="16" fontWeight="600" fill={CHART.primary}>
            {centerValue}
          </text>
        ) : null}
        {centerLabel ? (
          <text x={size / 2} y={size / 2 + 13} textAnchor="middle" fontSize="8" fill={CHART.faint}>
            {centerLabel}
          </text>
        ) : null}
      </svg>
      <ul className="flex flex-col gap-1.5">
        {data.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: toneColor(s.tone ?? fallback[i % fallback.length]) }}
            />
            <span className="text-text-muted">{s.label}</span>
            <span className="font-mono tabular-nums text-text">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ───────────────────────────── Heatmap ─────────────────────────────────────
 * Discrete-tier accuracy grid (flat soft-fill tiers, not a gradient).          */
export interface HeatCell {
  row: string;
  col: string;
  value: number | null;
}

export const HeatmapFlat = ({
  rows,
  cols,
  cells,
  unit = '%',
  className,
}: {
  rows: string[];
  cols: string[];
  cells: HeatCell[];
  unit?: string;
  className?: string;
}) => {
  if (rows.length === 0 || cols.length === 0) return <ChartEmpty />;
  const lookup = new Map(cells.map((c) => [`${c.row}|${c.col}`, c.value]));
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th className="px-1" />
            {cols.map((col) => (
              <th
                key={col}
                className="px-1 pb-1 text-center text-[10px] font-medium text-text-faint"
                title={col}
              >
                <span className="block max-w-[64px] truncate">{col}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <td className="pr-2 text-right text-[11px] text-text-muted">
                <span className="block max-w-[120px] truncate" title={row}>
                  {row}
                </span>
              </td>
              {cols.map((col) => {
                const v = lookup.get(`${row}|${col}`);
                if (v === null || v === undefined) {
                  return (
                    <td key={col} className="h-7 w-12 rounded-sm text-center text-[10px] text-text-faint" style={{ background: CHART.track }}>
                      –
                    </td>
                  );
                }
                const tone = scoreTone(v);
                return (
                  <td
                    key={col}
                    className="h-7 w-12 rounded-sm text-center text-[10px] font-medium tabular-nums"
                    style={{ background: toneSoft(tone), color: toneColor(tone) }}
                    title={`${row} · ${col}: ${v}${unit}`}
                  >
                    {Math.round(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ───────────────────────────── Sparkline (inline) ──────────────────────────*/
export const Sparkline = ({
  data,
  width = 76,
  height = 20,
  tone = 'primary',
}: {
  data: number[];
  width?: number;
  height?: number;
  tone?: Tone;
}) => {
  if (data.length < 2) return <span className="text-xs text-text-faint">–</span>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((v - min) / span) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden>
      <polyline points={pts} fill="none" stroke={toneColor(tone)} strokeWidth={1.25} />
    </svg>
  );
};

/* ───────────────────────────── Progress bar (table cell) ───────────────────
 * Accuracy / weak-topic indicator inside dense tables.                         */
export const ProgressBar = ({
  value,
  max = 100,
  tone,
  showLabel = true,
  unit = '%',
  width = 84,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  showLabel?: boolean;
  unit?: string;
  width?: number;
}) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const resolved = tone ?? scoreTone(pct);
  return (
    <div className="flex items-center gap-2">
      <span className="relative block h-2 rounded-sm" style={{ width, background: CHART.track }}>
        <span
          className="absolute inset-y-0 left-0 rounded-sm"
          style={{ width: `${pct}%`, background: toneColor(resolved) }}
        />
      </span>
      {showLabel ? (
        <span className="font-mono text-xs tabular-nums text-text-muted">
          {Math.round(value)}
          {unit}
        </span>
      ) : null}
    </div>
  );
};
