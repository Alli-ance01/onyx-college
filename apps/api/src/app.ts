import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';

import { NotFoundError } from './app/errors/app-error.js';
import { errorHandler } from './app/middleware/error-handler.js';
import { httpLogging } from './app/middleware/http-logging.js';
import { requestId } from './app/middleware/request-id.js';
import { createHealthRouter } from './app/routes/health.js';
import type { AppEnvironment } from './config/environment.js';
import { createIdentityModule } from './modules/identity/index.js';
import { createStudentOnboardingModule } from './modules/student-registration/index.js';
import type { ReadinessProbe } from './platform/health/service-readiness.js';

interface AppDependencies {
  environment: AppEnvironment;
  logger: Logger;
  readiness: ReadinessProbe;
  registerFoundationRoutes?: (app: Express) => void;
}

export function createApp({
  environment,
  logger,
  readiness,
  registerFoundationRoutes,
}: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  if (environment.TRUST_PROXY_HOPS > 0) {
    app.set('trust proxy', environment.TRUST_PROXY_HOPS);
  }
  app.use(requestId);
  app.use(httpLogging(logger));
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      methods: ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'],
      origin: environment.WEB_ORIGIN,
    }),
  );
  app.use(express.json({ limit: environment.JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.use('/api/v1/health', createHealthRouter(readiness));
  app.use('/api/v1/auth', createIdentityModule(environment).router);
  app.use('/api/v1', createStudentOnboardingModule(environment).router);
  registerFoundationRoutes?.(app);

  app.use((_request, _response, next) => {
    next(new NotFoundError());
  });

  app.use(errorHandler);

  return app;
}
