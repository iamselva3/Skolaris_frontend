import { Link } from 'react-router-dom';
import type { DashboardSummary } from '@/lib/api/dashboard.api';
import { fromNow } from '@/lib/utils/format';

/**
 * Operational panel. 6 max rows of READY_FOR_REVIEW uploads. Click anywhere
 * on a row navigates to the review screen.
 */
export const OcrReviewQueuePanel = ({ items }: { items: DashboardSummary['ocrReviewQueue'] }) => (
  <section className="rounded-md border border-border bg-surface">
    <header className="flex h-8 items-center justify-between border-b border-border-soft px-4">
      <span className="text-base font-semibold">OCR Review Queue</span>
      <Link
        to="/uploads?status=READY_FOR_REVIEW"
        className="text-xs font-medium text-primary hover:underline"
      >
        View all →
      </Link>
    </header>
    <div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-text-muted">
          No uploads waiting for review.
        </p>
      ) : (
        items.map((u) => (
          <Link
            key={u.id}
            to={`/uploads/${u.id}/review`}
            className="flex h-14 flex-col justify-center border-b border-border-soft px-4 last:border-0 hover:bg-hover"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-base text-text">{u.fileName}</span>
              <span className="shrink-0 text-xs font-medium text-primary">Review →</span>
            </div>
            <div className="mt-0.5 text-xs text-text-muted">
              {u.program ?? '—'}
              {u.subject ? ` · ${u.subject}` : ''}
              {' • '}
              {u.draftCount} drafts
              {' • '}
              uploaded {fromNow(u.uploadedAt)}
            </div>
          </Link>
        ))
      )}
    </div>
  </section>
);
