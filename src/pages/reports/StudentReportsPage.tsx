import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { reportsApi, type StudentReportRow } from '@/lib/api/reports.api';
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

export const StudentReportsPage = () => {
  const [filter, setFilter] = useState<ReportFilterValue>({});
  const [offset, setOffset] = useState(0);
  const q = useDebounce(filter.q ?? '', 300);

  const params = {
    q: q || undefined,
    branchId: filter.branchId,
    classroomId: filter.classroomId,
    limit: PAGE,
    offset,
  };

  const list = useQuery({
    queryKey: ['reports', 'students', params],
    queryFn: () => reportsApi.students(params),
    placeholderData: (p) => p,
  });

  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  const total = list.data?.meta.total ?? 0;

  const kpis = [
    { label: 'Students (filtered)', value: total.toLocaleString() },
    { label: 'Avg score', value: pctText(avg(rows.map((r) => r.avgScorePercent))) },
    { label: 'Avg accuracy', value: pctText(avg(rows.map((r) => r.accuracyPercent))) },
    {
      label: 'Weak-topic flags',
      value: rows.reduce((a, r) => a + r.weakTopicCount, 0).toLocaleString(),
    },
  ];

  const topStudents = useMemo(
    () =>
      [...rows]
        .filter((r) => r.gradedCount > 0)
        .sort((a, b) => b.avgScorePercent - a.avgScorePercent)
        .slice(0, 8)
        .map((r) => ({ label: r.name, value: r.avgScorePercent, tone: scoreTone(r.avgScorePercent) })),
    [rows],
  );

  const needAttention = useMemo(
    () =>
      [...rows]
        .filter((r) => r.gradedCount > 0)
        .sort((a, b) => a.accuracyPercent - b.accuracyPercent)
        .slice(0, 8)
        .map((r) => ({ label: r.name, value: r.accuracyPercent, tone: scoreTone(r.accuracyPercent) })),
    [rows],
  );

  const exportColumns: ExportColumn<StudentReportRow>[] = [
    { header: 'Student', value: (r) => r.name },
    { header: 'Class', value: (r) => r.classLabel ?? '' },
    { header: 'Roll no', value: (r) => r.rollNo ?? '' },
    { header: 'Attempts', value: (r) => r.attemptsTotal },
    { header: 'Graded', value: (r) => r.gradedCount },
    { header: 'Avg score %', value: (r) => r.avgScorePercent },
    { header: 'Accuracy %', value: (r) => r.accuracyPercent },
    { header: 'Weak topics', value: (r) => r.weakTopicCount },
  ];

  const columns = useMemo<ColumnDef<StudentReportRow>[]>(
    () => [
      {
        header: 'Student',
        cell: (c) => (
          <Link
            to={`/reports/students/${c.row.original.studentId}`}
            className="font-medium text-primary hover:underline"
          >
            {c.row.original.name}
          </Link>
        ),
      },
      {
        header: 'Class',
        cell: (c) => <span className="text-xs text-text-muted">{c.row.original.classLabel ?? '—'}</span>,
      },
      {
        header: 'Attempts',
        cell: (c) => (
          <span className="font-mono text-xs tabular-nums">
            {c.row.original.gradedCount}
            <span className="text-text-faint">/{c.row.original.attemptsTotal}</span>
          </span>
        ),
      },
      { header: 'Avg score', cell: (c) => <ProgressBar value={c.row.original.avgScorePercent} /> },
      { header: 'Accuracy', cell: (c) => <ProgressBar value={c.row.original.accuracyPercent} /> },
      {
        header: 'Weak',
        cell: (c) =>
          c.row.original.weakTopicCount > 0 ? (
            <span className="inline-flex h-[18px] items-center rounded border border-danger bg-danger-soft px-1.5 text-[10px] font-medium text-danger">
              {c.row.original.weakTopicCount}
            </span>
          ) : (
            <span className="text-text-faint">0</span>
          ),
      },
    ],
    [],
  );

  return (
    <ReportWorkspace
      title="Student performance reports"
      description="Per-student attempts, scoring, accuracy and weak-topic load"
      kpis={kpis}
      kpisLoading={list.isLoading && rows.length === 0}
      filter={
        <ReportFilterBar
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setOffset(0);
          }}
          fields={['search', 'branch', 'class']}
          searchPlaceholder="Search student name"
        />
      }
      toolbarLeft={`${total.toLocaleString()} student(s)`}
      exportDisabled={rows.length === 0}
      onExportCsv={() => exportCsv('student-reports', exportColumns, rows)}
      onExportPdf={() =>
        exportPdf('student-reports', {
          title: 'Student performance reports',
          subtitle: filterSubtitle(filter),
          columns: exportColumns,
          rows,
          kpis: kpis.map((k) => ({ label: k.label, value: String(k.value) })),
        })
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>Top students by average score</CardHeader>
          <CardBody>
            <BarList data={topStudents} unit="%" max={100} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Lowest accuracy (needs attention)</CardHeader>
          <CardBody>
            <BarList data={needAttention} unit="%" max={100} />
          </CardBody>
        </Card>
      </div>

      <Table
        columns={columns}
        data={rows}
        tableClassName="data-table-compact"
        empty={<>No students match the current filters.</>}
      />
      {total > PAGE ? (
        <Pagination total={total} limit={PAGE} offset={offset} onPageChange={setOffset} />
      ) : null}
    </ReportWorkspace>
  );
};
