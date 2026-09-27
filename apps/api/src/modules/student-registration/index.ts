import type { Router } from 'express';
import type { AppEnvironment } from '../../config/environment.js';
import { MongoPrincipalResolver } from '../access-control/infrastructure/mongo-principal-resolver.js';
import { StudentDocumentService } from '../documents/application/student-document-service.js';
import type { DocumentStorage } from '../documents/application/document-storage.js';
import { createCloudinaryDocumentStorage } from '../documents/infrastructure/cloudinary-document-storage.js';
import {
  DisabledDocumentStorage,
  LocalDocumentStorage,
} from '../documents/infrastructure/local-document-storage.js';
import { AccessTokenService } from '../identity/infrastructure/access-token-service.js';
import { MongoSessionRepository } from '../identity/infrastructure/mongo-session-repository.js';
import { createStudentOnboardingRouter } from './http/student-onboarding-router.js';

function createDocumentStorage(environment: AppEnvironment): DocumentStorage {
  if (environment.DOCUMENT_STORAGE_DRIVER === 'local')
    return new LocalDocumentStorage(environment.DOCUMENT_STORAGE_LOCAL_PATH);
  if (environment.DOCUMENT_STORAGE_DRIVER === 'cloudinary') {
    if (
      environment.CLOUDINARY_API_KEY === undefined ||
      environment.CLOUDINARY_API_SECRET === undefined ||
      environment.CLOUDINARY_CLOUD_NAME === undefined
    )
      throw new Error('Validated Cloudinary configuration is missing.');
    return createCloudinaryDocumentStorage({
      apiKey: environment.CLOUDINARY_API_KEY,
      apiSecret: environment.CLOUDINARY_API_SECRET,
      cloudName: environment.CLOUDINARY_CLOUD_NAME,
    });
  }
  return new DisabledDocumentStorage();
}

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
