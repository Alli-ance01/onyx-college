import { describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/environment.js';
import {
  CloudinaryDocumentStorage,
  type CloudinaryGateway,
  type CloudinaryUploadInput,
  type CloudinaryUploadResult,
} from '../src/modules/documents/infrastructure/cloudinary-document-storage.js';

class FakeCloudinaryGateway implements CloudinaryGateway {
  public readonly destroyed: { publicId: string; resourceType: 'image' | 'raw' }[] = [];
  public readonly signed: {
    attachment: boolean;
    expiresAtEpochSeconds: number;
    format: string;
    publicId: string;
    resourceType: 'image' | 'raw';
  }[] = [];
  public readonly uploaded: CloudinaryUploadInput[] = [];
  public uploadResult: CloudinaryUploadResult | undefined;

  public createSignedDownloadUrl(input: (typeof this.signed)[number]): string {
    this.signed.push(input);
    return 'https://api.cloudinary.com/v1_1/onyx/image/download?signature=signed';
  }

  public destroy(input: (typeof this.destroyed)[number]): Promise<void> {
    this.destroyed.push(input);
    return Promise.resolve();
  }

  public upload(input: CloudinaryUploadInput): Promise<CloudinaryUploadResult> {
    this.uploaded.push(input);
    return this.uploadResult === undefined
      ? Promise.reject(new Error('Missing fake upload result.'))
      : Promise.resolve(this.uploadResult);
  }
}

describe('Cloudinary document storage', () => {
  it('uploads images as authenticated assets and returns provider metadata', async () => {
    const body = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const gateway = new FakeCloudinaryGateway();
    gateway.uploadResult = {
      assetId: 'asset_opaque',
      bytes: body.length,
      deliveryType: 'authenticated',
      format: 'png',
      publicId: 'private/student-documents/registration/document/object',
      resourceType: 'image',
      version: 42,
    };
    const storage = new CloudinaryDocumentStorage(gateway);

    const result = await storage.put({
      body,
      key: 'private/student-documents/registration/document/object.png',
      mimeType: 'image/png',
    });

    expect(gateway.uploaded).toEqual([
      {
        body,
        format: 'png',
        publicId: 'private/student-documents/registration/document/object',
        resourceType: 'image',
      },
    ]);
    expect(result).toEqual({
      assetId: 'asset_opaque',
      bytes: body.length,
      deliveryType: 'authenticated',
      format: 'png',
      provider: 'CLOUDINARY',
      publicId: 'private/student-documents/registration/document/object',
      resourceType: 'image',
      version: 42,
    });
  });

  it('preserves a PDF extension for an authenticated raw document', async () => {
    const body = Buffer.from('%PDF-1.7 test');
    const gateway = new FakeCloudinaryGateway();
    gateway.uploadResult = {
      bytes: body.length,
      deliveryType: 'authenticated',
      format: 'pdf',
      publicId: 'private/student-documents/registration/document/object.pdf',
      resourceType: 'raw',
    };
    const storage = new CloudinaryDocumentStorage(gateway);

    const result = await storage.put({
      body,
      key: 'private/student-documents/registration/document/object.pdf',
      mimeType: 'application/pdf',
    });

    expect(result).toMatchObject({
      deliveryType: 'authenticated',
      format: 'pdf',
      provider: 'CLOUDINARY',
      publicId: 'private/student-documents/registration/document/object.pdf',
      resourceType: 'raw',
    });
  });

  it('generates a short-lived signed access URL and passes no credential to callers', async () => {
    const gateway = new FakeCloudinaryGateway();
    const storage = new CloudinaryDocumentStorage(gateway);
    const expiresAt = new Date(Date.now() + 90_000);

    const access = await storage.createSignedAccess(
      {
        deliveryType: 'authenticated',
        format: 'png',
        provider: 'CLOUDINARY',
        publicId: 'private/student-documents/registration/document/object',
        resourceType: 'image',
      },
      expiresAt,
    );

    expect(access).toEqual({
      expiresAt,
      url: 'https://api.cloudinary.com/v1_1/onyx/image/download?signature=signed',
    });
    expect(gateway.signed).toEqual([
      {
        attachment: false,
        expiresAtEpochSeconds: Math.floor(expiresAt.valueOf() / 1000),
        format: 'png',
        publicId: 'private/student-documents/registration/document/object',
        resourceType: 'image',
      },
    ]);
  });

  it('deletes the exact authenticated resource locator and rejects provider mismatches', async () => {
    const gateway = new FakeCloudinaryGateway();
    const storage = new CloudinaryDocumentStorage(gateway);
    const object = {
      deliveryType: 'authenticated' as const,
      format: 'pdf',
      provider: 'CLOUDINARY' as const,
      publicId: 'private/student-documents/registration/document/object.pdf',
      resourceType: 'raw' as const,
    };

    await storage.remove(object);

    expect(gateway.destroyed).toEqual([
      {
        publicId: 'private/student-documents/registration/document/object.pdf',
        resourceType: 'raw',
      },
    ]);
    await expect(
      storage.remove({ ...object, deliveryType: 'local', provider: 'LOCAL' }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_STORAGE_UNAVAILABLE' });
  });

  it('rejects provider metadata that disagrees with the uploaded bytes', async () => {
    const gateway = new FakeCloudinaryGateway();
    const body = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    gateway.uploadResult = {
      bytes: body.length + 1,
      deliveryType: 'upload',
      publicId: 'wrong',
      resourceType: 'raw',
    };
    const storage = new CloudinaryDocumentStorage(gateway);

    await expect(
      storage.put({
        body,
        key: 'private/student-documents/registration/document/object.png',
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_STORAGE_UNAVAILABLE' });
  });

  it('requires all Cloudinary credentials whenever the driver is selected', () => {
    expect(() =>
      loadEnvironment({
        DOCUMENT_STORAGE_DRIVER: 'cloudinary',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/onyx_test',
        NODE_ENV: 'test',
        WEB_ORIGIN: 'http://localhost:5173',
      }),
    ).toThrow(/CLOUDINARY_CLOUD_NAME/iu);

    expect(
      loadEnvironment({
        CLOUDINARY_API_KEY: 'api-key',
        CLOUDINARY_API_SECRET: 'api-secret',
        CLOUDINARY_CLOUD_NAME: 'onyx-college',
        DOCUMENT_STORAGE_DRIVER: 'cloudinary',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/onyx_test',
        NODE_ENV: 'test',
        WEB_ORIGIN: 'http://localhost:5173',
      }).DOCUMENT_STORAGE_DRIVER,
    ).toBe('cloudinary');
  });
});
