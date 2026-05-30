import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Trash2, Calendar, Clock } from 'lucide-react';
import { examsApi, type ExamQuestion } from '@/lib/api/exams.api';
import { questionsApi, type Question } from '@/lib/api/questions.api';
import { classroomsApi } from '@/lib/api/classrooms.api';
import { studentsApi } from '@/lib/api/students.api';
import { apiErrorMessage } from '@/lib/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CourseSelector } from '@/components/ui/CourseSelector';
import type { TaxonomySelection } from '@/lib/api/taxonomy.api';
import { DefinitionList } from '@/components/ui/DefinitionList';
import { Drawer } from '@/components/ui/Drawer';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Stepper } from '@/components/ui/Stepper';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Textarea } from '@/components/ui/Textarea';
import { formatDateTime } from '@/lib/utils/format';

const STEPS = [
  { key: '1', title: 'Create test' },
  { key: '2', title: 'Assign test' },
  { key: '3', title: 'Publish test' },
];

export const ExamComposePage = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState<'1' | '2' | '3'>('1');

  const exam = useQuery({ queryKey: ['exam', id], queryFn: () => examsApi.get(id), enabled: Boolean(id) });
  if (!exam.data) return <p className="loading-line">Loading…</p>;
  const isDraft = exam.data.status === 'DRAFT';

  const goNext = (): void => {
    if (step === '1') setStep('2');
    else if (step === '2') setStep('3');
  };
  const goBack = (): void => {
    if (step === '2') setStep('1');
    else if (step === '3') setStep('2');
  };

  return (
    <>
      <PageHeader
        title={exam.data.title}
        description={`Status: ${exam.data.status} · Total marks: ${exam.data.totalMarks}`}
      />

      <Stepper steps={STEPS} current={step} onChange={(k) => setStep(k as '1' | '2' | '3')} />

      <div className="pb-12">
        {step === '1' && (
          <StepCreate
            examId={id}
            disabled={!isDraft}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ['exam', id] });
              qc.invalidateQueries({ queryKey: ['exams'] });
              setStep('2');
            }}
          />
        )}
        {step === '2' && (
          <StepAssign
            examId={id}
            disabled={!isDraft}
            onAssigned={() => {
              qc.invalidateQueries({ queryKey: ['exam', id] });
              setStep('3');
            }}
          />
        )}
        {step === '3' && <StepPublish examId={id} />}
      </div>

      {/* Sticky footer action bar */}
      <div className="form-footer">
        <Button variant="secondary" onClick={() => navigate(`/exams/${id}`)}>
          <ArrowLeft size={14} /> Open detail view
        </Button>
        <div className="flex items-center gap-2">
          {step !== '1' ? (
            <Button variant="secondary" onClick={goBack}>
              Back
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
};

/* ────────────────────────────────────────────── Step 1 — Create */

const StepCreate = ({
  examId,
  disabled,
  onSaved,
}: {
  examId: string;
  disabled: boolean;
  onSaved: () => void;
}) => {
  const exam = useQuery({ queryKey: ['exam', examId], queryFn: () => examsApi.get(examId) });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('30');
  const [neg, setNeg] = useState('0');
  const [randomQ, setRandomQ] = useState(false);
  const [randomO, setRandomO] = useState(false);
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!exam.data) return;
    setTitle(exam.data.title === 'Untitled exam' ? '' : exam.data.title);
    setDescription(exam.data.description ?? '');
    setDuration(String(Math.round(exam.data.durationSeconds / 60)));
    setNeg(String(exam.data.defaultNegativeMarks));
    setRandomQ(exam.data.randomizeQuestions);
    setRandomO(exam.data.randomizeOptions);
    setOpensAt(exam.data.opensAt?.slice(0, 16) ?? '');
    setClosesAt(exam.data.closesAt?.slice(0, 16) ?? '');
  }, [exam.data]);

  const save = useMutation({
    mutationFn: () =>
      examsApi.update(examId, {
        title,
        description: description || undefined,
        durationSeconds: Number(duration) * 60,
        defaultNegativeMarks: Number(neg),
        randomizeQuestions: randomQ,
        randomizeOptions: randomO,
        opensAt: opensAt ? new Date(opensAt).toISOString() : undefined,
        closesAt: closesAt ? new Date(closesAt).toISOString() : undefined,
      }),
    onSuccess: () => {
      toast.success('Saved');
      onSaved();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const removeQ = useMutation({
    mutationFn: (eqId: string) => examsApi.removeQuestion(examId, eqId),
    onSuccess: onSaved,
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <>
      <Card>
        <CardHeader>Basic info</CardHeader>
        <CardBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <FormField label="Title" htmlFor="et">
                  <Input id="et" value={title} onChange={(e) => setTitle(e.target.value)} disabled={disabled} />
                </FormField>
              </div>
              <div className="md:col-span-1">
                <FormField label="Duration (minutes)" htmlFor="ed">
                  <Input id="ed" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} disabled={disabled} />
                </FormField>
              </div>
            </div>

            <FormField label="Description" htmlFor="edesc">
              <Textarea id="edesc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={disabled} rows={2} />
            </FormField>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <FormField label="Default negative marks" htmlFor="eneg">
                  <Input id="eneg" type="number" step="0.25" value={neg} onChange={(e) => setNeg(e.target.value)} disabled={disabled} />
                </FormField>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 items-start gap-4">
              <div>
                <FormField label="Opens at" htmlFor="eo">
                  <div className="relative">
                    <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint" />
                    <Input id="eo" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} disabled={disabled} className="pl-8" />
                  </div>
                </FormField>
              </div>
              <div>
                <FormField label="Closes at" htmlFor="ec">
                  <div className="relative">
                    <Clock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint" />
                    <Input 
                      id="ec" 
                      type="datetime-local" 
                      value={closesAt} 
                      onChange={(e) => setClosesAt(e.target.value)} 
                      disabled={disabled} 
                      min={new Date().toISOString().slice(0, 16)} 
                      className="pl-8" 
                    />
                  </div>
                </FormField>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5 pt-1">
              <Checkbox checked={randomQ} onChange={(e) => setRandomQ(e.target.checked)} disabled={disabled} label="Randomize question order" />
              <Checkbox checked={randomO} onChange={(e) => setRandomO(e.target.checked)} disabled={disabled} label="Randomize option order" />
            </div>

            <div className="flex justify-end pt-2 border-t border-border-soft">
              <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
                Save & Continue
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <span>Questions ({exam.data?.questions.length ?? 0})</span>
            <Button variant="primary" size="sm" disabled={disabled} onClick={() => setShowPicker(true)}>
              + Add questions
            </Button>
          </CardHeader>
          <CardBody>
            {exam.data?.questions.length === 0 ? (
              <p className="text-[13px] text-text-muted">No questions added yet.</p>
            ) : (
              <ul>
                {exam.data?.questions.map((eq) => (
                  <ExamQuestionRow key={eq.id} eq={eq} onRemove={() => removeQ.mutate(eq.id)} disabled={disabled} />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <QuestionPickerDrawer
        open={showPicker}
        examId={examId}
        existingIds={(exam.data?.questions ?? []).map((q) => q.questionId)}
        nextPosition={exam.data?.questions.length ?? 0}
        defaultNeg={Number(neg)}
        onClose={() => setShowPicker(false)}
        onAdded={() => {
          setShowPicker(false);
          onSaved();
        }}
      />
    </>
  );
};

const ExamQuestionRow = ({
  eq,
  onRemove,
  disabled,
}: {
  eq: ExamQuestion;
  onRemove: () => void;
  disabled: boolean;
}) => {
  const q = useQuery({
    queryKey: ['question', eq.questionId],
    queryFn: () => questionsApi.get(eq.questionId),
  });
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border-soft py-2 text-[13px] last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-text-muted">#{eq.position + 1}</span>
          <StatusBadge value={q.data?.type ?? '…'} />
          <span className="truncate">
            {q.data?.subject ?? '—'} / {q.data?.topic ?? '—'}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-text-muted">
          Marks: {eq.marks} · −{eq.negativeMarks}
        </p>
      </div>
      <Button variant="destructive" size="sm" disabled={disabled} onClick={onRemove}>
        <Trash2 size={12} /> Remove
      </Button>
    </li>
  );
};

/* ────────────────────────────────────────────── Question picker drawer */

const QuestionPickerDrawer = ({
  open,
  examId,
  existingIds,
  nextPosition,
  defaultNeg,
  onClose,
  onAdded,
}: {
  open: boolean;
  examId: string;
  existingIds: string[];
  nextPosition: number;
  defaultNeg: number;
  onClose: () => void;
  onAdded: () => void;
}) => {
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<TaxonomySelection>({});
  const [q, setQ] = useState('');
  const bank = useQuery({
    queryKey: ['questions', 'picker', { filter, q }],
    queryFn: () =>
      questionsApi.list({
        limit: 50,
        programId: filter.programId ?? undefined,
        subjectId: filter.subjectId ?? undefined,
        topicId: filter.topicId ?? undefined,
        chapterId: filter.chapterId ?? undefined,
        q: q || undefined,
      }),
    enabled: open,
  });
  const add = useMutation({
    mutationFn: () =>
      examsApi.addQuestions(
        examId,
        Object.entries(picked).map(([questionId, marks], i) => ({
          questionId,
          position: nextPosition + i,
          marks,
          negativeMarks: defaultNeg,
        })),
      ),
    onSuccess: () => {
      toast.success('Questions added');
      setPicked({});
      onAdded();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const toggle = (qq: Question): void => {
    setPicked((cur) => {
      const next = { ...cur };
      if (next[qq.id] !== undefined) delete next[qq.id];
      else next[qq.id] = 1;
      return next;
    });
  };

  const allFilteredIds = bank.data?.data.map((q) => q.id) ?? [];
  const addableIds = allFilteredIds.filter((id) => !existingIds.includes(id));
  const allSelected = addableIds.length > 0 && addableIds.every((id) => picked[id] !== undefined);

  const toggleAll = () => {
    if (allSelected) {
      setPicked((cur) => {
        const next = { ...cur };
        addableIds.forEach((id) => delete next[id]);
        return next;
      });
    } else {
      setPicked((cur) => {
        const next = { ...cur };
        addableIds.forEach((id) => {
          if (next[id] === undefined) next[id] = 1;
        });
        return next;
      });
    }
  };

  return (
    <Drawer
      open={open}
      title="Add questions from bank"
      onClose={onClose}
      width={520}
      footer={
        <>
          <div className="mr-auto text-[12px] text-text-muted">
            {Object.keys(picked).length} selected
          </div>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={add.isPending}
            disabled={Object.keys(picked).length === 0}
            onClick={() => add.mutate()}
          >
            Add
          </Button>
        </>
      }
    >
      <div className="mb-3 space-y-2">
        <Input
          placeholder="Search subject or topic"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <CourseSelector value={filter} onChange={setFilter} size="sm" />
        
        {addableIds.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-border-soft">
            <label className="flex items-center gap-2 cursor-pointer text-[13px] text-text font-medium hover:text-primary transition-colors">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={allSelected}
                onChange={toggleAll}
              />
              Select all {addableIds.length} visible questions
            </label>
          </div>
        )}
      </div>

      <ul>
        {bank.data?.data.map((qq) => {
          const already = existingIds.includes(qq.id);
          const isPicked = picked[qq.id] !== undefined;
          return (
            <li
              key={qq.id}
              className="flex items-center justify-between gap-2 border-b border-border-soft py-2 text-[13px] last:border-0"
            >
              <label className={`flex flex-1 items-start gap-2 ${already ? 'opacity-50' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  className="form-checkbox mt-1"
                  disabled={already}
                  checked={isPicked || already}
                  onChange={() => toggle(qq)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge value={qq.type} />
                    <span className="text-text-muted">
                      {qq.subject ?? '—'} / {qq.topic ?? '—'}
                    </span>
                  </div>
                  {qq.options.length > 0 ? (
                    <p className="mt-0.5 text-[11px] text-text-muted">{qq.options.length} options</p>
                  ) : null}
                </div>
              </label>
              {isPicked && !already ? (
                <input
                  type="number"
                  className="form-input w-16"
                  value={picked[qq.id]}
                  onChange={(e) =>
                    setPicked((cur) => ({ ...cur, [qq.id]: Math.max(0, Number(e.target.value)) }))
                  }
                  aria-label="Marks"
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </Drawer>
  );
};

/* ────────────────────────────────────────────── Step 2 — Assign */

const StepAssign = ({
  examId,
  disabled,
  onAssigned,
}: {
  examId: string;
  disabled: boolean;
  onAssigned: () => void;
}) => {
  const [classroomIds, setClassroomIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [classQ, setClassQ] = useState('');
  const [studentQ, setStudentQ] = useState('');

  const classrooms = useQuery({ queryKey: ['classrooms', 'all'], queryFn: () => classroomsApi.list({ limit: 200 }) });
  const students = useQuery({ queryKey: ['students', 'all'], queryFn: () => studentsApi.list({ limit: 500 }) });

  const visibleClasses =
    classrooms.data?.data.filter((c) =>
      classQ.length === 0 ? true : c.name.toLowerCase().includes(classQ.toLowerCase()),
    ) ?? [];
  const visibleStudents =
    students.data?.data.filter((s) =>
      studentQ.length === 0
        ? true
        : `${s.name} ${s.email}`.toLowerCase().includes(studentQ.toLowerCase()),
    ) ?? [];

  const classCount = classroomIds.length;
  const classStudentCount = (classrooms.data?.data ?? [])
    .filter((c) => classroomIds.includes(c.id))
    .reduce((acc, c) => acc + (c.studentCount ?? 0), 0);

  const save = useMutation({
    mutationFn: () => examsApi.assign(examId, { classroomIds, studentIds }),
    onSuccess: () => {
      toast.success('Assigned');
      onAssigned();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const toggle = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>Classrooms</CardHeader>
          <CardBody>
            <Input
              placeholder="Filter classrooms"
              value={classQ}
              onChange={(e) => setClassQ(e.target.value)}
              className="mb-2"
            />
            <ul className="max-h-[360px] space-y-1 overflow-y-auto">
              {visibleClasses.map((c) => (
                <li key={c.id}>
                  <Checkbox
                    checked={classroomIds.includes(c.id)}
                    disabled={disabled}
                    onChange={() => setClassroomIds((cur) => toggle(cur, c.id))}
                    label={`${c.name} · ${c.studentCount ?? 0} students`}
                  />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Individual students</CardHeader>
          <CardBody>
            <Input
              placeholder="Filter students"
              value={studentQ}
              onChange={(e) => setStudentQ(e.target.value)}
              className="mb-2"
            />
            <ul className="max-h-[360px] space-y-1 overflow-y-auto">
              {visibleStudents.map((s) => (
                <li key={s.id}>
                  <Checkbox
                    checked={studentIds.includes(s.id)}
                    disabled={disabled}
                    onChange={() => setStudentIds((cur) => toggle(cur, s.id))}
                    label={`${s.name} — ${s.email}`}
                  />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
      <div className="mt-3 text-[12px] text-text-muted">
        {classCount} classroom(s) · {classStudentCount} students from classrooms + {studentIds.length}{' '}
        individual ⇒ {classStudentCount + studentIds.length} total assignees
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="primary" loading={save.isPending} disabled={disabled} onClick={() => save.mutate()}>
          Save assignments & Continue
        </Button>
      </div>
    </>
  );
};

/* ────────────────────────────────────────────── Step 3 — Publish */

const StepPublish = ({ examId }: { examId: string }) => {
  const exam = useQuery({ queryKey: ['exam', examId], queryFn: () => examsApi.get(examId) });
  const qc = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const publish = useMutation({
    mutationFn: () => examsApi.publish(examId),
    onSuccess: (r) => {
      toast.success(`Published — ${r.attemptsCreated} attempt(s), ${r.notificationsCreated} notification(s)`);
      qc.invalidateQueries({ queryKey: ['exam', examId] });
      setShowConfirm(false);
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err));
      setShowConfirm(false);
    },
  });

  if (!exam.data) return null;
  const e = exam.data;
  const ac = e.antiCheatConfig;

  return (
    <>
      <Card>
        <CardHeader>Review</CardHeader>
        <CardBody>
          <DefinitionList
            rows={[
              { label: 'Title', value: e.title },
              { label: 'Status', value: e.status },
              { label: 'Total marks', value: e.totalMarks },
              { label: 'Duration', value: `${Math.round(e.durationSeconds / 60)} min` },
              { label: 'Opens at', value: formatDateTime(e.opensAt) },
              { label: 'Closes at', value: formatDateTime(e.closesAt) },
              { label: 'Questions', value: e.questions.length },
              { label: 'Assignments', value: e.assignments.length },
            ]}
          />
        </CardBody>
      </Card>

      <div className="mt-4">
        <Card>
          <CardHeader>Anti-cheat configuration</CardHeader>
          <CardBody>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Setting</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Require fullscreen</td><td>{ac.requireFullscreen ? 'Yes' : 'No'}</td></tr>
                <tr><td>Block copy/paste</td><td>{ac.blockCopyPaste ? 'Yes' : 'No'}</td></tr>
                <tr><td>Block right-click</td><td>{ac.blockRightClick ? 'Yes' : 'No'}</td></tr>
                <tr><td>Tab-switch threshold</td><td>{ac.tabSwitchThreshold}</td></tr>
                <tr><td>Total-violation threshold</td><td>{ac.totalViolationThreshold}</td></tr>
                <tr><td>Flag at</td><td>{ac.flagAtViolationCount}</td></tr>
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          variant="primary"
          disabled={e.status !== 'DRAFT'}
          onClick={() => setShowConfirm(true)}
        >
          Publish exam
        </Button>
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="Publish exam?"
        message="This creates an attempt per assigned student and notifies them. After publishing, only closesAt may be extended."
        confirmLabel="Publish"
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => publish.mutate()}
        loading={publish.isPending}
      />
    </>
  );
};
