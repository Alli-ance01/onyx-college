import { Router } from 'express';
import { z } from 'zod';

import { objectId, sendData } from '../../../app/http/route-utils.js';
import type { PrincipalResolver } from '../../identity/application/auth-records.js';
import {
  createAuthenticationMiddleware,
  requireAuthenticatedPrincipal,
  requireAnyPermission,
  requirePermission,
} from '../../identity/http/authentication-middleware.js';
import { validateBody } from '../../identity/http/validation.js';
import type { AccessTokenService } from '../../identity/infrastructure/access-token-service.js';
import type { MongoSessionRepository } from '../../identity/infrastructure/mongo-session-repository.js';
import { DocumentAdminService } from '../application/document-admin-service.js';

const mimeType = z.enum(['application/pdf', 'image/jpeg', 'image/png']);
const createSchema = z
  .object({
    acceptedMimeTypes: z.array(mimeType).min(1).max(3),
    code: z.string().trim().min(2).max(64),
    description: z.string().trim().max(1_000).optional(),
    label: z.string().trim().min(2).max(160),
    maximumBytes: z
      .number()
      .int()
      .min(1)
      .max(25 * 1024 * 1024),
    requiredForRegistration: z.boolean(),
  })
  .strict();
const updateSchema = createSchema
  .omit({ code: true })
  .partial()
  .extend({ active: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one change.');

export function createDocumentAdminRouter(dependencies: {
  accessTokens: AccessTokenService;
  principals: PrincipalResolver;
  sessions: MongoSessionRepository;
}): Router {
  const router = Router();
  const service = new DocumentAdminService();
  router.use(
    ['/admin/document-requirements', '/admin/student-documents'],
    createAuthenticationMiddleware(dependencies),
  );

  router.get(
    '/admin/document-requirements',
    requireAnyPermission('documents.read', 'documents.review', 'documents.configure'),
    async (_request, response) => {
      sendData(response, await service.listRequirements());
    },
  );
  router.post(
    '/admin/document-requirements',
    requirePermission('documents.configure'),
    validateBody(createSchema),
    async (request, response) => {
      const body = createSchema.parse(request.body);
      sendData(
        response,
        await service.createRequirement({
          acceptedMimeTypes: body.acceptedMimeTypes,
          actorUserId: requireAuthenticatedPrincipal(request).userId,
          code: body.code,
          label: body.label,
          maximumBytes: body.maximumBytes,
          requestId: request.requestId,
          requiredForRegistration: body.requiredForRegistration,
          ...(body.description === undefined ? {} : { description: body.description }),
        }),
        201,
      );
    },
  );
  router.patch(
    '/admin/document-requirements/:requirementId',
    requirePermission('documents.configure'),
    validateBody(updateSchema),
    async (request, response) => {
      const body = updateSchema.parse(request.body);
      sendData(
        response,
        await service.updateRequirement({
          actorUserId: requireAuthenticatedPrincipal(request).userId,
          requestId: request.requestId,
          requirementId: objectId(request.params.requirementId, 'Document requirement'),
          ...(body.acceptedMimeTypes === undefined
            ? {}
            : { acceptedMimeTypes: body.acceptedMimeTypes }),
          ...(body.active === undefined ? {} : { active: body.active }),
          ...(body.description === undefined ? {} : { description: body.description }),
          ...(body.label === undefined ? {} : { label: body.label }),
          ...(body.maximumBytes === undefined ? {} : { maximumBytes: body.maximumBytes }),
          ...(body.requiredForRegistration === undefined
            ? {}
            : { requiredForRegistration: body.requiredForRegistration }),
        }),
      );
    },
  );
  router.get(
    '/admin/student-documents',
    requireAnyPermission('documents.read', 'documents.review'),
    async (request, response) => {
      sendData(
        response,
        await service.listStudentDocuments(
          typeof request.query.reviewStatus === 'string' ? request.query.reviewStatus : undefined,
        ),
      );
    },
  );
  return router;
}
