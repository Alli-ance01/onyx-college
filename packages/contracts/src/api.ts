export type PublicErrorCode =
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_UNAVAILABLE'
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTH_REFRESH_RETRY'
  | 'BOOTSTRAP_ALREADY_COMPLETED'
  | 'DOCUMENT_STORAGE_UNAVAILABLE'
  | 'DUPLICATE_REVIEW_REQUIRED'
  | 'CONFLICT'
  | 'CSRF_VALIDATION_FAILED'
  | 'DOMAIN_CONFLICT'
  | 'FORBIDDEN'
  | 'INVALID_CREDENTIALS'
  | 'INTERNAL_SERVER_ERROR'
  | 'NOT_FOUND'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'PRECONDITION_FAILED'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'SESSION_REVOKED'
  | 'VALIDATION_FAILED';

export interface ValidationIssue {
  code: string;
  message: string;
  path: string;
}

export interface ApiErrorBody {
  code: PublicErrorCode;
  details?: Readonly<Record<string, unknown>>;
  message: string;
  requestId: string;
}

export interface ErrorEnvelope {
  error: ApiErrorBody;
}

export interface SuccessEnvelope<TData, TMeta = never> {
  data: TData;
  links?: Readonly<Record<string, string>>;
  meta?: TMeta;
}

export interface CursorPaginationMeta {
  hasMore: boolean;
  nextCursor?: string;
  pageSize: number;
}
