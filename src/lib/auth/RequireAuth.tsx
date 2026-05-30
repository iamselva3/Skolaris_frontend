import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Role } from '../types';
import { homePathFor } from '../utils/role';
import { useAuthStore } from './auth-store';
import { useCurrentUser } from '../hooks/use-current-user';
import { ConnectionError } from '@/components/ui/ConnectionError';

interface Props {
  allowedRoles?: Role[];
  children: ReactNode;
}

export const RequireAuth = ({ allowedRoles, children }: Props): JSX.Element => {
  const location = useLocation();
  const { hasToken } = useAuthStore();
  const { user, isLoading, isError, refetch } = useCurrentUser();

  // No token at all → not logged in.
  if (!hasToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Token present but profile not yet resolved.
  if (!user) {
    if (isLoading) {
      return <div className="loading-line p-6">Loading…</div>;
    }
    if (isError) {
      // We HAVE a token but can't reach the server (backend down / network
      // blip). Don't kick to /login — offer recovery. The query auto-retries
      // with backoff and on reconnect, so this often clears on its own.
      return <ConnectionError onRetry={() => void refetch()} />;
    }
    // Token present, no error, not loading, still no user → token is invalid.
    return <Navigate to="/login" replace />;
  }

  // Authenticated but wrong role → bounce to the user's OWN home instead of a
  // dead-end /forbidden page (which traps the browser back button). `replace`
  // keeps the disallowed URL out of history so Back doesn't re-trigger it.
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }

  return <>{children}</>;
};
