import type { ReactNode } from 'react';

interface Row {
  label: string;
  value: ReactNode;
}

interface Props {
  rows: Row[];
}

export const DefinitionList = ({ rows }: Props) => (
  <dl className="dl-grid">
    {rows.map((r) => (
      <div key={r.label} className="dl-row">
        <dt className="dl-label">{r.label}</dt>
        <dd className="dl-value">{r.value ?? <span className="text-text-faint">—</span>}</dd>
      </div>
    ))}
  </dl>
);
