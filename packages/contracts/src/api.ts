export type PublicErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'CONFLICT'
  | 'DOMAIN_CONFLICT'
  | 'FORBIDDEN'
  | 'INTERNAL_SERVER_ERROR'
  | 'NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
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
