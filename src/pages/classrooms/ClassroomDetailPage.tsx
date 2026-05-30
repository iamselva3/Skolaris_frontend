import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { classroomsApi } from '@/lib/api/classrooms.api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { Table } from '@/components/ui/Table';

export const ClassroomDetailPage = () => {
  const { id = '' } = useParams<{ id: string }>();
  const [tab, setTab] = useState<'members' | 'exams'>('members');

  const detail = useQuery({ queryKey: ['classroom', id], queryFn: () => classroomsApi.get(id), enabled: Boolean(id) });
  const members = useQuery({
    queryKey: ['classroom', id, 'students'],
    queryFn: () => classroomsApi.listStudents(id, { limit: 200 }),
    enabled: Boolean(id) && tab === 'members',
  });

  return (
    <>
      <PageHeader title={detail.data?.name ?? 'Classroom'} description={detail.data?.subject ?? ''} />
      <Card>
        <CardHeader>Overview</CardHeader>
        <CardBody>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-text-muted">Year</dt>
              <dd>{detail.data?.year ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Section</dt>
              <dd>{detail.data?.section ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Students</dt>
              <dd>{detail.data?.studentCount ?? '—'}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <div className="mt-6">
        <Tabs
          active={tab}
          onChange={(k) => setTab(k as 'members' | 'exams')}
          tabs={[
            { key: 'members', label: 'Members' },
            { key: 'exams', label: 'Exams' },
          ]}
        />
        {tab === 'members' ? (
          <div>
            <div className="mb-4 flex justify-end">
              <Link to={`/classrooms/${id}/add-students`}>
                <Button variant="secondary" size="sm" type="button">
                  <Plus size={14} className="mr-1" /> Add students
                </Button>
              </Link>
            </div>
            <Table
              columns={[
              { header: 'Name', accessorKey: 'name' },
              { header: 'Email', accessorKey: 'email' },
              { header: 'Roll no', accessorKey: 'rollNo' },
            ]}
            data={members.data?.data ?? []}
            empty={<>No students in this classroom.</>}
          />
        </div>
        ) : (
          <Card>
            <CardBody>
              <p className="text-sm text-text-muted">
                Exams assigned to this classroom appear here once published. (Wire-up coming when /classrooms/:id/exams
                endpoint is added — Phase 4.)
              </p>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
};
