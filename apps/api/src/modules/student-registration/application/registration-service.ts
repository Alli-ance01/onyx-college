import { randomUUID } from 'node:crypto';

import type {
  RegistrationConfigurationDto,
  RegistrationDraftInput,
  RegistrationDto,
  RegistrationStatus,
} from '@onyx/contracts';
import mongoose, { type ClientSession } from 'mongoose';

import { ConflictError, NotFoundError, ValidationError } from '../../../app/errors/app-error.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import {
  DocumentRequirementModel,
  StudentDocumentModel,
} from '../../documents/infrastructure/document-models.js';
import { OutboxEventModel } from '../../system/infrastructure/system-models.js';
import {
  assertRegistrationEditable,
  assertTransition,
  classifyDuplicateCandidate,
  normalizeHumanName,
  normalizePhone,
  normalizeRegistrationData,
  validateRegistrationForSubmission,
} from '../domain/registration-policy.js';
import {
  RegistrationFormConfigurationModel,
  StudentRegistrationModel,
} from '../infrastructure/registration-models.js';

type RegistrationData = Omit<RegistrationDraftInput, 'version'>;

function configurationDto(configuration: {
  _id: { toString(): string };
  canonicalFields: unknown[];
  customFields: unknown[];
  publishedAt: Date;
  versionNumber: number;
}): RegistrationConfigurationDto {
  return {
    canonicalFields:
      configuration.canonicalFields as unknown as RegistrationConfigurationDto['canonicalFields'],
    customFields:
      configuration.customFields as unknown as RegistrationConfigurationDto['customFields'],
    id: configuration._id.toString(),
    publishedAt: configuration.publishedAt.toISOString(),
    versionNumber: configuration.versionNumber,
  };
}

function changedPaths(previous: unknown, next: unknown, prefix = ''): string[] {
  if (JSON.stringify(previous) === JSON.stringify(next)) return [];
  if (
    previous === null ||
    next === null ||
    typeof previous !== 'object' ||
    typeof next !== 'object' ||
    Array.isArray(previous) ||
    Array.isArray(next)
  )
    return [prefix];
  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) =>
    changedPaths(before[key], after[key], prefix === '' ? key : `${prefix}.${key}`),
  );
}

export class RegistrationService {
  readonly #audit = new AuditWriter();

  async #toDto(
    registration: {
      _id: mongoose.Types.ObjectId;
      allowedCorrectionFields: string[];
      approvedStudentId?: mongoose.Types.ObjectId | null;
      configurationVersionId: mongoose.Types.ObjectId;
      createdAt?: Date;
      data: Record<string, unknown>;
      decisionReason?: string | null;
      duplicateCandidates: {
        confidence: 'FUZZY' | 'STRONG';
        matchedRegistrationId?: mongoose.Types.ObjectId;
        matchedStudentId?: mongoose.Types.ObjectId;
        status: string;
      }[];
      duplicateResolution?: string | null;
      reviewHistory: { action: string; at: Date; note?: string }[];
      status: RegistrationStatus;
      submittedAt?: Date | null;
      updatedAt?: Date;
      version: number;
    },
    includeSensitive = true,
  ): Promise<RegistrationDto> {
    const [configuration, documents] = await Promise.all([
      RegistrationFormConfigurationModel.findById(registration.configurationVersionId).lean(),
      StudentDocumentModel.find({
        registrationId: registration._id,
        status: 'ACTIVE',
        uploadStatus: 'AVAILABLE',
      })
        .sort({ createdAt: 1 })
        .lean(),
    ]);
    if (configuration === null) throw new Error('Registration configuration version is missing.');
    const data = normalizeRegistrationData(registration.data);
    return {
      allowedCorrectionFields: registration.allowedCorrectionFields,
      configuration: configurationDto(configuration),
      createdAt: (registration.createdAt ?? new Date()).toISOString(),
      data: includeSensitive ? data : { ...data, medical: {} },
      documents: documents.map((document) => ({
        createdAt: document.createdAt.toISOString(),
        displayName: document.displayName,
        documentRequirementId: document.documentRequirementId.toString(),
        id: document._id.toString(),
        mimeType: document.mimeType,
        reviewStatus: document.reviewStatus,
        sizeBytes: document.sizeBytes,
        version: document.versionNumber,
        ...(document.reviewNote === undefined ? {} : { reviewNote: document.reviewNote }),
      })),
      duplicateReview: {
        candidates: registration.duplicateCandidates.map((candidate) => ({
          confidence: candidate.confidence,
          ...(candidate.matchedRegistrationId === undefined
            ? {}
            : { matchedRegistrationId: candidate.matchedRegistrationId.toString() }),
          ...(candidate.matchedStudentId === undefined
            ? {}
            : { matchedStudentId: candidate.matchedStudentId.toString() }),
          status: candidate.status,
        })),
        requiresReview: registration.duplicateCandidates.some(
          ({ confidence }) => confidence === 'STRONG',
        ),
        ...(registration.duplicateResolution === undefined ||
        registration.duplicateResolution === null
          ? {}
          : {
              resolution: registration.duplicateResolution as
                'CONFIRMED_DISTINCT' | 'DUPLICATE_REJECTED' | 'ORIGINAL_REOPENED',
            }),
      },
      id: registration._id.toString(),
      reviewHistory: registration.reviewHistory.map((event) => ({
        action: event.action,
        at: event.at.toISOString(),
        ...(event.note === undefined ? {} : { note: event.note }),
      })),
      status: registration.status,
      updatedAt: (registration.updatedAt ?? new Date()).toISOString(),
      version: registration.version,
      ...(registration.approvedStudentId == null
        ? {}
        : { approvedStudentId: registration.approvedStudentId.toString() }),
      ...(registration.decisionReason == null
        ? {}
        : { decisionReason: registration.decisionReason }),
      ...(registration.submittedAt == null
        ? {}
        : { submittedAt: registration.submittedAt.toISOString() }),
    };
  }

  public async getMine(userId: string): Promise<RegistrationDto> {
    const registration = await StudentRegistrationModel.findOne({ userId }).lean();
    if (registration === null) throw new NotFoundError();
    return this.#toDto(registration);
  }

  public async saveMine(userId: string, input: RegistrationDraftInput): Promise<RegistrationDto> {
    const current = await StudentRegistrationModel.findOne({ userId }).lean();
    if (current === null) throw new NotFoundError();
    assertRegistrationEditable(current.status);
    if (current.version !== input.version)
      throw new ConflictError('This registration was updated elsewhere. Reload before saving.');
    const data: RegistrationData = {
      academic: input.academic,
      contact: input.contact,
      customResponses: input.customResponses ?? {},
      guardian: input.guardian,
      medical: input.medical,
      personal: input.personal,
    };
    if (current.status === 'CHANGES_REQUESTED') {
      const unauthorized = changedPaths(normalizeRegistrationData(current.data), data).filter(
        (path) =>
          !current.allowedCorrectionFields.some(
            (allowed) => path === allowed || path.startsWith(`${allowed}.`),
          ),
      );
      if (unauthorized.length > 0)
        throw new ConflictError('Only the fields identified by the reviewer may be changed.');
    }
    const updated = await StudentRegistrationModel.findOneAndUpdate(
      { _id: current._id, version: input.version, status: current.status },
      { $set: { data }, $inc: { version: 1 } },
      { new: true },
    ).lean();
    if (updated === null)
      throw new ConflictError('This registration was updated elsewhere. Reload before saving.');
    return this.#toDto(updated);
  }

  public async submitMine(userId: string, requestId: string): Promise<RegistrationDto> {
    const registration = await StudentRegistrationModel.findOne({ userId }).select(
      '+normalizedFirstName +normalizedSurname +normalizedDateOfBirth +normalizedGuardianPhone',
    );
    if (registration === null) throw new NotFoundError();
    assertTransition(registration.status, ['DRAFT', 'CHANGES_REQUESTED'], 'submitted');
    const [configuration, requiredRequirements] = await Promise.all([
      RegistrationFormConfigurationModel.findById(registration.configurationVersionId).lean(),
      DocumentRequirementModel.find({ active: true, requiredForRegistration: true }).lean(),
    ]);
    const passportRequirement = requiredRequirements.find(
      ({ code }) => code === 'PASSPORT_PHOTOGRAPH',
    );
    if (configuration === null || passportRequirement === undefined)
      throw new ConflictError('Registration configuration is unavailable.');
    const availableDocuments = await StudentDocumentModel.find({
      registrationId: registration._id,
      status: 'ACTIVE',
      uploadStatus: 'AVAILABLE',
    })
      .select({ documentRequirementId: 1 })
      .lean();
    const availableRequirementIds = new Set(
      availableDocuments.map(({ documentRequirementId }) => documentRequirementId.toString()),
    );
    const missingRequirements = requiredRequirements.filter(
      ({ _id }) => !availableRequirementIds.has(_id.toString()),
    );
    if (missingRequirements.length > 0)
      throw new ValidationError('All required registration documents must be uploaded.', {
        issues: missingRequirements.map(({ code }) => ({
          code: 'REQUIRED_DOCUMENT',
          message: 'This required document has not been uploaded.',
          path: `documents.${code}`,
        })),
      });
    const data = normalizeRegistrationData(registration.data);
    validateRegistrationForSubmission(
      data,
      configuration.canonicalFields,
      configuration.customFields,
      availableRequirementIds.has(passportRequirement._id.toString()),
    );
    const keys = {
      normalizedFirstName: normalizeHumanName(data.personal.firstName ?? ''),
      normalizedSurname: normalizeHumanName(data.personal.surname ?? ''),
      normalizedDateOfBirth: data.personal.dateOfBirth ?? '',
      normalizedGuardianPhone: normalizePhone(data.guardian.phone ?? ''),
    };
    const possible = await StudentRegistrationModel.find({
      _id: { $ne: registration._id },
      status: { $in: ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'] },
      $or: Object.entries(keys).map(([key, value]) => ({ [key]: value })),
    })
      .select(
        '+normalizedFirstName +normalizedSurname +normalizedDateOfBirth +normalizedGuardianPhone',
      )
      .lean();
    const duplicateCandidates = possible.flatMap((candidate) => {
      const classification = classifyDuplicateCandidate(keys, candidate);
      if (classification === null) return [];
      return [
        {
          ...classification,
          matchedRegistrationId: candidate._id,
          ...(candidate.approvedStudentId === undefined
            ? {}
            : { matchedStudentId: candidate.approvedStudentId }),
          status: candidate.status,
        },
      ];
    });
    const now = new Date();
    const action =
      registration.status === 'CHANGES_REQUESTED'
        ? 'REGISTRATION_RESUBMITTED'
        : 'REGISTRATION_SUBMITTED';
    await mongoose.connection.transaction(async (session) => {
      const transactionRequirements = await DocumentRequirementModel.find({
        active: true,
        requiredForRegistration: true,
      })
        .session(session)
        .lean();
      const transactionDocuments = await StudentDocumentModel.find({
        registrationId: registration._id,
        status: 'ACTIVE',
        uploadStatus: 'AVAILABLE',
      })
        .select({ documentRequirementId: 1 })
        .session(session)
        .lean();
      const transactionDocumentIds = new Set(
        transactionDocuments.map(({ documentRequirementId }) => documentRequirementId.toString()),
      );
      if (transactionRequirements.some(({ _id }) => !transactionDocumentIds.has(_id.toString())))
        throw new ConflictError(
          'Required documents changed before submission. Review the document section and try again.',
        );
      const result = await StudentRegistrationModel.updateOne(
        { _id: registration._id, status: registration.status },
        {
          $set: {
            ...keys,
            duplicateCandidates,
            status: 'SUBMITTED',
            submittedAt: now,
            submittedData: data,
          },
          $unset: { decisionReason: 1 },
          $push: { reviewHistory: { action, actorUserId: registration.userId, at: now } },
        },
        { session },
      );
      if (result.modifiedCount !== 1)
        throw new ConflictError('The registration state changed before it could be submitted.');
      await RegistrationFormConfigurationModel.updateOne(
        { _id: configuration._id, immutableSince: { $exists: false } },
        { $set: { immutableSince: now } },
        { session },
      );
      await this.#audit.append(
        {
          action,
          actorType: 'USER',
          actorUserId: registration.userId,
          outcome: 'SUCCESS',
          requestId,
          targetId: registration._id.toString(),
          targetType: 'StudentRegistration',
        },
        session,
      );
      await OutboxEventModel.create(
        [
          {
            aggregateId: registration._id.toString(),
            aggregateType: 'StudentRegistration',
            eventId: randomUUID(),
            eventType:
              action === 'REGISTRATION_RESUBMITTED'
                ? 'RegistrationResubmitted'
                : 'RegistrationSubmitted',
            occurredAt: now,
            payload: { registrationId: registration._id.toString() },
            status: 'PENDING',
            transactionActorId: registration.userId,
          },
        ],
        { session },
      );
    });
    return this.getMine(userId);
  }

  public async listAdmin(filters: {
    duplicateReview?: boolean;
    q?: string;
    status?: RegistrationStatus;
  }): Promise<RegistrationDto[]> {
    const query: Record<string, unknown> = {};
    if (filters.status !== undefined) query.status = filters.status;
    if (filters.duplicateReview === true) {
      query['duplicateCandidates.0'] = { $exists: true };
      query.duplicateResolution = { $exists: false };
    }
    if (filters.q !== undefined && filters.q.trim() !== '') {
      const value = filters.q.trim().slice(0, 100);
      query.$or = [
        {
          'data.personal.surname': new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'iu'),
        },
        {
          'data.personal.firstName': new RegExp(
            value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'),
            'iu',
          ),
        },
      ];
    }
    const registrations = await StudentRegistrationModel.find(query)
      .sort({ submittedAt: 1, _id: 1 })
      .limit(100)
      .lean();
    return Promise.all(registrations.map((item) => this.#toDto(item, false)));
  }

  public async getAdmin(
    registrationId: string,
    includeSensitive = false,
  ): Promise<RegistrationDto> {
    const registration = await StudentRegistrationModel.findById(registrationId).lean();
    if (registration === null) throw new NotFoundError();
    return this.#toDto(registration, includeSensitive);
  }

  public async transitionAdmin(input: {
    action: 'BEGIN_REVIEW' | 'REJECT' | 'REOPEN' | 'REQUEST_CHANGES';
    actorUserId: string;
    allowedCorrectionFields?: string[];
    note?: string;
    registrationId: string;
    requestId: string;
  }): Promise<RegistrationDto> {
    const registration = await StudentRegistrationModel.findById(input.registrationId);
    if (registration === null) throw new NotFoundError();
    const rules = {
      BEGIN_REVIEW: { allowed: ['SUBMITTED'], next: 'UNDER_REVIEW' },
      REQUEST_CHANGES: { allowed: ['UNDER_REVIEW'], next: 'CHANGES_REQUESTED' },
      REJECT: { allowed: ['UNDER_REVIEW'], next: 'REJECTED' },
      REOPEN: { allowed: ['REJECTED'], next: 'UNDER_REVIEW' },
    } as const;
    const rule = rules[input.action];
    assertTransition(registration.status, rule.allowed, input.action.toLocaleLowerCase('en-US'));
    if (
      input.action !== 'BEGIN_REVIEW' &&
      (input.note === undefined || input.note.trim().length < 5)
    )
      throw new ConflictError('A clear reason is required for this decision.');
    if (input.action === 'REQUEST_CHANGES' && (input.allowedCorrectionFields?.length ?? 0) === 0)
      throw new ConflictError('Identify at least one field that requires correction.');
    const now = new Date();
    const actor = new mongoose.Types.ObjectId(input.actorUserId);
    await mongoose.connection.transaction(async (session: ClientSession) => {
      const result = await StudentRegistrationModel.updateOne(
        { _id: registration._id, status: registration.status },
        {
          $set: {
            status: rule.next,
            decisionReason: input.note,
            allowedCorrectionFields:
              input.action === 'REQUEST_CHANGES' ? input.allowedCorrectionFields : [],
          },
          $push: {
            reviewHistory: {
              action: input.action,
              actorUserId: actor,
              at: now,
              note: input.note,
              fields: input.allowedCorrectionFields,
            },
          },
        },
        { session },
      );
      if (result.modifiedCount !== 1)
        throw new ConflictError('The registration changed before the action completed.');
      await this.#audit.append(
        {
          action: `REGISTRATION_${input.action}`,
          actorType: 'USER',
          actorUserId: actor,
          outcome: 'SUCCESS',
          ...(input.note === undefined ? {} : { reason: input.note }),
          requestId: input.requestId,
          targetId: registration._id.toString(),
          targetType: 'StudentRegistration',
        },
        session,
      );
      await OutboxEventModel.create(
        [
          {
            aggregateId: registration._id.toString(),
            aggregateType: 'StudentRegistration',
            eventId: randomUUID(),
            eventType: `Registration${input.action
              .split('_')
              .map((word) => word.charAt(0) + word.slice(1).toLocaleLowerCase('en-US'))
              .join('')}`,
            occurredAt: now,
            payload: {
              registrationId: registration._id.toString(),
              userId: registration.userId.toString(),
            },
            status: 'PENDING',
            transactionActorId: actor,
          },
        ],
        { session },
      );
    });
    return this.getAdmin(input.registrationId);
  }

  public async resolveDuplicate(input: {
    actorUserId: string;
    reason: string;
    registrationId: string;
    requestId: string;
    resolution: 'CONFIRMED_DISTINCT' | 'DUPLICATE_REJECTED' | 'ORIGINAL_REOPENED';
  }): Promise<RegistrationDto> {
    const actor = new mongoose.Types.ObjectId(input.actorUserId);
    const registration = await StudentRegistrationModel.findById(input.registrationId);
    if (registration === null) throw new NotFoundError();
    if (registration.status !== 'UNDER_REVIEW' || registration.duplicateResolution !== undefined)
      throw new ConflictError(
        'Only an unresolved registration under review can receive a duplicate decision.',
      );
    if (!registration.duplicateCandidates.some(({ confidence }) => confidence === 'STRONG'))
      throw new ConflictError('This registration has no strong duplicate candidate to resolve.');
    await mongoose.connection.transaction(async (session) => {
      const now = new Date();
      const duplicateStatus =
        input.resolution === 'CONFIRMED_DISTINCT' ? registration.status : 'REJECTED';
      const resolved = await StudentRegistrationModel.updateOne(
        {
          _id: registration._id,
          duplicateResolution: { $exists: false },
          status: 'UNDER_REVIEW',
        },
        {
          $set: {
            duplicateResolution: input.resolution,
            duplicateResolutionReason: input.reason,
            duplicateResolvedAt: now,
            duplicateResolvedByUserId: actor,
            status: duplicateStatus,
            ...(duplicateStatus === 'REJECTED' ? { decisionReason: input.reason } : {}),
          },
          $push: {
            reviewHistory: {
              action: `DUPLICATE_${input.resolution}`,
              actorUserId: actor,
              at: now,
              note: input.reason,
            },
          },
        },
        { session },
      );
      if (resolved.modifiedCount !== 1)
        throw new ConflictError('The duplicate case changed before the decision completed.');
      if (input.resolution === 'ORIGINAL_REOPENED') {
        const rejectedCandidate = registration.duplicateCandidates.find(
          (candidate) =>
            candidate.confidence === 'STRONG' &&
            candidate.status === 'REJECTED' &&
            candidate.matchedRegistrationId !== undefined,
        );
        if (rejectedCandidate?.matchedRegistrationId === undefined)
          throw new ConflictError('No rejected original registration is available to reopen.');
        const reopened = await StudentRegistrationModel.updateOne(
          { _id: rejectedCandidate.matchedRegistrationId, status: 'REJECTED' },
          {
            $set: { status: 'UNDER_REVIEW', decisionReason: input.reason },
            $push: {
              reviewHistory: {
                action: 'REOPENED_FROM_DUPLICATE_REVIEW',
                actorUserId: actor,
                at: now,
                note: input.reason,
              },
            },
          },
          { session },
        );
        if (reopened.modifiedCount !== 1)
          throw new ConflictError(
            'The original rejected registration is no longer eligible to reopen.',
          );
      }
      await this.#audit.append(
        {
          action: 'REGISTRATION_DUPLICATE_RESOLVED',
          actorType: 'USER',
          actorUserId: actor,
          changes: { resolution: input.resolution },
          outcome: 'SUCCESS',
          reason: input.reason,
          requestId: input.requestId,
          targetId: input.registrationId,
          targetType: 'StudentRegistration',
        },
        session,
      );
    });
    return this.getAdmin(input.registrationId);
  }
}
