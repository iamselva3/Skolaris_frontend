import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/client';
import {
  questionPapersApi,
  type PaperStatus,
  type QuestionPaper,
} from '@/lib/api/question-papers.api';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { formatDateTime } from '@/lib/utils/format';
import { Button } from '@/components/ui/Button';
import { CourseSelector } from '@/components/ui/CourseSelector';
import type { TaxonomySelection } from '@/lib/api/taxonomy.api';
import { Drawer } from '@/components/ui/Drawer';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table } from '@/components/ui/Table';
import type { KpiItem } from '@/components/reports/KpiStrip';
import { ReportWorkspace } from '@/components/reports/ReportWorkspace';

type StatusFilter = '' | PaperStatus;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: '', label: 'Active (not archived)' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const Meta = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs uppercase text-text-muted">{label}</span>
    <span className="text-text">{value}</span>
  </div>
);

export const ManageQuestionPapersPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [status, setStatus] = useState<StatusFilter>('');
  const [search, setSearch] = useState('');
  const [taxonomy, setTaxonomy] = useState<TaxonomySelection>({});
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<QuestionPaper | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<QuestionPaper | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const debounced = useDebounce(search, 300);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['question-papers'] });

  const list = useQuery({
    queryKey: [
      'question-papers',
      { status, q: debounced, programId: taxonomy.programId, subjectId: taxonomy.subjectId, offset, pageSize },
    ],
    queryFn: () =>
      questionPapersApi.list({
        status: status || undefined,
        q: debounced || undefined,
        programId: taxonomy.programId ?? undefined,
        subjectId: taxonomy.subjectId ?? undefined,
        limit: pageSize,
        offset,
      }),
    placeholderData: (p) => p,
  });

  const summary = useQuery({
    queryKey: ['question-papers', 'summary'],
    queryFn: questionPapersApi.summary,
    staleTime: 30_000,
  });

  const createDraft = useMutation({
    mutationFn: (body: { title: string; durationSeconds: number }) =>
      questionPapersApi.create(body),
    onSuccess: (paper) => {
      invalidate();
      navigate(`/question-papers/${paper.id}/compose`);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: string) => questionPapersApi.clone(id),
    onSuccess: () => {
      toast.success('Question paper duplicated');
      invalidate();
      setSelected(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const archiveMutation = useMutation({
    mutationFn: (p: QuestionPaper) =>
      p.status === 'ARCHIVED' ? questionPapersApi.unarchive(p.id) : questionPapersApi.archive(p.id),
    onSuccess: () => {
      toast.success('Updated');
      invalidate();
      setSelected(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => questionPapersApi.remove(id),
    onSuccess: () => {
      toast.success('Question paper deleted');
      invalidate();
      setConfirmDelete(null);
      setSelected(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const kpis: KpiItem[] = [
    { label: 'Total (active)', value: summary.data?.total ?? '—' },
    { label: 'Draft', value: summary.data?.draft ?? '—' },
    { label: 'Published', value: summary.data?.published ?? '—' },
    { label: 'Archived', value: summary.data?.archived ?? '—' },
  ];

  const columns: ColumnDef<QuestionPaper>[] = [
    {
      header: 'Title',
      accessorKey: 'title',
      cell: (c) => (
        <Link to={`/question-papers/${c.row.original.id}/compose`} className="text-primary hover:underline">
          {c.row.original.title}
        </Link>
      ),
    },
    {
      header: 'Subject',
      cell: (c) => (c.row.original.subjects.length ? c.row.original.subjects.join(', ') : '—'),
    },
    { header: 'Questions', cell: (c) => c.row.original.questionCount },
    { header: 'Marks', cell: (c) => c.row.original.totalMarks },
    { header: 'Status', cell: (c) => <StatusBadge value={c.row.original.status} /> },
    { header: 'Last modified', cell: (c) => formatDateTime(c.row.original.updatedAt) },
    {
      header: 'Actions',
      id: 'actions',
      cell: (c) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Open actions for ${c.row.original.title}`}
          onClick={() => setSelected(c.row.original)}
        >
          <MoreHorizontal size={14} />
        </Button>
      ),
    },
  ];

  return (
    <>
      <ReportWorkspace
        title="Question Papers"
        description="Reusable papers built from the Question Bank — create, edit, reorder, clone, publish and archive. A standalone module; exams can later import a paper from the Exam side."
        breadcrumb={[{ label: 'Workspace' }, { label: 'Question Papers' }]}
        kpis={kpis}
        kpisLoading={summary.isLoading}
        filter={
          <div className="flex flex-col gap-2">
            <div className="toolbar">
              <Input
                placeholder="Search title"
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
                  setStatus((e.target.value as StatusFilter) || '');
                  setOffset(0);
                }}
                className="max-w-xs"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <div className="ml-auto flex items-center gap-2">
                {/* Shortcuts to the Question Bank — papers are built from bank questions. */}
                {/* <Button variant="secondary" onClick={() => navigate('/questions')}>
                  Question Bank
                </Button>
                <Button variant="secondary" onClick={() => navigate('/questions/new')}>
                  <Plus size={16} /> Add question
                </Button> */}
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  <Plus size={16} /> Create Question Paper
                </Button>
              </div>
            </div>
            <CourseSelector
              value={taxonomy}
              onChange={(v) => {
                setTaxonomy(v);
                setOffset(0);
              }}
              levels={['programId', 'subjectId']}
              size="sm"
            />
          </div>
        }
        toolbarLeft={
          list.data ? `${list.data.meta.total} paper${list.data.meta.total === 1 ? '' : 's'}` : null
        }
      >
        <Table
          columns={columns}
          data={list.data?.data ?? []}
          empty={<>No question papers match your filters. Create one to get started.</>}
        />
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
      </ReportWorkspace>

      {selected ? (
        <Drawer open title={selected.title} onClose={() => setSelected(null)} width={460}>
          <div className="flex flex-col gap-4">
            <section className="grid grid-cols-2 gap-3 text-sm">
              <Meta label="Status" value={<StatusBadge value={selected.status} />} />
              <Meta label="Questions" value={selected.questionCount} />
              <Meta label="Total marks" value={selected.totalMarks} />
              <Meta label="Subject(s)" value={selected.subjects.length ? selected.subjects.join(', ') : '—'} />
              <Meta label="Created" value={formatDateTime(selected.createdAt)} />
              <Meta label="Last modified" value={formatDateTime(selected.updatedAt)} />
            </section>
            <section className="flex flex-col gap-2">
              <div className="text-xs font-medium uppercase text-text-muted">Actions</div>
              <Button variant="primary" onClick={() => navigate(`/question-papers/${selected.id}/compose`)}>
                Compose / edit
              </Button>
              <Button variant="secondary" loading={cloneMutation.isPending} onClick={() => cloneMutation.mutate(selected.id)}>
                Duplicate
              </Button>
              <Button variant="secondary" loading={archiveMutation.isPending} onClick={() => archiveMutation.mutate(selected)}>
                {selected.status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
              </Button>
              <Button variant="destructive" onClick={() => setConfirmDelete(selected)}>
                Delete
              </Button>
            </section>
          </div>
        </Drawer>
      ) : null}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete question paper?"
        message="This permanently removes the paper and its question list. Exams already created from it are unaffected."
        variant="destructive"
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
      />

      <CreatePaperDrawer
        open={createOpen}
        loading={createDraft.isPending}
        onClose={() => setCreateOpen(false)}
        onCreate={(title) => createDraft.mutate({ title, durationSeconds: 30 * 60 })}
      />
    </>
  );
};

const CreatePaperDrawer = ({
  open,
  loading,
  onClose,
  onCreate,
}: {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onCreate: (title: string) => void;
}) => {
  const [title, setTitle] = useState('');

  const submit = (): void => {
    const t = title.trim();
    if (!t) {
      toast.error('Enter a question paper title');
      return;
    }
    onCreate(t);
  };

  return (
    <Drawer
      open={open}
      title="New question paper"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" loading={loading} onClick={submit}>
            Create &amp; compose
          </Button>
        </>
      }
    >
      {/* A question paper is a reusable library asset — no duration here. Timing
          is set later when an exam is built from it. */}
      <FormField label="Paper title" htmlFor="new-paper-title">
        <Input
          id="new-paper-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="e.g. Physics — Practice Paper 1"
        />
      </FormField>
    </Drawer>
  );
};
