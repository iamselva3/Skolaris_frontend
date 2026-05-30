import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, User } from 'lucide-react';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { useAuthStore } from '@/lib/auth/auth-store';
import { authApi } from '@/lib/api/auth.api';
import { tokenStorage } from '@/lib/auth/token-storage';

/**
 * Far-right user block. Two-line label ("Hello,\n<first + truncated last>")
 * + 40px circular avatar with status dot. Hover/click opens a 220px menu.
 */
export const UserBlock = () => {
  const { user } = useCurrentUser();
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!user) return null;

  const fullName = user.name ?? 'User';
  const [first = '', ...rest] = fullName.split(' ');
  const last = rest.join(' ');
  const compactLast = last.length > 8 ? `${last.slice(0, 7)}…` : last;
  const displayName = last ? `${first} ${compactLast}` : first;
  const initial = (first[0] ?? user.email[0] ?? '?').toUpperCase();

  const onLogout = async (): Promise<void> => {
    try {
      await authApi.logout(tokenStorage.getRefresh());
    } catch {
      /* ignore */
    }
    clear();
    // Wipe ALL cached queries so no previous-session data (the ['auth','me']
    // user, dashboards, question lists) bleeds into the next login.
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-md px-1 py-1 hover:bg-hover"
      >
        <div className="hidden text-right leading-tight md:block">
          <div className="text-xs text-text-muted">Hello,</div>
          <div className="text-base font-semibold">{displayName}</div>
        </div>
        <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-base font-semibold text-primary">
          {initial}
          <span
            aria-hidden
            className="absolute bottom-0.5 right-0.5 inline-block h-2.5 w-2.5 rounded-full border-2 border-surface bg-online"
          />
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-[220px] rounded-md border border-border bg-surface py-1">
          <div className="border-b border-border-soft px-3 py-2">
            <div className="text-base font-medium">{fullName}</div>
            <div className="text-xs text-text-muted">{user.role}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/settings');
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-base hover:bg-hover"
          >
            <User size={14} /> Profile
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-base text-danger hover:bg-hover"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
};
