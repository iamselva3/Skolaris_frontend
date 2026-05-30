import { Button } from './Button';

interface Props {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (offset: number) => void;
  onLimitChange?: (limit: number) => void;
}

export const Pagination = ({ total, limit, offset, onPageChange, onLimitChange }: Props) => {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pagination">
      <div className="flex items-center gap-4">
        <span className="text-text-muted">
          {total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, total)} of {total}
        </span>
        {onLimitChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted">Per page</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="h-6 rounded border border-border bg-surface px-1 text-xs text-text focus:border-primary focus:outline-none"
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onPageChange(Math.max(0, offset - limit))}>
          Prev
        </Button>
        <span className="text-sm">
          Page {page} / {totalPages}
        </span>
        <Button size="sm" disabled={page >= totalPages} onClick={() => onPageChange(offset + limit)}>
          Next
        </Button>
      </div>
    </div>
  );
};
