import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { classroomsApi } from '@/lib/api/classrooms.api';
import { studentsApi } from '@/lib/api/students.api';
import { apiErrorMessage } from '@/lib/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Table } from '@/components/ui/Table';

export const AddStudentsPage = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const classroom = useQuery({
    queryKey: ['classroom', id],
    queryFn: () => classroomsApi.get(id),
    enabled: Boolean(id),
  });

  const branchId = classroom.data?.branchId;

  const students = useQuery({
    queryKey: ['students', { branchId }],
    queryFn: () => studentsApi.list({ branchId, limit: 200 }),
    enabled: Boolean(branchId),
  });

  const members = useQuery({
    queryKey: ['classroom', id, 'students'],
    queryFn: () => classroomsApi.listStudents(id, { limit: 200 }),
    enabled: Boolean(id),
  });

  const memberIds = new Set(members.data?.data.map((m) => m.id) ?? []);

  const availableStudents = (students.data?.data ?? []).filter(
    (s) => !memberIds.has(s.id) && s.status === 'ACTIVE',
  );

  const addMutation = useMutation({
    mutationFn: (studentIds: string[]) => classroomsApi.addStudents(id, studentIds),
    onSuccess: () => {
      toast.success('Students added to classroom');
      qc.invalidateQueries({ queryKey: ['classroom', id] });
      navigate(`/classrooms/${id}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const handleAdd = () => {
    if (selectedIds.size === 0) return;
    addMutation.mutate(Array.from(selectedIds));
  };

  const toggleSelect = (studentId: string) => {
    const next = new Set(selectedIds);
    if (next.has(studentId)) next.delete(studentId);
    else next.add(studentId);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === availableStudents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availableStudents.map((s) => s.id)));
    }
  };

  const columns = React.useMemo(() => [
    {
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          checked={availableStudents.length > 0 && selectedIds.size === availableStudents.length}
          onChange={toggleAll}
          className="rounded border-border text-primary focus:ring-primary"
        />
      ),
      cell: (c: any) => (
        <input
          type="checkbox"
          checked={selectedIds.has(c.row.original.id)}
          onChange={() => toggleSelect(c.row.original.id)}
          className="rounded border-border text-primary focus:ring-primary"
        />
      ),
    },
    { header: 'Name', accessorKey: 'name' },
    { header: 'Email', accessorKey: 'email' },
    { header: 'Roll no', cell: (c: any) => c.row.original.rollNo ?? '—' },
  ], [availableStudents.length, selectedIds]);

  return (
    <>
      <PageHeader
        title={`Add Students to ${classroom.data?.name ?? 'Classroom'}`}
        actionsKey={`${selectedIds.size}-${addMutation.isPending}`}
        actions={
          <Button
            variant="primary"
            disabled={selectedIds.size === 0 || addMutation.isPending}
            loading={addMutation.isPending}
            onClick={handleAdd}
          >
            Add {selectedIds.size > 0 ? selectedIds.size : ''} selected
          </Button>
        }
      />

      <div className="mb-4">
        <Link to={`/classrooms/${id}`} className="text-sm font-medium text-primary hover:underline">
          &larr; Back to classroom
        </Link>
      </div>

      <div className="mt-4">
        <Table
          columns={columns}
          data={availableStudents}
          empty={<>No available students found in this branch.</>}
        />
      </div>
    </>
  );
};
