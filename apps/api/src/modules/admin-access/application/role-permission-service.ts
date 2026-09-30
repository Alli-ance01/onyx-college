import mongoose, { type Types } from 'mongoose';
import { z } from 'zod';

import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../app/errors/app-error.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import { AuthSessionModel } from '../../identity/infrastructure/auth-session-model.js';
import { UserModel } from '../../identity/infrastructure/user-model.js';
import { PermissionModel } from '../../access-control/infrastructure/permission-model.js';
import { RoleModel } from '../../access-control/infrastructure/role-model.js';
import type { PermissionSummary, RoleSummary } from './access-administration-types.js';

const roleInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[A-Z][A-Z0-9_]*$/u),
    description: z.string().trim().min(5).max(500),
    displayName: z.string().trim().min(2).max(100),
    permissionCodes: z.array(z.string().trim().min(3).max(100)).max(100),
  })
  .strict();

const permissionCodesSchema = z.array(z.string().trim().min(3).max(100)).max(100);
const reasonSchema = z.string().trim().min(5).max(1000);

interface LeanPermission {
  _id: Types.ObjectId;
  code: string;
  description: string;
  domain: string;
  sensitivity: 'PRIVILEGED' | 'SENSITIVE' | 'STANDARD';
  status: 'ACTIVE' | 'RETIRED';
  systemManaged: boolean;
}

interface LeanRole {
  _id: Types.ObjectId;
  code: string;
  description: string;
  displayName: string;
  permissionIds: LeanPermission[];
  protected: boolean;
  status: 'ACTIVE' | 'RETIRED';
  systemManaged: boolean;
  version?: number;
}

function preconditionFailed(): AppError {
  return new AppError('The role changed before this operation completed.', {
    code: 'PRECONDITION_FAILED',
    statusCode: 412,
  });
}

function permissionSummary(permission: LeanPermission): PermissionSummary {
  return {
    code: permission.code,
    description: permission.description,
    domain: permission.domain,
    id: permission._id.toString(),
    sensitivity: permission.sensitivity,
    status: permission.status,
    systemManaged: permission.systemManaged,
  };
}

function roleSummary(role: LeanRole): RoleSummary {
  return {
    code: role.code,
    description: role.description,
    displayName: role.displayName,
    id: role._id.toString(),
    permissions: role.permissionIds
      .map(permissionSummary)
      .sort((left, right) => left.code.localeCompare(right.code)),
    protected: role.protected,
    status: role.status,
    systemManaged: role.systemManaged,
    version: role.version ?? 0,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11_000;
}

export class RolePermissionService {
  readonly #auditWriter: AuditWriter;

  public constructor(auditWriter = new AuditWriter()) {
    this.#auditWriter = auditWriter;
  }

  public async listPermissions(
    filters: {
      domain?: string;
      status?: 'ACTIVE' | 'RETIRED';
    } = {},
  ): Promise<readonly PermissionSummary[]> {
    const permissions = (await PermissionModel.find({
      ...(filters.domain === undefined ? {} : { domain: filters.domain }),
      ...(filters.status === undefined ? {} : { status: filters.status }),
    })
      .sort({ domain: 1, code: 1 })
      .lean()) as unknown as LeanPermission[];
    return permissions.map(permissionSummary);
  }

  public async listRoles(
    filters: {
      status?: 'ACTIVE' | 'RETIRED';
    } = {},
  ): Promise<readonly RoleSummary[]> {
    const roles = (await RoleModel.find(
      filters.status === undefined ? {} : { status: filters.status },
    )
      .sort({ protected: -1, code: 1 })
      .populate('permissionIds')
      .lean()) as unknown as LeanRole[];
    return roles.map(roleSummary);
  }

  public async getRole(roleId: string): Promise<RoleSummary> {
    if (!mongoose.isValidObjectId(roleId)) throw new NotFoundError();
    const role = (await RoleModel.findById(roleId)
      .populate('permissionIds')
      .lean()) as unknown as LeanRole | null;
    if (role === null) throw new NotFoundError();
    return roleSummary(role);
  }

  public async createRole(input: {
    actorSessionId?: string;
    actorUserId: string;
    code: string;
    description: string;
    displayName: string;
    permissionCodes: readonly string[];
    requestId: string;
  }): Promise<RoleSummary> {
    const validated = roleInputSchema.parse({
      code: input.code,
      description: input.description,
      displayName: input.displayName,
      permissionCodes: input.permissionCodes,
    });
    if (
      ['PRINCIPAL', 'SCHOOL_ADMIN', 'STUDENT', 'SUPER_ADMIN', 'TEACHER'].includes(validated.code)
    ) {
      throw new ConflictError('Canonical role codes are reserved and cannot be recreated.');
    }
    const permissionCodes = [...new Set(validated.permissionCodes)];
    try {
      const roleId = await mongoose.connection.transaction(async (session) => {
        const permissions = await PermissionModel.find({
          code: { $in: permissionCodes },
          status: 'ACTIVE',
        })
          .select({ _id: 1, code: 1 })
          .session(session)
          .lean();
        if (permissions.length !== permissionCodes.length) {
          throw new ValidationError('One or more requested permissions are unavailable.');
        }
        const [role] = await RoleModel.create(
          [
            {
              code: validated.code,
              description: validated.description,
              displayName: validated.displayName,
              permissionIds: permissions.map(({ _id }) => _id),
              protected: false,
              status: 'ACTIVE',
              systemManaged: false,
            },
          ],
          { session },
        );
        if (role === undefined) throw new Error('Role creation did not return a role.');
        await this.#auditWriter.append(
          {
            action: 'ROLE_CREATED',
            ...(input.actorSessionId === undefined ? {} : { actorSessionId: input.actorSessionId }),
            actorType: 'USER',
            actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
            changes: { permissionCodes },
            outcome: 'SUCCESS',
            requestId: input.requestId,
            targetId: role._id.toString(),
            targetType: 'Role',
          },
          session,
        );
        return role._id.toString();
      });
      return await this.getRole(roleId);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError('A role with that code already exists.');
      }
      throw error;
    }
  }

  public async setRolePermissions(input: {
    actorSessionId?: string;
    actorUserId: string;
    expectedVersion: number;
    permissionCodes: readonly string[];
    reason: string;
    requestId: string;
    roleId: string;
  }): Promise<RoleSummary> {
    if (!mongoose.isValidObjectId(input.roleId)) throw new NotFoundError();
    const requestedCodes = [...new Set(permissionCodesSchema.parse(input.permissionCodes))];
    const reason = reasonSchema.parse(input.reason);
    await mongoose.connection.transaction(async (session) => {
      const role = await RoleModel.findById(input.roleId).session(session).lean();
      if (role === null) throw new NotFoundError();
      const version = (role as unknown as { version?: number }).version ?? 0;
      if (version !== input.expectedVersion) throw preconditionFailed();
      if (role.protected || role.systemManaged) {
        throw new ConflictError(
          'Canonical protected roles are managed by the access catalogue and cannot be edited here.',
        );
      }
      if (role.status !== 'ACTIVE') {
        throw new ConflictError('A retired role cannot receive permission changes.');
      }
      const currentPermissions = await PermissionModel.find({ _id: { $in: role.permissionIds } })
        .select({ code: 1 })
        .session(session)
        .lean();
      const nextPermissions = await PermissionModel.find({
        code: { $in: requestedCodes },
        status: 'ACTIVE',
      })
        .select({ _id: 1, code: 1 })
        .session(session)
        .lean();
      if (nextPermissions.length !== requestedCodes.length) {
        throw new ValidationError('One or more requested permissions are unavailable.');
      }
      const changed = await RoleModel.updateOne(
        { _id: role._id, version: input.expectedVersion },
        {
          $inc: { version: 1 },
          $set: { permissionIds: nextPermissions.map(({ _id }) => _id) },
        },
        { session },
      );
      if (changed.modifiedCount !== 1) throw preconditionFailed();

      const affectedUsers = await UserModel.find({ roles: role._id })
        .select({ _id: 1 })
        .session(session)
        .lean();
      if (affectedUsers.length > 0) {
        await AuthSessionModel.updateMany(
          {
            status: 'ACTIVE',
            userId: { $in: affectedUsers.map(({ _id }) => _id) },
          },
          {
            $set: {
              revokedAt: new Date(),
              revocationReason: 'ROLE_PERMISSIONS_CHANGED',
              status: 'REVOKED',
            },
          },
          { session },
        );
      }
      await this.#auditWriter.append(
        {
          action: 'ROLE_PERMISSIONS_CHANGED',
          ...(input.actorSessionId === undefined ? {} : { actorSessionId: input.actorSessionId }),
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
          changes: {
            after: nextPermissions.map(({ code }) => code).sort(),
            before: currentPermissions.map(({ code }) => code).sort(),
            sessionsRevokedForUsers: affectedUsers.length,
          },
          outcome: 'SUCCESS',
          reason,
          requestId: input.requestId,
          targetId: role._id.toString(),
          targetType: 'Role',
        },
        session,
      );
    });
    return this.getRole(input.roleId);
  }

  public async retireRole(input: {
    actorSessionId?: string;
    actorUserId: string;
    expectedVersion: number;
    reason: string;
    requestId: string;
    roleId: string;
  }): Promise<RoleSummary> {
    if (!mongoose.isValidObjectId(input.roleId)) throw new NotFoundError();
    const reason = reasonSchema.parse(input.reason);
    await mongoose.connection.transaction(async (session) => {
      const role = await RoleModel.findById(input.roleId).session(session).lean();
      if (role === null) throw new NotFoundError();
      const version = (role as unknown as { version?: number }).version ?? 0;
      if (version !== input.expectedVersion) throw preconditionFailed();
      if (role.protected || role.systemManaged) {
        throw new ConflictError('Canonical protected roles cannot be retired.');
      }
      if (role.status !== 'ACTIVE') throw new ConflictError('The role is already retired.');
      const assignedCount = await UserModel.countDocuments({ roles: role._id }).session(session);
      if (assignedCount > 0) {
        throw new ConflictError('Remove this role from every user before retiring it.');
      }
      const changed = await RoleModel.updateOne(
        { _id: role._id, version: input.expectedVersion },
        { $inc: { version: 1 }, $set: { status: 'RETIRED' } },
        { session },
      );
      if (changed.modifiedCount !== 1) throw preconditionFailed();
      await this.#auditWriter.append(
        {
          action: 'ROLE_RETIRED',
          ...(input.actorSessionId === undefined ? {} : { actorSessionId: input.actorSessionId }),
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
          outcome: 'SUCCESS',
          reason,
          requestId: input.requestId,
          targetId: role._id.toString(),
          targetType: 'Role',
        },
        session,
      );
    });
    return this.getRole(input.roleId);
  }
}
