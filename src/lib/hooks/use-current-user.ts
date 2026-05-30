import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../auth/auth-store';

export const useCurrentUser = () => {
  const { user, hasToken, setUser } = useAuthStore();
  const q = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    enabled: hasToken && !user,
    // Inherit the global retry policy (retry network/5xx with backoff, never
    // 4xx). On a transient backend outage during bootstrap this keeps trying
    // instead of failing once and dumping a token-holding user at /login.
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (q.data) setUser(q.data);
  }, [q.data, setUser]);

  // Gate on hasToken: after logout the ['auth','me'] query cache can still hold
  // the previous user's data (staleTime is 5min). Without this guard,
  // `q.data` would surface as a logged-in user on the login page and trigger a
  // redirect → guard → login render loop. No token ⇒ no current user, period.
  return {
    user: hasToken ? (user ?? q.data ?? null) : null,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
  };
};
