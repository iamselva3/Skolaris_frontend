import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { reportsApi, type ClassReportRow } from '@/lib/api/reports.api';
import { exportCsv, exportPdf, type ExportColumn } from '@/lib/reports/export';
import { avg, filterSubtitle, pctText } from '@/lib/reports/format';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { ReportWorkspace } from '@/components/reports/ReportWorkspace';
import { ReportFilterBar, type ReportFilterValue } from '@/components/reports/ReportFilterBar';
import { BarList, ProgressBar } from '@/components/reports/charts';
import { scoreTone } from '@/components/reports/charts/palette';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';

const PAGE = 25;

const classLabel = (r: ClassReportRow): string =>
  [r.name, r.section].filter(Boolean).join(' · ');

export const ClassPerformancePage = () => {
  const [filter, setFilter] = useState<ReportFilterValue>({});
  const [offset, setOffset] = useState(0);
  const q = useDebounce(filter.q ?? '', 300);

  const params = { q: q || undefined, branchId: filter.branchId, limit: PAGE, offset };

  const list = useQuery({
    queryKey: ['reports', 'classes', params],
    queryFn: () => reportsApi.classes(params),
    placeholderData: (p) => p,
  });

  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  const total = list.data?.meta.total ?? 0;

  const kpis = [
    { label: 'Classes (filtered)', value: total.toLocaleString() },
    { label: 'Students', value: rows.reduce((a, r) => a + r.studentCount, 0).toLocaleString() },
    { label: 'Avg score', value: pctText(avg(rows.map((r) => r.avgScorePercent))) },
    { label: 'Avg completion', value: pctText(avg(rows.map((r) => r.completionPercent))) },
  ];

  const byScore = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.avgScorePercent - a.avgScorePercent)
        .slice(0, 8)
        .map((r) => ({ label: classLabel(r), value: r.avgScorePercent, tone: scoreTone(r.avgScorePercent) })),
    [rows],
  );

  const byCompletion = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.completionPercent - a.completionPercent)
        .slice(0, 8)
        .map((r) => ({ label: classLabel(r), value: r.completionPercent, tone: 'primary' as const })),
    [rows],
  );

  const exportColumns: ExportColumn<ClassReportRow>[] = [
    { header: 'Class', value: (r) => r.name },
    { header: 'Section', value: (r) => r.section ?? '' },
    { header: 'Year', value: (r) => r.year ?? '' },
    { header: 'Students', value: (r) => r.studentCount },
    { header: 'Exams assigned', value: (r) => r.examsAssigned },
    { header: 'Attempts', value: (r) => r.attemptsTotal },
    { header: 'Submitted', value: (r) => r.submittedCount },
    { header: 'Completion %', value: (r) => r.completionPercent },
    { header: 'Avg score %', value: (r) => r.avgScorePercent },
  ];

  const columns = useMemo<ColumnDef<ClassReportRow>[]>(
    () => [
      {
        header: 'Class',
        cell: (c) => (
          <span className="font-medium text-text">
            {c.row.original.name}
            {c.row.original.section ? (
              <span className="ml-1 text-xs text-text-muted">· {c.row.original.section}</span>
            ) : null}
          </span>
        ),
      },
      {
        header: 'Students',
        cell: (c) => <span className="font-mono text-xs tabular-nums text-text-muted">{c.row.original.studentCount}</span>,
      },
      {
        header: 'Exams',
        cell: (c) => <span className="font-mono text-xs tabular-nums text-text-muted">{c.row.original.examsAssigned}</span>,
      },
      {
        header: 'Attempts',
        cell: (c) => (
          <span className="font-mono text-xs tabular-nums">
            {c.row.original.submittedCount}
            <span className="text-text-faint">/{c.row.original.attemptsTotal}</span>
          </span>
        ),
      },
      { header: 'Completion', cell: (c) => <ProgressBar value={c.row.original.completionPercent} tone="primary" /> },
      { header: 'Avg score', cell: (c) => <ProgressBar value={c.row.original.avgScorePercent} /> },
    ],
    [],
  );

  return (
    <ReportWorkspace
      title="Batch / class performance"
      description="Per-classroom participation, completion and average score"
      kpis={kpis}
      kpisLoading={list.isLoading && rows.length === 0}
      filter={
        <ReportFilterBar
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setOffset(0);
          }}
          fields={['search', 'branch']}
          searchPlaceholder="Search class name"
        />
      }
      toolbarLeft={`${total.toLocaleString()} class(es)`}
      exportDisabled={rows.length === 0}
      onExportCsv={() => exportCsv('class-performance', exportColumns, rows)}
      onExportPdf={() =>
        exportPdf('class-performance', {
          title: 'Batch / class performance',
          subtitle: filterSubtitle(filter),
          columns: exportColumns,
          rows,
          kpis: kpis.map((k) => ({ label: k.label, value: String(k.value) })),
        })
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>Average score by class</CardHeader>
          <CardBody>
            <BarList data={byScore} unit="%" max={100} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Completion by class</CardHeader>
          <CardBody>
            <BarList data={byCompletion} unit="%" max={100} />
          </CardBody>
        </Card>
      </div>

      <Table
        columns={columns}
        data={rows}
        tableClassName="data-table-compact"
        empty={<>No classes match the current filters.</>}
      />
      {total > PAGE ? (
        <Pagination total={total} limit={PAGE} offset={offset} onPageChange={setOffset} />
      ) : null}
    </ReportWorkspace>
  );
};
