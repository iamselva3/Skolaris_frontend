import { Badge, type BadgeTone } from './Badge';

const TONE: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  GRADED: 'success',
  APPROVED: 'success',
  COMPLETED: 'success',
  READY_FOR_REVIEW: 'info',
  IN_PROGRESS: 'info',
  LIVE: 'info',
  SCHEDULED: 'info',
  PROCESSING: 'info',
  UPLOADED: 'info',
  SUBMITTED: 'info',
  PENDING_UPLOAD: 'default',
  PENDING_REVIEW: 'default',
  EDITED: 'default',
  NOT_STARTED: 'default',
  DRAFT: 'default',
  DISCARDED: 'default',
  DISABLED: 'default',
  CLOSED: 'default',
  FLAGGED: 'warning',
  FAILED: 'danger',
};

export const StatusBadge = ({ value }: { value: string }) => (
  <Badge tone={TONE[value] ?? 'default'}>{value.replace(/_/g, ' ').toLowerCase()}</Badge>
);
