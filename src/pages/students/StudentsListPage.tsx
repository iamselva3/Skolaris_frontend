import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { branchesApi } from '@/lib/api/branches.api';
import { classroomsApi } from '@/lib/api/classrooms.api';
import { studentsApi, type Student } from '@/lib/api/students.api';
import { apiErrorMessage } from '@/lib/api/client';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { useActiveBranch } from '@/lib/hooks/use-active-branch';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table } from '@/components/ui/Table';
import { ImportStudentsModal } from './ImportStudentsModal';

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
  branchId: z.string().uuid().optional().or(z.literal('')),
  parentContact: z.string().regex(/^\d{10}$/, 'Must be exactly 10 digits').optional().or(z.literal('')),
});
type CreateForm = z.infer<typeof createSchema>;

const editSchema = z.object({
  name: z.string().min(1).max(120),
  branchId: z.string().uuid().optional().or(z.literal('')),
  rollNo: z.string().max(80).optional().or(z.literal('')),
  parentContact: z.string().regex(/^\d{10}$/, 'Must be exactly 10 digits').optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'DISABLED']),
});
type EditForm = z.infer<typeof editSchema>;

export const StudentsListPage = () => {
  const [search, setSearch] = useState('');
  const effectiveBranchId = useActiveBranch();
  const [batchFilter, setBatchFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Student | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list({ limit: 200 }),
    staleTime: 5 * 60 * 1000,
  });

  const classrooms = useQuery({
    queryKey: ['classrooms', { branchId: effectiveBranchId }],
    queryFn: () => classroomsApi.list({ branchId: effectiveBranchId || undefined, limit: 200 }),
    staleTime: 5 * 60 * 1000,
  });

  // A student joins the classroom system only once an admin/teacher allocates
  // them to a classroom. Filtering is driven ENTIRELY by classroom membership:
  // the backend matches student → membership → classroom.{name,section}. The
  // batch/section the user picks come from the admin-created classrooms list,
  // never from any field on the student record. Picking a batch alone returns
  // every member across that batch's sections; adding a section narrows it.
  const classroomList = classrooms.data?.data ?? [];
  const isUnallocated = batchFilter === 'unallocated';
  const subjectOptions = [
    ...new Set(
      classroomList
        .map((c) => c.subject)
        .filter((s): s is string => !!s),
    ),
  ].sort();
  const batchOptions = [
    ...new Set(
      classroomList
        .filter((c) => (subjectFilter ? c.subject === subjectFilter : true))
        .map((c) => c.name)
    ),
  ].sort();
  const sectionOptions = [
    ...new Set(
      classroomList
        .filter((c) => (subjectFilter ? c.subject === subjectFilter : true))
        .filter((c) => (batchFilter && !isUnallocated ? c.name === batchFilter : true))
        .map((c) => c.section)
        .filter((s): s is string => !!s),
    ),
  ].sort();

  const list = useQuery({
    queryKey: ['students', { q: debouncedSearch, branchId: effectiveBranchId, batchFilter, sectionFilter, subjectFilter, offset, pageSize }],
    queryFn: () =>
      studentsApi.list({
        q: debouncedSearch || undefined,
        branchId: effectiveBranchId || undefined,
        // Resolved to classroom membership server-side (classroom.name / .section).
        batch: !isUnallocated && batchFilter ? batchFilter : undefined,
        section: !isUnallocated && sectionFilter ? sectionFilter : undefined,
        subject: !isUnallocated && subjectFilter ? subjectFilter : undefined,
        unallocated: isUnallocated ? true : undefined,
        limit: pageSize,
        offset,
      }),
    placeholderData: (prev) => prev,
  });

  const branchMap = new Map((branches.data?.data ?? []).map((b) => [b.id, b.name]));

  const visibleRows = list.data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => studentsApi.disable(id),
    onSuccess: () => {
      toast.success('Student disabled successfully');
      qc.invalidateQueries({ queryKey: ['students'] });
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const resetFilters = () => {
    setSearch('');
    setBatchFilter('');
    setSectionFilter('');
    setSubjectFilter('');
    setOffset(0);
  };
  const hasFilters = !!search || !!effectiveBranchId || !!batchFilter || !!sectionFilter || !!subjectFilter;
  const onPageSizeChange = (n: number) => { setPageSize(n); setOffset(0); };

  const columns: ColumnDef<Student>[] = [
    { header: 'Name', accessorKey: 'name' },
    { header: 'Email', accessorKey: 'email' },
    { header: 'Mobile', cell: (c) => c.row.original.parentContact ?? '—' },
    { header: 'Roll no', cell: (c) => c.row.original.rollNo ?? '—' },
    {
      header: 'Discipline',
      cell: (c) =>
        c.row.original.subject ?? <span className="text-text-faint">—</span>,
    },
    {
      header: 'Batch',
      cell: (c) =>
        c.row.original.batch ?? <span className="text-text-faint">Unallocated</span>,
    },
    {
      header: 'Section',
      cell: (c) =>
        c.row.original.section ? `Sec ${c.row.original.section}` : <span className="text-text-faint">—</span>,
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
    ...(isSuperAdmin
      ? [
          {
            header: '',
            id: 'actions',
            cell: (c: { row: { original: Student } }) => (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditTarget(c.row.original)}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:bg-hover hover:text-text"
                  title="Edit student"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(c.row.original)}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:bg-danger-soft hover:text-danger"
                  title="Disable student account"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            ),
          } as ColumnDef<Student>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Students"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              Import students
            </Button>
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              <Plus size={16} /> Add student
            </Button>
          </div>
        }
      />

      {/* Filter toolbar */}
      <div className="toolbar">
        <Input
          placeholder="Search name, email or roll no"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          className="max-w-xs"
        />

        <Select
          value={subjectFilter}
          onChange={(e) => {
            setSubjectFilter(e.target.value);
            setBatchFilter('');
            setSectionFilter('');
            setOffset(0);
          }}
          className="max-w-[160px]"
        >
          <option value="">All disciplines</option>
          {subjectOptions.map((subject) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
        </Select>

        <Select
          value={batchFilter}
          onChange={(e) => {
            setBatchFilter(e.target.value);
            setSectionFilter('');
            setOffset(0);
          }}
          className="max-w-[160px]"
        >
          <option value="">All batches</option>
          <option value="unallocated">Unallocated</option>
          {batchOptions.map((batch) => (
            <option key={batch} value={batch}>
              {batch}
            </option>
          ))}
        </Select>

        <Select
          value={sectionFilter}
          onChange={(e) => {
            setSectionFilter(e.target.value);
            setOffset(0);
          }}
          disabled={!batchFilter || isUnallocated || sectionOptions.length === 0}
          className="max-w-[140px]"
        >
          <option value="">All sections</option>
          {sectionOptions.map((section) => (
            <option key={section} value={section}>
              Sec {section}
            </option>
          ))}
        </Select>

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

      {list.error ? <ErrorBanner onRetry={() => list.refetch()} /> : null}

      <Table
        columns={columns}
        data={visibleRows}
        empty={
          <>
            <p className="text-sm font-medium text-text">No students</p>
            <p className="text-sm">Try clearing filters or add a student.</p>
          </>
        }
      />
      {list.data ? (
        <Pagination
          total={list.data.meta.total}
          limit={pageSize}
          offset={offset}
          onPageChange={setOffset}
          onLimitChange={onPageSizeChange}
        />
      ) : null}

      <CreateStudentModal
        open={modalOpen}
        branchOptions={branches.data?.data ?? []}
        isSuperAdmin={isSuperAdmin}
        userBranchId={user?.branchId ?? undefined}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['students'] });
          setModalOpen(false);
        }}
      />

      <ImportStudentsModal
        open={importOpen}
        branchOptions={branches.data?.data ?? []}
        isSuperAdmin={isSuperAdmin}
        userBranchId={user?.branchId ?? undefined}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          qc.invalidateQueries({ queryKey: ['students'] });
          setImportOpen(false);
        }}
      />

      {editTarget && (
        <EditStudentModal
          student={editTarget}
          branchOptions={branches.data?.data ?? []}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['students'] });
            setEditTarget(null);
          }}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <Modal
          open
          title="Disable student account?"
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
            log in, but all their attempt history and data is preserved.
          </p>
        </Modal>
      )}
    </>
  );
};

/* ─── Create modal ─────────────────────────────────────────────────────── */

interface CreateModalProps {
  open: boolean;
  branchOptions: Array<{ id: string; name: string }>;
  isSuperAdmin: boolean;
  userBranchId?: string;
  onClose: () => void;
  onCreated: () => void;
}

const CreateStudentModal = ({ open, branchOptions, isSuperAdmin, userBranchId, onClose, onCreated }: CreateModalProps) => {
  const { register, handleSubmit, reset, formState } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });
  const mutation = useMutation({
    mutationFn: studentsApi.create,
    onSuccess: () => {
      toast.success('Student created');
      reset();
      onCreated();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Modal
      open={open}
      title="Add student"
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
                name: v.name,
                password: v.password,
                branchId: isSuperAdmin ? (v.branchId ?? '') : (userBranchId ?? ''),
                parentContact: v.parentContact || undefined,
              }),
            )}
          >
            Create
          </Button>
        </>
      }
    >
      <form noValidate>
        <FormField label="Email" htmlFor="se" error={formState.errors.email?.message}>
          <Input id="se" type="email" invalid={!!formState.errors.email} {...register('email')} />
        </FormField>
        <FormField label="Full name" htmlFor="sn" error={formState.errors.name?.message}>
          <Input id="sn" invalid={!!formState.errors.name} {...register('name')} />
        </FormField>
        <FormField label="Initial password" htmlFor="sp" error={formState.errors.password?.message}>
          <Input id="sp" type="text" invalid={!!formState.errors.password} {...register('password')} />
        </FormField>
        {isSuperAdmin && (
          <FormField label="Branch" htmlFor="sb" error={formState.errors.branchId?.message}>
            <Select id="sb" invalid={!!formState.errors.branchId} {...register('branchId')}>
              <option value="">Select…</option>
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField label="Parent contact" htmlFor="spc" className="mt-3" error={formState.errors.parentContact?.message}>
          <Input id="spc" invalid={!!formState.errors.parentContact} {...register('parentContact')} />
        </FormField>
      </form>
    </Modal>
  );
};

/* ─── Edit modal ────────────────────────────────────────────────────────── */

interface EditModalProps {
  student: Student;
  branchOptions: Array<{ id: string; name: string }>;
  isSuperAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const EditStudentModal = ({ student, branchOptions, isSuperAdmin, onClose, onSaved }: EditModalProps) => {
  const { register, handleSubmit, formState } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: student.name,
      branchId: student.branchId ?? '',
      rollNo: student.rollNo ?? '',
      parentContact: student.parentContact ?? '',
      status: student.status,
    },
  });

  const mutation = useMutation({
    mutationFn: async (v: EditForm) => {
      await studentsApi.update(student.id, {
        branchId: isSuperAdmin ? (v.branchId || undefined) : undefined,
        rollNo: v.rollNo || null,
        parentContact: v.parentContact || null,
      });
      if (v.name !== student.name || v.status !== student.status) {
        await studentsApi.updateUser(student.userId, {
          name: v.name,
          status: v.status,
        });
      }
    },
    onSuccess: () => {
      toast.success('Student updated');
      onSaved();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Modal
      open
      title={`Edit student — ${student.name}`}
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
      <FormField label="Full name" htmlFor="esn" error={formState.errors.name?.message}>
        <Input id="esn" {...register('name')} />
      </FormField>
      {isSuperAdmin && (
        <FormField label="Branch" htmlFor="esb" error={formState.errors.branchId?.message}>
          <Select id="esb" invalid={!!formState.errors.branchId} {...register('branchId')}>
            <option value="">Select…</option>
            {branchOptions.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </FormField>
      )}
      <FormField label="Roll no" htmlFor="esrn" className="mt-3">
        <Input id="esrn" {...register('rollNo')} />
      </FormField>
      <FormField label="Parent contact" htmlFor="espc" className="mt-3" error={formState.errors.parentContact?.message}>
        <Input id="espc" invalid={!!formState.errors.parentContact} {...register('parentContact')} />
      </FormField>
      <FormField label="Status" htmlFor="esst" error={formState.errors.status?.message}>
        <Select id="esst" {...register('status')}>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
        </Select>
      </FormField>
      <p className="mt-2 text-xs text-text-faint">
        Email cannot be changed. Name and status changes affect the student's login account.
      </p>
    </Modal>
  );
};
