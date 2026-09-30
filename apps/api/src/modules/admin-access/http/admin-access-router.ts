import { Router } from 'express';
import { z } from 'zod';

import { objectId, sendData } from '../../../app/http/route-utils.js';
import type { AppEnvironment } from '../../../config/environment.js';
import { AuditQueryService } from '../../audit/application/audit-query-service.js';
import type { PrincipalResolver } from '../../identity/application/auth-records.js';
import {
  createAuthenticationMiddleware,
  requireAuthenticatedPrincipal,
  requireAnyPermission,
  requirePermission,
} from '../../identity/http/authentication-middleware.js';
import { validateBody } from '../../identity/http/validation.js';
import type { AccessTokenService } from '../../identity/infrastructure/access-token-service.js';
import { CredentialCrypto } from '../../identity/infrastructure/credential-crypto.js';
import type { MongoSessionRepository } from '../../identity/infrastructure/mongo-session-repository.js';
import { SchoolSettingsService } from '../../settings/application/school-settings-service.js';
import { AdminUserService } from '../application/admin-user-service.js';
import { RolePermissionService } from '../application/role-permission-service.js';

const userQuerySchema = z.looseObject({
  accountStatus: z
    .enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'ARCHIVED'])
    .optional(),
  accountType: z.enum(['APPLICANT', 'STUDENT', 'TEACHER', 'ADMINISTRATOR']).optional(),
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  query: z.string().trim().max(160).optional(),
  roleCode: z.string().trim().max(64).optional(),
});
const createAdministratorSchema = z
  .object({
    email: z.email().max(254).optional(),
    phone: z.string().trim().min(7).max(40).optional(),
    roleCodes: z.array(z.string().trim().min(3).max(64)).min(1).max(20),
    username: z.string().trim().min(3).max(64),
  })
  .strict();
const roleMembershipSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    reason: z.string().trim().min(5).max(1_000),
    roleCodes: z.array(z.string().trim().min(3).max(64)).min(1).max(20),
  })
  .strict();
const stateChangeSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    reason: z.string().trim().min(5).max(1_000),
  })
  .strict();
const createRoleSchema = z
  .object({
    code: z.string().trim().min(3).max(64),
    description: z.string().trim().min(5).max(500),
    displayName: z.string().trim().min(2).max(100),
    permissionCodes: z.array(z.string().trim().min(3).max(100)).max(100),
  })
  .strict();
const rolePermissionsSchema = stateChangeSchema
  .extend({ permissionCodes: z.array(z.string().trim().min(3).max(100)).max(100) })
  .strict();
const schoolIdentitySchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    identity: z
      .object({
        address: z.string().trim().min(5).max(500),
        contactEmail: z.email().max(254).optional(),
        contactPhone: z.string().trim().min(7).max(40).optional(),
        displayName: z.string().trim().min(2).max(160),
        motto: z.string().trim().min(2).max(240).optional(),
        websiteUrl: z.url().max(500).optional(),
      })
      .strict(),
  })
  .strict();
const classPositionSchema = z
  .object({
    academicSessionId: z.string(),
    classLevelId: z.string(),
    enabled: z.boolean(),
    expectedVersion: z.number().int().min(0),
    termId: z.string(),
    trackId: z.string().optional(),
  })
  .strict();
const auditQuerySchema = z.looseObject({
  action: z.string().trim().max(160).optional(),
  actorUserId: z.string().optional(),
  cursor: z.string().optional(),
  from: z.coerce.date().optional(),
  outcome: z.enum(['DENIED', 'FAILURE', 'SUCCESS']).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  requestId: z.string().trim().max(200).optional(),
  targetId: z.string().trim().max(200).optional(),
  targetType: z.string().trim().max(160).optional(),
  to: z.coerce.date().optional(),
});

export function createAdminAccessRouter(dependencies: {
  accessTokens: AccessTokenService;
  environment: AppEnvironment;
  principals: PrincipalResolver;
  sessions: MongoSessionRepository;
}): Router {
  const router = Router();
  const users = new AdminUserService(
    new CredentialCrypto(dependencies.environment.AUTH_REFRESH_TOKEN_PEPPER),
  );
  const roles = new RolePermissionService();
  const audit = new AuditQueryService();
  const settings = new SchoolSettingsService();

  router.use(
    ['/access', '/audit-logs', '/school-settings'],
    createAuthenticationMiddleware(dependencies),
  );

  router.get(
    '/access/users',
    requireAnyPermission('admins.manage', 'users.suspend'),
    async (request, response) => {
      const query = userQuerySchema.parse(request.query);
      sendData(
        response,
        await users.listUsers({
          ...(query.accountStatus === undefined ? {} : { accountStatus: query.accountStatus }),
          ...(query.accountType === undefined ? {} : { accountType: query.accountType }),
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
          ...(query.query === undefined ? {} : { query: query.query }),
          ...(query.roleCode === undefined ? {} : { roleCode: query.roleCode }),
        }),
      );
    },
  );
  router.get(
    '/access/users/:userId',
    requireAnyPermission('admins.manage', 'users.suspend'),
    async (request, response) => {
      sendData(response, await users.getUser(objectId(request.params.userId, 'User')));
    },
  );
  router.post(
    '/access/administrators',
    requirePermission('admins.create'),
    validateBody(createAdministratorSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = createAdministratorSchema.parse(request.body);
      sendData(
        response,
        await users.createAdministrator({
          actorSessionId: principal.sessionId,
          actorUserId: principal.userId,
          requestId: request.requestId,
          roleCodes: body.roleCodes,
          username: body.username,
          ...(body.email === undefined ? {} : { email: body.email }),
          ...(body.phone === undefined ? {} : { phone: body.phone }),
        }),
        201,
      );
    },
  );
  router.put(
    '/access/administrators/:userId/roles',
    requirePermission('admins.manage'),
    validateBody(roleMembershipSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = roleMembershipSchema.parse(request.body);
      sendData(
        response,
        await users.setAdministratorRoles({
          actorSessionId: principal.sessionId,
          actorUserId: principal.userId,
          expectedVersion: body.expectedVersion,
          reason: body.reason,
          requestId: request.requestId,
          roleCodes: body.roleCodes,
          targetUserId: objectId(request.params.userId, 'User'),
        }),
      );
    },
  );
  router.post(
    '/access/users/:userId/suspend',
    requirePermission('users.suspend'),
    validateBody(stateChangeSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = stateChangeSchema.parse(request.body);
      sendData(
        response,
        await users.suspendUser({
          actorSessionId: principal.sessionId,
          actorUserId: principal.userId,
          expectedVersion: body.expectedVersion,
          reason: body.reason,
          requestId: request.requestId,
          targetUserId: objectId(request.params.userId, 'User'),
        }),
      );
    },
  );
  router.post(
    '/access/users/:userId/reactivate',
    requirePermission('users.suspend'),
    validateBody(stateChangeSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = stateChangeSchema.parse(request.body);
      sendData(
        response,
        await users.reactivateUser({
          actorSessionId: principal.sessionId,
          actorUserId: principal.userId,
          expectedVersion: body.expectedVersion,
          reason: body.reason,
          requestId: request.requestId,
          targetUserId: objectId(request.params.userId, 'User'),
        }),
      );
    },
  );

  router.get(
    '/access/permissions',
    requirePermission('permissions.manage'),
    async (request, response) => {
      const status = request.query.status;
      sendData(
        response,
        await roles.listPermissions({
          ...(typeof request.query.domain === 'string' ? { domain: request.query.domain } : {}),
          ...(status === 'ACTIVE' || status === 'RETIRED' ? { status } : {}),
        }),
      );
    },
  );
  router.get(
    '/access/roles',
    requireAnyPermission('roles.manage', 'admins.manage'),
    async (request, response) => {
      const status = request.query.status;
      sendData(
        response,
        await roles.listRoles(status === 'ACTIVE' || status === 'RETIRED' ? { status } : {}),
      );
    },
  );
  router.post(
    '/access/roles',
    requirePermission('roles.manage'),
    validateBody(createRoleSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = createRoleSchema.parse(request.body);
      sendData(
        response,
        await roles.createRole({
          actorSessionId: principal.sessionId,
          actorUserId: principal.userId,
          code: body.code,
          description: body.description,
          displayName: body.displayName,
          permissionCodes: body.permissionCodes,
          requestId: request.requestId,
        }),
        201,
      );
    },
  );
  router.put(
    '/access/roles/:roleId/permissions',
    requirePermission('roles.manage'),
    validateBody(rolePermissionsSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = rolePermissionsSchema.parse(request.body);
      sendData(
        response,
        await roles.setRolePermissions({
          actorSessionId: principal.sessionId,
          actorUserId: principal.userId,
          expectedVersion: body.expectedVersion,
          permissionCodes: body.permissionCodes,
          reason: body.reason,
          requestId: request.requestId,
          roleId: objectId(request.params.roleId, 'Role'),
        }),
      );
    },
  );
  router.post(
    '/access/roles/:roleId/retire',
    requirePermission('roles.manage'),
    validateBody(stateChangeSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = stateChangeSchema.parse(request.body);
      sendData(
        response,
        await roles.retireRole({
          actorSessionId: principal.sessionId,
          actorUserId: principal.userId,
          expectedVersion: body.expectedVersion,
          reason: body.reason,
          requestId: request.requestId,
          roleId: objectId(request.params.roleId, 'Role'),
        }),
      );
    },
  );

  router.get('/audit-logs', requirePermission('audit.read'), async (request, response) => {
    const query = auditQuerySchema.parse(request.query);
    sendData(
      response,
      await audit.list({
        ...(query.action === undefined ? {} : { action: query.action }),
        ...(query.actorUserId === undefined ? {} : { actorUserId: query.actorUserId }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        ...(query.from === undefined ? {} : { from: query.from }),
        ...(query.outcome === undefined ? {} : { outcome: query.outcome }),
        ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
        ...(query.requestId === undefined ? {} : { requestId: query.requestId }),
        ...(query.targetId === undefined ? {} : { targetId: query.targetId }),
        ...(query.targetType === undefined ? {} : { targetType: query.targetType }),
        ...(query.to === undefined ? {} : { to: query.to }),
      }),
    );
  });

  router.get(
    '/school-settings',
    requirePermission('settings.manage'),
    async (_request, response) => {
      sendData(response, await settings.get());
    },
  );
  router.put(
    '/school-settings/identity',
    requirePermission('settings.manage'),
    validateBody(schoolIdentitySchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = schoolIdentitySchema.parse(request.body);
      sendData(
        response,
        await settings.updateIdentity({
          actorSessionId: principal.sessionId,
          actorUserId: principal.userId,
          expectedVersion: body.expectedVersion,
          identity: {
            address: body.identity.address,
            displayName: body.identity.displayName,
            ...(body.identity.contactEmail === undefined
              ? {}
              : { contactEmail: body.identity.contactEmail }),
            ...(body.identity.contactPhone === undefined
              ? {}
              : { contactPhone: body.identity.contactPhone }),
            ...(body.identity.motto === undefined ? {} : { motto: body.identity.motto }),
            ...(body.identity.websiteUrl === undefined
              ? {}
              : { websiteUrl: body.identity.websiteUrl }),
          },
          requestId: request.requestId,
        }),
      );
    },
  );
  router.put(
    '/school-settings/class-position-context',
    requireAnyPermission('settings.manage', 'results.configure'),
    validateBody(classPositionSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = classPositionSchema.parse(request.body);
      sendData(
        response,
        await settings.setClassPositionContext({
          academicSessionId: objectId(body.academicSessionId, 'Academic session'),
          actorSessionId: principal.sessionId,
          actorUserId: principal.userId,
          classLevelId: objectId(body.classLevelId, 'Class level'),
          enabled: body.enabled,
          expectedVersion: body.expectedVersion,
          requestId: request.requestId,
          termId: objectId(body.termId, 'Term'),
          ...(body.trackId === undefined ? {} : { trackId: objectId(body.trackId, 'Track') }),
        }),
      );
    },
  );

  return router;
}
