import mongoose from 'mongoose';
import type { Logger } from 'pino';

import { AuditWriter } from '../../audit/application/audit-writer.js';
import { canonicalPermissions, canonicalRoles } from '../domain/permission-catalogue.js';
import { PermissionModel } from '../infrastructure/permission-model.js';
import { RoleModel } from '../infrastructure/role-model.js';

export interface AccessSyncResult {
  changed: boolean;
  permissionCount: number;
  roleCount: number;
}

export class SyncAccessControlService {
  readonly #auditWriter: AuditWriter;
  readonly #logger: Logger;

  public constructor(logger: Logger, auditWriter = new AuditWriter()) {
    this.#logger = logger;
    this.#auditWriter = auditWriter;
  }

  public async execute(): Promise<AccessSyncResult> {
    await Promise.all([PermissionModel.createIndexes(), RoleModel.createIndexes()]);

    return mongoose.connection.transaction(async (session) => {
      const permissionResult = await PermissionModel.bulkWrite(
        canonicalPermissions.map((permission) => ({
          updateOne: {
            filter: { code: permission.code },
            update: {
              $set: { ...permission, status: 'ACTIVE', systemManaged: true },
            },
            upsert: true,
          },
        })),
        { session },
      );

      const permissions = await PermissionModel.find({
        code: { $in: canonicalPermissions.map(({ code }) => code) },
      })
        .select({ _id: 1, code: 1 })
        .session(session)
        .lean();
      const permissionIds = new Map(
        permissions.map((permission) => [permission.code, permission._id]),
      );

      const roleResult = await RoleModel.bulkWrite(
        canonicalRoles.map((role) => ({
          updateOne: {
            filter: { code: role.code },
            update: {
              $set: {
                description: role.description,
                displayName: role.displayName,
                permissionIds: role.permissionCodes.map((code) => {
                  const id = permissionIds.get(code);
                  if (id === undefined) {
                    throw new Error(
                      `Canonical permission ${code} is unavailable during role sync.`,
                    );
                  }
                  return id;
                }),
                protected: role.protected,
                status: 'ACTIVE',
                systemManaged: true,
              },
              $setOnInsert: { code: role.code },
            },
            upsert: true,
          },
        })),
        { session },
      );

      const changed =
        permissionResult.modifiedCount +
          permissionResult.upsertedCount +
          roleResult.modifiedCount +
          roleResult.upsertedCount >
        0;

      if (changed) {
        await this.#auditWriter.append(
          {
            action: 'ACCESS_CONTROL_CATALOGUE_SYNCHRONIZED',
            actorType: 'SYSTEM',
            changes: {
              permissionsModified: permissionResult.modifiedCount,
              permissionsCreated: permissionResult.upsertedCount,
              rolesModified: roleResult.modifiedCount,
              rolesCreated: roleResult.upsertedCount,
            },
            outcome: 'SUCCESS',
            targetId: 'canonical-v1',
            targetType: 'AccessControlCatalogue',
          },
          session,
        );
      }

      this.#logger.info(
        { changed, permissionCount: canonicalPermissions.length, roleCount: canonicalRoles.length },
        'Canonical access control synchronized',
      );

      return {
        changed,
        permissionCount: canonicalPermissions.length,
        roleCount: canonicalRoles.length,
      };
    });
  }
}
