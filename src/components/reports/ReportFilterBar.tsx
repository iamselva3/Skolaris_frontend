import { useQuery } from '@tanstack/react-query';
import { branchesApi } from '@/lib/api/branches.api';
import { classroomsApi } from '@/lib/api/classrooms.api';
import { CourseSelector, type TaxonomyLevel } from '@/components/ui/CourseSelector';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';

export interface ReportFilterValue {
  dateFrom?: string;
  dateTo?: string;
  programId?: string | null;
  subjectId?: string | null;
  topicId?: string | null;
  chapterId?: string | null;
  branchId?: string;
  classroomId?: string;
  q?: string;
}

export type ReportFilterField = 'search' | 'date' | 'taxonomy' | 'branch' | 'class';

interface Props {
  value: ReportFilterValue;
  onChange: (next: ReportFilterValue) => void;
  fields?: ReportFilterField[];
  taxonomyLevels?: TaxonomyLevel[];
  searchPlaceholder?: string;
  className?: string;
}

const EMPTY: ReportFilterValue = {};

export const ReportFilterBar = ({
  value,
  onChange,
  fields = ['search', 'date', 'taxonomy'],
  taxonomyLevels = ['programId', 'subjectId', 'chapterId'],
  searchPlaceholder = 'Search…',
  className,
}: Props) => {
  const show = (f: ReportFilterField) => fields.includes(f);

  const branches = useQuery({
    queryKey: ['branches', 'all'],
    queryFn: () => branchesApi.list({ limit: 100 }),
    staleTime: 10 * 60 * 1000,
    enabled: show('branch'),
  });

  const classes = useQuery({
    queryKey: ['classrooms', 'all', value.branchId ?? ''],
    queryFn: () => classroomsApi.list({ branchId: value.branchId, limit: 100 }),
    staleTime: 5 * 60 * 1000,
    enabled: show('class'),
  });

  const patch = (p: Partial<ReportFilterValue>) => onChange({ ...value, ...p });

  const labelCls = 'text-[10px] font-semibold uppercase tracking-[0.5px] text-text-faint';

  const hasActive =
    !!value.q ||
    !!value.dateFrom ||
    !!value.dateTo ||
    !!value.programId ||
    !!value.subjectId ||
    !!value.topicId ||
    !!value.chapterId ||
    !!value.branchId ||
    !!value.classroomId;

  return (
    <section className={cn('filter-bar flex flex-wrap items-end gap-3', className)}>
      {show('search') ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Search</span>
          <input
            className="form-input h-8 w-56 text-xs"
            placeholder={searchPlaceholder}
            value={value.q ?? ''}
            onChange={(e) => patch({ q: e.target.value })}
          />
        </label>
      ) : null}

      {show('date') ? (
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>From</span>
            <input
              type="date"
              className="form-input h-8 text-xs"
              value={value.dateFrom ?? ''}
              max={value.dateTo || undefined}
              onChange={(e) => patch({ dateFrom: e.target.value || undefined })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>To</span>
            <input
              type="date"
              className="form-input h-8 text-xs"
              value={value.dateTo ?? ''}
              min={value.dateFrom || undefined}
              onChange={(e) => patch({ dateTo: e.target.value || undefined })}
            />
          </label>
        </div>
      ) : null}

      {show('branch') ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Branch</span>
          <select
            className="form-select h-8 w-40 text-xs"
            value={value.branchId ?? ''}
            onChange={(e) => patch({ branchId: e.target.value || undefined, classroomId: undefined })}
          >
            <option value="">All branches</option>
            {(branches.data?.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {show('class') ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Class</span>
          <select
            className="form-select h-8 w-44 text-xs"
            value={value.classroomId ?? ''}
            onChange={(e) => patch({ classroomId: e.target.value || undefined })}
          >
            <option value="">All classes</option>
            {(classes.data?.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {show('taxonomy') ? (
        <div className="flex min-w-[280px] flex-1 flex-col gap-1">
          <span className={labelCls}>Program · Subject · Topic</span>
          <CourseSelector
            size="sm"
            levels={taxonomyLevels}
            value={{
              programId: value.programId ?? null,
              subjectId: value.subjectId ?? null,
              topicId: value.topicId ?? null,
              chapterId: value.chapterId ?? null,
            }}
            onChange={(next) =>
              patch({
                programId: next.programId ?? undefined,
                subjectId: next.subjectId ?? undefined,
                topicId: next.topicId ?? undefined,
                chapterId: next.chapterId ?? undefined,
              })
            }
          />
        </div>
      ) : null}

      {hasActive ? (
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...EMPTY })} className="mb-0.5">
          Clear filters
        </Button>
      ) : null}
    </section>
  );
};
