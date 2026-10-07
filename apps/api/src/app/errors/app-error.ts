import type { PublicErrorCode } from '@onyx/contracts';

interface AppErrorOptions {
  cause?: unknown;
  code: PublicErrorCode;
  details?: Readonly<Record<string, unknown>>;
  expose?: boolean;
  statusCode: number;
}

export class AppError extends Error {
  public readonly code: PublicErrorCode;
  public readonly details: Readonly<Record<string, unknown>> | undefined;
  public readonly expose: boolean;
  public readonly statusCode: number;

  public constructor(message: string, options: AppErrorOptions) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
    this.expose = options.expose ?? true;
    this.statusCode = options.statusCode;

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class DocumentStorageUnavailableError extends AppError {
  public readonly providerStatus: number | undefined;
  public readonly providerCode: string | undefined;
  public constructor(
    public readonly storageReason:
      'provider_error' | 'invalid_response' | 'metadata_mismatch' | 'invalid_locator',
    cause?: unknown,
  ) {
    super('Document storage is temporarily unavailable.', {
      code: 'DOCUMENT_STORAGE_UNAVAILABLE',
      statusCode: 503,
      cause,
    });
    const status =
      typeof cause === 'object' && cause !== null && 'http_code' in cause
        ? cause.http_code
        : undefined;
    this.providerStatus =
      typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
        ? status
        : undefined;
    const code =
      typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined;
    this.providerCode =
      typeof code === 'string' &&
      ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'].includes(code)
        ? code
        : undefined;
  }
}

export class ValidationError extends AppError {
  public constructor(
    message = 'The request contains invalid values.',
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message, {
      code: 'VALIDATION_FAILED',
      statusCode: 400,
      ...(details === undefined ? {} : { details }),
    });
  }
}

export class AuthenticationError extends AppError {
  public constructor(
    message = 'Authentication is required.',
    code: PublicErrorCode = 'AUTHENTICATION_REQUIRED',
  ) {
    super(message, { code, statusCode: 401 });
  }
}

export class AuthorizationError extends AppError {
  public constructor(message = 'You are not authorized to perform this action.') {
    super(message, { code: 'FORBIDDEN', statusCode: 403 });
  }
}

export class NotFoundError extends AppError {
  public constructor(message = 'The requested resource was not found.') {
    super(message, { code: 'NOT_FOUND', statusCode: 404 });
  }
}

export class ConflictError extends AppError {
  public constructor(message = 'The request conflicts with the current resource state.') {
    super(message, { code: 'CONFLICT', statusCode: 409 });
  }
}

export class DomainConflictError extends AppError {
  public constructor(message = 'The requested operation is not valid in the current state.') {
    super(message, { code: 'DOMAIN_CONFLICT', statusCode: 409 });
  }
}

export class RateLimitError extends AppError {
  public constructor(message = 'Too many requests. Please try again later.') {
    super(message, { code: 'RATE_LIMITED', statusCode: 429 });
  }
}

export class PasswordChangeRequiredError extends AppError {
  public constructor() {
    super('You must change your temporary password before continuing.', {
      code: 'PASSWORD_CHANGE_REQUIRED',
      statusCode: 403,
    });
  }
}
