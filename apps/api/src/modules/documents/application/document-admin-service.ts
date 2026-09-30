import mongoose from 'mongoose';

import { ConflictError, NotFoundError, ValidationError } from '../../../app/errors/app-error.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import {
  DocumentRequirementModel,
  StudentDocumentModel,
} from '../infrastructure/document-models.js';

export interface DocumentRequirementSummary {
  acceptedMimeTypes: readonly string[];
  active: boolean;
  code: string;
  description?: string;
  id: string;
  label: string;
  maximumBytes: number;
  requiredForRegistration: boolean;
}

export interface StudentDocumentAdminSummary {
  createdAt: string;
  displayName: string;
  id: string;
  mimeType: string;
  ownerName: string;
  ownerUserId: string;
  provider: 'CLOUDINARY' | 'LOCAL';
  registrationId: string;
  requirement: { code: string; id: string; label: string };
  reviewNote?: string;
  reviewStatus: 'PENDING_REVIEW' | 'REJECTED' | 'VERIFIED';
  sizeBytes: number;
  status: 'ACTIVE' | 'REMOVAL_PENDING' | 'REMOVED' | 'REPLACED';
  uploadStatus: 'AVAILABLE' | 'FAILED' | 'PENDING';
}

interface RequirementRecord {
  _id: mongoose.Types.ObjectId;
  acceptedMimeTypes: string[];
  active: boolean;
  code: string;
  description?: string;
  label: string;
  maximumBytes: number;
  requiredForRegistration: boolean;
}

function requirementSummary(record: RequirementRecord): DocumentRequirementSummary {
  return {
    acceptedMimeTypes: record.acceptedMimeTypes,
    active: record.active,
    code: record.code,
    id: record._id.toString(),
    label: record.label,
    maximumBytes: record.maximumBytes,
    requiredForRegistration: record.requiredForRegistration,
    ...(record.description === undefined ? {} : { description: record.description }),
  };
}

function duplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11_000;
}

export class DocumentAdminService {
  readonly #audit = new AuditWriter();

  public async listRequirements(): Promise<DocumentRequirementSummary[]> {
    const records = await DocumentRequirementModel.find().sort({ active: -1, label: 1 }).lean();
    return records.map(requirementSummary);
  }

  public async createRequirement(input: {
    acceptedMimeTypes: readonly string[];
    actorUserId: string;
    code: string;
    description?: string;
    label: string;
    maximumBytes: number;
    requestId: string;
    requiredForRegistration: boolean;
  }): Promise<DocumentRequirementSummary> {
    const code = input.code.trim().toLocaleUpperCase('en-US');
    if (!/^[A-Z0-9_]{2,64}$/u.test(code)) throw new ValidationError('Document code is invalid.');
    const mimeTypes = [...new Set(input.acceptedMimeTypes)];
    if (
      mimeTypes.length === 0 ||
      mimeTypes.some((value) => !['application/pdf', 'image/jpeg', 'image/png'].includes(value))
    ) {
      throw new ValidationError('Select one or more supported file types.');
    }
    try {
      const record = await DocumentRequirementModel.create({
        acceptedMimeTypes: mimeTypes,
        active: true,
        code,
        label: input.label.trim(),
        maximumBytes: input.maximumBytes,
        requiredForRegistration: input.requiredForRegistration,
        ...(input.description === undefined ? {} : { description: input.description.trim() }),
      });
      await this.#audit.append({
        action: 'DOCUMENT_REQUIREMENT_CREATED',
        actorType: 'USER',
        actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
        changes: { code, requiredForRegistration: input.requiredForRegistration },
        outcome: 'SUCCESS',
        requestId: input.requestId,
        targetId: record._id.toString(),
        targetType: 'DocumentRequirement',
      });
      return requirementSummary(record.toObject());
    } catch (error) {
      if (duplicateKey(error))
        throw new ConflictError('A document requirement already uses that code.');
      throw error;
    }
  }

  public async updateRequirement(input: {
    acceptedMimeTypes?: readonly string[];
    active?: boolean;
    actorUserId: string;
    description?: string;
    label?: string;
    maximumBytes?: number;
    requestId: string;
    requiredForRegistration?: boolean;
    requirementId: string;
  }): Promise<DocumentRequirementSummary> {
    const current = await DocumentRequirementModel.findById(input.requirementId).lean();
    if (current === null) throw new NotFoundError();
    if (
      current.code === 'PASSPORT_PHOTOGRAPH' &&
      (input.active === false || input.requiredForRegistration === false)
    ) {
      throw new ConflictError('The mandatory passport photograph requirement cannot be disabled.');
    }
    const changes: Record<string, unknown> = {};
    if (input.active !== undefined) changes.active = input.active;
    if (input.requiredForRegistration !== undefined)
      changes.requiredForRegistration = input.requiredForRegistration;
    if (input.label !== undefined) changes.label = input.label.trim();
    if (input.description !== undefined) changes.description = input.description.trim();
    if (input.maximumBytes !== undefined) changes.maximumBytes = input.maximumBytes;
    if (input.acceptedMimeTypes !== undefined) {
      const mimeTypes = [...new Set(input.acceptedMimeTypes)];
      if (
        mimeTypes.length === 0 ||
        mimeTypes.some((value) => !['application/pdf', 'image/jpeg', 'image/png'].includes(value))
      ) {
        throw new ValidationError('Select one or more supported file types.');
      }
      changes.acceptedMimeTypes = mimeTypes;
    }
    const updated = await DocumentRequirementModel.findByIdAndUpdate(
      current._id,
      { $set: changes },
      { new: true },
    );
    if (updated === null) throw new NotFoundError();
    await this.#audit.append({
      action: 'DOCUMENT_REQUIREMENT_UPDATED',
      actorType: 'USER',
      actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
      changes,
      outcome: 'SUCCESS',
      requestId: input.requestId,
      targetId: updated._id.toString(),
      targetType: 'DocumentRequirement',
    });
    return requirementSummary(updated.toObject());
  }

  public async listStudentDocuments(reviewStatus?: string): Promise<StudentDocumentAdminSummary[]> {
    const query: Record<string, unknown> = { status: 'ACTIVE' };
    if (['PENDING_REVIEW', 'REJECTED', 'VERIFIED'].includes(reviewStatus ?? ''))
      query.reviewStatus = reviewStatus;
    const records = await StudentDocumentModel.find(query)
      .populate('documentRequirementId', 'code label')
      .populate('registrationId', 'data submittedData')
      .sort({ createdAt: -1 })
      .limit(250)
      .lean();
    return records.map((record) => {
      const requirement = record.documentRequirementId as unknown as {
        _id: mongoose.Types.ObjectId;
        code: string;
        label: string;
      };
      const registration = record.registrationId as unknown as {
        _id: mongoose.Types.ObjectId;
        data?: { personal?: { firstName?: string; surname?: string } };
        submittedData?: { personal?: { firstName?: string; surname?: string } };
      };
      const personal = registration.submittedData?.personal ?? registration.data?.personal;
      return {
        createdAt: record.createdAt.toISOString(),
        displayName: record.displayName,
        id: record._id.toString(),
        mimeType: record.mimeType,
        ownerName:
          `${personal?.firstName ?? ''} ${personal?.surname ?? ''}`.trim() || 'Student applicant',
        ownerUserId: record.ownerUserId.toString(),
        provider: record.provider,
        registrationId: registration._id.toString(),
        requirement: {
          code: requirement.code,
          id: requirement._id.toString(),
          label: requirement.label,
        },
        reviewStatus: record.reviewStatus,
        sizeBytes: record.sizeBytes,
        status: record.status,
        uploadStatus: record.uploadStatus,
        ...(record.reviewNote === undefined ? {} : { reviewNote: record.reviewNote }),
      };
    });
  }
}
