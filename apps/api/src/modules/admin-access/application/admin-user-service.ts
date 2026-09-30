import type { AccountStatus, AccountType } from '@onyx/contracts';
import mongoose, { type Types } from 'mongoose';
import { z } from 'zod';

import {
  AppError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../app/errors/app-error.js';
import { RoleModel } from '../../access-control/infrastructure/role-model.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import {
  normalizeEmail,
  normalizePhone,
  normalizeUsername,
} from '../../identity/domain/identity-normalization.js';
import { AuthSessionModel } from '../../identity/infrastructure/auth-session-model.js';
import type { CredentialCrypto } from '../../identity/infrastructure/credential-crypto.js';
import { PasswordService } from '../../identity/infrastructure/password-service.js';
import { UserModel } from '../../identity/infrastructure/user-model.js';
import {
  ensureAnotherActiveSuperAdmin,
  lockSuperAdminMembership,
  requireSuperAdminActor,
} from './access-administration-policy.js';
import type { UserAccessPage, UserAccessSummary } from './access-administration-types.js';

const administratorInputSchema = z
  .object({
    email: z.email().max(254).optional(),
    phone: z.string().trim().min(7).max(40).optional(),
    roleCodes: z.array(z.string().trim().min(3).max(64)).min(1).max(20),
    username: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/u),
  })
  .strict();

const roleCodesSchema = z.array(z.string().trim().min(3).max(64)).min(1).max(20);
const reasonSchema = z.string().trim().min(5).max(1000);

interface PopulatedRole {
  _id: Types.ObjectId;
  code: string;
  displayName: string;
}

interface LeanUserSummary {
  _id: Types.ObjectId;
  accountStatus: AccountStatus;
  accountType: AccountType;
  createdAt: Date;
  email?: string;
  lastLoginAt?: Date;
  mustChangePassword: boolean;
  phone?: string;
  roles: PopulatedRole[];
  updatedAt: Date;
  username: string;
  version?: number;
}

const administrativePortalRoleCodes = new Set(['PRINCIPAL', 'SCHOOL_ADMIN', 'SUPER_ADMIN']);

function preconditionFailed(): AppError {
  return new AppError('The account changed before this operation completed.', {
    code: 'PRECONDITION_FAILED',
    statusCode: 412,
  });
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11_000;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^{}$()|[\]\\]/gu, '\\$&');
}

function auditSession(actorSessionId: string | undefined): { actorSessionId?: string } {
  return actorSessionId === undefined ? {} : { actorSessionId };
}

function toUserSummary(record: LeanUserSummary): UserAccessSummary {
  return {
    accountStatus: record.accountStatus,
    accountType: record.accountType,
    createdAt: record.createdAt.toISOString(),
    id: record._id.toString(),
    mustChangePassword: record.mustChangePassword,
    roles: record.roles
      .map((role) => ({
        code: role.code,
        displayName: role.displayName,
        id: role._id.toString(),
      }))
      .sort((left, right) => left.code.localeCompare(right.code)),
    updatedAt: record.updatedAt.toISOString(),
    username: record.username,
    version: record.version ?? 0,
    ...(record.email === undefined ? {} : { email: record.email }),
    ...(record.phone === undefined ? {} : { phone: record.phone }),
    ...(record.lastLoginAt === undefined ? {} : { lastLoginAt: record.lastLoginAt.toISOString() }),
  };
}

export class AdminUserService {
  readonly #auditWriter: AuditWriter;
  readonly #credentialCrypto: CredentialCrypto;
  readonly #passwordService: PasswordService;

  public constructor(
    credentialCrypto: CredentialCrypto,
    passwordService = new PasswordService(),
    auditWriter = new AuditWriter(),
  ) {
    this.#credentialCrypto = credentialCrypto;
    this.#passwordService = passwordService;
    this.#auditWriter = auditWriter;
  }

  public async listUsers(filters: {
    accountStatus?: AccountStatus;
    accountType?: AccountType;
    cursor?: string;
    pageSize?: number;
    query?: string;
    roleCode?: string;
  }): Promise<UserAccessPage> {
    const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 100);
    const query: Record<string, unknown> = {};
    if (filters.accountStatus !== undefined) query.accountStatus = filters.accountStatus;
    if (filters.accountType !== undefined) query.accountType = filters.accountType;
    if (filters.cursor !== undefined) {
      if (!mongoose.isValidObjectId(filters.cursor)) {
        throw new ValidationError('The user cursor is invalid.');
      }
      query._id = { $gt: new mongoose.Types.ObjectId(filters.cursor) };
    }
    if (filters.roleCode !== undefined) {
      const role = await RoleModel.findOne({ code: filters.roleCode, status: 'ACTIVE' })
        .select({ _id: 1 })
        .lean();
      if (role === null) {
        return { items: [] };
      }
      query.roles = role._id;
    }
    if (filters.query !== undefined) {
      const raw = filters.query.trim();
      if (raw.length < 2 || raw.length > 100) {
        throw new ValidationError('Search must contain between 2 and 100 characters.');
      }
      const expression = new RegExp(escapeRegex(raw), 'iu');
      query.$or = [{ username: expression }, { email: expression }, { phone: expression }];
    }

    const records = (await UserModel.find(query)
      .sort({ _id: 1 })
      .limit(pageSize + 1)
      .populate('roles', 'code displayName')
      .lean()) as unknown as LeanUserSummary[];
    const hasMore = records.length > pageSize;
    const page = records.slice(0, pageSize);
    const last = page.at(-1);
    return {
      items: page.map(toUserSummary),
      ...(hasMore && last !== undefined ? { nextCursor: last._id.toString() } : {}),
    };
  }

  public listAdministrators(
    filters: Omit<Parameters<AdminUserService['listUsers']>[0], 'accountType'>,
  ): Promise<UserAccessPage> {
    return this.listUsers({ ...filters, accountType: 'ADMINISTRATOR' });
  }

  public async getUser(userId: string): Promise<UserAccessSummary> {
    if (!mongoose.isValidObjectId(userId)) throw new NotFoundError();
    const record = (await UserModel.findById(userId)
      .populate('roles', 'code displayName')
      .lean()) as unknown as LeanUserSummary | null;
    if (record === null) throw new NotFoundError();
    return toUserSummary(record);
  }

  public async createAdministrator(input: {
    actorSessionId?: string;
    actorUserId: string;
    email?: string;
    phone?: string;
    requestId: string;
    roleCodes: readonly string[];
    username: string;
  }): Promise<{ temporaryPassword: string; user: UserAccessSummary }> {
    const validated = administratorInputSchema.parse({
      email: input.email,
      phone: input.phone,
      roleCodes: input.roleCodes,
      username: input.username,
    });
    const distinctRoleCodes = [...new Set(validated.roleCodes)];
    if (
      distinctRoleCodes.includes('SUPER_ADMIN') ||
      distinctRoleCodes.includes('STUDENT') ||
      distinctRoleCodes.includes('TEACHER') ||
      !distinctRoleCodes.some((code) => ['PRINCIPAL', 'SCHOOL_ADMIN'].includes(code))
    ) {
      throw new ValidationError(
        'A new administrator requires SCHOOL_ADMIN or PRINCIPAL access; protected and portal roles cannot be assigned here.',
      );
    }

    const temporaryPassword = this.#credentialCrypto.createOpaqueValue(24);
    const passwordHash = await this.#passwordService.hash(temporaryPassword);
    const normalizedUsername = normalizeUsername(validated.username);
    try {
      const userId = await mongoose.connection.transaction(async (session) => {
        const roles = await RoleModel.find({
          code: { $in: distinctRoleCodes },
          status: 'ACTIVE',
        })
          .session(session)
          .lean();
        if (roles.length !== distinctRoleCodes.length) {
          throw new ValidationError('One or more requested roles are unavailable.');
        }
        const user = new UserModel({
          accountStatus: 'ACTIVE',
          accountType: 'ADMINISTRATOR',
          mustChangePassword: true,
          normalizedUsername,
          passwordHash,
          roles: roles.map(({ _id }) => _id),
          username: validated.username.trim(),
          ...(validated.email === undefined
            ? {}
            : {
                email: validated.email,
                normalizedEmail: normalizeEmail(validated.email),
              }),
          ...(validated.phone === undefined
            ? {}
            : {
                normalizedPhone: normalizePhone(validated.phone),
                phone: validated.phone,
              }),
        });
        await user.save({ session });
        await this.#auditWriter.append(
          {
            action: 'ADMINISTRATOR_CREATED',
            ...auditSession(input.actorSessionId),
            actorType: 'USER',
            actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
            changes: { assignedRoleCodes: distinctRoleCodes },
            outcome: 'SUCCESS',
            requestId: input.requestId,
            targetId: user._id.toString(),
            targetType: 'User',
          },
          session,
        );
        return user._id.toString();
      });
      return { temporaryPassword, user: await this.getUser(userId) };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError('An account already uses one of those identifiers.');
      }
      throw error;
    }
  }

  public async setAdministratorRoles(input: {
    actorSessionId?: string;
    actorUserId: string;
    expectedVersion: number;
    reason: string;
    requestId: string;
    roleCodes: readonly string[];
    targetUserId: string;
  }): Promise<UserAccessSummary> {
    const requestedCodes = [...new Set(roleCodesSchema.parse(input.roleCodes))];
    const reason = reasonSchema.parse(input.reason);
    if (!mongoose.isValidObjectId(input.targetUserId)) throw new NotFoundError();

    await mongoose.connection.transaction(async (session) => {
      const target = await UserModel.findById(input.targetUserId)
        .select({ accountStatus: 1, accountType: 1, roles: 1, version: 1 })
        .session(session)
        .lean();
      if (target?.accountType !== 'ADMINISTRATOR') throw new NotFoundError();
      if (!['ACTIVE', 'SUSPENDED'].includes(target.accountStatus)) {
        throw new ConflictError('Access cannot be changed for this account state.');
      }
      const targetVersion = (target as unknown as { version?: number }).version ?? 0;
      if (targetVersion !== input.expectedVersion) throw preconditionFailed();

      const roles = await RoleModel.find({ code: { $in: requestedCodes }, status: 'ACTIVE' })
        .select({ _id: 1, code: 1 })
        .session(session)
        .lean();
      if (roles.length !== requestedCodes.length) {
        throw new ValidationError('One or more requested roles are unavailable.');
      }
      if (!roles.some(({ code }) => administrativePortalRoleCodes.has(code))) {
        throw new ValidationError('An administrator must retain an administrative portal role.');
      }
      if (roles.some(({ code }) => code === 'STUDENT' || code === 'TEACHER')) {
        throw new ValidationError(
          'Student and teacher portal roles cannot be assigned to an administrator.',
        );
      }

      const currentRoles = await RoleModel.find({ _id: { $in: target.roles } })
        .select({ code: 1 })
        .session(session)
        .lean();
      const currentCodes = currentRoles.map(({ code }) => code).sort();
      const nextCodes = roles.map(({ code }) => code).sort();
      const superAdminChanged =
        currentCodes.includes('SUPER_ADMIN') !== nextCodes.includes('SUPER_ADMIN');
      if (superAdminChanged) {
        await requireSuperAdminActor(input.actorUserId, session);
        if (nextCodes.includes('SUPER_ADMIN')) {
          await lockSuperAdminMembership(session);
        } else {
          await ensureAnotherActiveSuperAdmin(target._id, session);
        }
      }

      const updated = await UserModel.updateOne(
        { _id: target._id, version: input.expectedVersion },
        { $inc: { version: 1 }, $set: { roles: roles.map(({ _id }) => _id) } },
        { session },
      );
      if (updated.modifiedCount !== 1) throw preconditionFailed();
      await AuthSessionModel.updateMany(
        { status: 'ACTIVE', userId: target._id },
        {
          $set: {
            revokedAt: new Date(),
            revocationReason: 'ACCESS_CHANGED',
            status: 'REVOKED',
          },
        },
        { session },
      );
      await this.#auditWriter.append(
        {
          action: 'USER_ROLES_CHANGED',
          ...auditSession(input.actorSessionId),
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
          changes: { after: nextCodes, before: currentCodes },
          outcome: 'SUCCESS',
          reason,
          requestId: input.requestId,
          targetId: target._id.toString(),
          targetType: 'User',
        },
        session,
      );
    });
    return this.getUser(input.targetUserId);
  }

  public async suspendUser(input: {
    actorSessionId?: string;
    actorUserId: string;
    expectedVersion: number;
    reason: string;
    requestId: string;
    targetUserId: string;
  }): Promise<UserAccessSummary> {
    if (!mongoose.isValidObjectId(input.targetUserId)) throw new NotFoundError();
    if (input.actorUserId === input.targetUserId) {
      throw new AuthorizationError('You cannot suspend your own account.');
    }
    const reason = reasonSchema.parse(input.reason);
    await mongoose.connection.transaction(async (session) => {
      const target = await UserModel.findById(input.targetUserId)
        .select({ accountStatus: 1, roles: 1, version: 1 })
        .session(session)
        .lean();
      if (target === null) throw new NotFoundError();
      const version = (target as unknown as { version?: number }).version ?? 0;
      if (version !== input.expectedVersion) throw preconditionFailed();
      if (target.accountStatus !== 'ACTIVE') {
        throw new ConflictError('Only an active account can be suspended.');
      }
      const roleCodes = await RoleModel.find({ _id: { $in: target.roles } })
        .select({ code: 1 })
        .session(session)
        .lean();
      if (roleCodes.some(({ code }) => code === 'SUPER_ADMIN')) {
        await requireSuperAdminActor(input.actorUserId, session);
        await ensureAnotherActiveSuperAdmin(target._id, session);
      }
      const changed = await UserModel.updateOne(
        { _id: target._id, version: input.expectedVersion },
        { $inc: { version: 1 }, $set: { accountStatus: 'SUSPENDED' } },
        { session },
      );
      if (changed.modifiedCount !== 1) throw preconditionFailed();
      await AuthSessionModel.updateMany(
        { status: 'ACTIVE', userId: target._id },
        {
          $set: {
            revokedAt: new Date(),
            revocationReason: 'ACCOUNT_SUSPENDED',
            status: 'REVOKED',
          },
        },
        { session },
      );
      await this.#auditWriter.append(
        {
          action: 'USER_ACCOUNT_SUSPENDED',
          ...auditSession(input.actorSessionId),
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
          changes: { after: 'SUSPENDED', before: target.accountStatus },
          outcome: 'SUCCESS',
          reason,
          requestId: input.requestId,
          targetId: target._id.toString(),
          targetType: 'User',
        },
        session,
      );
    });
    return this.getUser(input.targetUserId);
  }

  public async reactivateUser(input: {
    actorSessionId?: string;
    actorUserId: string;
    expectedVersion: number;
    reason: string;
    requestId: string;
    targetUserId: string;
  }): Promise<UserAccessSummary> {
    if (!mongoose.isValidObjectId(input.targetUserId)) throw new NotFoundError();
    const reason = reasonSchema.parse(input.reason);
    await mongoose.connection.transaction(async (session) => {
      const target = await UserModel.findById(input.targetUserId)
        .select({ accountStatus: 1, roles: 1, version: 1 })
        .session(session)
        .lean();
      if (target === null) throw new NotFoundError();
      const version = (target as unknown as { version?: number }).version ?? 0;
      if (version !== input.expectedVersion) throw preconditionFailed();
      if (target.accountStatus !== 'SUSPENDED') {
        throw new ConflictError('Only a suspended account can be reactivated.');
      }
      const roleCodes = await RoleModel.find({ _id: { $in: target.roles } })
        .select({ code: 1 })
        .session(session)
        .lean();
      if (roleCodes.some(({ code }) => code === 'SUPER_ADMIN')) {
        await requireSuperAdminActor(input.actorUserId, session);
      }
      const changed = await UserModel.updateOne(
        { _id: target._id, version: input.expectedVersion },
        { $inc: { version: 1 }, $set: { accountStatus: 'ACTIVE' } },
        { session },
      );
      if (changed.modifiedCount !== 1) throw preconditionFailed();
      await this.#auditWriter.append(
        {
          action: 'USER_ACCOUNT_REACTIVATED',
          ...auditSession(input.actorSessionId),
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
          changes: { after: 'ACTIVE', before: 'SUSPENDED' },
          outcome: 'SUCCESS',
          reason,
          requestId: input.requestId,
          targetId: target._id.toString(),
          targetType: 'User',
        },
        session,
      );
    });
    return this.getUser(input.targetUserId);
  }
}
