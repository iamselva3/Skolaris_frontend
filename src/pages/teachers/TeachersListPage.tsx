import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { teachersApi, type User } from '@/lib/api/teachers.api';
import { branchesApi } from '@/lib/api/branches.api';
import { apiErrorMessage } from '@/lib/api/client';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useActiveBranch } from '@/lib/hooks/use-active-branch';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table } from '@/components/ui/Table';
import { formatDateTime } from '@/lib/utils/format';

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  phone: z.string().regex(/^\d{10}$/, 'Must be exactly 10 digits').optional().or(z.literal('')),
  password: z.string().min(8).max(128),
  branchId: z.string().uuid().optional().or(z.literal('')),
});
type CreateForm = z.infer<typeof createSchema>;

const editSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().regex(/^\d{10}$/, 'Must be exactly 10 digits').optional().or(z.literal('')),
  branchId: z.string().uuid().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'DISABLED']),
});
type EditForm = z.infer<typeof editSchema>;

export const TeachersListPage = () => {
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const activeBranchId = useActiveBranch();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const qc = useQueryClient();

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list({ limit: 200 }),
    staleTime: 5 * 60 * 1000,
  });

  const list = useQuery({
    queryKey: ['teachers', { filterBranchId: activeBranchId, offset, pageSize }],
    queryFn: () =>
      teachersApi.list({
        branchId: activeBranchId || undefined,
        limit: pageSize,
        offset,
      }),
    placeholderData: (p) => p,
  });

  const branchMap = new Map((branches.data?.data ?? []).map((b) => [b.id, b.name]));

  // Client-side name search (list is already branch-filtered at the server)
  const visibleRows = debouncedSearch
    ? (list.data?.data ?? []).filter(
        (t) =>
          t.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          t.email.toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : (list.data?.data ?? []);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => teachersApi.disable(id),
    onSuccess: () => {
      toast.success('Teacher disabled successfully');
      qc.invalidateQueries({ queryKey: ['teachers'] });
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const columns: ColumnDef<User>[] = [
    { header: 'Name', accessorKey: 'name' },
    { header: 'Email', accessorKey: 'email' },
    {
      header: 'Phone',
      cell: (c) => c.row.original.phone || <span className="text-text-faint">—</span>,
    },
    {
      header: 'Branch',
      cell: (c) => {
        const id = c.row.original.branchId;
        return id
          ? (branchMap.get(id) ?? id.slice(0, 8) + '…')
          : <span className="text-text-faint">—</span>;
      },
    },
    {
      header: 'Status',
      cell: (c) => <StatusBadge value={c.row.original.status} />,
    },
    { header: 'Last login', cell: (c) => formatDateTime(c.row.original.lastLoginAt) },
    {
      header: '',
      id: 'actions',
      cell: (c) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditTarget(c.row.original)}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:bg-hover hover:text-text"
            title="Edit teacher"
          >
            <Pencil size={13} /> Edit
          </button>
          <button
            type="button"
            onClick={() => setDeleteTarget(c.row.original)}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:bg-danger-soft hover:text-danger"
            title="Disable teacher account"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      ),
    },
  ];

  const resetFilters = () => {
    setSearch('');
    setOffset(0);
  };
  const hasFilters = !!search || !!activeBranchId;
  const onPageSizeChange = (n: number) => { setPageSize(n); setOffset(0); };

  return (
    <>
      <PageHeader
        title="Teachers"
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Add teacher
          </Button>
        }
      />

      {/* Filter toolbar */}
      <div className="toolbar">
        <Input
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          className="max-w-xs"
        />
        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <Table columns={columns} data={visibleRows} empty={<>No teachers match the current filters.</>} />
      {list.data && !debouncedSearch ? (
        <Pagination
          total={list.data.meta.total}
          limit={pageSize}
          offset={offset}
          onPageChange={setOffset}
          onLimitChange={onPageSizeChange}
        />
      ) : null}

      <CreateTeacherModal
        open={createOpen}
        branches={branches.data?.data ?? []}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['teachers'] });
          setCreateOpen(false);
        }}
      />

      {editTarget && (
        <EditTeacherModal
          teacher={editTarget}
          branches={branches.data?.data ?? []}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['teachers'] });
            setEditTarget(null);
          }}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <Modal
          open
          title="Disable teacher account?"
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
              >
                <Trash2 size={14} /> Disable account
              </Button>
            </>
          }
        >
          <p className="text-sm text-text">
            Are you sure you want to disable{' '}
            <strong className="font-semibold">{deleteTarget.name}</strong>'s account?
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Their account will be marked <strong>DISABLED</strong>. They will no longer be able to
            log in but all associated data (questions, classrooms) is preserved.
          </p>
        </Modal>
      )}
    </>
  );
};

/* ─── Create modal ─────────────────────────────────────────────────────── */

const CreateTeacherModal = ({
  open,
  branches,
  onClose,
  onCreated,
}: {
  open: boolean;
  branches: Array<{ id: string; name: string }>;
  onClose: () => void;
  onCreated: () => void;
}) => {
  const { register, handleSubmit, reset, formState } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });
  const mutation = useMutation({
    mutationFn: teachersApi.create,
    onSuccess: () => {
      toast.success('Teacher created');
      reset();
      onCreated();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Modal
      open={open}
      title="Add teacher"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            onClick={handleSubmit((v) =>
              mutation.mutate({
                email: v.email,
                phone: v.phone || undefined,
                name: v.name,
                password: v.password,
                role: 'TEACHER',
                branchId: v.branchId || undefined,
              }),
            )}
          >
            Create
          </Button>
        </>
      }
    >
      <FormField label="Email" htmlFor="te" error={formState.errors.email?.message}>
        <Input id="te" type="email" {...register('email')} />
      </FormField>
      <FormField label="Full name" htmlFor="tn" error={formState.errors.name?.message}>
        <Input id="tn" {...register('name')} />
      </FormField>
      <FormField label="Mobile Number" htmlFor="tph" error={formState.errors.phone?.message}>
        <Input id="tph" type="tel" maxLength={10} {...register('phone')} />
      </FormField>
      <FormField label="Initial password" htmlFor="tp" error={formState.errors.password?.message}>
        <Input id="tp" type="text" {...register('password')} />
      </FormField>
      <FormField label="Branch (optional)" htmlFor="tb">
        <Select id="tb" {...register('branchId')}>
          <option value="">No branch</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </FormField>
    </Modal>
  );
};

/* ─── Edit modal ────────────────────────────────────────────────────────── */

const EditTeacherModal = ({
  teacher,
  branches,
  onClose,
  onSaved,
}: {
  teacher: User;
  branches: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { register, handleSubmit, formState } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: teacher.name,
      phone: teacher.phone || '',
      branchId: teacher.branchId ?? '',
      status: teacher.status,
    },
  });

  const mutation = useMutation({
    mutationFn: (v: EditForm) =>
      teachersApi.update(teacher.id, {
        name: v.name,
        phone: v.phone || null,
        branchId: v.branchId || null,
        status: v.status,
      }),
    onSuccess: () => {
      toast.success('Teacher updated');
      onSaved();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Modal
      open
      title={`Edit teacher — ${teacher.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            onClick={handleSubmit((v) => mutation.mutate(v))}
          >
            Save changes
          </Button>
        </>
      }
    >
      <FormField label="Full name" htmlFor="etn" error={formState.errors.name?.message}>
        <Input id="etn" {...register('name')} />
      </FormField>
      <FormField label="Mobile Number" htmlFor="etph" error={formState.errors.phone?.message}>
        <Input id="etph" type="tel" maxLength={10} {...register('phone')} />
      </FormField>
      <FormField label="Branch" htmlFor="etb">
        <Select id="etb" {...register('branchId')}>
          <option value="">No branch</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </FormField>
      <FormField label="Status" htmlFor="ets" error={formState.errors.status?.message}>
        <Select id="ets" {...register('status')}>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
        </Select>
      </FormField>
      <p className="mt-2 text-xs text-text-faint">
        Email cannot be changed. To reset the password, update it in the teacher's profile.
      </p>
    </Modal>
  );
};
