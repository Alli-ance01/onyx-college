import mongoose, { type Types } from 'mongoose';

import { ValidationError } from '../../../app/errors/app-error.js';
import { AuditLogModel } from '../infrastructure/audit-log-model.js';

export interface AuditLogSummary {
  action: string;
  actorSessionId?: string;
  actorType: 'SYSTEM' | 'USER';
  actorUserId?: string;
  changes?: unknown;
  correlationId?: string;
  id: string;
  occurredAt: string;
  outcome: 'DENIED' | 'FAILURE' | 'SUCCESS';
  reason?: string;
  requestId?: string;
  sourceContext?: unknown;
  targetId: string;
  targetType: string;
}

export interface AuditLogPage {
  items: readonly AuditLogSummary[];
  nextCursor?: string;
}

interface LeanAuditLog {
  _id: Types.ObjectId;
  action: string;
  actorSessionId?: string;
  actorType: 'SYSTEM' | 'USER';
  actorUserId?: Types.ObjectId;
  changes?: unknown;
  correlationId?: string;
  occurredAt: Date;
  outcome: 'DENIED' | 'FAILURE' | 'SUCCESS';
  reason?: string;
  requestId?: string;
  sourceContext?: unknown;
  targetId: string;
  targetType: string;
}

const secretKeyPattern =
  /authorization|cookie|credential|hash|password|pepper|private.?key|secret|token/iu;

export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (depth >= 8) return '[TRUNCATED]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    return value.length > 2000 ? value.slice(0, 2000) + '…' : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeAuditValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, nested]) => [
          key,
          secretKeyPattern.test(key) ? '[REDACTED]' : sanitizeAuditValue(nested, depth + 1),
        ]),
    );
  }
  if (typeof value === 'bigint') return value.toString();
  if (value === undefined) return null;
  return '[' + typeof value + ']';
}

function toSummary(record: LeanAuditLog): AuditLogSummary {
  return {
    action: record.action,
    actorType: record.actorType,
    id: record._id.toString(),
    occurredAt: record.occurredAt.toISOString(),
    outcome: record.outcome,
    targetId: record.targetId,
    targetType: record.targetType,
    ...(record.actorSessionId === undefined ? {} : { actorSessionId: record.actorSessionId }),
    ...(record.actorUserId === undefined ? {} : { actorUserId: record.actorUserId.toString() }),
    ...(record.changes === undefined ? {} : { changes: sanitizeAuditValue(record.changes) }),
    ...(record.correlationId === undefined ? {} : { correlationId: record.correlationId }),
    ...(record.reason === undefined ? {} : { reason: record.reason }),
    ...(record.requestId === undefined ? {} : { requestId: record.requestId }),
    ...(record.sourceContext === undefined
      ? {}
      : { sourceContext: sanitizeAuditValue(record.sourceContext) }),
  };
}

export class AuditQueryService {
  public async list(filters: {
    action?: string;
    actorUserId?: string;
    cursor?: string;
    from?: Date;
    outcome?: 'DENIED' | 'FAILURE' | 'SUCCESS';
    pageSize?: number;
    requestId?: string;
    targetId?: string;
    targetType?: string;
    to?: Date;
  }): Promise<AuditLogPage> {
    const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 100);
    const query: Record<string, unknown> = {};
    if (filters.actorUserId !== undefined) {
      if (!mongoose.isValidObjectId(filters.actorUserId)) {
        throw new ValidationError('The audit actor identifier is invalid.');
      }
      query.actorUserId = new mongoose.Types.ObjectId(filters.actorUserId);
    }
    if (filters.action !== undefined) query.action = filters.action;
    if (filters.outcome !== undefined) query.outcome = filters.outcome;
    if (filters.requestId !== undefined) query.requestId = filters.requestId;
    if (filters.targetId !== undefined) query.targetId = filters.targetId;
    if (filters.targetType !== undefined) query.targetType = filters.targetType;
    if (filters.from !== undefined || filters.to !== undefined) {
      if (
        (filters.from !== undefined && Number.isNaN(filters.from.getTime())) ||
        (filters.to !== undefined && Number.isNaN(filters.to.getTime())) ||
        (filters.from !== undefined &&
          filters.to !== undefined &&
          filters.from.getTime() > filters.to.getTime())
      ) {
        throw new ValidationError('The audit date range is invalid.');
      }
      query.occurredAt = {
        ...(filters.from === undefined ? {} : { $gte: filters.from }),
        ...(filters.to === undefined ? {} : { $lte: filters.to }),
      };
    }
    if (filters.cursor !== undefined) {
      if (!mongoose.isValidObjectId(filters.cursor)) {
        throw new ValidationError('The audit cursor is invalid.');
      }
      const cursor = await AuditLogModel.findById(filters.cursor).select({ occurredAt: 1 }).lean();
      if (cursor === null) throw new ValidationError('The audit cursor is invalid.');
      query.$or = [
        { occurredAt: { $lt: cursor.occurredAt } },
        {
          _id: { $lt: cursor._id },
          occurredAt: cursor.occurredAt,
        },
      ];
    }

    const records = (await AuditLogModel.find(query)
      .sort({ occurredAt: -1, _id: -1 })
      .limit(pageSize + 1)
      .lean()) as unknown as LeanAuditLog[];
    const hasMore = records.length > pageSize;
    const page = records.slice(0, pageSize);
    const last = page.at(-1);
    return {
      items: page.map(toSummary),
      ...(hasMore && last !== undefined ? { nextCursor: last._id.toString() } : {}),
    };
  }
}
