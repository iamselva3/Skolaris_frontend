import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  chaptersApi,
  programsApi,
  subjectsApi,
  topicsApi,
  type TaxonomySelection,
} from '@/lib/api/taxonomy.api';
import { cn } from '@/lib/utils/cn';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/client';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { useCurrentUser } from '@/lib/hooks/use-current-user';

export type TaxonomyLevel = 'programId' | 'subjectId' | 'topicId' | 'chapterId';

interface Props {
  value: TaxonomySelection;
  onChange: (next: TaxonomySelection) => void;
  /** Which levels to render. Default ['programId','subjectId','topicId','chapterId']. */
  levels?: TaxonomyLevel[];
  size?: 'sm' | 'md';
  /** 'horizontal' (default) = side-by-side grid; 'vertical' = stacked column. */
  direction?: 'horizontal' | 'vertical';
  className?: string;
  disabled?: boolean;
}

/**
 * Horizontal CourseSelector — four cascading selects (Program → Subject → Topic
 * → Chapter). Used wherever the user is filtering or tagging by the coaching
 * taxonomy. Each select disables until its parent is set; changing a parent
 * clears the descendants in onChange.
 *
 * Data fetches are gated by `enabled: !!parentId` and cached for 10 min (taxonomy
 * changes infrequently).
 */
export const CourseSelector = ({
  value,
  onChange,
  levels = ['programId', 'subjectId', 'topicId', 'chapterId'],
  size = 'md',
  direction = 'horizontal',
  className,
  disabled,
}: Props): JSX.Element => {
  const showProgram = levels.includes('programId');
  const showSubject = levels.includes('subjectId');
  const showTopic = levels.includes('topicId');
  const showChapter = levels.includes('chapterId');
  
  const qc = useQueryClient();
  const [addModal, setAddModal] = useState<{ level: TaxonomyLevel; name: string; loading: boolean } | null>(null);
  const { user } = useCurrentUser();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const programs = useQuery({
    queryKey: ['taxonomy', 'programs'],
    queryFn: programsApi.list,
    staleTime: 10 * 60 * 1000,
    enabled: showProgram,
  });

  const subjects = useQuery({
    queryKey: ['taxonomy', 'subjects', value.programId],
    queryFn: () => subjectsApi.list({ programId: value.programId ?? undefined, isActive: '1' }),
    staleTime: 10 * 60 * 1000,
    enabled: showSubject && !!value.programId,
  });

  const topics = useQuery({
    queryKey: ['taxonomy', 'topics', value.subjectId],
    queryFn: () => topicsApi.list({ subjectId: value.subjectId ?? undefined }),
    staleTime: 10 * 60 * 1000,
    enabled: showTopic && !!value.subjectId,
  });

  const chapters = useQuery({
    queryKey: ['taxonomy', 'chapters', value.topicId],
    queryFn: () => chaptersApi.list({ topicId: value.topicId ?? undefined }),
    staleTime: 10 * 60 * 1000,
    enabled: showChapter && !!value.topicId,
  });

  // Clear descendants if the value contains an ID that no longer exists in the
  // newly-loaded parent set (handles e.g. stale URL params).
  useEffect(() => {
    if (showSubject && value.subjectId && subjects.data && !subjects.data.some((s) => s.id === value.subjectId)) {
      onChange({ ...value, subjectId: null, topicId: null, chapterId: null });
    }
  }, [subjects.data, value.subjectId, showSubject]); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = (level: TaxonomyLevel, id: string | null): void => {
    if (id === '__add_new__') {
      setAddModal({ level, name: '', loading: false });
      // Revert selection
      onChange({ ...value });
      return;
    }

    if (level === 'programId') {
      onChange({ programId: id, subjectId: null, topicId: null, chapterId: null });
    } else if (level === 'subjectId') {
      onChange({ ...value, subjectId: id, topicId: null, chapterId: null });
    } else if (level === 'topicId') {
      onChange({ ...value, topicId: id, chapterId: null });
    } else {
      onChange({ ...value, chapterId: id });
    }
  };

  const handleCreateSubmit = async () => {
    if (!addModal || !addModal.name.trim()) return;
    setAddModal((prev) => prev ? { ...prev, loading: true } : null);
    
    try {
      let newId = '';
      const name = addModal.name.trim();
      const level = addModal.level;
      
      if (level === 'programId') {
        // Auto-generate code from name (e.g. "JEE Mains 2026" -> "JEE_MAINS_2026")
        const code = name.toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').substring(0, 40);
        const res = await programsApi.create({ code, name });
        newId = res.id;
        qc.invalidateQueries({ queryKey: ['taxonomy', 'programs'] });
        onChange({ programId: newId, subjectId: null, topicId: null, chapterId: null });
      } else if (level === 'subjectId') {
        const res = await subjectsApi.create({ programId: value.programId!, name });
        newId = res.id;
        qc.invalidateQueries({ queryKey: ['taxonomy', 'subjects', value.programId] });
        onChange({ ...value, subjectId: newId, topicId: null, chapterId: null });
      } else if (level === 'topicId') {
        const res = await topicsApi.create({ subjectId: value.subjectId!, name });
        newId = res.id;
        qc.invalidateQueries({ queryKey: ['taxonomy', 'topics', value.subjectId] });
        onChange({ ...value, topicId: newId, chapterId: null });
      } else if (level === 'chapterId') {
        const res = await chaptersApi.create({ topicId: value.topicId!, name });
        newId = res.id;
        qc.invalidateQueries({ queryKey: ['taxonomy', 'chapters', value.topicId] });
        onChange({ ...value, chapterId: newId });
      }
      toast.success(`${level.replace('Id', '')} created successfully`);
      setAddModal(null);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setAddModal((prev) => prev ? { ...prev, loading: false } : null);
    }
  };

  const selectCls = cn('form-select w-full', size === 'sm' && 'h-7 text-xs');
  // Static class names so Tailwind JIT picks them up.
  const colsCls =
    levels.length === 1
      ? 'grid-cols-1'
      : levels.length === 2
        ? 'grid-cols-2'
        : levels.length === 3
          ? 'grid-cols-3'
          : 'grid-cols-4';
  const wrapCls =
    direction === 'vertical' ? 'flex flex-col gap-2' : cn('grid gap-2', colsCls);

  return (
    <div className={cn(wrapCls, className)}>
      {showProgram ? (
        <select
          className={selectCls}
          value={value.programId ?? ''}
          disabled={disabled || programs.isLoading}
          onChange={(e) => handle('programId', e.target.value || null)}
        >
          <option value="">Program ▾</option>
          {(programs.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {isSuperAdmin && <option value="__add_new__">+ Add Program...</option>}
        </select>
      ) : null}

      {showSubject ? (
        <select
          className={selectCls}
          value={value.subjectId ?? ''}
          disabled={disabled || !value.programId || subjects.isLoading}
          onChange={(e) => handle('subjectId', e.target.value || null)}
        >
          <option value="">{value.programId ? 'Subject ▾' : '— select program —'}</option>
          {(subjects.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {value.programId && <option value="__add_new__">+ Add Subject...</option>}
        </select>
      ) : null}

      {showTopic ? (
        <select
          className={selectCls}
          value={value.topicId ?? ''}
          disabled={disabled || !value.subjectId || topics.isLoading}
          onChange={(e) => handle('topicId', e.target.value || null)}
        >
          <option value="">{value.subjectId ? 'Topic ▾' : '— select subject —'}</option>
          {(topics.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          {value.subjectId && <option value="__add_new__">+ Add Topic...</option>}
        </select>
      ) : null}

      {showChapter ? (
        <select
          className={selectCls}
          value={value.chapterId ?? ''}
          disabled={disabled || !value.topicId || chapters.isLoading}
          onChange={(e) => handle('chapterId', e.target.value || null)}
        >
          <option value="">{value.topicId ? 'Chapter ▾' : '— select topic —'}</option>
          {(chapters.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          {value.topicId && <option value="__add_new__">+ Add Chapter...</option>}
        </select>
      ) : null}

      {addModal && (
        <Modal
          open={true}
          title={`Add ${addModal.level.replace('Id', '')}`}
          onClose={() => setAddModal(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAddModal(null)}>Cancel</Button>
              <Button
                variant="primary"
                loading={addModal.loading}
                disabled={!addModal.name.trim()}
                onClick={handleCreateSubmit}
              >
                Create
              </Button>
            </>
          }
        >
          <FormField label="Name" htmlFor="newItemName">
            <Input
              id="newItemName"
              autoFocus
              value={addModal.name}
              onChange={(e) => setAddModal({ ...addModal, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateSubmit();
                }
              }}
            />
          </FormField>
        </Modal>
      )}
    </div>
  );
};
