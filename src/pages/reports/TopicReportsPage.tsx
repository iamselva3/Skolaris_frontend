import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { reportsApi, type TopicRollupRow } from '@/lib/api/reports.api';
import { exportCsv, exportPdf, type ExportColumn } from '@/lib/reports/export';
import { avg, filterSubtitle, pctText } from '@/lib/reports/format';
import { ReportWorkspace } from '@/components/reports/ReportWorkspace';
import { ReportFilterBar, type ReportFilterValue } from '@/components/reports/ReportFilterBar';
import { BarList, HeatmapFlat, ProgressBar, type HeatCell } from '@/components/reports/charts';
import { riskTone, scoreTone } from '@/components/reports/charts/palette';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';

const PAGE = 50;
const HEAT_COLS = ['Avg score', 'Accuracy'];

export const TopicReportsPage = () => {
  const [filter, setFilter] = useState<ReportFilterValue>({});
  const [offset, setOffset] = useState(0);

  const params = {
    programId: filter.programId ?? undefined,
    subjectId: filter.subjectId ?? undefined,
    topicId: filter.topicId ?? undefined,
    branchId: filter.branchId,
    limit: PAGE,
    offset,
  };

  const list = useQuery({
    queryKey: ['reports', 'topics', params],
    queryFn: () => reportsApi.topics(params),
    placeholderData: (p) => p,
  });

  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  const total = list.data?.meta.total ?? 0;

  const kpis = [
    { label: 'Topics (filtered)', value: total.toLocaleString() },
    { label: 'Avg score', value: pctText(avg(rows.map((r) => r.avgScorePercent))) },
    { label: 'Avg accuracy', value: pctText(avg(rows.map((r) => r.accuracyPercent))) },
    {
      label: 'Weak students',
      value: rows.reduce((a, r) => a + r.weakStudents, 0).toLocaleString(),
    },
  ];

  const lowest = useMemo(
    () =>
      [...rows]
        .sort((a, b) => a.avgScorePercent - b.avgScorePercent)
        .slice(0, 8)
        .map((r) => ({
          label: `${r.subject} · ${r.topic}`,
          value: r.avgScorePercent,
          tone: scoreTone(r.avgScorePercent),
        })),
    [rows],
  );

  const { heatRows, heatCells } = useMemo(() => {
    const top = [...rows].sort((a, b) => b.studentsAssessed - a.studentsAssessed).slice(0, 16);
    const labels = top.map((r) => `${r.subject} · ${r.topic}`);
    const cells: HeatCell[] = [];
    top.forEach((r, i) => {
      cells.push({ row: labels[i], col: 'Avg score', value: r.avgScorePercent });
      cells.push({ row: labels[i], col: 'Accuracy', value: r.accuracyPercent });
    });
    return { heatRows: labels, heatCells: cells };
  }, [rows]);

  const exportColumns: ExportColumn<TopicRollupRow>[] = [
    { header: 'Subject', value: (r) => r.subject },
    { header: 'Topic', value: (r) => r.topic },
    { header: 'Students assessed', value: (r) => r.studentsAssessed },
    { header: 'Avg score %', value: (r) => r.avgScorePercent },
    { header: 'Accuracy %', value: (r) => r.accuracyPercent },
    { header: 'Weak students', value: (r) => r.weakStudents },
    { header: 'Weak share %', value: (r) => r.weakSharePercent },
  ];

  const columns = useMemo<ColumnDef<TopicRollupRow>[]>(
    () => [
      {
        header: 'Subject · Topic',
        cell: (c) => (
          <span className="text-xs">
            <span className="text-text">{c.row.original.subject}</span>
            <span className="mx-1 text-text-faint">·</span>
            <span className="text-text-muted">{c.row.original.topic}</span>
          </span>
        ),
      },
      {
        header: 'Students',
        cell: (c) => <span className="font-mono text-xs tabular-nums text-text-muted">{c.row.original.studentsAssessed}</span>,
      },
      { header: 'Avg score', cell: (c) => <ProgressBar value={c.row.original.avgScorePercent} /> },
      { header: 'Accuracy', cell: (c) => <ProgressBar value={c.row.original.accuracyPercent} /> },
      {
        header: 'Weak share',
        cell: (c) => (
          <ProgressBar value={c.row.original.weakSharePercent} tone={riskTone(c.row.original.weakSharePercent)} />
        ),
      },
    ],
    [],
  );

  return (
    <ReportWorkspace
      title="Topic-wise analysis"
      description="Cohort performance and weak-topic concentration by subject and topic"
      kpis={kpis}
      kpisLoading={list.isLoading && rows.length === 0}
      filter={
        <ReportFilterBar
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setOffset(0);
          }}
          fields={['taxonomy', 'branch']}
          taxonomyLevels={['programId', 'subjectId', 'topicId']}
        />
      }
      toolbarLeft={`${total.toLocaleString()} topic(s)`}
      exportDisabled={rows.length === 0}
      onExportCsv={() => exportCsv('topic-analysis', exportColumns, rows)}
      onExportPdf={() =>
        exportPdf('topic-analysis', {
          title: 'Topic-wise analysis',
          subtitle: filterSubtitle(filter),
          columns: exportColumns,
          rows,
          kpis: kpis.map((k) => ({ label: k.label, value: String(k.value) })),
        })
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>Lowest average score (topics)</CardHeader>
          <CardBody>
            <BarList data={lowest} unit="%" max={100} labelWidth={160} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Performance heatmap</CardHeader>
          <CardBody>
            <HeatmapFlat rows={heatRows} cols={HEAT_COLS} cells={heatCells} />
          </CardBody>
        </Card>
      </div>

      <Table
        columns={columns}
        data={rows}
        tableClassName="data-table-compact"
        empty={<>No topic performance yet — grade some attempts to populate this report.</>}
      />
      {total > PAGE ? (
        <Pagination total={total} limit={PAGE} offset={offset} onPageChange={setOffset} />
      ) : null}
    </ReportWorkspace>
  );
};
