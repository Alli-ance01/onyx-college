import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './status-badge.js';
import { formatStatusLabel, getStatusTone } from './status-label.js';

describe('status formatting helpers', () => {
  it('formats known system statuses into human-friendly labels', () => {
    expect(formatStatusLabel('UNDER_REVIEW')).toBe('In review');
    expect(formatStatusLabel('RETURNED_FOR_CORRECTION')).toBe('Needs correction');
    expect(formatStatusLabel('CHANGES_REQUESTED')).toBe('Changes requested');
    expect(formatStatusLabel('APPROVED')).toBe('Approved');
    expect(formatStatusLabel('REJECTED')).toBe('Rejected');
    expect(formatStatusLabel('SUBMITTED')).toBe('Submitted');
    expect(formatStatusLabel('DRAFT')).toBe('Draft');
    expect(formatStatusLabel('PUBLISHED')).toBe('Published');
    expect(formatStatusLabel('ACTIVE')).toBe('Active');
    expect(formatStatusLabel('CONFIRMED_DISTINCT')).toBe('Distinct confirmed');
    expect(formatStatusLabel('ORIGINAL_REOPENED')).toBe('Reopened');
    expect(formatStatusLabel('DUPLICATE_REJECTED')).toBe('Duplicate rejected');
    expect(formatStatusLabel('EXEMPT')).toBe('Exempt');
    expect(formatStatusLabel('ABSENT')).toBe('Absent');
  });

  it('gracefully formats unknown statuses with title case conversion', () => {
    expect(formatStatusLabel('CUSTOM_SYSTEM_STATE')).toBe('Custom system state');
    expect(formatStatusLabel('')).toBe('');
    expect(formatStatusLabel(null)).toBe('');
    expect(formatStatusLabel(undefined)).toBe('');
  });

  it('maps domain statuses to appropriate semantic tones', () => {
    expect(getStatusTone('ACTIVE')).toBe('success');
    expect(getStatusTone('APPROVED')).toBe('success');
    expect(getStatusTone('PUBLISHED')).toBe('success');
    expect(getStatusTone('UNDER_REVIEW')).toBe('warning');
    expect(getStatusTone('RETURNED_FOR_CORRECTION')).toBe('warning');
    expect(getStatusTone('REJECTED')).toBe('danger');
    expect(getStatusTone('ABSENT')).toBe('danger');
    expect(getStatusTone('SUBMITTED')).toBe('info');
    expect(getStatusTone('DRAFT')).toBe('neutral');
  });
});

describe('StatusBadge component', () => {
  it('renders a humanized label and dot indicator when given a status key', () => {
    const { container } = render(<StatusBadge status="UNDER_REVIEW" />);
    expect(screen.getByText('In review')).toBeInTheDocument();
    expect(container.querySelector('.ui-status--warning')).toBeInTheDocument();
    expect(container.querySelector('.ui-status__dot')).toBeInTheDocument();
  });

  it('respects tone overrides', () => {
    const { container } = render(<StatusBadge status="UNDER_REVIEW" tone="info" />);
    expect(container.querySelector('.ui-status--info')).toBeInTheDocument();
  });

  it('supports explicit children and custom labels for backwards compatibility', () => {
    render(<StatusBadge tone="success">Custom Active Label</StatusBadge>);
    expect(screen.getByText('Custom Active Label')).toBeInTheDocument();
  });

  it('can suppress the dot indicator if withDot is false', () => {
    const { container } = render(<StatusBadge status="ACTIVE" withDot={false} />);
    expect(container.querySelector('.ui-status__dot')).not.toBeInTheDocument();
  });
});
