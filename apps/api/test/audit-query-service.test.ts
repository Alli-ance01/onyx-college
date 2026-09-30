import { describe, expect, it } from 'vitest';

import { sanitizeAuditValue } from '../src/modules/audit/application/audit-query-service.js';

describe('audit query redaction', () => {
  it('redacts secret-bearing keys recursively while preserving safe change context', () => {
    expect(
      sanitizeAuditValue({
        after: {
          accountStatus: 'SUSPENDED',
          refreshToken: 'must-not-leak',
        },
        authorization: 'Bearer must-not-leak',
        before: { accountStatus: 'ACTIVE' },
        nested: [{ passwordHash: 'must-not-leak', role: 'TEACHER' }],
      }),
    ).toEqual({
      after: {
        accountStatus: 'SUSPENDED',
        refreshToken: '[REDACTED]',
      },
      authorization: '[REDACTED]',
      before: { accountStatus: 'ACTIVE' },
      nested: [{ passwordHash: '[REDACTED]', role: 'TEACHER' }],
    });
  });

  it('bounds oversized strings and excessive nesting', () => {
    const longValue = 'a'.repeat(2100);
    const result = sanitizeAuditValue({
      longValue,
      nested: { one: { two: { three: { four: { five: { six: { seven: {} } } } } } } },
    }) as Record<string, unknown>;

    expect(result.longValue).toBe('a'.repeat(2000) + '…');
    expect(result.nested).toEqual({
      one: {
        two: {
          three: {
            four: {
              five: {
                six: {
                  seven: '[TRUNCATED]',
                },
              },
            },
          },
        },
      },
    });
  });
});
