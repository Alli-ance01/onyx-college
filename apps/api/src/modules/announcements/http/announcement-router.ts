import { Router } from 'express';
import { z } from 'zod';

import { objectId, principalSummary, sendData } from '../../../app/http/route-utils.js';
import type { PrincipalResolver } from '../../identity/application/auth-records.js';
import {
  createAuthenticationMiddleware,
  requireAuthenticatedPrincipal,
  requireAnyPermission,
} from '../../identity/http/authentication-middleware.js';
import { validateBody } from '../../identity/http/validation.js';
import type { AccessTokenService } from '../../identity/infrastructure/access-token-service.js';
import type { MongoSessionRepository } from '../../identity/infrastructure/mongo-session-repository.js';
import { AnnouncementService } from '../application/announcement-service.js';

const createSchema = z
  .object({
    audience: z
      .object({
        classLevelId: z.string().optional(),
        trackId: z.string().optional(),
        type: z.enum([
          'SCHOOL',
          'STUDENTS',
          'TEACHERS',
          'JUNIOR_SCHOOL',
          'SENIOR_SCHOOL',
          'CLASS',
          'TRACK',
          'CLASS_TRACK',
          'SPECIFIC_USERS',
        ]),
        userIds: z.array(z.string()).max(500).optional(),
      })
      .strict(),
    body: z.string().trim().min(1).max(20_000),
    expiresAt: z.iso.datetime().optional(),
    title: z.string().trim().min(2).max(200),
  })
  .strict();
const updateSchema = z
  .object({
    body: z.string().trim().min(1).max(20_000).optional(),
    expiresAt: z.iso.datetime().optional(),
    title: z.string().trim().min(2).max(200).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one change.');

export function createAnnouncementRouter(dependencies: {
  accessTokens: AccessTokenService;
  principals: PrincipalResolver;
  sessions: MongoSessionRepository;
}): Router {
  const router = Router();
  const announcements = new AnnouncementService();
  router.use('/announcements', createAuthenticationMiddleware(dependencies));

  router.get('/announcements', async (request, response) => {
    sendData(
      response,
      await announcements.listForPrincipal(
        principalSummary(requireAuthenticatedPrincipal(request)),
      ),
    );
  });
  router.post(
    '/announcements',
    requireAnyPermission('announcements.create_scoped', 'announcements.create_schoolwide'),
    validateBody(createSchema),
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const body = createSchema.parse(request.body);
      const id = await announcements.create({
        actor: principalSummary(principal),
        audience: {
          type: body.audience.type,
          ...(body.audience.classLevelId === undefined
            ? {}
            : { classLevelId: objectId(body.audience.classLevelId, 'Class level') }),
          ...(body.audience.trackId === undefined
            ? {}
            : { trackId: objectId(body.audience.trackId, 'Track') }),
          ...(body.audience.userIds === undefined
            ? {}
            : {
                userIds: body.audience.userIds.map((userId) => objectId(userId, 'User')),
              }),
        },
        body: body.body,
        requestId: request.requestId,
        title: body.title,
        ...(body.expiresAt === undefined ? {} : { expiresAt: body.expiresAt }),
      });
      sendData(response, { id }, 201);
    },
  );
  router.patch(
    '/announcements/:announcementId',
    requireAnyPermission('announcements.update_own', 'announcements.manage_all'),
    validateBody(updateSchema),
    async (request, response) => {
      const body = updateSchema.parse(request.body);
      await announcements.update({
        actor: principalSummary(requireAuthenticatedPrincipal(request)),
        announcementId: objectId(request.params.announcementId, 'Announcement'),
        ...(body.body === undefined ? {} : { body: body.body }),
        ...(body.expiresAt === undefined ? {} : { expiresAt: body.expiresAt }),
        ...(body.title === undefined ? {} : { title: body.title }),
      });
      sendData(response, { updated: true });
    },
  );
  router.post(
    '/announcements/:announcementId/publish',
    requireAnyPermission(
      'announcements.create_scoped',
      'announcements.create_schoolwide',
      'announcements.manage_all',
    ),
    async (request, response) => {
      await announcements.publish({
        actor: principalSummary(requireAuthenticatedPrincipal(request)),
        announcementId: objectId(request.params.announcementId, 'Announcement'),
        requestId: request.requestId,
      });
      sendData(response, { published: true });
    },
  );
  router.post(
    '/announcements/:announcementId/withdraw',
    requireAnyPermission('announcements.update_own', 'announcements.manage_all'),
    async (request, response) => {
      await announcements.withdraw({
        actor: principalSummary(requireAuthenticatedPrincipal(request)),
        announcementId: objectId(request.params.announcementId, 'Announcement'),
        requestId: request.requestId,
      });
      sendData(response, { withdrawn: true });
    },
  );

  return router;
}
