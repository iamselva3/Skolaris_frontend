import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { BrandLogo } from './BrandLogo';
import { BranchBadge, BranchPicker } from './BranchPicker';
import { NotificationBell } from './NotificationBell';
import { PrimaryNav } from './PrimaryNav';
import { UserBlock } from './UserBlock';

/**
 * 64px ERP horizontal header.
 *
 *   [ LOGO ] [ Home ] [ ERP ▾ ] [ DIGITAL ▾ ] [ Settings ]   …   [ branch ] [ bell ] [ user ]
 *
 * Branch visibility by role:
 *   SUPER_ADMIN → interactive BranchPicker (can switch branches)
 *   TEACHER     → read-only BranchBadge (locked to their assigned branch)
 *   STUDENT     → no branch UI (students are branch-scoped at the backend)
 */
export const TopBar = () => {
  const { user } = useCurrentUser();

  const branchSlot = (() => {
    if (!user) return null;
    if (user.role === 'SUPER_ADMIN') return <BranchPicker />;
    if (user.role === 'TEACHER') return <BranchBadge branchId={user.branchId} />;
    return null; // STUDENT — no branch UI
  })();

  return (
    <header className="sticky top-0 z-30 flex h-topbar items-center gap-6 border-b border-border bg-surface px-4">
      <div className="flex items-center gap-6">
        <BrandLogo />
        <PrimaryNav />
      </div>
      <div className="ml-auto flex items-center gap-5">
        {branchSlot}
        {user?.role === 'STUDENT' && (
          <div className="hidden sm:flex items-center gap-4 text-sm font-medium">
            <Link to="/me/actions" className="text-text hover:text-primary transition-colors">Quick Actions</Link>
          </div>
        )}
        <NotificationBell />
        <UserBlock />
      </div>
    </header>
  );
};
