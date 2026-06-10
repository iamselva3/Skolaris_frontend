import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, BookOpen, Calendar, Layers, GraduationCap, LayoutGrid, FileText, Activity } from 'lucide-react';
import { classroomsApi } from '@/lib/api/classrooms.api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';

export const ClassroomDetailPage = () => {
  const { id = '' } = useParams<{ id: string }>();
  const [tab, setTab] = useState<'members' | 'exams'>('members');

  const detail = useQuery({ queryKey: ['classroom', id], queryFn: () => classroomsApi.get(id), enabled: Boolean(id) });
  const members = useQuery({
    queryKey: ['classroom', id, 'students'],
    queryFn: () => classroomsApi.listStudents(id, { limit: 200 }),
    enabled: Boolean(id) && tab === 'members',
  });

  const classroom = detail.data;

  return (
    <>
      <PageHeader
        title={classroom?.name ?? 'Classroom Details'}
        breadcrumb={[
          { label: 'Classrooms', to: '/classrooms' },
          { label: classroom?.subject ?? 'Discipline', to: '/classrooms' },
          { label: classroom?.year ?? 'Year', to: '/classrooms' },
          { label: classroom?.name ?? 'Batch' },
        ]}
      />

      {/* Hero / Overview Section */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Main Identity Card */}
        <div className="md:col-span-2 lg:col-span-2 relative overflow-hidden rounded-xl border border-border-soft bg-gradient-to-br from-primary/5 via-surface to-surface p-6 shadow-sm">
          <div className="absolute -right-4 -top-4 opacity-5">
            <GraduationCap size={120} />
          </div>
          <div className="relative z-10 flex h-full flex-col justify-center">
            <div className="mb-2 flex items-center gap-2 text-primary">
              <BookOpen size={20} />
              <span className="text-sm font-semibold uppercase tracking-wider">{classroom?.subject ?? 'Discipline'}</span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-text">
              {classroom?.name ?? '—'}
            </h2>
            <p className="mt-2 text-text-muted max-w-[80%]">
              Manage members, track exams, and monitor overall performance for this classroom.
            </p>
          </div>
        </div>

        {/* Stats Mini Cards */}
        <div className="flex flex-col gap-4">
          <Card className="flex-1 flex items-center p-4 transition-all hover:border-primary/30 hover:shadow-md">
            <div className="mr-4 rounded-full bg-blue-500/10 p-3 text-blue-500">
              <Calendar size={20} />
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted">Year</p>
              <p className="text-lg font-semibold text-text">{classroom?.year ?? 'N/A'}</p>
            </div>
          </Card>
          <Card className="flex-1 flex items-center p-4 transition-all hover:border-primary/30 hover:shadow-md">
            <div className="mr-4 rounded-full bg-emerald-500/10 p-3 text-emerald-500">
              <Layers size={20} />
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted">Section</p>
              <p className="text-lg font-semibold text-text">{classroom?.section ?? 'N/A'}</p>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="flex-1 flex items-center p-4 transition-all hover:border-primary/30 hover:shadow-md">
            <div className="mr-4 rounded-full bg-indigo-500/10 p-3 text-indigo-500">
              <Users size={20} />
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted">Total Students</p>
              <p className="text-lg font-semibold text-text">{classroom?.studentCount ?? 0}</p>
            </div>
          </Card>
          <Card className="flex-1 flex items-center p-4 transition-all hover:border-primary/30 hover:shadow-md">
            <div className="mr-4 rounded-full bg-orange-500/10 p-3 text-orange-500">
              <Activity size={20} />
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted">Active Exams</p>
              <p className="text-lg font-semibold text-text">0</p>
            </div>
          </Card>
        </div>
      </div>

      <div className="mb-6">
        <Tabs
          active={tab}
          onChange={(k) => setTab(k as 'members' | 'exams')}
          tabs={[
            { key: 'members', label: 'Members', icon: <Users size={16} /> },
            { key: 'exams', label: 'Exams', icon: <FileText size={16} /> },
          ]}
        />
      </div>

      {tab === 'members' ? (
        <Card className="overflow-hidden shadow-sm border-border-soft">
          <div className="flex items-center justify-between border-b border-border-soft bg-surface px-6 py-4">
            <h3 className="text-base font-semibold text-text">Enrolled Students</h3>
            <div className="text-sm text-text-muted">
              {members.data?.data?.length ?? 0} students
            </div>
          </div>
          <CardBody className="p-0">
            <Table
              columns={[
                {
                  header: 'Name',
                  accessorKey: 'name',
                  cell: (info) => (
                    <span className="font-medium text-text">
                      {(info.row.original as any).name}
                    </span>
                  ),
                },
                {
                  header: 'Phone Number',
                  accessorKey: 'parentContact',
                  cell: (info) => (
                    <span className="text-text-muted">
                      {(info.row.original as any).parentContact || '—'}
                    </span>
                  ),
                },
                {
                  header: 'Email',
                  accessorKey: 'email',
                  cell: (info) => <span className="text-text-muted">{(info.row.original as any).email}</span>,
                },
                {
                  header: 'Roll no',
                  accessorKey: 'rollNo',
                  cell: (info) => (
                    <span className="inline-flex items-center rounded-md bg-surface-raised px-2 py-1 text-xs font-medium text-text-muted ring-1 ring-inset ring-border-soft">
                      {(info.row.original as any).rollNo || '—'}
                    </span>
                  ),
                },
              ]}
              data={members.data?.data ?? []}
              empty={
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-raised text-border">
                    <Users size={32} />
                  </div>
                  <h3 className="text-lg font-medium text-text">No students enrolled</h3>
                  <p className="mt-1 text-sm text-text-muted">
                    This classroom doesn't have any students yet.
                  </p>
                </div>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card className="shadow-sm border-border-soft">
          <CardBody>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-raised text-border">
                <LayoutGrid size={32} />
              </div>
              <h3 className="text-lg font-medium text-text">No exams published</h3>
              <p className="mt-1 max-w-sm text-sm text-text-muted">
                Exams assigned to this classroom appear here once published. Exam management for classrooms will be available in the upcoming Phase 4 release.
              </p>
            </div>
          </CardBody>
        </Card>
      )}
    </>
  );
};
