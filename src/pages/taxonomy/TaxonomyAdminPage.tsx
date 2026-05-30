import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  chaptersApi,
  programsApi,
  subjectsApi,
  topicsApi,
} from '@/lib/api/taxonomy.api';
import { apiErrorMessage } from '@/lib/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils/cn';

/**
 * SUPER_ADMIN four-column drill-down: Program → Subject → Topic → Chapter.
 * Selecting a row in one column loads the children in the next. Inline
 * "+ Add" at the bottom of each column for fast taxonomy authoring.
 */
export const TaxonomyAdminPage = () => {
  const [programId, setProgramId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Programs & Subjects"
        description="Manage the coaching-centre taxonomy. Changes apply to questions, exams, and uploads instantly."
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <ProgramsColumn
          selectedId={programId}
          onSelect={(id) => {
            setProgramId(id);
            setSubjectId(null);
            setTopicId(null);
          }}
        />
        <SubjectsColumn
          programId={programId}
          selectedId={subjectId}
          onSelect={(id) => {
            setSubjectId(id);
            setTopicId(null);
          }}
        />
        <TopicsColumn
          subjectId={subjectId}
          selectedId={topicId}
          onSelect={setTopicId}
        />
        <ChaptersColumn topicId={topicId} />
      </div>
    </>
  );
};

/* ────────────────────────────────────────────── Programs */

const ProgramsColumn = ({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) => {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['taxonomy', 'programs'], queryFn: programsApi.list });
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');

  const create = useMutation({
    mutationFn: () => programsApi.create({ code: newCode.toUpperCase(), name: newName }),
    onSuccess: () => {
      toast.success('Program added');
      setNewCode('');
      setNewName('');
      qc.invalidateQueries({ queryKey: ['taxonomy', 'programs'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Card>
      <CardHeader>Programs</CardHeader>
      <CardBody>
        <ul className="mb-3 space-y-0.5">
          {(list.data ?? []).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className={cn(
                  'w-full px-2 py-1 text-left text-[13px] hover:bg-hover',
                  selectedId === p.id && 'bg-primary-soft text-primary',
                  !p.isActive && 'text-text-faint',
                )}
              >
                {p.name}
                <span className="ml-2 text-[10px] uppercase text-text-faint">{p.code}</span>
              </button>
            </li>
          ))}
          {list.data?.length === 0 ? (
            <li className="px-2 py-1 text-[12px] text-text-muted">No programs yet.</li>
          ) : null}
        </ul>
        <div className="space-y-1.5 border-t border-border-soft pt-2">
          <Input
            placeholder="Code (e.g. CUET)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            className="h-7 text-xs"
          />
          <Input
            placeholder="Display name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-7 text-xs"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!newCode || !newName || create.isPending}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            <Plus size={12} /> Add program
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};

/* ────────────────────────────────────────────── Subjects */

const SubjectsColumn = ({
  programId,
  selectedId,
  onSelect,
}: {
  programId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) => {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['taxonomy', 'subjects', programId],
    queryFn: () => subjectsApi.list({ programId: programId ?? undefined }),
    enabled: !!programId,
  });
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: () => subjectsApi.create({ programId: programId ?? '', name }),
    onSuccess: () => {
      toast.success('Subject added');
      setName('');
      qc.invalidateQueries({ queryKey: ['taxonomy', 'subjects', programId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Card>
      <CardHeader>Subjects</CardHeader>
      <CardBody>
        {!programId ? (
          <p className="px-2 py-1 text-[12px] text-text-muted">Select a program first.</p>
        ) : (
          <>
            <ul className="mb-3 space-y-0.5">
              {(list.data ?? []).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    className={cn(
                      'w-full px-2 py-1 text-left text-[13px] hover:bg-hover',
                      selectedId === s.id && 'bg-primary-soft text-primary',
                    )}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
              {list.data?.length === 0 ? (
                <li className="px-2 py-1 text-[12px] text-text-muted">No subjects yet.</li>
              ) : null}
            </ul>
            <div className="space-y-1.5 border-t border-border-soft pt-2">
              <Input
                placeholder="Subject name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-7 text-xs"
              />
              <Button
                variant="primary"
                size="sm"
                disabled={!name || create.isPending}
                loading={create.isPending}
                onClick={() => create.mutate()}
              >
                <Plus size={12} /> Add subject
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
};

/* ────────────────────────────────────────────── Topics */

const TopicsColumn = ({
  subjectId,
  selectedId,
  onSelect,
}: {
  subjectId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) => {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['taxonomy', 'topics', subjectId],
    queryFn: () => topicsApi.list({ subjectId: subjectId ?? undefined }),
    enabled: !!subjectId,
  });
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: () => topicsApi.create({ subjectId: subjectId ?? '', name }),
    onSuccess: () => {
      toast.success('Topic added');
      setName('');
      qc.invalidateQueries({ queryKey: ['taxonomy', 'topics', subjectId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => topicsApi.remove(id),
    onSuccess: () => {
      toast.success('Topic removed');
      qc.invalidateQueries({ queryKey: ['taxonomy', 'topics', subjectId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Card>
      <CardHeader>Topics</CardHeader>
      <CardBody>
        {!subjectId ? (
          <p className="px-2 py-1 text-[12px] text-text-muted">Select a subject first.</p>
        ) : (
          <>
            <ul className="mb-3 space-y-0.5">
              {(list.data ?? []).map((t) => (
                <li key={t.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelect(t.id)}
                    className={cn(
                      'flex-1 px-2 py-1 text-left text-[13px] hover:bg-hover',
                      selectedId === t.id && 'bg-primary-soft text-primary',
                    )}
                  >
                    {t.name}
                  </button>
                  <button
                    type="button"
                    title="Delete topic"
                    onClick={() => remove.mutate(t.id)}
                    className="px-1 text-text-faint opacity-0 group-hover:opacity-100 hover:text-danger"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
              {list.data?.length === 0 ? (
                <li className="px-2 py-1 text-[12px] text-text-muted">No topics yet.</li>
              ) : null}
            </ul>
            <div className="space-y-1.5 border-t border-border-soft pt-2">
              <Input
                placeholder="Topic name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-7 text-xs"
              />
              <Button
                variant="primary"
                size="sm"
                disabled={!name || create.isPending}
                loading={create.isPending}
                onClick={() => create.mutate()}
              >
                <Plus size={12} /> Add topic
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
};

/* ────────────────────────────────────────────── Chapters */

const ChaptersColumn = ({ topicId }: { topicId: string | null }) => {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['taxonomy', 'chapters', topicId],
    queryFn: () => chaptersApi.list({ topicId: topicId ?? undefined }),
    enabled: !!topicId,
  });
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: () => chaptersApi.create({ topicId: topicId ?? '', name }),
    onSuccess: () => {
      toast.success('Chapter added');
      setName('');
      qc.invalidateQueries({ queryKey: ['taxonomy', 'chapters', topicId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => chaptersApi.remove(id),
    onSuccess: () => {
      toast.success('Chapter removed');
      qc.invalidateQueries({ queryKey: ['taxonomy', 'chapters', topicId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Card>
      <CardHeader>Chapters</CardHeader>
      <CardBody>
        {!topicId ? (
          <p className="px-2 py-1 text-[12px] text-text-muted">Select a topic first.</p>
        ) : (
          <>
            <ul className="mb-3 space-y-0.5">
              {(list.data ?? []).map((c) => (
                <li key={c.id} className="group flex items-center gap-1">
                  <span className="flex-1 px-2 py-1 text-[13px]">{c.name}</span>
                  <button
                    type="button"
                    title="Delete chapter"
                    onClick={() => remove.mutate(c.id)}
                    className="px-1 text-text-faint opacity-0 group-hover:opacity-100 hover:text-danger"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
              {list.data?.length === 0 ? (
                <li className="px-2 py-1 text-[12px] text-text-muted">No chapters yet.</li>
              ) : null}
            </ul>
            <div className="space-y-1.5 border-t border-border-soft pt-2">
              <Input
                placeholder="Chapter name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-7 text-xs"
              />
              <Button
                variant="primary"
                size="sm"
                disabled={!name || create.isPending}
                loading={create.isPending}
                onClick={() => create.mutate()}
              >
                <Plus size={12} /> Add chapter
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
};
