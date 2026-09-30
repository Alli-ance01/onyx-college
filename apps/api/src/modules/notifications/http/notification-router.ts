import { Router } from 'express';

import { objectId, sendData } from '../../../app/http/route-utils.js';
import type { PrincipalResolver } from '../../identity/application/auth-records.js';
import {
  createAuthenticationMiddleware,
  requireAuthenticatedPrincipal,
} from '../../identity/http/authentication-middleware.js';
import type { AccessTokenService } from '../../identity/infrastructure/access-token-service.js';
import type { MongoSessionRepository } from '../../identity/infrastructure/mongo-session-repository.js';
import { NotificationService } from '../application/notification-service.js';

export function createNotificationRouter(dependencies: {
  accessTokens: AccessTokenService;
  principals: PrincipalResolver;
  sessions: MongoSessionRepository;
}): Router {
  const router = Router();
  const notifications = new NotificationService();
  router.use('/notifications', createAuthenticationMiddleware(dependencies));

  router.get('/notifications', async (request, response) => {
    sendData(response, await notifications.list(requireAuthenticatedPrincipal(request).userId));
  });
  router.post('/notifications/read-all', async (request, response) => {
    await notifications.markAllRead(requireAuthenticatedPrincipal(request).userId);
    sendData(response, { updated: true });
  });
  router.post('/notifications/:notificationId/read', async (request, response) => {
    await notifications.markRead(
      requireAuthenticatedPrincipal(request).userId,
      objectId(request.params.notificationId, 'Notification'),
    );
    sendData(response, { updated: true });
  });

  return router;
}
