import type { ClientSession, Types } from 'mongoose';

import { AuditLogModel } from '../infrastructure/audit-log-model.js';

export interface AuditEvent {
  action: string;
  actorSessionId?: string;
  actorType: 'SYSTEM' | 'USER';
  actorUserId?: Types.ObjectId;
  changes?: Readonly<Record<string, unknown>>;
  correlationId?: string;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
  reason?: string;
  requestId?: string;
  sourceContext?: Readonly<Record<string, unknown>>;
  targetId: string;
  targetType: string;
}

export class AuditWriter {
  public async append(event: AuditEvent, session?: ClientSession): Promise<void> {
    await AuditLogModel.create(
      [
        {
          ...event,
          occurredAt: new Date(),
        },
      ],
      session === undefined ? {} : { session },
    );
  }
}
