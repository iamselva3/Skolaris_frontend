import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Eye, FileText, Pencil, Sparkles, Trash2, X, ChevronDown } from 'lucide-react';
import { questionsApi, type Question } from '@/lib/api/questions.api';
import { QuestionViewModal } from '@/components/questions/QuestionViewModal';
import {
  programsApi,
  subjectsApi,
  topicsApi,
  chaptersApi,
} from '@/lib/api/taxonomy.api';
import { apiErrorMessage } from '@/lib/api/client';
import type { Difficulty, QuestionType } from '@/lib/types';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Table } from '@/components/ui/Table';
import { cn } from '@/lib/utils/cn';
import { fromNow } from '@/lib/utils/format';

const TYPES: QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'FILL_BLANK',
  'MATCH_FOLLOWING',
  'MATRIX_MATCH',
  'DESCRIPTIVE',
  'VISUAL',
];
const DIFFS: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];
const PAGE_SIZES = [25, 50, 100, 200];

type SourceFilter = '' | 'OCR' | 'MANUAL';

export const QuestionsListPage = () => {
  const qc = useQueryClient();

  const [q, setQ] = useState('');
  const [selectedProgram, setSelectedProgram] = useState<Set<string>>(new Set());
  const programId = useMemo(() => Array.from(selectedProgram)[0] || '', [selectedProgram]);
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());

  const [selectedTypes, setSelectedTypes] = useState<Set<QuestionType>>(new Set());
  const [selectedDifficulties, setSelectedDifficulties] = useState<Set<Difficulty>>(new Set());
  const [selectedSources, setSelectedSources] = useState<Set<SourceFilter>>(new Set());

  const SOURCE_OPTIONS = useMemo<Array<{ id: string; name: string }>>(() => [
    { id: 'OCR', name: 'OCR-imported' },
    { id: 'MANUAL', name: 'Manual' },
  ], []);

  const TYPE_OPTIONS = useMemo<Array<{ id: string; name: string }>>(() => 
    TYPES.map((t) => ({ id: t, name: t.replace(/_/g, ' ').toLowerCase() })),
  []);

  const DIFF_OPTIONS = useMemo<Array<{ id: string; name: string }>>(() => 
    DIFFS.map((d) => ({ id: d, name: d })),
  []);
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [viewing, setViewing] = useState<Question | null>(null);

  const debounced = useDebounce(q, 300);

  // Cascading Taxonomy Queries
  const programsQuery = useQuery({
    queryKey: ['taxonomy', 'programs'],
    queryFn: programsApi.list,
    staleTime: 10 * 60 * 1000,
  });

  const subjectsQuery = useQuery({
    queryKey: ['taxonomy', 'subjects', programId],
    queryFn: () => subjectsApi.list({ programId: programId || undefined, isActive: '1' }),
    staleTime: 10 * 60 * 1000,
  });

  const topicsQuery = useQuery({
    queryKey: ['taxonomy', 'topics-multi', Array.from(selectedSubjects)],
    queryFn: async () => {
      const ids = Array.from(selectedSubjects);
      if (ids.length === 0) {
        return topicsApi.list();
      }
      const responses = await Promise.all(
        ids.map((id) => topicsApi.list({ subjectId: id }))
      );
      return responses.flat();
    },
    staleTime: 10 * 60 * 1000,
  });

  const chaptersQuery = useQuery({
    queryKey: ['taxonomy', 'chapters-multi', Array.from(selectedTopics)],
    queryFn: async () => {
      const ids = Array.from(selectedTopics);
      if (ids.length === 0) {
        return chaptersApi.list();
      }
      const responses = await Promise.all(
        ids.map((id) => chaptersApi.list({ topicId: id }))
      );
      return responses.flat();
    },
    staleTime: 10 * 60 * 1000,
  });

  // Reset cascade steps on change
  const handleProgramChange = (next: Set<string>) => {
    setSelectedProgram(next);
    setSelectedSubjects(new Set());
    setSelectedTopics(new Set());
    setSelectedChapters(new Set());
    setOffset(0);
  };

  const handleSubjectsChange = (next: Set<string>) => {
    setSelectedSubjects(next);
    setSelectedTopics(new Set());
    setSelectedChapters(new Set());
    setOffset(0);
  };

  const handleTopicsChange = (next: Set<string>) => {
    setSelectedTopics(next);
    setSelectedChapters(new Set());
    setOffset(0);
  };

  // Main Listing Query
  const list = useQuery({
    queryKey: ['questions', { debounced, programId }],
    queryFn: () =>
      questionsApi.list({
        q: debounced || undefined,
        programId: programId || undefined,
        limit: 200, // Load maximum permitted batch size of 200 for frontend cascade filtering
        offset: 0,
      }),
    placeholderData: (p) => p,
  });

  // Cascading local filtering
  const filteredRows = useMemo(() => {
    let raw = list.data?.data ?? [];

    if (selectedSources.size > 0) {
      raw = raw.filter((r) => {
        const isOcr = !!r.sourceUploadId;
        if (selectedSources.has('OCR') && isOcr) return true;
        if (selectedSources.has('MANUAL') && !isOcr) return true;
        return false;
      });
    }

    if (selectedTypes.size > 0) {
      raw = raw.filter((r) => selectedTypes.has(r.type));
    }

    if (selectedDifficulties.size > 0) {
      raw = raw.filter((r) => selectedDifficulties.has(r.difficulty));
    }

    if (selectedSubjects.size > 0) {
      raw = raw.filter((r) => r.subjectId && selectedSubjects.has(r.subjectId));
    }
    if (selectedTopics.size > 0) {
      raw = raw.filter((r) => r.topicId && selectedTopics.has(r.topicId));
    }
    if (selectedChapters.size > 0) {
      raw = raw.filter((r) => r.chapterId && selectedChapters.has(r.chapterId));
    }
    return raw;
  }, [
    list.data,
    selectedSources,
    selectedTypes,
    selectedDifficulties,
    selectedSubjects,
    selectedTopics,
    selectedChapters,
  ]);

  const paginatedRows = useMemo(() => {
    return filteredRows.slice(offset, offset + pageSize);
  }, [filteredRows, offset, pageSize]);

  const totalQuestions = list.data?.meta.total ?? 0;
  const visibleCount = filteredRows.length;
  const ocrCount = filteredRows.filter((r) => !!r.sourceUploadId).length;
  const manualCount = filteredRows.filter((r) => !r.sourceUploadId).length;

  const hasActiveFilters =
    q.length > 0 ||
    selectedProgram.size > 0 ||
    selectedSources.size > 0 ||
    selectedTypes.size > 0 ||
    selectedDifficulties.size > 0 ||
    selectedSubjects.size > 0 ||
    selectedTopics.size > 0 ||
    selectedChapters.size > 0;

  const clearAll = (): void => {
    setQ('');
    setSelectedProgram(new Set());
    setSelectedSources(new Set());
    setSelectedTypes(new Set());
    setSelectedDifficulties(new Set());
    setSelectedSubjects(new Set());
    setSelectedTopics(new Set());
    setSelectedChapters(new Set());
    setOffset(0);
  };

  /* ─── Bulk actions ─── */

  const allOnPageSelected =
    paginatedRows.length > 0 && paginatedRows.every((r) => selected.has(r.id));

  const toggleOne = (id: string): void => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkDisable = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      const results = await Promise.allSettled(ids.map((id) => questionsApi.remove(id)));
      const failures = results.filter((r) => r.status === 'rejected').length;
      return { total: ids.length, failures };
    },
    onSuccess: ({ total, failures }) => {
      toast.success(`Disabled ${total - failures} of ${total} question(s)`);
      setSelected(new Set());
      setConfirmBulk(false);
      qc.invalidateQueries({ queryKey: ['questions'] });
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err));
      setConfirmBulk(false);
    },
  });

  /* ─── Columns (dense, ERP-style) ─── */

  const columns: ColumnDef<Question>[] = useMemo(
    () => [
      {
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            className="form-checkbox"
            checked={allOnPageSelected}
            onChange={() => {
              setSelected((cur) => {
                const next = new Set(cur);
                if (allOnPageSelected) paginatedRows.forEach((r) => next.delete(r.id));
                else paginatedRows.forEach((r) => next.add(r.id));
                return next;
              });
            }}
            aria-label="Select all on page"
          />
        ),
        cell: (c) => (
          <input
            type="checkbox"
            className="form-checkbox"
            checked={selected.has(c.row.original.id)}
            onChange={() => toggleOne(c.row.original.id)}
            aria-label={`Select ${c.row.original.id}`}
          />
        ),
      },
      {
        header: 'ID',
        cell: (c) => {
          const q = c.row.original;
          const s = (q.subject || 'Q').slice(0, 3).toUpperCase();
          const t = (q.topic || '').slice(0, 2).toUpperCase();
          const hex = q.id.slice(-4).toUpperCase();
          const shortId = `${s}${t}${hex}`;
          
          return (
            <span className="font-mono text-[11px] font-medium text-text" title={q.id}>
              {shortId}
            </span>
          );
        },
      },
      {
        header: 'Source',
        cell: (c) => <SourceTag ocr={!!c.row.original.sourceUploadId} />,
      },
      {
        header: 'Type',
        cell: (c) => (
          <span className="text-[11px] uppercase tracking-[0.4px] text-text-muted">
            {c.row.original.type.replace(/_/g, ' ').toLowerCase()}
          </span>
        ),
      },
      {
        header: 'Subject · Topic',
        cell: (c) => {
          const subj = c.row.original.subject ?? '—';
          const top = c.row.original.topic ?? '—';
          return (
            <span className="truncate">
              <span className="text-text">{subj}</span>
              <span className="mx-1 text-text-faint">·</span>
              <span className="text-text-muted">{top}</span>
            </span>
          );
        },
      },
      {
        header: 'Diff',
        cell: (c) => <DifficultyChip value={c.row.original.difficulty} />,
      },
      {
        header: 'Opts',
        cell: (c) => (
          <span className="font-mono text-xs tabular-nums text-text-muted">
            {c.row.original.options.length > 0 ? c.row.original.options.length : '—'}
          </span>
        ),
      },
      {
        header: 'Status',
        cell: (c) =>
          c.row.original.isActive ? (
            <span className="inline-flex h-[18px] items-center rounded border border-success bg-success-soft px-1.5 text-[10px] font-medium text-success">
              ACTIVE
            </span>
          ) : (
            <span className="inline-flex h-[18px] items-center rounded border border-border bg-subtle px-1.5 text-[10px] font-medium text-text-muted">
              DISABLED
            </span>
          ),
      },
      {
        header: 'Updated',
        cell: (c) => (
          <span className="text-xs text-text-muted">{fromNow(c.row.original.updatedAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: (c) => (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              title="View"
              onClick={() => setViewing(c.row.original)}
              className="rounded p-1 text-text-faint hover:bg-hover hover:text-text"
            >
              <Eye size={12} />
            </button>
            <Link
              to={`/questions/${c.row.original.id}/edit`}
              className="rounded p-1 text-text-faint hover:bg-hover hover:text-text"
              title="Edit"
            >
              <Pencil size={12} />
            </Link>
            <button
              type="button"
              title={c.row.original.isActive ? 'Disable' : 'Already disabled'}
              disabled={!c.row.original.isActive}
              onClick={() => {
                setSelected(new Set([c.row.original.id]));
                setConfirmBulk(true);
              }}
              className="rounded p-1 text-text-faint hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ),
      },
    ],
    [allOnPageSelected, selected, paginatedRows],
  );

  return (
    <>
      <PageHeader
        title="Question bank"
        description="Operational inventory · OCR-imported + manually authored"
        actions={
          <div className="flex gap-2">
            <Link to="/question-papers">
              <Button variant="secondary">Add question paper</Button>
            </Link>
            <Link to="/questions/new">
              <Button variant="primary">+ Add question</Button>
            </Link>
          </div>
        }
      />

      {/* Count summary strip */}
      <section className="mb-4 flex flex-wrap items-center gap-4 rounded-md border border-border bg-surface px-4 py-2">
        <Stat label="Total questions" value={totalQuestions.toLocaleString()} tone="primary" />
        <Stat label="Showing" value={visibleCount.toLocaleString()} />
        <Stat
          label="OCR-imported (filtered)"
          value={ocrCount}
          icon={<Sparkles size={11} className="text-primary" aria-hidden />}
        />
        <Stat
          label="Manual (filtered)"
          value={manualCount}
          icon={<FileText size={11} className="text-text-muted" aria-hidden />}
        />
        {selected.size > 0 ? (
          <Stat
            label="Selected"
            value={selected.size}
            tone="attention"
            className="ml-auto"
          />
        ) : null}
      </section>

      {/* Structured, clean 4-column Double-Row Grid Filter Bar */}
      <section className="filter-bar flex flex-col gap-3">
        {/* Row 1: Aligned drop selectors */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center w-full">
          <div className="relative">
            <Input
              placeholder="Search subject or topic"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
              className="w-full"
            />
          </div>
          <MultiSelectDropdown
            label="Source"
            options={SOURCE_OPTIONS}
            selected={selectedSources}
            onChange={(next) => {
              setSelectedSources(next as Set<SourceFilter>);
              setOffset(0);
            }}
          />

          <MultiSelectDropdown
            label="Type"
            options={TYPE_OPTIONS}
            selected={selectedTypes}
            onChange={(next) => {
              setSelectedTypes(next as Set<QuestionType>);
              setOffset(0);
            }}
          />

          <div className="flex gap-2 items-center w-full">
            <div className="flex-1 min-w-0">
              <MultiSelectDropdown
                label="Difficulty"
                options={DIFF_OPTIONS}
                selected={selectedDifficulties}
                onChange={(next) => {
                  setSelectedDifficulties(next as Set<Difficulty>);
                  setOffset(0);
                }}
              />
            </div>
            {hasActiveFilters ? (
              <Button variant="ghost" size="sm" onClick={clearAll} className="shrink-0">
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {/* Row 2: Cascading Program and MultiSelectDropdowns */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center w-full">
          <MultiSelectDropdown
            label="Program"
            options={(programsQuery.data ?? []).map((p) => ({ id: p.id, name: p.name }))}
            selected={selectedProgram}
            onChange={handleProgramChange}
            disabled={programsQuery.isLoading}
            singleSelect={true}
          />

          <MultiSelectDropdown
            label="Subject"
            options={(subjectsQuery.data ?? []).map((s) => ({ id: s.id, name: s.name }))}
            selected={selectedSubjects}
            onChange={handleSubjectsChange}
            disabled={subjectsQuery.isLoading}
          />

          <MultiSelectDropdown
            label="Topic"
            options={(topicsQuery.data ?? []).map((t) => ({ id: t.id, name: t.name }))}
            selected={selectedTopics}
            onChange={handleTopicsChange}
            disabled={topicsQuery.isLoading}
          />

          <MultiSelectDropdown
            label="Chapter"
            options={(chaptersQuery.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
            selected={selectedChapters}
            onChange={setSelectedChapters}
            disabled={chaptersQuery.isLoading}
          />
        </div>
      </section>

      {/* Bulk action bar */}
      {selected.size > 0 ? (
        <div className="bulk-strip">
          <span>
            <strong>{selected.size}</strong> selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmBulk(true)}
              loading={bulkDisable.isPending}
            >
              <Trash2 size={12} /> Disable {selected.size}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Dense compact table */}
      <Table
        columns={columns}
        data={paginatedRows}
        tableClassName="data-table-compact"
        empty={<>No questions match the current filters.</>}
      />

      {/* Elegant, Relocated entries selector & Pagination Controls below the table */}
      <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        {/* Entries size selector */}
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Show</span>
          <select
            value={String(pageSize)}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setOffset(0);
            }}
            className="form-select h-8 w-16 rounded border border-border bg-surface text-xs text-text focus:outline-none"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span>entries</span>
        </div>

        {/* Pagination controls */}
        {visibleCount > pageSize ? (
          <Pagination
            total={visibleCount}
            limit={pageSize}
            offset={offset}
            onPageChange={setOffset}
          />
        ) : null}
      </div>

      <QuestionViewModal question={viewing} onClose={() => setViewing(null)} />

      <ConfirmDialog
        open={confirmBulk}
        title={selected.size === 1 ? 'Disable question?' : `Disable ${selected.size} questions?`}
        message="Disabled questions stay in the bank for audit but are excluded from new exams and the default Active filter. You can re-enable individually later."
        variant="destructive"
        confirmLabel="Disable"
        loading={bulkDisable.isPending}
        onCancel={() => setConfirmBulk(false)}
        onConfirm={() => bulkDisable.mutate()}
      />
    </>
  );
};

/* ─────────────────────────────────────────── Cascading Multi-Select Dropdown */

interface MultiSelectProps {
  label: string;
  options: Array<{ id: string; name: string }>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
  singleSelect?: boolean;
}

const MultiSelectDropdown = ({
  label,
  options,
  selected,
  onChange,
  disabled,
  singleSelect = false,
}: MultiSelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const filtered = useMemo(() => {
    return options.filter((o) =>
      o.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [options, search]);

  const toggle = (id: string) => {
    if (singleSelect) {
      if (selected.has(id)) {
        onChange(new Set());
      } else {
        onChange(new Set([id]));
      }
    } else {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onChange(next);
    }
  };

  const selectAll = () => {
    if (singleSelect) return;
    const next = new Set(selected);
    options.forEach((o) => next.add(o.id));
    onChange(next);
  };

  const clearAll = () => {
    const next = new Set(selected);
    options.forEach((o) => next.delete(o.id));
    onChange(next);
  };

  const displayText = useMemo(() => {
    if (selected.size === 0) return label;
    if (selected.size === 1) {
      const match = options.find((o) => selected.has(o.id));
      return match ? match.name : `${selected.size} selected`;
    }
    return `${selected.size} selected`;
  }, [selected, options, label]);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="form-input inline-flex h-8 w-full items-center justify-between rounded border border-border bg-surface pl-2.5 pr-2.5 text-xs text-text-muted hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate pr-2">{displayText}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {selected.size > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(new Set());
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onChange(new Set());
                }
              }}
              className="rounded-full p-0.5 text-text-faint hover:bg-hover hover:text-text cursor-pointer transition-colors"
              title="Clear selection"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className="text-text-faint transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </div>
      </button>

      {open ? (
        <div className="absolute left-0 z-50 mt-1 w-full min-w-[200px] rounded border border-border bg-surface p-2" style={{ boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)' }}>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 block h-7 w-full rounded border border-border px-2 text-[11px] placeholder:text-text-faint focus:border-primary focus:outline-none"
          />

          {!singleSelect && (
            <div className="flex items-center justify-between border-b border-border-soft pb-1.5 mb-1.5 text-[10px] font-semibold text-primary">
              <button type="button" onClick={selectAll} className="hover:underline">
                Select All
              </button>
              <button type="button" onClick={clearAll} className="hover:underline text-text-faint">
                Clear All
              </button>
            </div>
          )}

          <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-1">
            {filtered.length === 0 ? (
              <span className="text-[11px] text-text-faint py-1 text-center">No options found</span>
            ) : (
              filtered.map((o) => {
                const active = selected.has(o.id);
                return (
                  <label
                    key={o.id}
                    className={cn(
                      'flex items-center gap-2 rounded px-1.5 py-1 text-[11px] cursor-pointer transition-colors hover:bg-hover',
                      active && 'bg-primary-soft text-primary font-medium',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggle(o.id)}
                      className="form-checkbox h-3.5 w-3.5 rounded border border-border"
                    />
                    <span className="truncate">{o.name}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

/* ─────────────────────────────────────────── Subcomponents */

const Stat = ({
  label,
  value,
  tone,
  icon,
  className,
}: {
  label: string;
  value: number | string;
  tone?: 'primary' | 'attention';
  icon?: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('flex items-baseline gap-2', className)}>
    <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-faint">
      {label}
    </span>
    <span
      className={cn(
        'text-base font-semibold tabular-nums',
        tone === 'primary' && 'text-primary',
        tone === 'attention' && 'text-warning',
        !tone && 'text-text',
      )}
    >
      {value}
    </span>
    {icon}
  </div>
);

const SourceTag = ({ ocr }: { ocr: boolean }) =>
  ocr ? (
    <span className="inline-flex items-center gap-1 rounded border border-primary bg-primary-soft px-1.5 text-[10px] font-medium uppercase tracking-[0.4px] text-primary">
      <Sparkles size={9} aria-hidden /> OCR
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-subtle px-1.5 text-[10px] font-medium uppercase tracking-[0.4px] text-text-muted">
      <FileText size={9} aria-hidden /> Manual
    </span>
  );

const DifficultyChip = ({ value }: { value: Difficulty }) => {
  const tone =
    value === 'EASY'
      ? 'border-success bg-success-soft text-success'
      : value === 'MEDIUM'
        ? 'border-primary bg-primary-soft text-primary'
        : 'border-warning bg-warning-soft text-warning';
  return (
    <span
      className={cn(
        'inline-flex h-[18px] items-center rounded border px-1.5 text-[10px] font-medium uppercase tracking-[0.4px]',
        tone,
      )}
    >
      {value[0]}
    </span>
  );
};
