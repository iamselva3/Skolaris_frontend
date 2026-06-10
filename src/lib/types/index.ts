/* Common types shared across API modules and pages. */

export type Role = 'SUPER_ADMIN' | 'TEACHER' | 'STUDENT';

export type ExamStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'CLOSED';

export type AttemptStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'GRADED'
  | 'FLAGGED';

export type QuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'FILL_BLANK'
  | 'TRUE_FALSE'
  | 'MATCH_FOLLOWING'
  | 'MATRIX_MATCH'
  | 'DESCRIPTIVE'
  // The whole question is a single image; teacher marks one positional option
  // (1..N, N=2..6) correct. Optional solution. Graded like SINGLE_CHOICE.
  | 'VISUAL';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type ViolationType =
  | 'TAB_SWITCH'
  | 'FULLSCREEN_EXIT'
  | 'COPY_ATTEMPT'
  | 'PASTE_ATTEMPT'
  | 'RIGHT_CLICK'
  | 'WINDOW_BLUR'
  | 'DEVTOOLS_OPEN'
  | 'NETWORK_DROP';

export interface PaginatedMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}

export interface ApiEnvelope<T> {
  data: T;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
}
