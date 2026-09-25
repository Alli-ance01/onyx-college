import type { ErrorEnvelope, SuccessEnvelope } from '@onyx/contracts';
import { Router } from 'express';

import type { ReadinessProbe } from '../../platform/health/service-readiness.js';

interface HealthStatus {
  status: 'ok' | 'ready';
}

export function createHealthRouter(readiness: ReadinessProbe): Router {
  const router = Router();

  router.get('/live', (_request, response) => {
    const envelope: SuccessEnvelope<HealthStatus> = { data: { status: 'ok' } };
    response.status(200).json(envelope);
  });

  router.get('/ready', (request, response) => {
    if (!readiness.isReady()) {
      const envelope: ErrorEnvelope = {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'The service is not ready to accept requests.',
          requestId: request.requestId,
        },
      };

      response.status(503).json(envelope);
      return;
    }

    const envelope: SuccessEnvelope<HealthStatus> = { data: { status: 'ready' } };
    response.status(200).json(envelope);
  });

  return router;
}
