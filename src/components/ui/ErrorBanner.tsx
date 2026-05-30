import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface Props {
  message?: string;
  onRetry?: () => void;
}

export const ErrorBanner = ({ message = "Couldn't load. Try again.", onRetry }: Props) => (
  <div className="error-banner">
    <span className="flex items-center gap-2">
      <AlertTriangle size={16} />
      {message}
    </span>
    {onRetry ? (
      <Button size="sm" onClick={onRetry}>
        Retry
      </Button>
    ) : null}
  </div>
);
