import { cn } from '@/lib/utils/cn';

/**
 * Sole place allowed to use animate-spin. Used for the upload progress
 * indicator and OCR processing state.
 */
export const Loader = ({ className }: { className?: string }) => (
  <svg
    className={cn('h-3 w-3 animate-spin text-text-muted', className)}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
    />
  </svg>
);
