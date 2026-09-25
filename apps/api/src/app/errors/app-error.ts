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
  public constructor(message = 'Authentication is required.') {
    super(message, { code: 'AUTHENTICATION_REQUIRED', statusCode: 401 });
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
