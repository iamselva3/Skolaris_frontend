import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { reportsApi, type TopicRollupRow } from '@/lib/api/reports.api';
import { exportCsv, exportPdf, type ExportColumn } from '@/lib/reports/export';
import { avg, filterSubtitle, pctText } from '@/lib/reports/format';
import { ReportWorkspace } from '@/components/reports/ReportWorkspace';
import { ReportFilterBar, type ReportFilterValue } from '@/components/reports/ReportFilterBar';
import { BarList, HeatmapFlat, ProgressBar, type HeatCell } from '@/components/reports/charts';
import { riskTone } from '@/components/reports/charts/palette';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';

const PAGE = 50;
const HEAT_COLS = ['Avg score', 'Accuracy'];

export const WeakTopicAnalysisPage = () => {
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
    queryKey: ['reports', 'weak-topics', params],
    queryFn: () => reportsApi.weakTopics(params),
    placeholderData: (p) => p,
  });

  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  const total = list.data?.meta.total ?? 0;

  const kpis = [
    { label: 'Weak topics', value: total.toLocaleString() },
    { label: 'Weak students', value: rows.reduce((a, r) => a + r.weakStudents, 0).toLocaleString() },
    { label: 'Avg weak-topic score', value: pctText(avg(rows.map((r) => r.avgScorePercent))) },
    { label: 'Avg weak share', value: pctText(avg(rows.map((r) => r.weakSharePercent))) },
  ];

  const mostWeak = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.weakStudents - a.weakStudents)
        .slice(0, 8)
        .map((r) => ({
          label: `${r.subject} · ${r.topic}`,
          value: r.weakStudents,
          tone: riskTone(r.weakSharePercent),
          hint: `${r.weakSharePercent}% of ${r.studentsAssessed} students`,
        })),
    [rows],
  );

  const { heatRows, heatCells } = useMemo(() => {
    const top = [...rows].sort((a, b) => b.weakStudents - a.weakStudents).slice(0, 16);
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
    { header: 'Weak students', value: (r) => r.weakStudents },
    { header: 'Weak share %', value: (r) => r.weakSharePercent },
    { header: 'Avg score %', value: (r) => r.avgScorePercent },
    { header: 'Accuracy %', value: (r) => r.accuracyPercent },
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
        header: 'Weak / total',
        cell: (c) => (
          <span className="font-mono text-xs tabular-nums">
            <span className="text-danger">{c.row.original.weakStudents}</span>
            <span className="text-text-faint">/{c.row.original.studentsAssessed}</span>
          </span>
        ),
      },
      {
        header: 'Weak share',
        cell: (c) => (
          <ProgressBar value={c.row.original.weakSharePercent} tone={riskTone(c.row.original.weakSharePercent)} />
        ),
      },
      { header: 'Avg score', cell: (c) => <ProgressBar value={c.row.original.avgScorePercent} /> },
      { header: 'Accuracy', cell: (c) => <ProgressBar value={c.row.original.accuracyPercent} /> },
    ],
    [],
  );

  return (
    <ReportWorkspace
      title="Weak topic detection"
      description="Topics where students are underperforming — prioritised by weak-student concentration"
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
      toolbarLeft={`${total.toLocaleString()} weak topic(s)`}
      exportDisabled={rows.length === 0}
      onExportCsv={() => exportCsv('weak-topics', exportColumns, rows)}
      onExportPdf={() =>
        exportPdf('weak-topics', {
          title: 'Weak topic detection',
          subtitle: filterSubtitle(filter),
          columns: exportColumns,
          rows,
          kpis: kpis.map((k) => ({ label: k.label, value: String(k.value) })),
        })
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>Most weak students by topic</CardHeader>
          <CardBody>
            <BarList data={mostWeak} labelWidth={160} format={(v) => `${v}`} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Weak-topic heatmap</CardHeader>
          <CardBody>
            <HeatmapFlat rows={heatRows} cols={HEAT_COLS} cells={heatCells} />
          </CardBody>
        </Card>
      </div>

      <Table
        columns={columns}
        data={rows}
        tableClassName="data-table-compact"
        empty={<>No weak topics detected for the current filters.</>}
      />
      {total > PAGE ? (
        <Pagination total={total} limit={PAGE} offset={offset} onPageChange={setOffset} />
      ) : null}
    </ReportWorkspace>
  );
};
