import type { ReactNode } from 'react';
import { Download, FileText } from 'lucide-react';
import { usePageHeader } from '@/lib/page-header/use-page-header';
import type { Crumb } from '@/lib/page-header/page-header-context';
import { Button } from '@/components/ui/Button';
import { KpiStrip, type KpiItem } from './KpiStrip';

interface Props {
  title: string;
  description?: string;
  breadcrumb?: Crumb[];
  kpis?: KpiItem[];
  kpisLoading?: boolean;
  /** A <ReportFilterBar/> element (or any filter UI). */
  filter?: ReactNode;
  /** Left side of the export toolbar (e.g. a result count). */
  toolbarLeft?: ReactNode;
  onExportCsv?: () => void;
  onExportPdf?: () => void;
  exportDisabled?: boolean;
  children: ReactNode;
}

const REPORTS_CRUMB: Crumb = { label: 'Reports', to: '/reports' };

/**
 * Standard reporting page skeleton: header (via page-header context) → KPI strip
 * → filter bar → export toolbar → body (charts + dense tables). Export actions
 * live in the body toolbar (not the header) so the header receives only stable
 * primitives and never re-render-loops.
 */
export const ReportWorkspace = ({
  title,
  description,
  breadcrumb,
  kpis,
  kpisLoading,
  filter,
  toolbarLeft,
  onExportCsv,
  onExportPdf,
  exportDisabled,
  children,
}: Props) => {
  usePageHeader({
    title,
    description,
    breadcrumb: breadcrumb ?? [REPORTS_CRUMB, { label: title }],
  });

  const showExport = !!onExportCsv || !!onExportPdf;

  return (
    <div className="flex flex-col gap-4">
      {kpis || kpisLoading ? <KpiStrip items={kpis} loading={kpisLoading} /> : null}
      {filter}

      {showExport || toolbarLeft ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-text-muted">{toolbarLeft}</div>
          {showExport ? (
            <div className="flex items-center gap-2">
              {onExportCsv ? (
                <Button variant="secondary" size="sm" onClick={onExportCsv} disabled={exportDisabled}>
                  <FileText size={12} /> CSV
                </Button>
              ) : null}
              {onExportPdf ? (
                <Button variant="secondary" size="sm" onClick={onExportPdf} disabled={exportDisabled}>
                  <Download size={12} /> PDF
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {children}
    </div>
  );
};
