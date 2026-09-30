import type { Router } from 'express';
import type { AppEnvironment } from '../../config/environment.js';
import { MongoPrincipalResolver } from '../access-control/infrastructure/mongo-principal-resolver.js';
import { createDocumentStorage } from '../documents/application/create-document-storage.js';
import { StudentDocumentService } from '../documents/application/student-document-service.js';
import { AccessTokenService } from '../identity/infrastructure/access-token-service.js';
import { MongoSessionRepository } from '../identity/infrastructure/mongo-session-repository.js';
import { createStudentOnboardingRouter } from './http/student-onboarding-router.js';

export function createStudentOnboardingModule(environment: AppEnvironment): { router: Router } {
  const accessTokens = new AccessTokenService({
    audience: environment.AUTH_AUDIENCE,
    issuer: environment.AUTH_ISSUER,
    secret: environment.AUTH_ACCESS_TOKEN_SECRET,
    ttlSeconds: environment.AUTH_ACCESS_TOKEN_TTL_SECONDS,
  });
  const storage = createDocumentStorage(environment);
  return {
    router: createStudentOnboardingRouter({
      accessTokens,
      documents: new StudentDocumentService(
        storage,
        environment.DOCUMENT_MAX_BYTES,
        environment.DOCUMENT_SIGNED_URL_TTL_SECONDS,
      ),
      environment,
      principals: new MongoPrincipalResolver(),
      sessions: new MongoSessionRepository(),
    }),
  };
}
