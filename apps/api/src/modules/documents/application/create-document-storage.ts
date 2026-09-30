import type { AppEnvironment } from '../../../config/environment.js';
import { createCloudinaryDocumentStorage } from '../infrastructure/cloudinary-document-storage.js';
import {
  DisabledDocumentStorage,
  LocalDocumentStorage,
} from '../infrastructure/local-document-storage.js';
import type { DocumentStorage } from './document-storage.js';

export function createDocumentStorage(environment: AppEnvironment): DocumentStorage {
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
