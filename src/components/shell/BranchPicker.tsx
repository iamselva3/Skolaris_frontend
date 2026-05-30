import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, MapPin } from 'lucide-react';
import { branchesApi } from '@/lib/api/branches.api';
import { cn } from '@/lib/utils/cn';
import { useBranchStore } from '@/lib/store/branch.store';

/**
 * Branch picker chip for SUPER_ADMIN — the yellow "Pethaniapuram" element.
 * Click opens a popover listing all branches. Switching writes to
 * localStorage and invalidates branch-scoped React Query keys.
 *
 * For TEACHER and STUDENT, render the read-only <BranchBadge /> instead.
 */
export const BranchPicker = () => {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { activeBranchId, setActiveBranchId } = useBranchStore();

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const active = branches.data?.data.find((b) => b.id === activeBranchId);

  const onPick = (id: string | null): void => {
    setActiveBranchId(id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-1.5 rounded-md border border-branch-border bg-branch-bg px-3 text-sm font-medium text-branch-text hover:brightness-95"
      >
        <MapPin size={14} aria-hidden />
        <span className="hidden lg:inline">
          {branches.isLoading ? '…' : active?.name ?? 'Select branch'}
        </span>
        <ChevronDown size={12} />
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-40 w-60 rounded-md border border-border bg-surface py-1">
          <button
            type="button"
            onClick={() => onPick(null)}
            className={cn(
              'flex w-full items-center justify-between px-3 py-1.5 text-left text-base hover:bg-hover',
              !activeBranchId && 'bg-primary-soft text-primary',
            )}
          >
            <span>All branches</span>
            {!activeBranchId ? <span className="text-xs">active</span> : null}
          </button>
          
          {(branches.data?.data ?? []).map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onPick(b.id)}
              className={cn(
                'flex w-full items-center justify-between px-3 py-1.5 text-left text-base hover:bg-hover',
                b.id === activeBranchId && 'bg-primary-soft text-primary',
              )}
            >
              <span>{b.name}</span>
              {b.id === activeBranchId ? <span className="text-xs">active</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

/**
 * Read-only branch badge shown to TEACHER users.
 * Displays their assigned branch name as a non-interactive chip —
 * visually consistent with BranchPicker but without the dropdown.
 */
export const BranchBadge = ({ branchId }: { branchId: string | null }) => {
  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list(),
    staleTime: 5 * 60 * 1000,
    // Only fetch if we actually have a branchId to look up
    enabled: !!branchId,
  });

  const name = branchId
    ? (branches.data?.data.find((b) => b.id === branchId)?.name ?? '…')
    : 'No branch';

  return (
    <div
      className="inline-flex h-10 items-center gap-1.5 rounded-md border border-branch-border bg-branch-bg px-3 text-sm font-medium text-branch-text cursor-default select-none"
      title="Your branch is fixed — contact your Super Admin to change it"
      aria-label={`Current branch: ${name}`}
    >
      <MapPin size={14} aria-hidden />
      <span className="hidden lg:inline">{name}</span>
    </div>
  );
};
