import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Edit2, Plus, Trash2 } from 'lucide-react';
import { branchesApi, type Branch } from '@/lib/api/branches.api';
import { apiErrorMessage } from '@/lib/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Table } from '@/components/ui/Table';

const PAGE_SIZE = 20;

const schema = z.object({
  name: z.string().min(1).max(120),
});
type Form = z.infer<typeof schema>;

export const BranchesListPage = () => {
  const [offset, setOffset] = useState(0);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['branches', { offset }],
    queryFn: () => branchesApi.list({ limit: PAGE_SIZE, offset }),
    placeholderData: (p) => p,
  });

  const deleteMutation = useMutation({
    mutationFn: branchesApi.delete,
    onSuccess: () => {
      toast.success('Branch deleted');
      qc.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const columns: ColumnDef<Branch>[] = [
    {
      header: 'Name',
      accessorKey: 'name',
    },
    {
      header: 'Created at',
      cell: (c) => new Date(c.row.original.createdAt).toLocaleDateString(),
    },
    {
      id: 'actions',
      cell: (c) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Edit"
            className="text-text-muted hover:text-primary"
            onClick={() => setEditingBranch(c.row.original)}
          >
            <Edit2 size={16} />
          </button>
          <button
            type="button"
            title="Delete"
            className="text-text-muted hover:text-danger"
            onClick={() => {
              if (window.confirm('Are you sure you want to delete this branch?')) {
                deleteMutation.mutate(c.row.original.id);
              }
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Branches"
        actions={
          <Button variant="primary" onClick={() => setIsAddOpen(true)}>
            <Plus size={16} /> Add branch
          </Button>
        }
      />

      <Table columns={columns} data={list.data?.data ?? []} empty={<>No branches found.</>} />
      {list.data ? (
        <Pagination total={list.data.meta.total} limit={PAGE_SIZE} offset={offset} onPageChange={setOffset} />
      ) : null}

      {isAddOpen && (
        <BranchModal
          open={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['branches'] });
            setIsAddOpen(false);
          }}
        />
      )}

      {editingBranch && (
        <BranchModal
          open={!!editingBranch}
          branch={editingBranch}
          onClose={() => setEditingBranch(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['branches'] });
            setEditingBranch(null);
          }}
        />
      )}
    </>
  );
};

const BranchModal = ({
  open,
  branch,
  onClose,
  onSuccess,
}: {
  open: boolean;
  branch?: Branch;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { register, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: branch?.name || '' },
  });

  const mutation = useMutation({
    mutationFn: (data: Form) => (branch ? branchesApi.update(branch.id, data) : branchesApi.create(data)),
    onSuccess: () => {
      toast.success(branch ? 'Branch updated' : 'Branch created');
      onSuccess();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Modal
      open={open}
      title={branch ? 'Edit branch' : 'Add branch'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            onClick={handleSubmit((v) => mutation.mutate(v))}
          >
            {branch ? 'Save changes' : 'Create'}
          </Button>
        </>
      }
    >
      <FormField label="Name" htmlFor="branch-name" error={formState.errors.name?.message}>
        <Input id="branch-name" {...register('name')} />
      </FormField>
    </Modal>
  );
};
