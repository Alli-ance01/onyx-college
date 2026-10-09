import { createTimetableRouter } from '../timetable/http/timetable-router.js';
import { Router } from 'express';

import type { AppEnvironment } from '../../config/environment.js';
import { MongoPrincipalResolver } from '../access-control/infrastructure/mongo-principal-resolver.js';
import { createAdminAccessRouter } from '../admin-access/http/admin-access-router.js';
import { createAcademicManagementRouter } from '../academics/http/academic-management-router.js';
import { createAnnouncementRouter } from '../announcements/http/announcement-router.js';
import { createAssignmentRouter } from '../assignments/http/assignment-router.js';
import { createDocumentAdminRouter } from '../documents/http/document-admin-router.js';
import { AccessTokenService } from '../identity/infrastructure/access-token-service.js';
import { MongoSessionRepository } from '../identity/infrastructure/mongo-session-repository.js';
import { createNotificationRouter } from '../notifications/http/notification-router.js';
import { createResultRouter } from '../results/http/result-router.js';
import { createTeacherRouter } from '../teachers/http/teacher-router.js';

export function createProductModule(environment: AppEnvironment): { router: Router } {
  const router = Router();
  const dependencies = {
    accessTokens: new AccessTokenService({
      audience: environment.AUTH_AUDIENCE,
      issuer: environment.AUTH_ISSUER,
      secret: environment.AUTH_ACCESS_TOKEN_SECRET,
      ttlSeconds: environment.AUTH_ACCESS_TOKEN_TTL_SECONDS,
    }),
    environment,
    principals: new MongoPrincipalResolver(),
    sessions: new MongoSessionRepository(),
  };

  router.use(createAcademicManagementRouter(dependencies));
  router.use(createTeacherRouter(dependencies));
  router.use(createTimetableRouter(dependencies));
  router.use(createAssignmentRouter(dependencies));
  router.use(createDocumentAdminRouter(dependencies));
  router.use(createAnnouncementRouter(dependencies));
  router.use(createNotificationRouter(dependencies));
  router.use(createResultRouter(dependencies));
  router.use(createAdminAccessRouter(dependencies));

  return { router };
}
