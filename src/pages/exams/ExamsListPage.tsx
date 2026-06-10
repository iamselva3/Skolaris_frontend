import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { examsApi, type Exam } from '@/lib/api/exams.api';
import type { ExamStatus } from '@/lib/types';
import { apiErrorMessage } from '@/lib/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table } from '@/components/ui/Table';
import { formatDateTime } from '@/lib/utils/format';
import { useDebounce } from '@/lib/hooks/use-debounce';

export const ExamsListPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'' | ExamStatus>('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const debounced = useDebounce(search, 300);

  const list = useQuery({
    queryKey: ['exams', { status, q: debounced, offset, pageSize }],
    queryFn: () =>
      examsApi.list({
        status: status || undefined,
        q: debounced || undefined,
        limit: pageSize,
        offset,
      }),
    placeholderData: (p) => p,
  });

  // No name modal here — clicking "New exam" creates a draft and drops the
  // teacher straight into the composer, where Step 1 collects the title +
  // duration (one fewer dialog to dismiss). Title is required there to save.
  const createDraft = useMutation({
    mutationFn: () => examsApi.create({ title: 'Untitled exam', durationSeconds: 30 * 60 }),
    onSuccess: (exam) => {
      qc.invalidateQueries({ queryKey: ['exams'] });
      navigate(`/exams/${exam.id}/compose`);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const columns: ColumnDef<Exam>[] = [
    {
      header: 'Title',
      accessorKey: 'title',
      cell: (c) => (
        <Link to={`/exams/${c.row.original.id}`} className="text-primary hover:underline">
          {c.row.original.title}
        </Link>
      ),
    },
    { header: 'Status', cell: (c) => <StatusBadge value={c.row.original.status} /> },
    { header: 'Duration (min)', cell: (c) => Math.round(c.row.original.durationSeconds / 60) },
    { header: 'Total marks', accessorKey: 'totalMarks' },
    { header: 'Opens at', cell: (c) => c.row.original.opensAt ? formatDateTime(c.row.original.opensAt) : '—' },
    { header: 'Closes at', cell: (c) => c.row.original.closesAt ? formatDateTime(c.row.original.closesAt) : '—' },
  ];

  return (
    <>
      <PageHeader
        title="Exams"
        actions={
          <Button variant="primary" loading={createDraft.isPending} onClick={() => createDraft.mutate()}>
            <Plus size={16} /> New exam
          </Button>
        }
      />

      <div className="toolbar">
        <Input
          placeholder="Search title or description"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          className="max-w-xs"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus((e.target.value as ExamStatus | '') || '');
            setOffset(0);
          }}
          className="max-w-xs"
        >
          <option value="">Any status</option>
          <option value="DRAFT">Draft</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="LIVE">Live</option>
          <option value="CLOSED">Closed</option>
        </Select>
      </div>
      <Table columns={columns} data={list.data?.data ?? []} empty={<>No exams. Create one to get started.</>} />
      {list.data ? (
        <Pagination
          total={list.data.meta.total}
          limit={pageSize}
          offset={offset}
          onPageChange={setOffset}
          onLimitChange={(l) => {
            setPageSize(l);
            setOffset(0);
          }}
        />
      ) : null}
    </>
  );
};
