import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from '../../../app/errors/app-error.js';
import type {
  DocumentStorage,
  DocumentStorageObject,
  DocumentStorageUpload,
  SignedDocumentAccess,
  StoredDocument,
  StoredDocumentUpload,
} from '../application/document-storage.js';
import { documentExtensionFor, documentResourceTypeFor } from '../domain/document-file-policy.js';

function unavailable(): AppError {
  return new AppError('Document storage is not configured.', {
    code: 'DOCUMENT_STORAGE_UNAVAILABLE',
    statusCode: 503,
  });
}

export class DisabledDocumentStorage implements DocumentStorage {
  public createSignedAccess(): Promise<SignedDocumentAccess | null> {
    return Promise.reject(unavailable());
  }
  public get(): Promise<StoredDocument> {
    return Promise.reject(unavailable());
  }
  public put(): Promise<StoredDocumentUpload> {
    return Promise.reject(unavailable());
  }
  public remove(): Promise<void> {
    return Promise.reject(unavailable());
  }
}

export class LocalDocumentStorage implements DocumentStorage {
  readonly #root: string;
  public constructor(root: string) {
    this.#root = path.resolve(root);
  }

  #resolve(key: string): string {
    if (!/^[a-zA-Z0-9/_-]+\.[a-z0-9]+$/u.test(key)) throw unavailable();
    const target = path.resolve(this.#root, key);
    if (!target.startsWith(`${this.#root}${path.sep}`)) throw unavailable();
    return target;
  }

  #key(object: DocumentStorageObject): string {
    if (object.provider !== 'LOCAL') throw unavailable();
    return object.publicId;
  }

  public createSignedAccess(): Promise<null> {
    return Promise.resolve(null);
  }

  public async get(object: DocumentStorageObject, contentType: string): Promise<StoredDocument> {
    return { body: await readFile(this.#resolve(this.#key(object))), contentType };
  }

  public async put(upload: DocumentStorageUpload): Promise<StoredDocumentUpload> {
    const target = this.#resolve(upload.key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, upload.body, { flag: 'wx' });
    return {
      bytes: upload.body.length,
      deliveryType: 'local',
      format: documentExtensionFor(upload.mimeType),
      provider: 'LOCAL',
      publicId: upload.key,
      resourceType: documentResourceTypeFor(upload.mimeType),
    };
  }

  public async remove(object: DocumentStorageObject): Promise<void> {
    await rm(this.#resolve(this.#key(object)), { force: true });
  }
}
