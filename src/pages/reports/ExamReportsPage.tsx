import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { reportsApi, type ExamReportRow } from '@/lib/api/reports.api';
import { exportCsv, exportPdf, type ExportColumn } from '@/lib/reports/export';
import { avg, durationText, filterSubtitle, pctText, sum } from '@/lib/reports/format';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { ReportWorkspace } from '@/components/reports/ReportWorkspace';
import { ReportFilterBar, type ReportFilterValue } from '@/components/reports/ReportFilterBar';
import { BarList, DonutChartFlat, ProgressBar } from '@/components/reports/charts';
import { scoreTone } from '@/components/reports/charts/palette';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { StatusPill } from './shared';

const PAGE = 25;

export const ExamReportsPage = () => {
  const [filter, setFilter] = useState<ReportFilterValue>({});
  const [offset, setOffset] = useState(0);
  const q = useDebounce(filter.q ?? '', 300);

  const params = {
    q: q || undefined,
    dateFrom: filter.dateFrom,
    dateTo: filter.dateTo,
    programId: filter.programId ?? undefined,
    subjectId: filter.subjectId ?? undefined,
    branchId: filter.branchId,
    limit: PAGE,
    offset,
  };

  const list = useQuery({
    queryKey: ['reports', 'exams', params],
    queryFn: () => reportsApi.exams(params),
    placeholderData: (p) => p,
  });

  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  const total = list.data?.meta.total ?? 0;

  const kpis = [
    { label: 'Exams (filtered)', value: total.toLocaleString() },
    { label: 'Attempts (page)', value: sum(rows.map((r) => r.attemptCount)).toLocaleString() },
    { label: 'Avg score', value: pctText(avg(rows.map((r) => r.avgScorePercent))) },
    { label: 'Avg completion', value: pctText(avg(rows.map((r) => r.completionPercent))) },
  ];

  const statusMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    const tone: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'muted'> = {
      LIVE: 'success',
      SCHEDULED: 'primary',
      DRAFT: 'muted',
      CLOSED: 'warning',
    };
    return Array.from(counts.entries()).map(([label, value]) => ({
      label,
      value,
      tone: tone[label] ?? 'muted',
    }));
  }, [rows]);

  const topByScore = useMemo(
    () =>
      [...rows]
        .filter((r) => r.gradedCount > 0)
        .sort((a, b) => b.avgScorePercent - a.avgScorePercent)
        .slice(0, 8)
        .map((r) => ({ label: r.title, value: r.avgScorePercent, tone: scoreTone(r.avgScorePercent) })),
    [rows],
  );

  const exportColumns: ExportColumn<ExamReportRow>[] = [
    { header: 'Exam', value: (r) => r.title },
    { header: 'Program', value: (r) => r.program ?? '' },
    { header: 'Subject', value: (r) => r.subject ?? '' },
    { header: 'Status', value: (r) => r.status },
    { header: 'Questions', value: (r) => r.totalQuestions },
    { header: 'Attempts', value: (r) => r.attemptCount },
    { header: 'Submitted', value: (r) => r.submittedCount },
    { header: 'Graded', value: (r) => r.gradedCount },
    { header: 'Completion %', value: (r) => r.completionPercent },
    { header: 'Avg score %', value: (r) => r.avgScorePercent },
    { header: 'Avg time', value: (r) => durationText(r.avgTimeSeconds) },
  ];

  const columns = useMemo<ColumnDef<ExamReportRow>[]>(
    () => [
      {
        header: 'Exam',
        cell: (c) => (
          <Link to={`/reports/exams/${c.row.original.examId}`} className="font-medium text-primary hover:underline">
            {c.row.original.title}
          </Link>
        ),
      },
      {
        header: 'Program · Subject',
        cell: (c) => (
          <span className="text-xs">
            <span className="text-text">{c.row.original.program ?? '—'}</span>
            <span className="mx-1 text-text-faint">·</span>
            <span className="text-text-muted">{c.row.original.subject ?? '—'}</span>
          </span>
        ),
      },
      { header: 'Status', cell: (c) => <StatusPill value={c.row.original.status} /> },
      {
        header: 'Qs',
        cell: (c) => <span className="font-mono text-xs tabular-nums text-text-muted">{c.row.original.totalQuestions}</span>,
      },
      {
        header: 'Attempts',
        cell: (c) => (
          <span className="font-mono text-xs tabular-nums">
            {c.row.original.submittedCount}
            <span className="text-text-faint">/{c.row.original.attemptCount}</span>
          </span>
        ),
      },
      {
        header: 'Completion',
        cell: (c) => <ProgressBar value={c.row.original.completionPercent} tone="primary" />,
      },
      { header: 'Avg score', cell: (c) => <ProgressBar value={c.row.original.avgScorePercent} /> },
      {
        header: 'Avg time',
        cell: (c) => <span className="text-xs text-text-muted">{durationText(c.row.original.avgTimeSeconds)}</span>,
      },
    ],
    [],
  );

  return (
    <ReportWorkspace
      title="Exam reports"
      description="Participation, completion and score performance across exams"
      kpis={kpis}
      kpisLoading={list.isLoading && rows.length === 0}
      filter={
        <ReportFilterBar
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setOffset(0);
          }}
          fields={['search', 'date', 'taxonomy', 'branch']}
          taxonomyLevels={['programId', 'subjectId']}
          searchPlaceholder="Search exam title"
        />
      }
      toolbarLeft={`${total.toLocaleString()} exam(s)`}
      exportDisabled={rows.length === 0}
      onExportCsv={() => exportCsv('exam-reports', exportColumns, rows)}
      onExportPdf={() =>
        exportPdf('exam-reports', {
          title: 'Exam reports',
          subtitle: filterSubtitle(filter),
          columns: exportColumns,
          rows,
          kpis: kpis.map((k) => ({ label: k.label, value: String(k.value) })),
        })
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>Status mix (page)</CardHeader>
          <CardBody>
            <DonutChartFlat data={statusMix} centerValue={rows.length} centerLabel="exams" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Top exams by average score</CardHeader>
          <CardBody>
            <BarList data={topByScore} unit="%" max={100} />
          </CardBody>
        </Card>
      </div>

      <Table
        columns={columns}
        data={rows}
        tableClassName="data-table-compact"
        empty={<>No exams match the current filters.</>}
      />
      {total > PAGE ? (
        <Pagination total={total} limit={PAGE} offset={offset} onPageChange={setOffset} />
      ) : null}
    </ReportWorkspace>
  );
};
