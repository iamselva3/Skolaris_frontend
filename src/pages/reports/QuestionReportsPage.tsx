import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { reportsApi, type QuestionReportRow } from '@/lib/api/reports.api';
import { exportCsv, exportPdf, type ExportColumn } from '@/lib/reports/export';
import { avg, durationText, filterSubtitle, pctText } from '@/lib/reports/format';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { ReportWorkspace } from '@/components/reports/ReportWorkspace';
import { ReportFilterBar, type ReportFilterValue } from '@/components/reports/ReportFilterBar';
import { BarList, DonutChartFlat, ProgressBar, type DonutSlice } from '@/components/reports/charts';
import { scoreTone } from '@/components/reports/charts/palette';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { FlagPill } from './shared';

const PAGE = 25;

const FLAG_TONE: Record<string, DonutSlice['tone']> = {
  too_easy: 'warning',
  too_hard: 'danger',
  ambiguous: 'primary',
  normal: 'muted',
};

export const QuestionReportsPage = () => {
  const [filter, setFilter] = useState<ReportFilterValue>({});
  const [offset, setOffset] = useState(0);
  const q = useDebounce(filter.q ?? '', 300);

  const params = {
    q: q || undefined,
    programId: filter.programId ?? undefined,
    subjectId: filter.subjectId ?? undefined,
    topicId: filter.topicId ?? undefined,
    chapterId: filter.chapterId ?? undefined,
    branchId: filter.branchId,
    limit: PAGE,
    offset,
  };

  const list = useQuery({
    queryKey: ['reports', 'questions', params],
    queryFn: () => reportsApi.questions(params),
    placeholderData: (p) => p,
  });

  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  const total = list.data?.meta.total ?? 0;

  const kpis = [
    { label: 'Questions tracked', value: total.toLocaleString() },
    { label: 'Avg correct', value: pctText(avg(rows.map((r) => r.correctPercent))) },
    { label: 'Avg time / Q', value: durationText(avg(rows.map((r) => r.avgTimeSeconds))) },
    {
      label: 'Hard / ambiguous',
      value: rows.filter((r) => r.flag === 'too_hard' || r.flag === 'ambiguous').length,
    },
  ];

  const flagMix = useMemo<DonutSlice[]>(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.flag, (counts.get(r.flag) ?? 0) + 1);
    return Array.from(counts.entries()).map(([label, value]) => ({
      label: label.replace(/_/g, ' '),
      value,
      tone: FLAG_TONE[label] ?? 'muted',
    }));
  }, [rows]);

  const hardest = useMemo(
    () =>
      [...rows]
        .sort((a, b) => a.correctPercent - b.correctPercent)
        .slice(0, 8)
        .map((r) => ({
          label: r.stem || r.questionId.slice(0, 8),
          value: r.correctPercent,
          tone: scoreTone(r.correctPercent),
        })),
    [rows],
  );

  const exportColumns: ExportColumn<QuestionReportRow>[] = [
    { header: 'Question', value: (r) => r.stem || r.questionId.slice(0, 8) },
    { header: 'Type', value: (r) => String(r.type) },
    { header: 'Difficulty', value: (r) => String(r.difficulty) },
    { header: 'Subject', value: (r) => r.subject ?? '' },
    { header: 'Topic', value: (r) => r.topic ?? '' },
    { header: 'Attempts', value: (r) => r.totalAttempts },
    { header: 'Correct', value: (r) => r.correctAttempts },
    { header: 'Correct %', value: (r) => r.correctPercent },
    { header: 'Avg time', value: (r) => durationText(r.avgTimeSeconds) },
    { header: 'Flag', value: (r) => r.flag },
  ];

  const columns = useMemo<ColumnDef<QuestionReportRow>[]>(
    () => [
      {
        header: 'Question',
        cell: (c) => (
          <span className="block max-w-[360px] truncate text-text" title={c.row.original.stem}>
            {c.row.original.stem || <span className="text-text-faint">— no text —</span>}
          </span>
        ),
      },
      {
        header: 'Subject · Topic',
        cell: (c) => (
          <span className="text-xs">
            <span className="text-text">{c.row.original.subject ?? '—'}</span>
            <span className="mx-1 text-text-faint">·</span>
            <span className="text-text-muted">{c.row.original.topic ?? '—'}</span>
          </span>
        ),
      },
      {
        header: 'Attempts',
        cell: (c) => <span className="font-mono text-xs tabular-nums text-text-muted">{c.row.original.totalAttempts}</span>,
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

  return (
    <ReportWorkspace
      title="Question-wise analytics"
      description="Difficulty, accuracy and timing per question — surfaces too-hard / ambiguous items"
      kpis={kpis}
      kpisLoading={list.isLoading && rows.length === 0}
      filter={
        <ReportFilterBar
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setOffset(0);
          }}
          fields={['search', 'taxonomy', 'branch']}
          taxonomyLevels={['programId', 'subjectId', 'topicId', 'chapterId']}
          searchPlaceholder="Search subject or topic"
        />
      }
      toolbarLeft={`${total.toLocaleString()} question(s)`}
      exportDisabled={rows.length === 0}
      onExportCsv={() => exportCsv('question-analytics', exportColumns, rows)}
      onExportPdf={() =>
        exportPdf('question-analytics', {
          title: 'Question-wise analytics',
          subtitle: filterSubtitle(filter),
          columns: exportColumns,
          rows,
          kpis: kpis.map((k) => ({ label: k.label, value: String(k.value) })),
        })
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>Difficulty-flag mix (page)</CardHeader>
          <CardBody>
            <DonutChartFlat data={flagMix} centerValue={rows.length} centerLabel="questions" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Hardest questions (lowest correct %)</CardHeader>
          <CardBody>
            <BarList data={hardest} unit="%" max={100} labelWidth={180} />
          </CardBody>
        </Card>
      </div>

      <Table
        columns={columns}
        data={rows}
        tableClassName="data-table-compact"
        empty={<>No question stats yet — grade some attempts to populate analytics.</>}
      />
      {total > PAGE ? (
        <Pagination total={total} limit={PAGE} offset={offset} onPageChange={setOffset} />
      ) : null}
    </ReportWorkspace>
  );
};
