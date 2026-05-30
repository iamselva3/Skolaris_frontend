import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { reportsApi, type ExamReportDetail } from '@/lib/api/reports.api';
import { exportCsv, exportPdf, type ExportColumn } from '@/lib/reports/export';
import { durationText, pctText } from '@/lib/reports/format';
import { ReportWorkspace } from '@/components/reports/ReportWorkspace';
import { ColumnChartFlat, ProgressBar, type BarDatum } from '@/components/reports/charts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';
import { FlagPill } from './shared';

type QuestionRow = ExamReportDetail['questions'][number];

const BUCKET_TONE: Record<string, BarDatum['tone']> = {
  '0-20': 'danger',
  '20-40': 'warning',
  '40-60': 'primary',
  '60-80': 'primary',
  '80-100': 'success',
};

export const ExamReportDetailPage = () => {
  const { examId = '' } = useParams();
  const detail = useQuery({
    queryKey: ['reports', 'exam-detail', examId],
    queryFn: () => reportsApi.examDetail(examId),
    enabled: !!examId,
  });

  const d = detail.data;

  const distribution = useMemo<BarDatum[]>(
    () =>
      (d?.summary.distribution ?? []).map((b) => ({
        label: b.bucket,
        value: b.count,
        tone: BUCKET_TONE[b.bucket] ?? 'primary',
      })),
    [d],
  );

  const exportColumns: ExportColumn<QuestionRow>[] = [
    { header: 'Question', value: (r) => r.stem || r.questionId.slice(0, 8) },
    { header: 'Type', value: (r) => r.type ?? '' },
    { header: 'Difficulty', value: (r) => r.difficulty ?? '' },
    { header: 'Subject', value: (r) => r.subject ?? '' },
    { header: 'Topic', value: (r) => r.topic ?? '' },
    { header: 'Answered', value: (r) => r.totalAnswered },
    { header: 'Correct', value: (r) => r.correctCount },
    { header: 'Correct %', value: (r) => r.correctPercent },
    { header: 'Avg time', value: (r) => durationText(r.avgTimeSeconds) },
    { header: 'Flag', value: (r) => r.flag },
  ];

  const columns = useMemo<ColumnDef<QuestionRow>[]>(
    () => [
      {
        id: 'idx',
        header: '#',
        cell: (c) => <span className="font-mono text-[11px] text-text-faint">{c.row.index + 1}</span>,
      },
      {
        header: 'Question',
        cell: (c) => (
          <span className="block max-w-[420px] truncate text-text" title={c.row.original.stem}>
            {c.row.original.stem || <span className="text-text-faint">— no text —</span>}
          </span>
        ),
      },
      {
        header: 'Type',
        cell: (c) => (
          <span className="text-[11px] uppercase tracking-[0.4px] text-text-muted">
            {(c.row.original.type ?? '—').toString().replace(/_/g, ' ').toLowerCase()}
          </span>
        ),
      },
      {
        header: 'Answered',
        cell: (c) => <span className="font-mono text-xs tabular-nums text-text-muted">{c.row.original.totalAnswered}</span>,
      },
      { header: 'Correct %', cell: (c) => <ProgressBar value={c.row.original.correctPercent} /> },
      {
        header: 'Avg time',
        cell: (c) => <span className="text-xs text-text-muted">{durationText(c.row.original.avgTimeSeconds)}</span>,
      },
      { header: 'Flag', cell: (c) => <FlagPill value={c.row.original.flag} /> },
    ],
    [],
  );

  const kpis = d
    ? [
        { label: 'Attempts', value: d.summary.totalAttempts.toLocaleString() },
        { label: 'Submitted', value: d.summary.submittedCount.toLocaleString() },
        { label: 'Graded', value: d.summary.gradedCount.toLocaleString() },
        {
          label: 'Avg score',
          value: `${Math.round(d.summary.avgScore * 10) / 10} / ${d.header.totalMarks}`,
        },
        {
          label: 'Avg score %',
          value: pctText((d.summary.avgScore / Math.max(1, d.header.totalMarks)) * 100),
        },
      ]
    : undefined;

  return (
    <ReportWorkspace
      title={d ? d.header.title : 'Exam report'}
      description={
        d ? [d.header.program, d.header.subject].filter(Boolean).join(' · ') || undefined : undefined
      }
      breadcrumb={[
        { label: 'Reports', to: '/reports' },
        { label: 'Exam reports', to: '/reports/exams' },
        { label: d ? d.header.title : 'Exam' },
      ]}
      kpis={kpis}
      kpisLoading={detail.isLoading}
      exportDisabled={!d || d.questions.length === 0}
      onExportCsv={() => d && exportCsv('exam-questions', exportColumns, d.questions)}
      onExportPdf={() =>
        d &&
        exportPdf('exam-questions', {
          title: `Exam report — ${d.header.title}`,
          subtitle: [d.header.program, d.header.subject].filter(Boolean).join(' · '),
          columns: exportColumns,
          rows: d.questions,
          kpis: kpis?.map((k) => ({ label: k.label, value: String(k.value) })),
        })
      }
    >
      {detail.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader />
        </div>
      ) : !d ? (
        <EmptyState title="Report unavailable" message="This exam could not be loaded." />
      ) : (
        <>
          <Card>
            <CardHeader>Score distribution (% of total marks)</CardHeader>
            <CardBody>
              <ColumnChartFlat data={distribution} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>Per-question performance</CardHeader>
            <CardBody className="p-0">
              <Table
                columns={columns}
                data={d.questions}
                tableClassName="data-table-compact"
                empty={<>No graded answers yet for this exam.</>}
              />
            </CardBody>
          </Card>
        </>
      )}
    </ReportWorkspace>
  );
};
