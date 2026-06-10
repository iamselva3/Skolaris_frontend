import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Eye, Plus, Sparkles, Trash2 } from 'lucide-react';
import {
  questionPapersApi,
  type GenerateRule,
  type PaperQuestion,
} from '@/lib/api/question-papers.api';
import { questionsApi, type Question } from '@/lib/api/questions.api';
import type { Difficulty } from '@/lib/types';
import { apiErrorMessage } from '@/lib/api/client';
import { usePageHeader } from '@/lib/page-header/use-page-header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { CourseSelector } from '@/components/ui/CourseSelector';
import type { TaxonomySelection } from '@/lib/api/taxonomy.api';
import { QuestionViewModal } from '@/components/questions/QuestionViewModal';
import { useDebounce } from '@/lib/hooks/use-debounce';

export const ComposeQuestionPaperPage = () => {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const paperId = id!;

  const paperQuery = useQuery({
    queryKey: ['question-paper', paperId],
    queryFn: () => questionPapersApi.get(paperId),
    enabled: !!paperId,
  });
  const paper = paperQuery.data;

  usePageHeader({
    title: paper ? paper.title : 'Compose Question Paper',
    description: 'Add questions from the Question Bank, reorder, and publish the paper.',
    breadcrumb: [{ label: 'Workspace' }, { label: 'Question Papers' }, { label: 'Compose' }],
  });

  const [addOpen, setAddOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['question-paper', paperId] });

  const rename = useMutation({
    mutationFn: (title: string) => questionPapersApi.update(paperId, { title }),
    onSuccess: () => {
      toast.success('Title updated');
      qc.invalidateQueries({ queryKey: ['question-paper', paperId] });
      qc.invalidateQueries({ queryKey: ['question-papers'] });
      setTitleDraft(null);
    },
    onError: (e) => {
      toast.error(apiErrorMessage(e));
      setTitleDraft(null);
    },
  });
  const commitTitle = (): void => {
    const next = titleDraft?.trim();
    if (next && next !== paper?.title) rename.mutate(next);
    else setTitleDraft(null);
  };

  const removeQ = useMutation({
    mutationFn: (questionId: string) => questionPapersApi.removeQuestion(paperId, questionId),
    onSuccess: invalidate,
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const reorder = useMutation({
    mutationFn: (order: Array<{ questionId: string; position: number }>) =>
      questionPapersApi.reorder(paperId, order),
    onSuccess: invalidate,
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const setStatus = useMutation({
    mutationFn: (status: 'DRAFT' | 'PUBLISHED') => questionPapersApi.update(paperId, { status }),
    onSuccess: (_, status) => {
      toast.success(status === 'PUBLISHED' ? 'Paper published' : 'Moved to draft');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const move = (questions: PaperQuestion[], index: number, dir: -1 | 1): void => {
    const target = index + dir;
    if (target < 0 || target >= questions.length) return;
    const reordered = [...questions];
    const [item] = reordered.splice(index, 1);
    reordered.splice(target, 0, item);
    reorder.mutate(reordered.map((q, i) => ({ questionId: q.questionId, position: i })));
  };

  if (paperQuery.isLoading) {
    return <p className="p-6 text-sm text-text-muted">Loading paper…</p>;
  }
  if (!paper) {
    return <p className="p-6 text-sm text-danger">Question paper not found.</p>;
  }

  const questions = paper.questions;
  const presentIds = new Set(questions.map((q) => q.questionId));

  return (
    <div className="space-y-4">
      {/* Header / KPIs */}
      <section className="rounded-md border border-border bg-surface px-4 py-3">
        <div className="mb-3">
          <label htmlFor="paper-title" className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-faint">
            Paper title
          </label>
          <Input
            id="paper-title"
            value={titleDraft ?? paper.title}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setTitleDraft(null);
            }}
            placeholder="e.g. Physics — Practice Paper 1"
            className="mt-1 max-w-lg text-base font-semibold"
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
        <Kpi label="Status" value={paper.status} />
        <Kpi label="Questions" value={paper.questionCount} />
        <Kpi label="Total marks" value={paper.totalMarks} />
        <Kpi label="Duration (min)" value={Math.round(paper.durationSeconds / 60)} />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setGenOpen(true)}>
            <Sparkles size={14} className="mr-1" /> Generate
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={14} className="mr-1" /> Add questions
          </Button>
          {paper.status === 'PUBLISHED' ? (
            <Button variant="ghost" size="sm" onClick={() => setStatus.mutate('DRAFT')}>
              Unpublish
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={paper.questionCount === 0}
              onClick={() => setStatus.mutate('PUBLISHED')}
            >
              Publish
            </Button>
          )}
        </div>
        </div>
      </section>

      {/* Questions table */}
      <section className="rounded-md border border-border bg-surface">
        <header className="border-b border-border-soft px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.6px] text-text-faint">
          Questions
        </header>
        {questions.length === 0 ? (
          <p className="p-6 text-center text-sm text-text-muted">
            No questions yet. Use <strong>Add questions</strong> or <strong>Generate</strong>.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-soft text-left text-[11px] uppercase tracking-[0.4px] text-text-faint">
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">Type · Subject</th>
                <th className="px-3 py-2 w-20">Marks</th>
                <th className="px-3 py-2 w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q, i) => (
                <tr key={q.id} className="border-b border-border-soft last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{i + 1}</td>
                  <td className="px-3 py-2">
                    <span className="text-[11px] uppercase tracking-[0.3px] text-text-muted">
                      {q.type.replace(/_/g, ' ').toLowerCase()}
                    </span>
                    <span className="mx-1 text-text-faint">·</span>
                    <span className="text-text">{q.subject ?? '—'}</span>
                    {q.topic ? <span className="text-text-faint"> / {q.topic}</span> : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{q.marks}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn title="Move up" disabled={i === 0} onClick={() => move(questions, i, -1)}>
                        <ArrowUp size={13} />
                      </IconBtn>
                      <IconBtn
                        title="Move down"
                        disabled={i === questions.length - 1}
                        onClick={() => move(questions, i, 1)}
                      >
                        <ArrowDown size={13} />
                      </IconBtn>
                      <IconBtn title="Preview" onClick={() => setPreviewId(q.questionId)}>
                        <Eye size={13} />
                      </IconBtn>
                      <IconBtn title="Remove" danger onClick={() => removeQ.mutate(q.questionId)}>
                        <Trash2 size={13} />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {addOpen ? (
        <AddQuestionsModal
          paperId={paperId}
          presentIds={presentIds}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            invalidate();
            setAddOpen(false);
          }}
        />
      ) : null}

      {genOpen ? (
        <GenerateModal
          paperId={paperId}
          onClose={() => setGenOpen(false)}
          onGenerated={(added) => {
            toast.success(`Added ${added} question(s)`);
            invalidate();
            setGenOpen(false);
          }}
        />
      ) : null}

      <PreviewModal questionId={previewId} onClose={() => setPreviewId(null)} />
    </div>
  );
};

/* ─────────────────────────────────────────── Add questions from the bank */

const AddQuestionsModal = ({
  paperId,
  presentIds,
  onClose,
  onAdded,
}: {
  paperId: string;
  presentIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) => {
  const [taxonomy, setTaxonomy] = useState<TaxonomySelection>({});
  const [q, setQ] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const debounced = useDebounce(q, 300);

  const results = useQuery({
    queryKey: ['paper-bank-search', { debounced, taxonomy }],
    queryFn: () =>
      questionsApi.list({
        q: debounced || undefined,
        programId: taxonomy.programId ?? undefined,
        subjectId: taxonomy.subjectId ?? undefined,
        topicId: taxonomy.topicId ?? undefined,
        chapterId: taxonomy.chapterId ?? undefined,
        limit: 100,
        offset: 0,
      }),
  });

  const add = useMutation({
    mutationFn: () =>
      questionPapersApi.addQuestions(
        paperId,
        Array.from(selected).map((questionId) => ({ questionId })),
      ),
    onSuccess: onAdded,
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const toggle = (id: string): void =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows = (results.data?.data ?? [])
    .filter((r) => !presentIds.has(r.id))
    .filter((r) => (difficulty ? r.difficulty === difficulty : true));

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected((cur) => {
        const next = new Set(cur);
        rows.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelected((cur) => {
        const next = new Set(cur);
        rows.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  return (
    <Modal
      open
      title="Add questions from the bank"
      onClose={onClose}
      size="xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={selected.size === 0}
            loading={add.isPending}
            onClick={() => add.mutate()}
          >
            Add {selected.size > 0 ? selected.size : ''}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <CourseSelector value={taxonomy} onChange={setTaxonomy} size="sm" />
        <div className="flex gap-2">
          <Input placeholder="Search subject or topic" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1" />
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | '')} className="w-40">
            <option value="">Any difficulty</option>
            <option value="EASY">EASY</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HARD">HARD</option>
          </Select>
        </div>
        
        {rows.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-border-soft">
            <label className="flex items-center gap-2 cursor-pointer text-[13px] text-text font-medium hover:text-primary transition-colors">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={allSelected}
                onChange={toggleAll}
              />
              Select all {rows.length} visible questions
            </label>
          </div>
        )}

        <div className="max-h-80 space-y-1 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">No matching questions.</p>
          ) : (
            rows.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-2 rounded border border-border-soft px-2 py-1.5 text-sm hover:bg-hover"
              >
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                />
                <span className="text-[11px] uppercase tracking-[0.3px] text-text-muted">
                  {r.type.replace(/_/g, ' ').toLowerCase()}
                </span>
                <span className="text-text-faint">·</span>
                <span className="truncate text-text">{r.subject ?? '—'}</span>
                {r.topic ? <span className="truncate text-text-faint">/ {r.topic}</span> : null}
                <span className="ml-auto text-[10px] uppercase text-text-faint">{r.difficulty}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};

/* ─────────────────────────────────────────── Random generation */

type GenRow = { subjectId?: string; difficulty?: Difficulty; count: number };

const GenerateModal = ({
  paperId,
  onClose,
  onGenerated,
}: {
  paperId: string;
  onClose: () => void;
  onGenerated: (added: number) => void;
}) => {
  const [rows, setRows] = useState<GenRow[]>([{ count: 10 }]);

  const generate = useMutation({
    mutationFn: async () => {
      const before = await questionPapersApi.get(paperId);
      const rules: GenerateRule[] = rows
        .filter((r) => r.count > 0)
        .map((r) => ({ subjectId: r.subjectId, difficulty: r.difficulty, count: r.count }));
      await questionPapersApi.generate(paperId, rules);
      const after = await questionPapersApi.get(paperId);
      return after.questionCount - before.questionCount;
    },
    onSuccess: onGenerated,
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Modal
      open
      title="Generate questions"
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={generate.isPending} onClick={() => generate.mutate()}>
            Generate
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-text-muted">
          Each rule draws random active questions from the bank by subject + difficulty. Subject ID is
          optional (leave blank for any subject).
        </p>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_140px_100px_auto] items-center gap-2">
            <Input
              placeholder="Subject ID (optional)"
              value={r.subjectId ?? ''}
              onChange={(e) =>
                setRows((cur) =>
                  cur.map((x, j) => (i === j ? { ...x, subjectId: e.target.value || undefined } : x)),
                )
              }
            />
            <Select
              value={r.difficulty ?? ''}
              onChange={(e) =>
                setRows((cur) =>
                  cur.map((x, j) =>
                    i === j ? { ...x, difficulty: (e.target.value || undefined) as Difficulty } : x,
                  ),
                )
              }
            >
              <option value="">Any difficulty</option>
              <option value="EASY">EASY</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HARD">HARD</option>
            </Select>
            <Input
              type="number"
              min={1}
              value={r.count}
              onChange={(e) =>
                setRows((cur) =>
                  cur.map((x, j) => (i === j ? { ...x, count: Number(e.target.value) || 0 } : x)),
                )
              }
            />
            <button
              type="button"
              className="rounded p-1 text-text-faint hover:text-danger disabled:opacity-30"
              disabled={rows.length <= 1}
              onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setRows((cur) => [...cur, { count: 10 }])}>
          <Plus size={13} className="mr-1" /> Add rule
        </Button>
      </div>
    </Modal>
  );
};

/* ─────────────────────────────────────────── Preview (fetch full question) */

const PreviewModal = ({ questionId, onClose }: { questionId: string | null; onClose: () => void }) => {
  const q = useQuery({
    queryKey: ['question', questionId],
    queryFn: () => questionsApi.get(questionId!),
    enabled: !!questionId,
  });
  return <QuestionViewModal question={(q.data as Question) ?? null} onClose={onClose} />;
};

/* ─────────────────────────────────────────── bits */

const Kpi = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex items-baseline gap-2">
    <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-faint">{label}</span>
    <span className="text-base font-semibold tabular-nums text-text">{value}</span>
  </div>
);

const IconBtn = ({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    disabled={disabled}
    className={
      'rounded p-1 text-text-faint hover:bg-hover disabled:cursor-not-allowed disabled:opacity-30 ' +
      (danger ? 'hover:text-danger' : 'hover:text-text')
    }
  >
    {children}
  </button>
);
