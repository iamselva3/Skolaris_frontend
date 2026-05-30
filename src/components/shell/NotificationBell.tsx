import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, X, Trash2 } from 'lucide-react';
import { notificationsApi } from '@/lib/api/notifications.api';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';

/**
 * Soft-yellow bell pill with a count badge. Click opens a 360px right-side
 * drawer with the latest notifications (matches the operational density
 * direction — drawer, not a tiny dropdown).
 */
export const NotificationBell = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const qc = useQueryClient();

  const unread = useQuery({
    queryKey: ['notifications', 'meta'],
    queryFn: () => notificationsApi.list({ limit: 1, offset: 0 }),
    refetchInterval: 60_000,
  });
  const list = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => notificationsApi.list({ limit: 10, offset: 0 }),
    enabled: drawerOpen,
  });

  const deleteOne = useMutation({
    mutationFn: notificationsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    onError: () => toast.error('Failed to clear notification'),
  });

  const clearAll = useMutation({
    mutationFn: notificationsApi.clearAll,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All notifications cleared');
    },
    onError: () => toast.error('Failed to clear notifications'),
  });

  const count = unread.data?.meta.unread ?? 0;

  // Mark visible unread notifications as read when the drawer is open
  useEffect(() => {
    if (drawerOpen && list.data?.data) {
      const unreads = list.data.data.filter((n) => !n.readAt);
      if (unreads.length > 0) {
        Promise.all(unreads.map((n) => notificationsApi.markRead(n.id)))
          .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
          .catch(console.error);
      }
    }
  }, [drawerOpen, list.data, qc]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label={`Notifications (${count} unread)`}
        className="relative inline-flex h-10 items-center gap-1.5 rounded-md border border-bell-bg bg-bell-bg px-3 text-bell-text hover:brightness-95"
      >
        <Bell size={16} aria-hidden />
        <span
          className={cn(
            'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
            count > 0 ? 'bg-bell-count text-text-on-primary' : 'bg-transparent text-bell-text',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      </button>

      {drawerOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="Notifications"
            className="fixed right-0 top-0 z-50 flex h-full w-[360px] flex-col border-l border-border bg-surface"
          >
            <header className="flex h-16 items-center justify-between border-b border-border px-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-md font-semibold">Notifications</span>
                  {count > 0 && <span className="text-xs text-text-muted">{count} unread</span>}
                </div>
                {(list.data?.data ?? []).length > 0 && (
                  <button
                    type="button"
                    onClick={() => clearAll.mutate()}
                    className="mt-0.5 text-[11px] font-medium text-primary hover:underline"
                    disabled={clearAll.isPending}
                  >
                    Clear all
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
                className="rounded p-1 hover:bg-hover"
              >
                <X size={14} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto">
              {list.isLoading ? (
                <p className="px-4 py-3 text-sm text-text-muted">Loading…</p>
              ) : (list.data?.data ?? []).length === 0 ? (
                <p className="px-4 py-3 text-sm text-text-muted">You're all caught up.</p>
              ) : (
                (list.data?.data ?? []).map((n) => (
                  <article
                    key={n.id}
                    className={cn(
                      'group relative border-b border-border-soft px-4 py-3 pr-8 hover:bg-hover',
                      !n.readAt && 'bg-primary-soft hover:bg-primary-soft/80',
                    )}
                  >
                    <div className="text-base font-medium">{n.subject}</div>
                    <div className="mt-0.5 text-xs text-text-muted">{n.body}</div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteOne.mutate(n.id);
                      }}
                      className="absolute right-3 top-3 hidden rounded p-1 text-text-muted hover:bg-surface hover:text-danger group-hover:block"
                      title="Clear notification"
                    >
                      <Trash2 size={13} />
                    </button>
                  </article>
                ))
              )}
            </div>
            <footer className="border-t border-border px-4 py-2">
              <Link
                to="/notifications"
                onClick={() => setDrawerOpen(false)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Open all notifications →
              </Link>
            </footer>
          </aside>
        </>
      ) : null}
    </>
  );
};
