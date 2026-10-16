import type { StatusTone } from './status-badge.js';

const STATUS_LABELS: Record<string, string> = {
  // Registration and review workflow
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'In review',
  PENDING_REVIEW: 'Pending review',
  RETURNED_FOR_CORRECTION: 'Needs correction',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PUBLISHED: 'Published',

  // Duplicate resolutions
  CONFIRMED_DISTINCT: 'Distinct confirmed',
  ORIGINAL_REOPENED: 'Reopened',
  DUPLICATE_REJECTED: 'Duplicate rejected',

  // Student & teacher lifecycle
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  GRADUATED: 'Graduated',
  WITHDRAWN: 'Withdrawn',
  REVOKED: 'Revoked',
  SUSPENDED: 'Suspended',
  COMPLETED: 'Completed',
  PENDING: 'Pending',

  // Document verification & corrections
  ACCEPTED: 'Accepted',
  REPLACED: 'Replaced',

  // Curriculum & Assessment
  REQUIRED: 'Required',
  ELECTIVE: 'Elective',
  EXEMPT: 'Exempt',
  SCORED: 'Scored',
  ABSENT: 'Absent',
};

const STATUS_TONES: Record<string, StatusTone> = {
  ACTIVE: 'success',
  APPROVED: 'success',
  PUBLISHED: 'success',
  COMPLETED: 'success',
  ACCEPTED: 'success',

  UNDER_REVIEW: 'warning',
  PENDING_REVIEW: 'warning',
  RETURNED_FOR_CORRECTION: 'warning',
  CHANGES_REQUESTED: 'warning',
  PENDING: 'warning',

  REJECTED: 'danger',
  DUPLICATE_REJECTED: 'danger',
  WITHDRAWN: 'danger',
  REVOKED: 'danger',
  SUSPENDED: 'danger',
  ABSENT: 'danger',

  SUBMITTED: 'info',
  CONFIRMED_DISTINCT: 'info',
  ORIGINAL_REOPENED: 'info',
  REQUIRED: 'info',
  REPLACED: 'info',

  DRAFT: 'neutral',
  INACTIVE: 'neutral',
  GRADUATED: 'neutral',
  EXEMPT: 'neutral',
  ELECTIVE: 'neutral',
  SCORED: 'neutral',
};

/**
 * Formats a raw machine status into a human-friendly plain language label.
 */
export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return '';
  const known = STATUS_LABELS[status];
  if (known) return known;

  // Fallback: replace underscores/dashes with spaces and capitalize initial letter
  return status
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Derives a design-token tone ('success' | 'warning' | 'danger' | 'info' | 'neutral') for a given status.
 */
export function getStatusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'neutral';
  return STATUS_TONES[status] ?? 'neutral';
}
