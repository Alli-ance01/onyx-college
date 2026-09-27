import { createHash, randomUUID } from 'node:crypto';

import type { StudentDocumentAccessDto } from '@onyx/contracts';
import mongoose from 'mongoose';

import { ConflictError, NotFoundError } from '../../../app/errors/app-error.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import { StudentRegistrationModel } from '../../student-registration/infrastructure/registration-models.js';
import {
  DocumentRequirementModel,
  StudentDocumentModel,
} from '../infrastructure/document-models.js';
import {
  documentExtensionFor,
  sanitizeDocumentFilename,
  validateDocumentUpload,
} from '../domain/document-file-policy.js';
import type { DocumentStorage, DocumentStorageObject, StoredDocument } from './document-storage.js';

interface StoredDocumentRecord {
  displayName: string;
  mimeType: string;
  ownerUserId: mongoose.Types.ObjectId;
  provider: 'CLOUDINARY' | 'LOCAL';
  providerAssetId?: string;
  providerDeliveryType: 'authenticated' | 'local';
  providerFormat: string;
  providerPublicId: string;
  providerResourceType: 'image' | 'raw';
  providerVersion?: number;
}

function storageObject(document: StoredDocumentRecord): DocumentStorageObject {
  return {
    deliveryType: document.providerDeliveryType,
    format: document.providerFormat,
    provider: document.provider,
    publicId: document.providerPublicId,
    resourceType: document.providerResourceType,
    ...(document.providerAssetId === undefined ? {} : { assetId: document.providerAssetId }),
    ...(document.providerVersion === undefined ? {} : { version: document.providerVersion }),
  };
}

export class StudentDocumentService {
  readonly #audit = new AuditWriter();
  readonly #maximumBytes: number;
  readonly #signedAccessTtlSeconds: number;
  readonly #storage: DocumentStorage;

  public constructor(
    storage: DocumentStorage,
    maximumBytes: number,
    signedAccessTtlSeconds: number,
  ) {
    this.#storage = storage;
    this.#maximumBytes = maximumBytes;
    this.#signedAccessTtlSeconds = signedAccessTtlSeconds;
  }

  public async upload(input: {
    body: Buffer;
    displayName: string;
    mimeType: string;
    requestId: string;
    requirementId: string;
    userId: string;
  }): Promise<string> {
    const [registration, requirement] = await Promise.all([
      StudentRegistrationModel.findOne({ userId: input.userId }),
      DocumentRequirementModel.findById(input.requirementId),
    ]);
    if (registration === null || !requirement?.active) throw new NotFoundError();
    if (!['DRAFT', 'CHANGES_REQUESTED'].includes(registration.status))
      throw new ConflictError('Documents cannot be changed after submission.');
    const detected = validateDocumentUpload({
      acceptedMimeTypes: requirement.acceptedMimeTypes,
      body: input.body,
      declaredMimeType: input.mimeType,
      maximumBytes: Math.min(requirement.maximumBytes, this.#maximumBytes),
    });
    const documentRecordId = new mongoose.Types.ObjectId();
    const storageKey = `private/student-documents/${registration._id.toString()}/${documentRecordId.toString()}/${randomUUID()}.${documentExtensionFor(detected)}`;
    const stored = await this.#storage.put({
      body: input.body,
      key: storageKey,
      mimeType: detected,
    });
    const originalFilename = sanitizeDocumentFilename(input.displayName);
    try {
      return await mongoose.connection.transaction(async (session) => {
        const editableRegistration = await StudentRegistrationModel.updateOne(
          {
            _id: registration._id,
            status: { $in: ['DRAFT', 'CHANGES_REQUESTED'] },
            userId: registration.userId,
          },
          { $inc: { version: 1 } },
          { session },
        );
        if (editableRegistration.modifiedCount !== 1)
          throw new ConflictError('Documents cannot be changed after submission.');
        const [prior, latestInTransaction] = await Promise.all([
          StudentDocumentModel.findOne({
            registrationId: registration._id,
            documentRequirementId: requirement._id,
            status: 'ACTIVE',
          })
            .sort({ versionNumber: -1 })
            .session(session),
          StudentDocumentModel.findOne({
            registrationId: registration._id,
            documentRequirementId: requirement._id,
          })
            .sort({ versionNumber: -1 })
            .session(session),
        ]);
        const versionNumber = (latestInTransaction?.versionNumber ?? 0) + 1;
        if (prior !== null)
          await StudentDocumentModel.updateOne(
            { _id: prior._id, status: 'ACTIVE' },
            { $set: { status: 'REPLACED' } },
            { session },
          );
        const [document] = await StudentDocumentModel.create(
          [
            {
              _id: documentRecordId,
              checksumSha256: createHash('sha256').update(input.body).digest('hex'),
              displayName: originalFilename,
              documentRequirementId: requirement._id,
              mimeType: detected,
              originalFilename,
              ownerUserId: registration.userId,
              provider: stored.provider,
              providerDeliveryType: stored.deliveryType,
              providerFormat: stored.format,
              providerPublicId: stored.publicId,
              providerResourceType: stored.resourceType,
              ...(stored.assetId === undefined ? {} : { providerAssetId: stored.assetId }),
              ...(stored.version === undefined ? {} : { providerVersion: stored.version }),
              registrationId: registration._id,
              ...(prior === null ? {} : { replacedDocumentId: prior._id }),
              reviewStatus: 'PENDING_REVIEW',
              sizeBytes: stored.bytes,
              status: 'ACTIVE',
              storageDeletionStatus: 'NOT_REQUESTED',
              storageKey: stored.publicId,
              uploadStatus: 'AVAILABLE',
              versionNumber,
            },
          ],
          { session },
        );
        if (document === undefined) throw new Error('Document metadata creation failed.');
        await this.#audit.append(
          {
            action: prior === null ? 'STUDENT_DOCUMENT_UPLOADED' : 'STUDENT_DOCUMENT_REPLACED',
            actorType: 'USER',
            actorUserId: registration.userId,
            outcome: 'SUCCESS',
            requestId: input.requestId,
            targetId: document._id.toString(),
            targetType: 'StudentDocument',
          },
          session,
        );
        return document._id.toString();
      });
    } catch (error) {
      await this.#storage.remove(stored).catch(() => undefined);
      throw error;
    }
  }

  public async remove(documentId: string, userId: string, requestId: string): Promise<void> {
    const document = await StudentDocumentModel.findOne({
      _id: documentId,
      ownerUserId: userId,
      status: { $in: ['ACTIVE', 'REMOVAL_PENDING'] },
    }).select('+providerAssetId +providerPublicId +storageKey');
    if (document === null) throw new NotFoundError();
    if (document.status === 'ACTIVE') {
      await mongoose.connection.transaction(async (session) => {
        const editableRegistration = await StudentRegistrationModel.updateOne(
          {
            _id: document.registrationId,
            status: { $in: ['DRAFT', 'CHANGES_REQUESTED'] },
            userId,
          },
          { $inc: { version: 1 } },
          { session },
        );
        if (editableRegistration.modifiedCount !== 1)
          throw new ConflictError('Documents cannot be removed after submission.');
        const claimed = await StudentDocumentModel.updateOne(
          { _id: document._id, ownerUserId: userId, status: 'ACTIVE' },
          { $set: { status: 'REMOVAL_PENDING', storageDeletionStatus: 'PENDING' } },
          { session },
        );
        if (claimed.modifiedCount !== 1)
          throw new ConflictError('The document changed before it could be removed.');
      });
    } else {
      const editableRegistration = await StudentRegistrationModel.exists({
        _id: document.registrationId,
        status: { $in: ['DRAFT', 'CHANGES_REQUESTED'] },
        userId,
      });
      if (editableRegistration === null)
        throw new ConflictError('Documents cannot be removed after submission.');
    }
    try {
      await this.#storage.remove(storageObject(document));
    } catch (error) {
      await StudentDocumentModel.updateOne(
        { _id: document._id, ownerUserId: userId, status: 'REMOVAL_PENDING' },
        { $set: { status: 'ACTIVE', storageDeletionStatus: 'NOT_REQUESTED' } },
      );
      throw error;
    }
    await mongoose.connection.transaction(async (session) => {
      const removed = await StudentDocumentModel.updateOne(
        { _id: document._id, ownerUserId: userId, status: 'REMOVAL_PENDING' },
        {
          $set: {
            status: 'REMOVED',
            storageDeletedAt: new Date(),
            storageDeletionStatus: 'DELETED',
          },
        },
        { session },
      );
      if (removed.modifiedCount !== 1)
        throw new ConflictError('The document changed before removal could be finalized.');
      await this.#audit.append(
        {
          action: 'STUDENT_DOCUMENT_REMOVED',
          actorType: 'USER',
          actorUserId: document.ownerUserId,
          outcome: 'SUCCESS',
          requestId,
          targetId: document._id.toString(),
          targetType: 'StudentDocument',
        },
        session,
      );
    });
  }

  public async download(
    documentId: string,
    actor: { permissions: readonly string[]; userId: string },
  ): Promise<{ displayName: string; stored: StoredDocument }> {
    const document = await StudentDocumentModel.findOne({
      _id: documentId,
      status: 'ACTIVE',
      uploadStatus: 'AVAILABLE',
    }).select('+providerAssetId +providerPublicId +storageKey');
    if (document === null) throw new NotFoundError();
    const owns = document.ownerUserId.toString() === actor.userId;
    if (
      !owns &&
      !actor.permissions.includes('documents.read') &&
      !actor.permissions.includes('documents.review')
    )
      throw new NotFoundError();
    return {
      displayName: document.displayName,
      stored: await this.#storage.get(storageObject(document), document.mimeType),
    };
  }

  public async createDownloadAccess(
    documentId: string,
    actor: { permissions: readonly string[]; userId: string },
  ): Promise<StudentDocumentAccessDto> {
    const document = await StudentDocumentModel.findOne({
      _id: documentId,
      status: 'ACTIVE',
      uploadStatus: 'AVAILABLE',
    }).select('+providerAssetId +providerPublicId +storageKey');
    if (document === null) throw new NotFoundError();
    const owns = document.ownerUserId.toString() === actor.userId;
    if (
      !owns &&
      !actor.permissions.includes('documents.read') &&
      !actor.permissions.includes('documents.review')
    )
      throw new NotFoundError();
    const expiresAt = new Date(Date.now() + this.#signedAccessTtlSeconds * 1000);
    const access = await this.#storage.createSignedAccess(storageObject(document), expiresAt);
    return access === null
      ? { delivery: 'PROXY' }
      : { delivery: 'SIGNED', expiresAt: access.expiresAt.toISOString(), url: access.url };
  }

  public async review(input: {
    actorUserId: string;
    documentId: string;
    note?: string;
    requestId: string;
    status: 'REJECTED' | 'VERIFIED';
  }): Promise<void> {
    if (input.status === 'REJECTED' && (input.note?.trim().length ?? 0) < 5)
      throw new ConflictError('A rejection reason is required.');
    const result = await StudentDocumentModel.updateOne(
      { _id: input.documentId, status: 'ACTIVE', uploadStatus: 'AVAILABLE' },
      {
        $set: {
          reviewNote: input.note,
          reviewStatus: input.status,
          reviewedAt: new Date(),
          reviewedByUserId: new mongoose.Types.ObjectId(input.actorUserId),
        },
      },
    );
    if (result.matchedCount !== 1) throw new NotFoundError();
    await this.#audit.append({
      action: `STUDENT_DOCUMENT_${input.status}`,
      actorType: 'USER',
      actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
      outcome: 'SUCCESS',
      ...(input.note === undefined ? {} : { reason: input.note }),
      requestId: input.requestId,
      targetId: input.documentId,
      targetType: 'StudentDocument',
    });
  }
}
