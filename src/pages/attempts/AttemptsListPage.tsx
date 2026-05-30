import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { attemptsAdminApi, type AttemptRow } from '@/lib/api/attempts-admin.api';
import { examsApi } from '@/lib/api/exams.api';
import type { AttemptStatus } from '@/lib/types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table } from '@/components/ui/Table';
import { Toolbar } from '@/components/ui/Toolbar';
import { formatDateTime } from '@/lib/utils/format';

const PAGE_SIZE = 25;
const STATUSES: AttemptStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'GRADED', 'FLAGGED'];

const last7DaysIso = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};

export const AttemptsListPage = () => {
  const [status, setStatus] = useState<'' | AttemptStatus>('');
  const [examId, setExamId] = useState('');
  const [from, setFrom] = useState(last7DaysIso());
  const [to, setTo] = useState('');
  const [hasViolations, setHasViolations] = useState(false);
  const [offset, setOffset] = useState(0);

  const exams = useQuery({
    queryKey: ['exams', 'lookup'],
    queryFn: () => examsApi.list({ limit: 200 }),
  });
  const list = useQuery({
    queryKey: ['attempts', { status, examId, from, to, hasViolations, offset }],
    queryFn: () =>
      attemptsAdminApi.list({
        status: status || undefined,
        examId: examId || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        hasViolations: hasViolations || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    placeholderData: (p) => p,
  });

  const columns: ColumnDef<AttemptRow>[] = [
    {
      header: 'Student',
      cell: (c) => (
        <div>
          <div>{c.row.original.studentName}</div>
          <div className="text-[11px] text-text-muted">{c.row.original.studentEmail}</div>
        </div>
      ),
    },
    {
      header: 'Exam',
      cell: (c) => (
        <Link
          to={`/exams/${c.row.original.examId}/attempts/${c.row.original.id}`}
          className="text-primary hover:underline"
        >
          {c.row.original.examTitle}
        </Link>
      ),
    },
    { header: 'Status', cell: (c) => <StatusBadge value={c.row.original.status} /> },
    { header: 'Score', cell: (c) => c.row.original.score ?? '—' },
    { header: 'Violations', accessorKey: 'violationCount' },
    { header: 'Submitted', cell: (c) => formatDateTime(c.row.original.submittedAt) },
    {
      header: '',
      id: 'action',
      cell: (c) => (
        <Link
          to={`/exams/${c.row.original.examId}/attempts/${c.row.original.id}`}
          className="btn-link"
        >
          View →
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Attempts" description="Cross-exam browser" />
      <Toolbar
        left={
          <>
            <Select
              value={examId}
              onChange={(e) => {
                setExamId(e.target.value);
                setOffset(0);
              }}
              className="w-56"
            >
              <option value="">All exams</option>
              {exams.data?.data.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(e) => {
                setStatus((e.target.value as AttemptStatus | '') || '');
                setOffset(0);
              }}
              className="w-40"
            >
              <option value="">Any status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ').toLowerCase()}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
            <Checkbox
              checked={hasViolations}
              onChange={(e) => {
                setHasViolations(e.target.checked);
                setOffset(0);
              }}
              label="Has violations"
            />
          </>
        }
      />
      <Table columns={columns} data={list.data?.data ?? []} empty={<>No attempts in this window.</>} />
      {list.data ? (
        <Pagination
          total={list.data.meta.total}
          limit={PAGE_SIZE}
          offset={offset}
          onPageChange={setOffset}
        />
      ) : null}
    </>
  );
};
