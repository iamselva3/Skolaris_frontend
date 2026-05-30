import { WifiOff } from 'lucide-react';
import { Button } from './Button';

/**
 * Recoverable "can't reach the server" state. Shown when an authenticated
 * session can't resolve because the backend is unreachable (down/restarting),
 * instead of dumping the user at /login or a stuck spinner. The query layer
 * also auto-retries with backoff and refetches on reconnect, so this often
 * clears itself; the button is a manual nudge.
 */
export const ConnectionError = ({
  onRetry,
  message,
}: {
  onRetry: () => void;
  message?: string;
}): JSX.Element => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
    <WifiOff size={28} className="text-text-muted" aria-hidden />
    <div>
      <p className="text-md font-semibold text-text">Can't reach the server</p>
      <p className="mt-1 text-sm text-text-muted">
        {message ?? 'The connection dropped or the server is restarting. Your session is still valid.'}
      </p>
    </div>
    <Button variant="primary" onClick={onRetry}>
      Retry
    </Button>
  </div>
);
