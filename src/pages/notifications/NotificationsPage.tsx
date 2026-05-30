import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, type Notification } from '@/lib/api/notifications.api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/utils/cn';
import { formatDateTime } from '@/lib/utils/format';

const PAGE_SIZE = 25;

export const NotificationsPage = () => {
  const [offset, setOffset] = useState(0);
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['notifications', { offset }],
    queryFn: () => notificationsApi.list({ limit: PAGE_SIZE, offset }),
    placeholderData: (p) => p,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  return (
    <>
      <PageHeader
        title="Notifications"
        description={list.data ? `${list.data.meta.unread} unread of ${list.data.meta.total}` : ''}
      />
      <Card>
        <ul className="divide-y divide-border">
          {list.data?.data.map((n) => (
            <Row key={n.id} n={n} onClick={() => !n.readAt && markRead.mutate(n.id)} />
          ))}
        </ul>
      </Card>
      {list.data ? (
        <Pagination total={list.data.meta.total} limit={PAGE_SIZE} offset={offset} onPageChange={setOffset} />
      ) : null}
    </>
  );
};

const Row = ({ n, onClick }: { n: Notification; onClick: () => void }) => (
  <li
    className={cn(
      'cursor-pointer p-4 hover:bg-surface-hover',
      n.readAt ? 'bg-surface-muted' : 'bg-surface',
    )}
    onClick={onClick}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {!n.readAt ? <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-label="Unread" /> : null}
        <span className="text-sm font-medium">{n.subject}</span>
      </div>
      <span className="text-xs text-text-muted">{formatDateTime(n.createdAt)}</span>
    </div>
    <p className="mt-1 text-sm text-text-muted">{n.body}</p>
  </li>
);
