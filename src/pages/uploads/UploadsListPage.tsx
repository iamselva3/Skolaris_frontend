import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { uploadsApi, type Upload, type UploadStatus } from '@/lib/api/uploads.api';
import { ocrApi, type OcrBatchListItem } from '@/lib/api/ocr.api';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table } from '@/components/ui/Table';
import { StatusTabs } from '@/components/uploads/StatusTabs';
import { formatNumber, fromNow } from '@/lib/utils/format';

const PAGE_SIZE = 25;

/** A queue row is either a standalone upload or a collapsed multi-file batch. */
type QueueRow = { kind: 'upload'; upload: Upload } | { kind: 'batch'; batch: OcrBatchListItem };

/**
 * Operational OCR queue dashboard. Per-status tabs across the top drive the
 * underlying list query via `?status=`. The columns surface what an operator
 * needs at a glance: file, status pill, draft count, age, inline action.
 */
export const UploadsListPage = () => {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [offset, setOffset] = useState(0);
  const status = (params.get('status') as UploadStatus | null) ?? '';
  const debounced = useDebounce(q, 300);

  const list = useQuery({
    queryKey: ['uploads', { status, q: debounced, offset }],
    queryFn: () =>
      uploadsApi.list({
        status: status || undefined,
        q: debounced || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    placeholderData: (p) => p,
    // Poll while there's any in-flight upload (PROCESSING) so the dashboard
    // feels live without manual refresh. 5s cadence — cheap on a single query.
    refetchInterval: (qData) =>
      qData.state.data?.data.some((u) => u.status === 'PROCESSING') ? 5_000 : false,
  });

  // Multi-file batches show as ONE collapsed row (their member uploads are
  // excluded from the uploads list server-side). They only make sense on the
  // unfiltered first page, so we fetch them there and render them on top.
  const showBatches = !status && !debounced && offset === 0;
  const batches = useQuery({
    queryKey: ['ocr-batches'],
    queryFn: () => ocrApi.listBatches({ limit: 50, offset: 0 }),
    enabled: showBatches,
    refetchInterval: (qData) =>
      qData.state.data?.data.some((b) => b.processing) ? 5_000 : false,
  });

  const rows: QueueRow[] = useMemo(() => {
    const batchRows: QueueRow[] = showBatches
      ? (batches.data?.data ?? []).map((b) => ({ kind: 'batch', batch: b }))
      : [];
    const uploadRows: QueueRow[] = (list.data?.data ?? []).map((u) => ({ kind: 'upload', upload: u }));
    return [...batchRows, ...uploadRows];
  }, [showBatches, batches.data, list.data]);

  // Batch rows derive a single rolled-up status from their member files.
  const batchStatus = (b: OcrBatchListItem): UploadStatus =>
    b.processing ? 'PROCESSING' : b.failed > 0 ? 'FAILED' : 'READY_FOR_REVIEW';

  const columns: ColumnDef<QueueRow>[] = useMemo(
    () => [
      {
        header: 'File',
        cell: (c) => {
          const r = c.row.original;
          if (r.kind === 'batch') {
            return (
              <div className="min-w-0">
                <div className="truncate text-base font-medium text-text">OCR Batch</div>
                <div className="text-xs text-text-muted">
                  {r.batch.fileCount} file{r.batch.fileCount === 1 ? '' : 's'}
                  {r.batch.failed > 0 ? ` · ${r.batch.failed} failed` : ''}
                </div>
              </div>
            );
          }
          const u = r.upload;
          return (
            <div className="min-w-0">
              <div className="truncate text-base font-medium text-text" title={u.originalName}>
                {u.originalName}
              </div>
              <div className="text-xs text-text-muted">
                {u.mimeType.replace(/.*\//, '').toUpperCase()}
                {u.sizeBytes ? ` · ${formatNumber(u.sizeBytes / 1024)} KB` : ''}
              </div>
            </div>
          );
        },
      },
      {
        header: 'Status',
        cell: (c) => {
          const r = c.row.original;
          return <StatusBadge value={r.kind === 'batch' ? batchStatus(r.batch) : r.upload.status} />;
        },
      },
      {
        header: 'Questions',
        cell: (c) => {
          const r = c.row.original;
          const n = r.kind === 'batch' ? r.batch.questionCount : (r.upload.draftCount ?? 0);
          if (!n) return <span className="text-xs text-text-faint">—</span>;
          return <span className="font-mono text-sm tabular-nums">{n}</span>;
        },
      },
      {
        header: 'Age',
        cell: (c) => {
          const created = c.row.original.kind === 'batch'
            ? c.row.original.batch.createdAt
            : c.row.original.upload.createdAt;
          return (
            <span className="text-xs text-text-muted" title={created}>
              {fromNow(created)}
            </span>
          );
        },
      },
      {
        header: '',
        id: 'action',
        cell: (c) => {
          const r = c.row.original;
          if (r.kind === 'batch') {
            const b = r.batch;
            if (!b.firstUploadId) return <span className="text-xs text-text-faint">—</span>;
            const to = `/uploads/${b.firstUploadId}/review?batchId=${b.batchId}`;
            return (
              <Link className="btn-link" to={to}>
                {b.processing ? 'View Progress →' : 'Review →'}
              </Link>
            );
          }
          const u = r.upload;
          if (u.status === 'READY_FOR_REVIEW') {
            return (
              <Link className="btn-link" to={`/uploads/${u.id}/review`}>
                Review →
              </Link>
            );
          }
          if (u.status === 'APPROVED') {
            return (
              <Link className="btn-link" to={`/uploads/${u.id}/review`}>
                View →
              </Link>
            );
          }
          if (u.status === 'PROCESSING') {
            return (
              <Link className="btn-link" to={`/uploads/${u.id}/review`}>
                View Progress →
              </Link>
            );
          }
          if (u.status === 'FAILED') {
            return (
              <span className="text-xs text-danger" title={u.errorMessage ?? ''}>
                {u.errorMessage ? u.errorMessage.slice(0, 40) : 'Failed'}
              </span>
            );
          }
          return <span className="text-xs text-text-faint">—</span>;
        },
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Uploads"
        description="OCR queue — uploads are routed through extraction, then reviewed and approved into the Question Bank."
        actions={
          <>
            <div className="hidden md:block">
              <Input
                placeholder="Search file name"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOffset(0);
                }}
                className="h-8 w-64"
              />
            </div>
            <Link to="/uploads/new">
              <Button variant="primary">
                <Plus size={14} /> Upload paper
              </Button>
            </Link>
          </>
        }
      />

      <StatusTabs active={status} />

      {/* Mobile-only search (page header search is hidden < md). */}
      <div className="mb-2 md:hidden">
        <Input
          placeholder="Search file name"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOffset(0);
          }}
          className="h-8 w-full"
        />
      </div>

      {list.error ? <ErrorBanner onRetry={() => list.refetch()} /> : null}

      <Table
        columns={columns}
        data={rows}
        empty={
          <div className="px-3 py-8 text-center text-sm text-text-muted">
            {status === 'READY_FOR_REVIEW' ? (
              <>No uploads waiting for review. Take a coffee.</>
            ) : status === 'FAILED' ? (
              <>No failed uploads. The pipeline is healthy.</>
            ) : status === 'PROCESSING' ? (
              <>Nothing extracting right now.</>
            ) : (
              <>
                No uploads yet.{' '}
                <Link to="/uploads/new" className="btn-link">
                  Upload your first paper →
                </Link>
              </>
            )}
          </div>
        }
      />

      {list.data && list.data.meta.total > PAGE_SIZE ? (
        <Pagination
          total={list.data.meta.total}
          limit={PAGE_SIZE}
          offset={offset}
          onPageChange={setOffset}
        />
      ) : null}
    </>
  );
};
