import type { ErrorEnvelope, PublicErrorCode } from '@onyx/contracts';
import type { ErrorRequestHandler } from 'express';

import { AppError, DocumentStorageUnavailableError, ValidationError } from '../errors/app-error.js';

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

function mongoErrorDiagnostics(error: unknown): Record<string, unknown> {
  if (typeof error !== 'object' || error === null || !('name' in error)) return {};
  const candidate = error as {
    code?: unknown;
    codeName?: unknown;
    errorLabels?: unknown;
    keyPattern?: unknown;
    name?: unknown;
  };
  if (candidate.name !== 'MongoServerError') return {};

  const keyPatternFields =
    typeof candidate.keyPattern === 'object' && candidate.keyPattern !== null
      ? Object.keys(candidate.keyPattern)
      : undefined;
  return {
    ...(typeof candidate.code === 'number' || typeof candidate.code === 'string'
      ? { mongoCode: candidate.code }
      : {}),
    ...(typeof candidate.codeName === 'string' ? { mongoCodeName: candidate.codeName } : {}),
    ...(Array.isArray(candidate.errorLabels)
      ? {
          mongoErrorLabels: candidate.errorLabels.filter(
            (label): label is string => typeof label === 'string',
          ),
        }
      : {}),
    ...(keyPatternFields === undefined ? {} : { mongoKeyPatternFields: keyPatternFields }),
  };
}

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const normalized = normalizeError(error);

  if (normalized.statusCode >= 500) {
    request.log.error(
      {
        errorType: error instanceof Error ? error.name : 'UnknownError',
        requestId: request.requestId,
        ...mongoErrorDiagnostics(error),
        ...(normalized instanceof DocumentStorageUnavailableError
          ? {
              storageReason: normalized.storageReason,
              providerStatus: normalized.providerStatus,
              providerCode: normalized.providerCode,
            }
          : {}),
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
