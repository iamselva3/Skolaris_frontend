import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, X, Pencil, Eye, Search } from 'lucide-react';
import { branchesApi } from '@/lib/api/branches.api';
import { classroomsApi, type Classroom } from '@/lib/api/classrooms.api';
import { teachersApi } from '@/lib/api/teachers.api';
import { studentsApi } from '@/lib/api/students.api';
import { apiErrorMessage } from '@/lib/api/client';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { useActiveBranch } from '@/lib/hooks/use-active-branch';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Table } from '@/components/ui/Table';
// Removed unused Search import since it's added above

const PAGE_SIZE = 20;

const schema = z.object({
  name: z.string().min(1, 'Batch name is required').max(120),
  branchId: z.string().min(1, 'Branch is required').uuid(),
  year: z.string().min(1, 'Year is required').max(20),
  section: z.string().min(1, 'Section is required').max(20),
  subject: z.string().min(1, 'Discipline is required').max(80),
});
type Form = z.infer<typeof schema>;

export const ClassroomsListPage = () => {
  const branchId = useActiveBranch() || '';
  const [teacherId, setTeacherId] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [editClassroom, setEditClassroom] = useState<Classroom | null>(null);
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const lockedBranchId = user?.role === 'TEACHER' ? (user.branchId ?? undefined) : undefined;

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list({ limit: 200 }),
  });

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const teachers = useQuery({
    queryKey: ['teachers'],
    queryFn: () => teachersApi.list({ limit: 500 }),
    enabled: isSuperAdmin,
  });

  const list = useQuery({
    queryKey: [
      'classrooms',
      {
        branchId,
        teacherId,
        name: nameFilter,
        section: sectionFilter,
        year: yearFilter,
        subject: subjectFilter,
        search: debouncedSearch,
        offset,
      },
    ],
    queryFn: () =>
      classroomsApi.list({
        branchId: branchId || undefined,
        teacherId: teacherId || undefined,
        name: nameFilter || undefined,
        section: sectionFilter || undefined,
        year: yearFilter || undefined,
        subject: subjectFilter || undefined,
        search: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    placeholderData: (p) => p,
  });

  const filters = useQuery({
    queryKey: ['classroom-filters', branchId],
    queryFn: () => classroomsApi.getFilters(branchId || undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: classroomsApi.remove,
    onSuccess: () => {
      toast.success('Classroom removed');
      qc.invalidateQueries({ queryKey: ['classrooms'] });
      qc.invalidateQueries({ queryKey: ['classroom-filters'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const columns: ColumnDef<Classroom>[] = [
    {
      header: 'Discipline',
      accessorKey: 'subject',
      cell: (c) => (
        <Link className="text-primary hover:underline font-medium" to={`/classrooms/${c.row.original.id}`}>
          {c.row.original.subject ?? '—'}
        </Link>
      ),
    },
    { header: 'Year', cell: (c) => c.row.original.year ?? '—' },
    { header: 'Batch', cell: (c) => c.row.original.name ?? '—' },
    { header: 'Section', cell: (c) => c.row.original.section ?? '—' },
    { header: 'Students', cell: (c) => c.row.original.studentCount ?? '—' },
    {
      header: '',
      id: 'actions',
      cell: (c) => (
        <div className="flex items-center justify-end gap-2">
          <Link
            to={`/classrooms/${c.row.original.id}`}
            className="p-1 text-text-faint transition-colors hover:text-primary"
            title="View classroom"
          >
            <Eye size={16} />
          </Link>
          <button
            type="button"
            className="p-1 text-text-faint transition-colors hover:text-primary"
            onClick={() => setEditClassroom(c.row.original)}
            title="Edit classroom"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className="rounded-sm p-1 text-text-faint transition-colors hover:text-danger"
            onClick={() => {
              if (confirm(`Remove classroom ${c.row.original.name}?`)) {
                deleteMutation.mutate(c.row.original.id);
              }
            }}
            title="Remove classroom"
          >
            <X size={16} />
          </button>
        </div>
      ),
    },
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
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
              size={16}
            />
            <Input
              placeholder="Search by batch, discipline..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setOffset(0);
              }}
              className="w-full pl-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border-soft bg-surface p-3">

          <Select
            value={subjectFilter}
            onChange={(e) => {
              setSubjectFilter(e.target.value);
              setOffset(0);
            }}
            className="w-full sm:max-w-[160px]"
            disabled={filters.isLoading}
          >
            <option value="">All disciplines</option>
            {filters.data?.subjects?.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select
            value={nameFilter}
            onChange={(e) => {
              setNameFilter(e.target.value);
              setOffset(0);
            }}
            className="w-full sm:max-w-[160px]"
            disabled={filters.isLoading}
          >
            <option value="">All batches</option>
            {filters.data?.names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <Select
            value={sectionFilter}
            onChange={(e) => {
              setSectionFilter(e.target.value);
              setOffset(0);
            }}
            className="w-full sm:max-w-[120px]"
            disabled={filters.isLoading}
          >
            <option value="">All sections</option>
            {filters.data?.sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value);
              setOffset(0);
            }}
            className="w-full sm:max-w-[120px]"
            disabled={filters.isLoading}
          >
            <option value="">All years</option>
            {filters.data?.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Table columns={columns} data={list.data?.data ?? []} empty={<>No classrooms yet.</>} />
      {list.data ? (
        <Pagination
          total={list.data.meta.total}
          limit={PAGE_SIZE}
          offset={offset}
          onPageChange={setOffset}
        />
      ) : null}

      <ClassroomFormModal
        open={open || !!editClassroom}
        classroom={editClassroom}
        branches={branches.data?.data ?? []}
        lockedBranchId={lockedBranchId}
        isSuperAdmin={isSuperAdmin}
        onClose={() => {
          setOpen(false);
          setEditClassroom(null);
        }}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['classrooms'] });
          qc.invalidateQueries({ queryKey: ['classroom-filters'] });
          setOpen(false);
          setEditClassroom(null);
        }}
      />
    </>
  );
};

const capitalize = (s: string) => s.toUpperCase();

const ClassroomFormModal = ({
  open,
  classroom,
  branches,
  lockedBranchId,
  isSuperAdmin,
  onClose,
  onSaved,
}: {
  open: boolean;
  classroom?: Classroom | null;
  branches: Array<{ id: string; name: string }>;
  lockedBranchId?: string;
  isSuperAdmin?: boolean;
  onClose: () => void;
  onSaved: (c: Classroom) => void;
}) => {
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 21 }, (_, i) => currentYear + 10 - i);

  const { register, handleSubmit, reset, formState, watch, setValue } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { branchId: lockedBranchId || '' },
  });

  const [initClassroomId, setInitClassroomId] = useState<string | null>(null);

  const existingStudentsQuery = useQuery({
    queryKey: ['classroom-students', classroom?.id],
    queryFn: () => classroomsApi.listStudents(classroom!.id, { limit: 200 }),
    enabled: !!classroom?.id && open,
  });

  useEffect(() => {
    if (open) {
      if (classroom) {
        reset({
          name: classroom.name,
          branchId: classroom.branchId,
          year: classroom.year || '',
          section: classroom.section || '',
          subject: classroom.subject || '',
        });
        setSelectedTeacherIds(new Set(classroom.teacherIds || []));
      } else {
        reset({ branchId: lockedBranchId || '' });
        setSelectedStudentIds(new Set());
        setSelectedTeacherIds(new Set());
        setPreviewUser(null);
      }
    } else {
      setInitClassroomId(null);
    }
  }, [open, classroom, reset, lockedBranchId]);

  useEffect(() => {
    if (open && classroom && existingStudentsQuery.data && initClassroomId !== classroom.id) {
      setSelectedStudentIds(new Set(existingStudentsQuery.data.data.map((s) => s.id)));
      setInitClassroomId(classroom.id);
    }
  }, [open, classroom, existingStudentsQuery.data, initClassroomId]);

  const selectedBranchId = watch('branchId');

  const [activeTab, setActiveTab] = useState<'students' | 'teachers'>('students');
  const [studentSearch, setStudentSearch] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<Set<string>>(new Set());

  const [previewUser, setPreviewUser] = useState<{
    type: 'student' | 'teacher';
    id: string;
    name: string;
    email: string;
    phone?: string;
    rollNumber?: string;
    subject?: string;
  } | null>(null);

  const { data: teachersData, isLoading: isLoadingTeachers } = useQuery({
    queryKey: ['teachers', selectedBranchId],
    queryFn: () => teachersApi.list({ branchId: selectedBranchId, limit: 100 }),
    enabled: !!isSuperAdmin && !!selectedBranchId && open,
  });

  const { data: studentsData, isLoading: isLoadingStudents } = useQuery({
    queryKey: ['students', selectedBranchId],
    queryFn: () => studentsApi.list({ branchId: selectedBranchId, limit: 200 }),
    enabled: !!selectedBranchId && open,
  });

  const qc = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (v: Form) => {
      if (classroom) {
        const updated = await classroomsApi.update(classroom.id, {
          name: v.name,
          year: v.year || undefined,
          section: v.section || undefined,
          subject: v.subject || undefined,
          teacherIds: Array.from(selectedTeacherIds),
        });
        
        const originalIds = new Set(existingStudentsQuery.data?.data.map((s) => s.id) || []);
        const toAdd = Array.from(selectedStudentIds).filter((id) => !originalIds.has(id));
        const toRemove = Array.from(originalIds).filter((id) => !selectedStudentIds.has(id));

        if (toAdd.length > 0) {
          await classroomsApi.addStudents(classroom.id, toAdd);
        }
        for (const id of toRemove) {
          await classroomsApi.removeStudent(classroom.id, id);
        }
        return updated;
      }

      // 1. Create Classroom
      const newClassroom = await classroomsApi.create({
        name: v.name,
        branchId: v.branchId,
        year: v.year || undefined,
        section: v.section || undefined,
        subject: v.subject || undefined,
        teacherIds: Array.from(selectedTeacherIds),
      });

      // 2. Assign Students (if any)
      if (selectedStudentIds.size > 0) {
        await classroomsApi.addStudents(newClassroom.id, Array.from(selectedStudentIds));
      }

      return newClassroom;
    },
    onSuccess: (savedClassroom) => {
      toast.success(classroom ? 'Classroom updated' : 'Classroom created and assignments saved');
      reset();
      setSelectedStudentIds(new Set());
      setSelectedTeacherIds(new Set());
      setPreviewUser(null);
      onSaved(savedClassroom);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const handleCapitalizedInput = (field: keyof Form, value: string) => {
    setValue(field, capitalize(value), { shouldValidate: true });
  };

  const filteredStudents = useMemo(() => {
    if (!studentsData?.data) return [];
    const q = studentSearch.toLowerCase();
    return studentsData.data.filter(
      (s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
    );
  }, [studentsData, studentSearch]);

  const filteredTeachers = useMemo(() => {
    if (!teachersData?.data) return [];
    const q = teacherSearch.toLowerCase();
    return teachersData.data.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        (t.phone && t.phone.includes(q)),
    );
  }, [teachersData, teacherSearch]);

  const toggleStudent = (id: string) => {
    const next = new Set(selectedStudentIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStudentIds(next);
  };

  const toggleTeacher = (id: string) => {
    const next = new Set(selectedTeacherIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTeacherIds(next);
  };

  return (
    <Modal
      open={open}
      size="full"
      title={classroom ? 'Edit Classroom' : 'Create Classroom'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saveMutation.isPending}
            onClick={handleSubmit((v) => {
              if (!classroom) {
                if (selectedStudentIds.size === 0) {
                  toast.error('Please select at least one student.');
                  return;
                }
                if (isSuperAdmin && selectedTeacherIds.size === 0) {
                  toast.error('Please assign at least one teacher.');
                  return;
                }
              }
              saveMutation.mutate(v);
            })}
          >
            {classroom ? 'Save Changes' : 'Create Classroom'}
          </Button>
        </>
      }
    >
      <div className="grid max-h-[70vh] min-h-[60vh] grid-cols-1 gap-6 md:grid-cols-[1fr_1.5fr_1fr]">
        {/* PANEL 1: Classroom Information */}
        <div className="flex flex-col gap-4 overflow-y-auto border-r border-border pr-6">
          <h3 className="border-b border-border-soft pb-2 text-lg font-semibold">
            Classroom Details
          </h3>

          <FormField label="Discipline" htmlFor="csub" error={formState.errors.subject?.message}>
            <Input
              id="csub"
              placeholder="Enter Discipline"
              {...register('subject')}
              value={watch('subject') || ''}
              onChange={(e) => handleCapitalizedInput('subject', e.target.value)}
            />
          </FormField>

          <FormField label="Batch" htmlFor="cn" error={formState.errors.name?.message}>
            <Input
              id="cn"
              placeholder="Enter Batch"
              {...register('name')}
              value={watch('name') || ''}
              onChange={(e) => handleCapitalizedInput('name', e.target.value)}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Section"
              htmlFor="cs"
              error={formState.errors.section?.message}
              className="!mt-0"
            >
              <Input
                id="cs"
                placeholder="e.g. A"
                {...register('section')}
                value={watch('section') || ''}
                onChange={(e) => handleCapitalizedInput('section', e.target.value)}
              />
            </FormField>

            <FormField
              label="Year"
              htmlFor="cy"
              error={formState.errors.year?.message}
              className="!mt-0"
            >
              <Select id="cy" {...register('year')}>
                <option value="">Select year…</option>
                {yearOptions.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          {!lockedBranchId && (
            <FormField label="Branch" htmlFor="cb" error={formState.errors.branchId?.message}>
              <Select id="cb" invalid={!!formState.errors.branchId} {...register('branchId')}>
                <option value="">Select branch…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
        </div>

        {/* PANEL 2: Assignment Selection */}
        <div className="flex flex-col overflow-hidden border-r border-border pr-6">
            <h3 className="mb-4 border-b border-border-soft pb-2 text-lg font-semibold">
              Assignment
            </h3>

            <div className="mb-4 flex shrink-0 rounded-md border border-border-soft bg-subtle p-1">
              <button
                className={`flex-1 rounded py-1.5 text-sm font-medium ${activeTab === 'students' ? 'shadow-sm bg-surface text-primary' : 'text-text-muted hover:text-text'}`}
                onClick={() => setActiveTab('students')}
              >
                Students ({selectedStudentIds.size})
              </button>
              {isSuperAdmin && (
                <button
                  className={`flex-1 rounded py-1.5 text-sm font-medium ${activeTab === 'teachers' ? 'shadow-sm bg-surface text-primary' : 'text-text-muted hover:text-text'}`}
                  onClick={() => setActiveTab('teachers')}
                >
                  Teachers ({selectedTeacherIds.size})
                </button>
              )}
            </div>

            {!selectedBranchId ? (
              <div className="mt-8 text-center text-text-muted">
                Please select a branch first to view {activeTab}.
              </div>
            ) : activeTab === 'students' ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="relative mb-3 shrink-0">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
                  />
                  <Input
                    placeholder="Search students..."
                    className="h-9 pl-8 text-sm"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                  />
                </div>
                <div className="flex-1 divide-y divide-border-soft overflow-y-auto rounded-md border border-border-soft bg-surface">
                  {isLoadingStudents ? (
                    <div className="p-4 text-center text-sm text-text-muted">
                      Loading students...
                    </div>
                  ) : filteredStudents.length === 0 ? (
                    <div className="p-4 text-center text-sm text-text-muted">
                      No students found.
                    </div>
                  ) : (
                    filteredStudents.map((s) => (
                      <div
                        key={s.id}
                        className={`flex cursor-pointer items-center justify-between p-3 transition-colors hover:bg-hover ${selectedStudentIds.has(s.id) ? 'bg-primary-soft/20' : ''}`}
                        onClick={() => toggleStudent(s.id)}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.has(s.id)}
                            readOnly
                            className="h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary"
                          />
                          <div className="truncate">
                            <div className="truncate text-sm font-medium text-text">{s.name}</div>
                            <div className="truncate text-xs text-text-muted">{s.email}</div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewUser({
                              type: 'student',
                              id: s.id,
                              name: s.name,
                              email: s.email,
                              phone: s.parentContact || undefined,
                              rollNumber: s.rollNo || undefined,
                            });
                          }}
                        >
                          View
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="relative mb-3 shrink-0">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
                  />
                  <Input
                    placeholder="Search teachers..."
                    className="h-9 pl-8 text-sm"
                    value={teacherSearch}
                    onChange={(e) => setTeacherSearch(e.target.value)}
                  />
                </div>
                <div className="flex-1 divide-y divide-border-soft overflow-y-auto rounded-md border border-border-soft bg-surface">
                  {isLoadingTeachers ? (
                    <div className="p-4 text-center text-sm text-text-muted">
                      Loading teachers...
                    </div>
                  ) : filteredTeachers.length === 0 ? (
                    <div className="p-4 text-center text-sm text-text-muted">
                      No teachers found.
                    </div>
                  ) : (
                    filteredTeachers.map((t) => (
                      <div
                        key={t.id}
                        className={`flex cursor-pointer items-center justify-between p-3 transition-colors hover:bg-hover ${selectedTeacherIds.has(t.id) ? 'bg-primary-soft/20' : ''}`}
                        onClick={() => toggleTeacher(t.id)}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <input
                            type="checkbox"
                            checked={selectedTeacherIds.has(t.id)}
                            readOnly
                            className="h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary"
                          />
                          <div className="truncate">
                            <div className="truncate text-sm font-medium text-text">{t.name}</div>
                            <div className="truncate text-xs text-text-muted">
                              {t.email} {t.phone ? `• ${t.phone}` : ''}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewUser({
                              type: 'teacher',
                              id: t.id,
                              name: t.name,
                              email: t.email,
                              phone: t.phone,
                            });
                          }}
                        >
                          View
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

        {/* PANEL 3: Preview */}
          <div className="flex flex-col overflow-y-auto pl-2">
            <h3 className="mb-4 border-b border-border-soft pb-2 text-lg font-semibold">
              Personal Details
            </h3>

            {!previewUser ? (
              <div className="bg-surface/50 flex flex-1 items-center justify-center rounded-md border-2 border-dashed border-border p-6 text-center text-sm text-text-muted">
                Select "View" on a student or teacher to see their details here.
              </div>
            ) : (
              <div className="shadow-sm flex flex-col gap-4 rounded-md border border-border-soft bg-surface p-4">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xl font-bold uppercase text-primary">
                    {previewUser.name.charAt(0)}
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="truncate font-semibold text-text">{previewUser.name}</h4>
                    <span className="mt-1 inline-block rounded-full border border-border-soft bg-subtle px-2 py-0.5 text-xs font-medium capitalize">
                      {previewUser.type}
                    </span>
                  </div>
                </div>

                <div className="mt-2 space-y-3 text-sm">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-text-faint">
                      Email
                    </div>
                    <div className="truncate font-medium text-text">{previewUser.email}</div>
                  </div>
                  {previewUser.phone && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-text-faint">
                        Phone
                      </div>
                      <div className="font-medium text-text">{previewUser.phone}</div>
                    </div>
                  )}
                  {previewUser.rollNumber && previewUser.type === 'student' && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-text-faint">
                        Roll Number
                      </div>
                      <div className="font-medium text-text">{previewUser.rollNumber}</div>
                    </div>
                  )}
                  {previewUser.subject && previewUser.type === 'teacher' && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-text-faint">
                        Subject
                      </div>
                      <div className="font-medium text-text">{previewUser.subject}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
      </div>
    </Modal>
  );
};
