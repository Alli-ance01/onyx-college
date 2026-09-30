import type { AuthenticatedPrincipal, SuccessEnvelope } from '@onyx/contracts';
import type { Response } from 'express';
import mongoose from 'mongoose';

import { ValidationError } from '../errors/app-error.js';

export function objectId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
    throw new ValidationError(`${label} is invalid.`);
  }
  return value;
}

export function optionalObjectId(value: unknown, label: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  return objectId(value, label);
}

export function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

export function sendData(response: Response, data: unknown, status = 200): void {
  const envelope: SuccessEnvelope<unknown> = { data };
  response.status(status).json(envelope);
}

export function principalSummary(principal: AuthenticatedPrincipal) {
  return {
    accountType: principal.accountType,
    permissions: principal.permissions,
    userId: principal.userId,
  };
}
