import { v2 as cloudinary } from 'cloudinary';
import { z } from 'zod';

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

interface CloudinaryConfiguration {
  apiKey: string;
  apiSecret: string;
  cloudName: string;
}

export interface CloudinaryUploadInput {
  body: Buffer;
  format: string;
  publicId: string;
  resourceType: 'image' | 'raw';
}

export interface CloudinaryUploadResult {
  assetId?: string;
  bytes: number;
  deliveryType: string;
  format?: string;
  publicId: string;
  resourceType: string;
  version?: number;
}

export interface CloudinaryGateway {
  createSignedDownloadUrl(input: {
    attachment: boolean;
    expiresAtEpochSeconds: number;
    format: string;
    publicId: string;
    resourceType: 'image' | 'raw';
  }): string;
  destroy(input: { publicId: string; resourceType: 'image' | 'raw' }): Promise<void>;
  upload(input: CloudinaryUploadInput): Promise<CloudinaryUploadResult>;
}

const uploadResponseSchema = z.object({
  asset_id: z.string().min(1).optional(),
  bytes: z.number().int().nonnegative(),
  format: z.string().min(1).optional(),
  public_id: z.string().min(1),
  resource_type: z.string().min(1),
  type: z.string().min(1),
  version: z.number().int().nonnegative().optional(),
});

const destroyResponseSchema = z.object({
  result: z.enum(['not found', 'ok']),
});

function unavailable(cause?: unknown): AppError {
  return new AppError('Document storage is temporarily unavailable.', {
    code: 'DOCUMENT_STORAGE_UNAVAILABLE',
    expose: true,
    statusCode: 503,
    ...(cause === undefined ? {} : { cause }),
  });
}

class CloudinarySdkGateway implements CloudinaryGateway {
  public constructor(configuration: CloudinaryConfiguration) {
    cloudinary.config({
      api_key: configuration.apiKey,
      api_secret: configuration.apiSecret,
      cloud_name: configuration.cloudName,
      secure: true,
    });
  }

  public createSignedDownloadUrl(input: {
    attachment: boolean;
    expiresAtEpochSeconds: number;
    format: string;
    publicId: string;
    resourceType: 'image' | 'raw';
  }): string {
    return cloudinary.utils.private_download_url(input.publicId, input.format, {
      attachment: input.attachment,
      expires_at: input.expiresAtEpochSeconds,
      resource_type: input.resourceType,
      type: 'authenticated',
    });
  }

  public async destroy(input: { publicId: string; resourceType: 'image' | 'raw' }): Promise<void> {
    const response = destroyResponseSchema.parse(
      (await cloudinary.uploader.destroy(input.publicId, {
        invalidate: true,
        resource_type: input.resourceType,
        type: 'authenticated',
      })) as unknown,
    );
    if (!['ok', 'not found'].includes(response.result)) throw unavailable();
  }

  public upload(input: CloudinaryUploadInput): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          discard_original_filename: true,
          overwrite: false,
          public_id: input.publicId,
          resource_type: input.resourceType,
          type: 'authenticated',
          unique_filename: false,
          use_filename: false,
        },
        (error, result) => {
          if (error !== undefined || result === undefined) {
            reject(unavailable(error));
            return;
          }
          const parsed = uploadResponseSchema.safeParse(result);
          if (!parsed.success) {
            reject(unavailable(parsed.error));
            return;
          }
          resolve({
            bytes: parsed.data.bytes,
            deliveryType: parsed.data.type,
            publicId: parsed.data.public_id,
            resourceType: parsed.data.resource_type,
            ...(parsed.data.asset_id === undefined ? {} : { assetId: parsed.data.asset_id }),
            ...(parsed.data.format === undefined ? {} : { format: parsed.data.format }),
            ...(parsed.data.version === undefined ? {} : { version: parsed.data.version }),
          });
        },
      );
      stream.on('error', (error: Error) => {
        reject(unavailable(error));
      });
      stream.end(input.body);
    });
  }
}

function cloudinaryPublicId(key: string, resourceType: 'image' | 'raw'): string {
  if (!/^[a-zA-Z0-9/_-]+\.[a-z0-9]+$/u.test(key)) throw unavailable();
  return resourceType === 'raw' ? key : key.replace(/\.[a-z0-9]+$/u, '');
}

function assertCloudinaryObject(object: DocumentStorageObject): void {
  if (
    object.provider !== 'CLOUDINARY' ||
    object.deliveryType !== 'authenticated' ||
    !['image', 'raw'].includes(object.resourceType)
  )
    throw unavailable();
}

export class CloudinaryDocumentStorage implements DocumentStorage {
  readonly #fetch: typeof fetch;
  readonly #gateway: CloudinaryGateway;

  public constructor(gateway: CloudinaryGateway, fetchImplementation: typeof fetch = fetch) {
    this.#gateway = gateway;
    this.#fetch = fetchImplementation;
  }

  public createSignedAccess(
    object: DocumentStorageObject,
    expiresAt: Date,
  ): Promise<SignedDocumentAccess> {
    assertCloudinaryObject(object);
    if (expiresAt.valueOf() <= Date.now()) throw unavailable();
    const url = this.#gateway.createSignedDownloadUrl({
      attachment: false,
      expiresAtEpochSeconds: Math.floor(expiresAt.valueOf() / 1000),
      format: object.format,
      publicId: object.publicId,
      resourceType: object.resourceType,
    });
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') throw unavailable();
    return Promise.resolve({ expiresAt, url: parsedUrl.toString() });
  }

  public async get(object: DocumentStorageObject, contentType: string): Promise<StoredDocument> {
    const access = await this.createSignedAccess(object, new Date(Date.now() + 60_000));
    const response = await this.#fetch(access.url, {
      headers: { Accept: contentType },
      redirect: 'follow',
    });
    if (!response.ok) throw unavailable();
    return { body: Buffer.from(await response.arrayBuffer()), contentType };
  }

  public async put(upload: DocumentStorageUpload): Promise<StoredDocumentUpload> {
    const resourceType = documentResourceTypeFor(upload.mimeType);
    const format = documentExtensionFor(upload.mimeType);
    const publicId = cloudinaryPublicId(upload.key, resourceType);
    try {
      const result = await this.#gateway.upload({
        body: upload.body,
        format,
        publicId,
        resourceType,
      });
      if (
        result.bytes !== upload.body.length ||
        result.deliveryType !== 'authenticated' ||
        result.publicId !== publicId ||
        result.resourceType !== resourceType ||
        (result.format !== undefined && result.format !== format)
      )
        throw unavailable();
      return {
        bytes: result.bytes,
        deliveryType: 'authenticated',
        format,
        provider: 'CLOUDINARY',
        publicId: result.publicId,
        resourceType,
        ...(result.assetId === undefined ? {} : { assetId: result.assetId }),
        ...(result.version === undefined ? {} : { version: result.version }),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw unavailable(error);
    }
  }

  public async remove(object: DocumentStorageObject): Promise<void> {
    assertCloudinaryObject(object);
    try {
      await this.#gateway.destroy({
        publicId: object.publicId,
        resourceType: object.resourceType,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw unavailable(error);
    }
  }
}

export function createCloudinaryDocumentStorage(
  configuration: CloudinaryConfiguration,
): CloudinaryDocumentStorage {
  return new CloudinaryDocumentStorage(new CloudinarySdkGateway(configuration));
}
