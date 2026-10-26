import { ApiClientError } from '../lib/api/api-client.js';

/**
 * Produces a user-facing error message for API errors.
 * Prefers domain-specific, actionable language over generic catch-all text.
 */
export function resolveErrorMessage(error: unknown, context?: ErrorContext): string {
  if (error instanceof ApiClientError) {
    return resolveApiError(error, context);
  }

  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return 'The service is taking longer than expected. Check your connection and try again.';
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'The request was cancelled. Please try again if this was unintentional.';
  }

  if (error instanceof Error && error.message.toLowerCase().includes('timeout')) {
    return 'The server is taking too long to respond. Please wait a moment and try again.';
  }

  return 'Something unexpected happened. Please try again or contact the school office if the problem persists.';
}

interface ErrorContext {
  /** The domain action being performed, e.g. 'approve registration', 'save result' */
  action?: string;
  /** The entity type, e.g. 'student', 'registration', 'result' */
  entity?: string;
}

function resolveApiError(error: ApiClientError, context?: ErrorContext): string {
  // ── Validation details take precedence if available ───────────────────────
  if (error.code === 'VALIDATION_ERROR') {
    const details = error.details;
    if (details !== undefined && typeof details === 'object') {
      const fieldErrors = Object.entries(details)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => `${formatFieldName(key)}: ${value as string}`)
        .join(' · ');
      if (fieldErrors.length > 0) return fieldErrors;
    }
    if (error.message && error.message !== 'The request could not be completed.') {
      return error.message;
    }
    return 'Some fields contain invalid values. Please review and correct them.';
  }

  // ── Specific server message takes priority over client generic text ─────────
  if (
    error.message &&
    error.message !== 'The request could not be completed.' &&
    error.message !== 'An unexpected error occurred.'
  ) {
    return error.message;
  }

  // ── Authentication & authorization ───────────────────────────────────────

  // ── Duplicate / conflict ─────────────────────────────────────────────────
  if (error.code === 'DUPLICATE_ENTRY' || error.code === 'ALREADY_EXISTS') {
    const entity = context?.entity ?? 'record';
    return `This ${entity} already exists. Please check for duplicates or use different values.`;
  }
  if (error.code === 'CONFLICT' || error.code === 'CONCURRENT_MODIFICATION') {
    return 'This record was modified by someone else while you were working on it. Refresh the page and try again.';
  }

  // ── Not found ────────────────────────────────────────────────────────────
  if (error.code === 'NOT_FOUND' || error.status === 404) {
    const entity = context?.entity ?? 'record';
    return `The ${entity} could not be found. It may have been moved or deleted.`;
  }

  // ── Registration & student lifecycle ─────────────────────────────────────
  if (error.code === 'REGISTRATION_ALREADY_SUBMITTED') {
    return 'This registration has already been submitted and cannot be modified.';
  }
  if (error.code === 'REGISTRATION_NOT_SUBMITTED') {
    return 'This registration must be submitted before it can be reviewed.';
  }
  if (error.code === 'STUDENT_ALREADY_APPROVED') {
    return 'This student has already been approved and enrolled.';
  }
  if (error.code === 'ENROLLMENT_EXISTS') {
    return 'This student already has an enrollment for this academic session.';
  }

  // ── Results ──────────────────────────────────────────────────────────────
  if (error.code === 'RESULT_ALREADY_PUBLISHED') {
    return 'Published results cannot be edited directly. Use the correction request workflow instead.';
  }
  if (error.code === 'RESULT_INVALID_STATE') {
    return 'This result batch is not in the correct state for this action. Refresh the page and check its current status.';
  }
  if (error.code === 'SCORE_OUT_OF_RANGE') {
    return 'One or more scores are outside the valid range. Please check the maximum marks for each assessment component.';
  }

  // ── Server errors ────────────────────────────────────────────────────────
  if (error.status >= 500) {
    const action = context?.action ?? 'complete this request';
    return `The server could not ${action} right now. Please try again in a moment. If the problem continues, contact the school's IT support.`;
  }

  // ── Rate limiting ────────────────────────────────────────────────────────
  if (error.status === 429) {
    return 'Too many requests. Please wait a moment before trying again.';
  }

  // ── Fallback: prefer the server message if it exists ─────────────────────
  if (error.message && error.message !== 'The request could not be completed.') {
    return error.message;
  }

  const action = context?.action ?? 'process your request';
  return `We were unable to ${action}. Please try again.`;
}

function formatFieldName(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^\w/, (char) => char.toUpperCase());
}
