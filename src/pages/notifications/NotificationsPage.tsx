import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import {
  communicationsApi,
  type Communication,
  type CommunicationStatus,
  type CommunicationType,
  type DeliveryChannel,
} from '@/lib/api/communications.api';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Table } from '@/components/ui/Table';
import { formatDateTime, formatNumber } from '@/lib/utils/format';

const PAGE_SIZE = 25;

/* ── Enum → human label + badge tone maps ─────────────────────────────── */

const TYPE_LABELS: Record<CommunicationType, string> = {
  EXAM_ALERT: 'Exam Alert',
  REPORT_PUBLISHED: 'Report Published',
  ATTENDANCE_ALERT: 'Attendance Alert',
  FEE_REMINDER: 'Fee Reminder',
  CIRCULAR: 'Circular',
  ANNOUNCEMENT: 'Announcement',
  GENERAL: 'General',
};

const CHANNEL_LABELS: Record<DeliveryChannel, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
  PUSH: 'Push',
  WHATSAPP: 'WhatsApp',
  IN_APP: 'In-App',
};

const STATUS_LABELS: Record<CommunicationStatus, string> = {
  SENT: 'Sent',
  FAILED: 'Failed',
  SCHEDULED: 'Scheduled',
  PARTIAL: 'Partial Success',
};

const STATUS_TONE: Record<CommunicationStatus, BadgeTone> = {
  SENT: 'success',
  FAILED: 'danger',
  SCHEDULED: 'info',
  PARTIAL: 'warning',
};

const CHANNEL_TONE: Record<DeliveryChannel, BadgeTone> = {
  EMAIL: 'info',
  SMS: 'info',
  PUSH: 'info',
  WHATSAPP: 'success',
  IN_APP: 'default',
};

const TYPE_OPTIONS = Object.keys(TYPE_LABELS) as CommunicationType[];
const CHANNEL_OPTIONS = Object.keys(CHANNEL_LABELS) as DeliveryChannel[];
const STATUS_OPTIONS = Object.keys(STATUS_LABELS) as CommunicationStatus[];

/**
 * Communication History — the admin-facing record of every broadcast the
 * institution has sent to students, parents and staff. A read-only audit log:
 * who was reached, when, through which channel, and with what outcome.
 * (This is NOT the personal notification feed — that still lives in the bell.)
 */
export const NotificationsPage = () => {
  const [q, setQ] = useState('');
  const [type, setType] = useState<'' | CommunicationType>('');
  const [channel, setChannel] = useState<'' | DeliveryChannel>('');
  const [status, setStatus] = useState<'' | CommunicationStatus>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Communication | null>(null);

  const debounced = useDebounce(q, 300);

  const resetPage = () => setOffset(0);

  const list = useQuery({
    queryKey: ['communications', { q: debounced, type, channel, status, dateFrom, dateTo, offset }],
    queryFn: () =>
      communicationsApi.list({
        q: debounced || undefined,
        type: type || undefined,
        channel: channel || undefined,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        // Make the upper bound inclusive of the whole selected day.
        dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    placeholderData: (p) => p,
  });

  const hasFilters = Boolean(type || channel || status || dateFrom || dateTo || debounced);

  const clearFilters = () => {
    setQ('');
    setType('');
    setChannel('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
    resetPage();
  };

  const columns: ColumnDef<Communication>[] = useMemo(
    () => [
      {
        header: 'Notification',
        cell: (c) => {
          const row = c.row.original;
          return (
            <button
              type="button"
              className="min-w-0 text-left"
              onClick={() => setSelected(row)}
            >
              <div className="truncate font-medium text-text hover:text-primary" title={row.title}>
                {row.title}
              </div>
              {row.audience ? (
                <div className="truncate text-xs text-text-muted">{row.audience}</div>
              ) : null}
            </button>
          );
        },
      },
      {
        header: 'Type',
        cell: (c) => <Badge>{TYPE_LABELS[c.row.original.type]}</Badge>,
      },
      {
        header: 'Channel',
        cell: (c) => (
          <Badge tone={CHANNEL_TONE[c.row.original.channel]}>
            {CHANNEL_LABELS[c.row.original.channel]}
          </Badge>
        ),
      },
      {
        header: 'Recipients',
        cell: (c) => (
          <span className="font-mono text-sm tabular-nums">
            {formatNumber(c.row.original.recipientCount)}
          </span>
        ),
      },
      {
        header: 'Sent By',
        cell: (c) => (
          <span className="text-sm text-text-muted">{c.row.original.sentByName ?? 'System'}</span>
        ),
      },
      {
        header: 'Sent At',
        cell: (c) => {
          const row = c.row.original;
          if (row.status === 'SCHEDULED') {
            return (
              <span className="text-xs text-text-muted" title="Scheduled — not yet sent">
                {row.scheduledAt ? `⏱ ${formatDateTime(row.scheduledAt)}` : '—'}
              </span>
            );
          }
          return (
            <span className="text-xs text-text-muted">
              {row.sentAt ? formatDateTime(row.sentAt) : '—'}
            </span>
          );
        },
      },
      {
        header: 'Status',
        cell: (c) => (
          <Badge tone={STATUS_TONE[c.row.original.status]}>
            {STATUS_LABELS[c.row.original.status]}
          </Badge>
        ),
      },
      {
        header: '',
        id: 'action',
        cell: (c) => (
          <button
            type="button"
            className="btn-link"
            onClick={() => setSelected(c.row.original)}
          >
            View →
          </button>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Communication History"
        description="A record of every notification sent to students, parents and staff — who was reached, when, and through which channel."
        actions={
          <div className="hidden md:block">
            <SearchBox value={q} onChange={(v) => { setQ(v); resetPage(); }} />
          </div>
        }
      />

      {/* Filter bar */}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="md:hidden">
          <SearchBox value={q} onChange={(v) => { setQ(v); resetPage(); }} />
        </div>

        <FilterField label="Type">
          <Select
            value={type}
            onChange={(e) => { setType(e.target.value as '' | CommunicationType); resetPage(); }}
            className="h-8"
          >
            <option value="">All types</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="Channel">
          <Select
            value={channel}
            onChange={(e) => { setChannel(e.target.value as '' | DeliveryChannel); resetPage(); }}
            className="h-8"
          >
            <option value="">All channels</option>
            {CHANNEL_OPTIONS.map((ch) => (
              <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="Status">
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value as '' | CommunicationStatus); resetPage(); }}
            className="h-8"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="From">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
            className="h-8"
          />
        </FilterField>

        <FilterField label="To">
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); resetPage(); }}
            className="h-8"
          />
        </FilterField>

        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        ) : null}
      </div>

      {list.error ? <ErrorBanner onRetry={() => list.refetch()} /> : null}

      <Table
        columns={columns}
        data={list.data?.data ?? []}
        empty={
          <div className="px-3 py-8 text-center text-sm text-text-muted">
            {hasFilters
              ? 'No communications match these filters.'
              : 'No communications have been sent yet.'}
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

      <CommunicationDetail communication={selected} onClose={() => setSelected(null)} />
    </>
  );
};

/* ── Sub-components ────────────────────────────────────────────────────── */

const SearchBox = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <div className="relative">
    <Search
      size={14}
      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
    />
    <Input
      placeholder="Search title, audience, sender…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-64 pl-8"
    />
  </div>
);

const FilterField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1">
    <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
    {children}
  </label>
);

const CommunicationDetail = ({
  communication,
  onClose,
}: {
  communication: Communication | null;
  onClose: () => void;
}) => {
  if (!communication) return null;
  const c = communication;
  const pending = Math.max(0, c.recipientCount - c.deliveredCount - c.failedCount);

  return (
    <Drawer open title="Communication Details" onClose={onClose} width={520}>
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge>{TYPE_LABELS[c.type]}</Badge>
            <Badge tone={CHANNEL_TONE[c.channel]}>{CHANNEL_LABELS[c.channel]}</Badge>
            <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABELS[c.status]}</Badge>
          </div>
          <h3 className="text-base font-semibold text-text">{c.title}</h3>
        </div>

        <p className="whitespace-pre-wrap text-sm text-text">{c.body}</p>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-sm">
          <Field label="Audience" value={c.audience ?? '—'} />
          <Field label="Sent By" value={c.sentByName ?? 'System'} />
          <Field
            label={c.status === 'SCHEDULED' ? 'Scheduled For' : 'Sent At'}
            value={
              c.status === 'SCHEDULED'
                ? c.scheduledAt
                  ? formatDateTime(c.scheduledAt)
                  : '—'
                : c.sentAt
                  ? formatDateTime(c.sentAt)
                  : '—'
            }
          />
          <Field label="Created" value={formatDateTime(c.createdAt)} />
        </dl>

        <div className="border-t border-border pt-4">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Recipient statistics
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Recipients" value={c.recipientCount} tone="default" />
            <Stat label="Delivered" value={c.deliveredCount} tone="success" />
            <Stat label="Failed" value={c.failedCount} tone="danger" />
            <Stat label="Pending" value={pending} tone="muted" />
          </div>
        </div>
      </div>
    </Drawer>
  );
};

const Field = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</dt>
    <dd className="mt-0.5 text-text">{value}</dd>
  </div>
);

const Stat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'default' | 'success' | 'danger' | 'muted';
}) => {
  const toneClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'danger'
        ? 'text-danger'
        : tone === 'muted'
          ? 'text-text-muted'
          : 'text-text';
  return (
    <div className="rounded-md border border-border bg-surface-muted px-2 py-2 text-center">
      <div className={`font-mono text-lg font-semibold tabular-nums ${toneClass}`}>
        {formatNumber(value)}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );
};
