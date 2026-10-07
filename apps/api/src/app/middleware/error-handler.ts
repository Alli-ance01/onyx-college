import type { ErrorEnvelope, PublicErrorCode } from '@onyx/contracts';
import type { ErrorRequestHandler } from 'express';

import { AppError, ValidationError } from '../errors/app-error.js';

interface HttpSyntaxError extends SyntaxError {
  status?: number;
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof SyntaxError && (error as HttpSyntaxError).status === 400) {
    return new ValidationError('The request body contains invalid JSON.');
  }

  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.too.large') {
      return new AppError('The request body exceeds the allowed size.', {
        code: 'VALIDATION_FAILED',
        statusCode: 413,
      });
    }
    if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
      return new AppError('The request body encoding is not supported.', {
        code: 'VALIDATION_FAILED',
        statusCode: 415,
      });
    }
  }

  return new AppError('An unexpected error occurred.', {
    cause: error,
    code: 'INTERNAL_SERVER_ERROR',
    expose: false,
    statusCode: 500,
  });
}

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const normalized = normalizeError(error);

  if (normalized.statusCode >= 500) {
    request.log.error(
      {
        errorType: error instanceof Error ? error.name : 'UnknownError',
        requestId: request.requestId,
      },
      'Unhandled request error',
    );
  }

  const code: PublicErrorCode = normalized.expose ? normalized.code : 'INTERNAL_SERVER_ERROR';
  const message = normalized.expose ? normalized.message : 'An unexpected error occurred.';
  const envelope: ErrorEnvelope = {
    error: {
      code,
      message,
      requestId: request.requestId,
      ...(normalized.expose && normalized.details !== undefined
        ? { details: normalized.details }
        : {}),
    },
  };

  response.status(normalized.statusCode).json(envelope);
};
