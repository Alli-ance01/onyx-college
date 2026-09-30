import { raw, Router } from 'express';
import { z } from 'zod';

import { ValidationError } from '../../../app/errors/app-error.js';
import { objectId, principalSummary, sendData } from '../../../app/http/route-utils.js';
import type { AppEnvironment } from '../../../config/environment.js';
import { createDocumentStorage } from '../../documents/application/create-document-storage.js';
import type { PrincipalResolver } from '../../identity/application/auth-records.js';
import {
  createAuthenticationMiddleware,
  requireAuthenticatedPrincipal,
  requireAnyPermission,
  requirePermission,
} from '../../identity/http/authentication-middleware.js';
import { requireTrustedBrowserOrigin } from '../../identity/http/browser-request-security.js';
import { validateBody } from '../../identity/http/validation.js';
import type { AccessTokenService } from '../../identity/infrastructure/access-token-service.js';
import type { MongoSessionRepository } from '../../identity/infrastructure/mongo-session-repository.js';
import { AssignmentService } from '../application/assignment-service.js';

const assignmentSchema = z
  .object({
    dueAt: z.iso.datetime(),
    instructions: z.string().trim().min(1).max(20_000),
    teachingAssignmentId: z.string(),
    title: z.string().trim().min(2).max(200),
  })
  .strict();
const updateSchema = z
  .object({
    dueAt: z.iso.datetime().optional(),
    instructions: z.string().trim().min(1).max(20_000).optional(),
    title: z.string().trim().min(2).max(200).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one change.');

export function createAssignmentRouter(dependencies: {
  accessTokens: AccessTokenService;
  environment: AppEnvironment;
  principals: PrincipalResolver;
  sessions: MongoSessionRepository;
}): Router {
  const router = Router();
  const assignments = new AssignmentService(
    createDocumentStorage(dependencies.environment),
    dependencies.environment.DOCUMENT_MAX_BYTES,
    dependencies.environment.DOCUMENT_SIGNED_URL_TTL_SECONDS,
  );
  const trustedOrigin = requireTrustedBrowserOrigin(dependencies.environment.WEB_ORIGIN);

  router.use('/assignments', createAuthenticationMiddleware(dependencies));

  router.get('/assignments', async (request, response) => {
    sendData(
      response,
      await assignments.listForPrincipal(principalSummary(requireAuthenticatedPrincipal(request))),
    );
  });
  router.post(
    '/assignments',
    requirePermission('assignments.create'),
    validateBody(assignmentSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = assignmentSchema.parse(request.body);
      const id = await assignments.create({
        actorUserId: principal.userId,
        dueAt: body.dueAt,
        instructions: body.instructions,
        requestId: request.requestId,
        teachingAssignmentId: objectId(body.teachingAssignmentId, 'Teaching assignment'),
        title: body.title,
      });
      sendData(response, { id }, 201);
    },
  );
  router.patch(
    '/assignments/:assignmentId',
    requireAnyPermission('assignments.update', 'assignments.manage_all'),
    validateBody(updateSchema),
    async (request, response) => {
      const body = updateSchema.parse(request.body);
      await assignments.update({
        actor: principalSummary(requireAuthenticatedPrincipal(request)),
        assignmentId: objectId(request.params.assignmentId, 'Assignment'),
        ...(body.dueAt === undefined ? {} : { dueAt: body.dueAt }),
        ...(body.instructions === undefined ? {} : { instructions: body.instructions }),
        ...(body.title === undefined ? {} : { title: body.title }),
      });
      sendData(response, { updated: true });
    },
  );
  router.post(
    '/assignments/:assignmentId/publish',
    requireAnyPermission('assignments.publish', 'assignments.manage_all'),
    async (request, response) => {
      await assignments.publish({
        actor: principalSummary(requireAuthenticatedPrincipal(request)),
        assignmentId: objectId(request.params.assignmentId, 'Assignment'),
        requestId: request.requestId,
      });
      sendData(response, { published: true });
    },
  );
  router.post(
    '/assignments/:assignmentId/archive',
    requireAnyPermission('assignments.archive', 'assignments.manage_all'),
    async (request, response) => {
      await assignments.archive({
        actor: principalSummary(requireAuthenticatedPrincipal(request)),
        assignmentId: objectId(request.params.assignmentId, 'Assignment'),
        requestId: request.requestId,
      });
      sendData(response, { archived: true });
    },
  );
  router.post(
    '/assignments/:assignmentId/attachments',
    trustedOrigin,
    requireAnyPermission('assignments.update', 'assignments.manage_all'),
    (request, response, next) => {
      raw({
        limit: dependencies.environment.DOCUMENT_MAX_BYTES,
        type: ['image/jpeg', 'image/png', 'application/pdf'],
      })(request, response, next);
    },
    async (request, response) => {
      if (!Buffer.isBuffer(request.body))
        throw new ValidationError('A binary attachment body is required.');
      const id = await assignments.uploadAttachment({
        actor: principalSummary(requireAuthenticatedPrincipal(request)),
        assignmentId: objectId(request.params.assignmentId, 'Assignment'),
        body: request.body,
        displayName: request.header('x-file-name') ?? 'attachment',
        mimeType: request.header('content-type') ?? '',
        requestId: request.requestId,
      });
      sendData(response, { id }, 201);
    },
  );
  router.get('/assignments/attachments/:attachmentId/download-url', async (request, response) => {
    const access = await assignments.attachmentAccess(
      objectId(request.params.attachmentId, 'Assignment attachment'),
      principalSummary(requireAuthenticatedPrincipal(request)),
    );
    response.setHeader('Cache-Control', 'private, no-store');
    sendData(response, access);
  });
  router.get('/assignments/attachments/:attachmentId/content', async (request, response) => {
    const result = await assignments.downloadAttachment(
      objectId(request.params.attachmentId, 'Assignment attachment'),
      principalSummary(requireAuthenticatedPrincipal(request)),
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Type', result.stored.contentType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${result.displayName.replace(/["\\]/gu, '')}"`,
    );
    response.send(result.stored.body);
  });

  return router;
}
