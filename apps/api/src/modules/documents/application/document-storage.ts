export interface StoredDocument {
  body: Buffer;
  contentType: string;
}

export type DocumentStorageProvider = 'CLOUDINARY' | 'LOCAL';
export type DocumentStorageResourceType = 'image' | 'raw';

export interface DocumentStorageObject {
  assetId?: string;
  deliveryType: 'authenticated' | 'local';
  format: string;
  provider: DocumentStorageProvider;
  publicId: string;
  resourceType: DocumentStorageResourceType;
  version?: number;
}

export interface DocumentStorageUpload {
  body: Buffer;
  key: string;
  mimeType: string;
}

export interface StoredDocumentUpload extends DocumentStorageObject {
  bytes: number;
}

export interface SignedDocumentAccess {
  expiresAt: Date;
  url: string;
}

export interface DocumentStorage {
  createSignedAccess(
    object: DocumentStorageObject,
    expiresAt: Date,
  ): Promise<SignedDocumentAccess | null>;
  get(object: DocumentStorageObject, contentType: string): Promise<StoredDocument>;
  put(upload: DocumentStorageUpload): Promise<StoredDocumentUpload>;
  remove(object: DocumentStorageObject): Promise<void>;
}
