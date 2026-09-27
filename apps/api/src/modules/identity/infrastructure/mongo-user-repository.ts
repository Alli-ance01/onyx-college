import type { AccountStatus, AccountType } from '@onyx/contracts';
import type { ClientSession } from 'mongoose';

import type {
  AuthUserRecord,
  FailedLoginPolicy,
  UserRepository,
} from '../application/auth-records.js';
import { normalizeLoginIdentifier } from '../domain/identity-normalization.js';
import { UserModel } from './user-model.js';

function toRecord(document: {
  _id: { toString(): string };
  accountStatus: string;
  accountType: string;
  failedLoginCount: number;
  firstFailedLoginAt?: Date | null;
  lockedUntil?: Date | null;
  mustChangePassword: boolean;
  passwordHash: string;
  username: string;
}): AuthUserRecord {
  return {
    accountStatus: document.accountStatus as AccountStatus,
    accountType: document.accountType as AccountType,
    failedLoginCount: document.failedLoginCount,
    id: document._id.toString(),
    mustChangePassword: document.mustChangePassword,
    passwordHash: document.passwordHash,
    username: document.username,
    ...(document.firstFailedLoginAt == null
      ? {}
      : { firstFailedLoginAt: document.firstFailedLoginAt }),
    ...(document.lockedUntil == null ? {} : { lockedUntil: document.lockedUntil }),
  };
}

export class MongoUserRepository implements UserRepository {
  public async findForLogin(identifier: string): Promise<AuthUserRecord | null> {
    const normalized = normalizeLoginIdentifier(identifier);
    const user = await UserModel.findOne({
      $or: [
        { normalizedUsername: normalized.username },
        { normalizedEmail: normalized.email },
        { normalizedPhone: normalized.phone },
      ],
    })
      .select('+passwordHash +normalizedUsername +normalizedEmail +normalizedPhone')
      .lean();
    return user === null ? null : toRecord(user);
  }

  public async findByIdForAuthentication(userId: string): Promise<AuthUserRecord | null> {
    const user = await UserModel.findById(userId).select('+passwordHash').lean();
    return user === null ? null : toRecord(user);
  }

  public async recordFailedLogin(
    userId: string,
    now: Date,
    policy: FailedLoginPolicy,
  ): Promise<{ locked: boolean }> {
    const cutoff = new Date(now.getTime() - policy.windowSeconds * 1_000);
    const lockedUntil = new Date(now.getTime() + policy.lockDurationSeconds * 1_000);
    const updated = await UserModel.findByIdAndUpdate(
      userId,
      [
        {
          $set: {
            failedLoginCount: {
              $cond: [
                {
                  $or: [
                    { $eq: [{ $type: '$firstFailedLoginAt' }, 'missing'] },
                    { $lt: ['$firstFailedLoginAt', cutoff] },
                  ],
                },
                1,
                { $add: ['$failedLoginCount', 1] },
              ],
            },
            firstFailedLoginAt: {
              $cond: [
                {
                  $or: [
                    { $eq: [{ $type: '$firstFailedLoginAt' }, 'missing'] },
                    { $lt: ['$firstFailedLoginAt', cutoff] },
                  ],
                },
                now,
                '$firstFailedLoginAt',
              ],
            },
          },
        },
        {
          $set: {
            lockedUntil: {
              $cond: [
                { $gte: ['$failedLoginCount', policy.maxAttempts] },
                lockedUntil,
                '$lockedUntil',
              ],
            },
          },
        },
      ],
      { new: true },
    )
      .select({ lockedUntil: 1 })
      .lean();
    return { locked: updated?.lockedUntil != null && updated.lockedUntil > now };
  }

  public async markLoginSuccessful(userId: string, now: Date): Promise<void> {
    await UserModel.updateOne(
      { _id: userId },
      {
        $set: { failedLoginCount: 0, lastLoginAt: now },
        $unset: { firstFailedLoginAt: 1, lockedUntil: 1 },
      },
    );
  }

  public async replacePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await UserModel.updateOne({ _id: userId }, { $set: { passwordHash } });
  }

  public async changePassword(
    userId: string,
    passwordHash: string,
    now: Date,
    session?: ClientSession,
  ): Promise<void> {
    await UserModel.updateOne(
      { _id: userId, accountStatus: 'ACTIVE' },
      {
        $set: { mustChangePassword: false, passwordChangedAt: now, passwordHash },
      },
      session === undefined ? {} : { session },
    );
  }
}
