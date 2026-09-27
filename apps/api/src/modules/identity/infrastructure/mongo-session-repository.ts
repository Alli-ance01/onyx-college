import type { AuthSessionSummary } from '@onyx/contracts';
import type { ClientSession } from 'mongoose';

import type { SessionRecord } from '../application/auth-records.js';
import { AuthSessionModel } from './auth-session-model.js';

function toRecord(document: {
  _id: { toString(): string };
  createdAt: Date;
  csrfNonce: string;
  currentTokenHash: string;
  deviceLabel: string;
  expiresAt: Date;
  familyId: string;
  fingerprintHash: string;
  lastUsedAt: Date;
  previousTokenHash?: string | null;
  previousTokenValidUntil?: Date | null;
  rotationCounter: number;
  sessionId: string;
  status: 'ACTIVE' | 'REVOKED';
  userId: { toString(): string };
}): SessionRecord {
  return {
    createdAt: document.createdAt,
    csrfNonce: document.csrfNonce,
    currentTokenHash: document.currentTokenHash,
    deviceLabel: document.deviceLabel,
    expiresAt: document.expiresAt,
    familyId: document.familyId,
    fingerprintHash: document.fingerprintHash,
    id: document._id.toString(),
    lastUsedAt: document.lastUsedAt,
    rotationCounter: document.rotationCounter,
    sessionId: document.sessionId,
    status: document.status,
    userId: document.userId.toString(),
    ...(document.previousTokenHash == null
      ? {}
      : { previousTokenHash: document.previousTokenHash }),
    ...(document.previousTokenValidUntil == null
      ? {}
      : { previousTokenValidUntil: document.previousTokenValidUntil }),
  };
}

const secretSelection =
  '+currentTokenHash +previousTokenHash +previousTokenValidUntil +csrfNonce +fingerprintHash';

export class MongoSessionRepository {
  public async create(input: {
    csrfNonce: string;
    currentTokenHash: string;
    deviceLabel: string;
    expiresAt: Date;
    familyId: string;
    fingerprintHash: string;
    ipHash: string;
    now: Date;
    sessionId: string;
    userId: string;
  }): Promise<SessionRecord> {
    const session = await AuthSessionModel.create({
      ...input,
      lastUsedAt: input.now,
      rotationCounter: 0,
      status: 'ACTIVE',
    });
    const selected = await AuthSessionModel.findById(session._id).select(secretSelection).lean();
    if (selected === null) {
      throw new Error('Created authentication session could not be loaded.');
    }
    return toRecord(selected);
  }

  public async findActive(sessionId: string): Promise<SessionRecord | null> {
    const session = await AuthSessionModel.findOne({ sessionId, status: 'ACTIVE' })
      .select(secretSelection)
      .lean();
    return session === null ? null : toRecord(session);
  }

  public async rotateCurrent(
    input: {
      currentTokenHash: string;
      graceUntil: Date;
      newTokenHash: string;
      now: Date;
      sessionId: string;
    },
    mongoSession?: ClientSession,
  ): Promise<SessionRecord | null> {
    const session = await AuthSessionModel.findOneAndUpdate(
      {
        currentTokenHash: input.currentTokenHash,
        expiresAt: { $gt: input.now },
        sessionId: input.sessionId,
        status: 'ACTIVE',
      },
      {
        $inc: { rotationCounter: 1 },
        $set: {
          currentTokenHash: input.newTokenHash,
          lastUsedAt: input.now,
          previousTokenHash: input.currentTokenHash,
          previousTokenValidUntil: input.graceUntil,
        },
      },
      { new: true, ...(mongoSession === undefined ? {} : { session: mongoSession }) },
    )
      .select(secretSelection)
      .lean();
    return session === null ? null : toRecord(session);
  }

  public async revoke(
    sessionId: string,
    reason: string,
    now: Date,
    mongoSession?: ClientSession,
  ): Promise<boolean> {
    const result = await AuthSessionModel.updateOne(
      { sessionId, status: 'ACTIVE' },
      { $set: { revokedAt: now, revocationReason: reason, status: 'REVOKED' } },
      mongoSession === undefined ? {} : { session: mongoSession },
    );
    return result.modifiedCount === 1;
  }

  public async markReplay(
    sessionId: string,
    now: Date,
    mongoSession?: ClientSession,
  ): Promise<void> {
    await AuthSessionModel.updateOne(
      { sessionId },
      {
        $set: {
          replayDetectedAt: now,
          revokedAt: now,
          revocationReason: 'REFRESH_REPLAY_DETECTED',
          status: 'REVOKED',
        },
      },
      mongoSession === undefined ? {} : { session: mongoSession },
    );
  }

  public async revokeOthers(
    userId: string,
    currentSessionId: string,
    reason: string,
    now: Date,
    mongoSession?: ClientSession,
  ): Promise<number> {
    const result = await AuthSessionModel.updateMany(
      { sessionId: { $ne: currentSessionId }, status: 'ACTIVE', userId },
      { $set: { revokedAt: now, revocationReason: reason, status: 'REVOKED' } },
      mongoSession === undefined ? {} : { session: mongoSession },
    );
    return result.modifiedCount;
  }

  public async list(
    userId: string,
    currentSessionId: string,
    now: Date,
  ): Promise<AuthSessionSummary[]> {
    const sessions = await AuthSessionModel.find({
      expiresAt: { $gt: now },
      status: 'ACTIVE',
      userId,
    })
      .sort({ lastUsedAt: -1 })
      .select({ createdAt: 1, deviceLabel: 1, expiresAt: 1, lastUsedAt: 1, sessionId: 1 })
      .lean();
    return sessions.map((session) => ({
      createdAt: session.createdAt.toISOString(),
      current: session.sessionId === currentSessionId,
      deviceLabel: session.deviceLabel,
      expiresAt: session.expiresAt.toISOString(),
      id: session.sessionId,
      lastUsedAt: session.lastUsedAt.toISOString(),
    }));
  }

  public async belongsToUser(sessionId: string, userId: string): Promise<boolean> {
    return (await AuthSessionModel.exists({ sessionId, userId })) !== null;
  }
}
