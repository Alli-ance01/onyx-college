import { TeacherService } from '../../teachers/application/teacher-service.js';
import { CredentialCrypto } from '../../identity/infrastructure/credential-crypto.js';
import { Router } from 'express';
import { z } from 'zod';
import type { AppEnvironment } from '../../../config/environment.js';
import {
  objectId,
  optionalObjectId,
  principalSummary,
  sendData,
} from '../../../app/http/route-utils.js';
import type { PrincipalResolver } from '../../identity/application/auth-records.js';
import {
  createAuthenticationMiddleware,
  requireAuthenticatedPrincipal,
  requirePermission,
} from '../../identity/http/authentication-middleware.js';
import type { AccessTokenService } from '../../identity/infrastructure/access-token-service.js';
import type { MongoSessionRepository } from '../../identity/infrastructure/mongo-session-repository.js';
import { validateBody } from '../../identity/http/validation.js';
import { TimetableService } from '../application/timetable-service.js';
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
const schema = z
  .object({
    version: z.number().int().min(0),
    timeZone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Choose a valid IANA time zone.'),
    lessons: z
      .array(
        z
          .object({
            teachingAssignmentId: z.string().regex(/^[a-f\d]{24}$/iu),
            weekday: z.number().int().min(1).max(5),
            startsAt: time,
            endsAt: time,
            room: z.string().trim().max(80),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict();
export function createTimetableRouter(dependencies: {
  accessTokens: AccessTokenService;
  environment: AppEnvironment;
  principals: PrincipalResolver;
  sessions: MongoSessionRepository;
}): Router {
  const router = Router();
  const service = new TimetableService();
  router.use(
    ['/timetables', '/timetable-terms', '/timetable-assignments'],
    createAuthenticationMiddleware(dependencies),
  );
  router.get('/timetable-assignments', requirePermission('timetable.manage'), async (_req, res) => {
    sendData(
      res,
      (
        await new TeacherService(
          new CredentialCrypto(dependencies.environment.AUTH_REFRESH_TOKEN_PEPPER),
        ).listAssignments()
      ).filter((x) => x.type === 'TEACHING' && x.status === 'ACTIVE'),
    );
  });
  router.get('/timetable-terms', async (req, res) => {
    sendData(res, await service.terms(principalSummary(requireAuthenticatedPrincipal(req))));
  });
  router.get('/timetables', async (req, res) => {
    sendData(
      res,
      await service.read(
        principalSummary(requireAuthenticatedPrincipal(req)),
        optionalObjectId(req.query.termId, 'Term'),
      ),
    );
  });
  router.put(
    '/timetables/:termId',
    requirePermission('timetable.manage'),
    validateBody(schema),
    async (req, res) => {
      await service.save(
        principalSummary(requireAuthenticatedPrincipal(req)),
        objectId(req.params.termId, 'Term'),
        schema.parse(req.body),
        req.requestId,
      );
      sendData(res, { saved: true });
    },
  );
  return router;
}
