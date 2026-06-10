import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { router } from './router';
import { useThemeStore } from '@/lib/theme/theme-store';

/** HTTP status from an axios-style error, if present. */
const errStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | undefined)?.response?.status;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry transient failures (network down, 5xx) with backoff so the app
      // self-heals when the backend restarts. Never retry 4xx (auth/permission
      // /not-found) — those won't fix themselves.
      retry: (failureCount, error) => {
        const status = errStatus(error);
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
      // Recover an already-open page after a backend restart or network blip:
      // refetch when the browser reconnects or the tab regains focus.
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
  },
});

export const App = () => {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-right" duration={4000} closeButton richColors={false} />
    </QueryClientProvider>
  );
};
