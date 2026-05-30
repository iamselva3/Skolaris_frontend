import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { branchesApi } from '@/lib/api/branches.api';
import { classroomsApi, type Classroom } from '@/lib/api/classrooms.api';
import { teachersApi } from '@/lib/api/teachers.api';
import { apiErrorMessage } from '@/lib/api/client';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Table } from '@/components/ui/Table';

const PAGE_SIZE = 20;

const schema = z.object({
  name: z.string().min(1).max(120),
  branchId: z.string().uuid(),
  year: z.string().max(20).optional().or(z.literal('')),
  section: z.string().max(20).optional().or(z.literal('')),
  subject: z.string().max(80).optional().or(z.literal('')),
  teacherId: z.string().uuid().optional().or(z.literal('')),
});
type Form = z.infer<typeof schema>;

export const ClassroomsListPage = () => {
  const [branchId, setBranchId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const lockedBranchId = user?.role === 'TEACHER' ? (user.branchId ?? undefined) : undefined;

  const branches = useQuery({ queryKey: ['branches'], queryFn: () => branchesApi.list({ limit: 200 }) });
  
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const teachers = useQuery({
    queryKey: ['teachers'],
    queryFn: () => teachersApi.list({ limit: 500 }),
    enabled: isSuperAdmin,
  });

  const list = useQuery({
    queryKey: ['classrooms', { branchId, teacherId, offset }],
    queryFn: () => classroomsApi.list({ branchId: branchId || undefined, teacherId: teacherId || undefined, limit: PAGE_SIZE, offset }),
    placeholderData: (p) => p,
  });

  const columns: ColumnDef<Classroom>[] = [
    {
      header: 'Name',
      accessorKey: 'name',
      cell: (c) => (
        <Link className="text-primary hover:underline" to={`/classrooms/${c.row.original.id}`}>
          {c.row.original.name}
        </Link>
      ),
    },
    { header: 'Year', cell: (c) => c.row.original.year ?? '—' },
    { header: 'Section', cell: (c) => c.row.original.section ?? '—' },
    { header: 'Subject', cell: (c) => c.row.original.subject ?? '—' },
    { header: 'Students', cell: (c) => c.row.original.studentCount ?? '—' },
  ];

  return (
    <>
      <PageHeader
        title="Classrooms"
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Add classroom
          </Button>
        }
      />
      <div className="toolbar">
        <Select
          className="max-w-xs"
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All branches</option>
          {branches.data?.data.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        {isSuperAdmin && (
          <Select
            className="max-w-xs"
            value={teacherId}
            onChange={(e) => {
              setTeacherId(e.target.value);
              setOffset(0);
            }}
            disabled={teachers.isLoading}
          >
            <option value="">All teachers</option>
            {teachers.data?.data.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.email})
              </option>
            ))}
          </Select>
        )}
      </div>

      <Table columns={columns} data={list.data?.data ?? []} empty={<>No classrooms yet.</>} />
      {list.data ? (
        <Pagination total={list.data.meta.total} limit={PAGE_SIZE} offset={offset} onPageChange={setOffset} />
      ) : null}

      <CreateClassroomModal
        open={open}
        branches={branches.data?.data ?? []}
        lockedBranchId={lockedBranchId}
        isSuperAdmin={isSuperAdmin}
        onClose={() => setOpen(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['classrooms'] });
          setOpen(false);
        }}
      />
    </>
  );
};

const CreateClassroomModal = ({
  open,
  branches,
  lockedBranchId,
  isSuperAdmin,
  onClose,
  onCreated,
}: {
  open: boolean;
  branches: Array<{ id: string; name: string }>;
  lockedBranchId?: string;
  isSuperAdmin?: boolean;
  onClose: () => void;
  onCreated: (c: Classroom) => void;
}) => {
  const navigate = useNavigate();
  const { register, handleSubmit, reset, formState, watch } = useForm<Form>({ 
    resolver: zodResolver(schema),
    defaultValues: { branchId: lockedBranchId || '' },
  });
  const selectedBranchId = watch('branchId');
  
  // Only fetch teachers if superadmin and a branch is selected
  const { data: teachersData, isLoading: isLoadingTeachers } = useQuery({
    queryKey: ['teachers', selectedBranchId],
    queryFn: () => teachersApi.list({ branchId: selectedBranchId, limit: 100 }),
    enabled: !!isSuperAdmin && !!selectedBranchId && open,
  });
  const mutation = useMutation({
    mutationFn: classroomsApi.create,
    onSuccess: (newClassroom) => {
      toast.success('Classroom created');
      reset();
      onCreated(newClassroom);
      navigate(`/classrooms/${newClassroom.id}/add-students`);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  return (
    <Modal
      open={open}
      title="Add classroom"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            onClick={handleSubmit((v) =>
              mutation.mutate({
                name: v.name,
                branchId: v.branchId,
                year: v.year || undefined,
                section: v.section || undefined,
                subject: v.subject || undefined,
                teacherId: v.teacherId || undefined,
              }),
            )}
          >
            Create
          </Button>
        </>
      }
    >
      <FormField label="Name" htmlFor="cn" error={formState.errors.name?.message}>
        <Input id="cn" {...register('name')} />
      </FormField>
      {!lockedBranchId && (
        <FormField label="Branch" htmlFor="cb" error={formState.errors.branchId?.message}>
          <Select id="cb" {...register('branchId')}>
            <option value="">Select…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </FormField>
      )}
      {isSuperAdmin && (
        <FormField label="Assign Teacher (Optional)" htmlFor="ct" error={formState.errors.teacherId?.message}>
          <Select id="ct" {...register('teacherId')} disabled={!selectedBranchId || isLoadingTeachers}>
            <option value="">{isLoadingTeachers ? 'Loading...' : !selectedBranchId ? 'Select a branch first' : 'Select teacher...'}</option>
            {teachersData?.data.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.email})
              </option>
            ))}
          </Select>
        </FormField>
      )}
      <div className="grid grid-cols-3 gap-4">
        <FormField label="Year" htmlFor="cy" className="!mt-0">
          <Input id="cy" {...register('year')} />
        </FormField>
        <FormField label="Section" htmlFor="cs" className="!mt-0">
          <Input id="cs" {...register('section')} />
        </FormField>
        <FormField label="Subject" htmlFor="csubj" className="!mt-0">
          <Input id="csubj" {...register('subject')} />
        </FormField>
      </div>
    </Modal>
  );
};
