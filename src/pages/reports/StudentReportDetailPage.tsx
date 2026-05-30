import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { reportsApi, type StudentReportDetail } from '@/lib/api/reports.api';
import { exportCsv, exportPdf, type ExportColumn } from '@/lib/reports/export';
import { durationText, pctText } from '@/lib/reports/format';
import { ReportWorkspace } from '@/components/reports/ReportWorkspace';
import { LineChartFlat, ProgressBar } from '@/components/reports/charts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';

type WeakRow = StudentReportDetail['weakTopics'][number];

export const StudentReportDetailPage = () => {
  const { studentId = '' } = useParams();
  const detail = useQuery({
    queryKey: ['reports', 'student-detail', studentId],
    queryFn: () => reportsApi.studentDetail(studentId),
    enabled: !!studentId,
  });
  const d = detail.data;

  const trend = useMemo(
    () => (d?.trend ?? []).map((t) => ({ label: t.examTitle, value: t.scorePercent })),
    [d],
  );

  const weakExportColumns: ExportColumn<WeakRow>[] = [
    { header: 'Subject', value: (r) => r.subject },
    { header: 'Topic', value: (r) => r.topic },
    { header: 'Score %', value: (r) => r.scorePercent },
    { header: 'Correct', value: (r) => r.correctCount },
    { header: 'Attempts', value: (r) => r.attemptsCount },
  ];

  const weakColumns = useMemo<ColumnDef<WeakRow>[]>(
    () => [
      { header: 'Subject', cell: (c) => <span className="text-text">{c.row.original.subject}</span> },
      { header: 'Topic', cell: (c) => <span className="text-text-muted">{c.row.original.topic}</span> },
      {
        header: 'Correct',
        cell: (c) => (
          <span className="font-mono text-xs tabular-nums text-text-muted">
            {c.row.original.correctCount}/{c.row.original.attemptsCount}
          </span>
        ),
      },
      { header: 'Score', cell: (c) => <ProgressBar value={c.row.original.scorePercent} /> },
    ],
    [],
  );

  const kpis = d
    ? [
        { label: 'Attempts', value: d.summary.attemptsTotal.toLocaleString() },
        { label: 'Avg score', value: pctText(d.summary.avgScore) },
        { label: 'Accuracy', value: pctText(d.accuracyPercent) },
        { label: 'Weak topics', value: d.summary.weakTopicsCount.toLocaleString() },
        { label: 'Avg time / Q', value: durationText(d.avgTimePerQuestionSeconds) },
      ]
    : undefined;

  return (
    <ReportWorkspace
      title={d ? d.student.name : 'Student report'}
      description={
        d
          ? [d.student.classLabel, d.student.rollNo ? `Roll ${d.student.rollNo}` : null]
              .filter(Boolean)
              .join(' · ') || undefined
          : undefined
      }
      breadcrumb={[
        { label: 'Reports', to: '/reports' },
        { label: 'Student reports', to: '/reports/students' },
        { label: d ? d.student.name : 'Student' },
      ]}
      kpis={kpis}
      kpisLoading={detail.isLoading}
      exportDisabled={!d || d.weakTopics.length === 0}
      onExportCsv={() => d && exportCsv('student-weak-topics', weakExportColumns, d.weakTopics)}
      onExportPdf={() =>
        d &&
        exportPdf('student-weak-topics', {
          title: `Student report — ${d.student.name}`,
          subtitle: `Weak topics · accuracy ${pctText(d.accuracyPercent)}`,
          columns: weakExportColumns,
          rows: d.weakTopics,
          kpis: kpis?.map((k) => ({ label: k.label, value: String(k.value) })),
        })
      }
    >
      {detail.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader />
        </div>
      ) : !d ? (
        <EmptyState title="Report unavailable" message="This student could not be loaded." />
      ) : (
        <>
          <Card>
            <CardHeader>Score progression</CardHeader>
            <CardBody>
              <LineChartFlat data={trend} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>Weak topics (below 60%)</CardHeader>
            <CardBody className="p-0">
              <Table
                columns={weakColumns}
                data={d.weakTopics}
                tableClassName="data-table-compact"
                empty={<>No weak topics — this student is on track.</>}
              />
            </CardBody>
          </Card>
        </>
      )}
    </ReportWorkspace>
  );
};
