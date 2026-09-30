import mongoose, { type ClientSession, type Types } from 'mongoose';
import { z } from 'zod';

import {
  AppError,
  DomainConflictError,
  NotFoundError,
  ValidationError,
} from '../../../app/errors/app-error.js';
import {
  AcademicSessionModel,
  ClassLevelModel,
  SchoolSettingsModel,
  TermModel,
  TrackModel,
  type SchoolSettingsRecord,
} from '../../academics/infrastructure/academic-models.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import { normalizeEmail } from '../../identity/domain/identity-normalization.js';

const identityInputSchema = z
  .object({
    address: z.string().trim().min(5).max(500),
    contactEmail: z.email().max(254).optional(),
    contactPhone: z.string().trim().min(7).max(40).optional(),
    displayName: z.string().trim().min(2).max(160),
    motto: z.string().trim().min(2).max(240).optional(),
    websiteUrl: z
      .string()
      .trim()
      .max(500)
      .refine((value) => {
        try {
          const parsed = new URL(value);
          return parsed.protocol === 'https:' || parsed.protocol === 'http:';
        } catch {
          return false;
        }
      }, 'Website URL must use HTTP or HTTPS.')
      .optional(),
  })
  .strict();

export interface SchoolIdentitySettings {
  address: string;
  contactEmail?: string;
  contactPhone?: string;
  displayName: string;
  motto?: string;
  websiteUrl?: string;
}

export interface ClassPositionContextSettings {
  academicSessionId: string;
  classLevelId: string;
  enabled: boolean;
  termId: string;
  trackId?: string;
}

export interface SchoolSettingsSummary {
  classPositionContexts: readonly ClassPositionContextSettings[];
  currentAcademicSessionId?: string;
  currentRegistrationConfigurationId?: string;
  currentTermId?: string;
  id: string;
  schoolIdentity?: SchoolIdentitySettings;
  updatedAt: string;
  updatedByUserId?: string;
  version: number;
}

interface LeanSettings extends SchoolSettingsRecord {
  _id: Types.ObjectId;
  updatedAt: Date;
  version?: number;
}

function preconditionFailed(): AppError {
  return new AppError('School settings changed before this operation completed.', {
    code: 'PRECONDITION_FAILED',
    statusCode: 412,
  });
}

function mapIdentity(
  identity: SchoolSettingsRecord['schoolIdentity'],
): SchoolIdentitySettings | undefined {
  if (identity === undefined) return undefined;
  return {
    address: identity.address,
    displayName: identity.displayName,
    ...(identity.contactEmail === undefined ? {} : { contactEmail: identity.contactEmail }),
    ...(identity.contactPhone === undefined ? {} : { contactPhone: identity.contactPhone }),
    ...(identity.motto === undefined ? {} : { motto: identity.motto }),
    ...(identity.websiteUrl === undefined ? {} : { websiteUrl: identity.websiteUrl }),
  };
}

function mapSettings(settings: LeanSettings): SchoolSettingsSummary {
  const identity = mapIdentity(settings.schoolIdentity);
  return {
    classPositionContexts: (settings.classPositionContexts ?? []).map((context) => ({
      academicSessionId: context.academicSessionId.toString(),
      classLevelId: context.classLevelId.toString(),
      enabled: context.enabled,
      termId: context.termId.toString(),
      ...(context.trackId === undefined ? {} : { trackId: context.trackId.toString() }),
    })),
    id: settings._id.toString(),
    updatedAt: settings.updatedAt.toISOString(),
    version: settings.version ?? 0,
    ...(settings.currentAcademicSessionId === undefined
      ? {}
      : { currentAcademicSessionId: settings.currentAcademicSessionId.toString() }),
    ...(settings.currentRegistrationConfigurationId === undefined
      ? {}
      : {
          currentRegistrationConfigurationId:
            settings.currentRegistrationConfigurationId.toString(),
        }),
    ...(settings.currentTermId === undefined
      ? {}
      : { currentTermId: settings.currentTermId.toString() }),
    ...(identity === undefined ? {} : { schoolIdentity: identity }),
    ...(settings.updatedByUserId === undefined
      ? {}
      : { updatedByUserId: settings.updatedByUserId.toString() }),
  };
}

async function loadSettings(session?: ClientSession): Promise<LeanSettings | null> {
  return (await SchoolSettingsModel.findOne({ singletonKey: 'SCHOOL' })
    .session(session ?? null)
    .lean()) as unknown as LeanSettings | null;
}

export class SchoolSettingsService {
  readonly #auditWriter: AuditWriter;

  public constructor(auditWriter = new AuditWriter()) {
    this.#auditWriter = auditWriter;
  }

  public async get(): Promise<SchoolSettingsSummary | null> {
    const settings = await loadSettings();
    if (settings === null) return null;
    await this.#assertAcademicContextConsistency(settings);
    return mapSettings(settings);
  }

  public async updateIdentity(input: {
    actorSessionId?: string;
    actorUserId: string;
    expectedVersion: number;
    identity: SchoolIdentitySettings;
    requestId: string;
  }): Promise<SchoolSettingsSummary> {
    const parsed = identityInputSchema.parse(input.identity);
    const identity: SchoolIdentitySettings = {
      address: parsed.address,
      displayName: parsed.displayName,
      ...(parsed.contactEmail === undefined
        ? {}
        : { contactEmail: normalizeEmail(parsed.contactEmail) }),
      ...(parsed.contactPhone === undefined ? {} : { contactPhone: parsed.contactPhone }),
      ...(parsed.motto === undefined ? {} : { motto: parsed.motto }),
      ...(parsed.websiteUrl === undefined ? {} : { websiteUrl: parsed.websiteUrl }),
    };
    await mongoose.connection.transaction(async (session) => {
      const settings = await loadSettings(session);
      if (settings === null) {
        if (input.expectedVersion !== 0) throw preconditionFailed();
        const [created] = await SchoolSettingsModel.create(
          [
            {
              classPositionContexts: [],
              schoolIdentity: identity,
              singletonKey: 'SCHOOL',
              updatedByUserId: input.actorUserId,
            },
          ],
          { session },
        );
        if (created === undefined) throw new Error('School settings creation failed.');
        await this.#auditWriter.append(
          {
            action: 'SCHOOL_IDENTITY_CONFIGURED',
            ...(input.actorSessionId === undefined ? {} : { actorSessionId: input.actorSessionId }),
            actorType: 'USER',
            actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
            changes: { after: identity },
            outcome: 'SUCCESS',
            requestId: input.requestId,
            targetId: created._id.toString(),
            targetType: 'SchoolSettings',
          },
          session,
        );
        return;
      }
      if ((settings.version ?? 0) !== input.expectedVersion) throw preconditionFailed();
      const changed = await SchoolSettingsModel.updateOne(
        { _id: settings._id, version: input.expectedVersion },
        {
          $inc: { version: 1 },
          $set: { schoolIdentity: identity, updatedByUserId: input.actorUserId },
        },
        { session },
      );
      if (changed.modifiedCount !== 1) throw preconditionFailed();
      await this.#auditWriter.append(
        {
          action: 'SCHOOL_IDENTITY_UPDATED',
          ...(input.actorSessionId === undefined ? {} : { actorSessionId: input.actorSessionId }),
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
          changes: { after: identity, before: mapIdentity(settings.schoolIdentity) },
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: settings._id.toString(),
          targetType: 'SchoolSettings',
        },
        session,
      );
    });
    const updated = await this.get();
    if (updated === null) throw new Error('Updated school settings could not be loaded.');
    return updated;
  }

  public async setClassPositionContext(input: {
    academicSessionId: string;
    actorSessionId?: string;
    actorUserId: string;
    classLevelId: string;
    enabled: boolean;
    expectedVersion: number;
    requestId: string;
    termId: string;
    trackId?: string;
  }): Promise<SchoolSettingsSummary> {
    const identifiers = [
      input.academicSessionId,
      input.classLevelId,
      input.termId,
      ...(input.trackId === undefined ? [] : [input.trackId]),
    ];
    if (identifiers.some((identifier) => !mongoose.isValidObjectId(identifier))) {
      throw new ValidationError('The class-position reporting context is invalid.');
    }
    await mongoose.connection.transaction(async (session) => {
      const academicSession = await AcademicSessionModel.findById(input.academicSessionId)
        .session(session)
        .lean();
      const term = await TermModel.findById(input.termId).session(session).lean();
      const classLevel = await ClassLevelModel.findById(input.classLevelId).session(session).lean();
      const track =
        input.trackId === undefined
          ? null
          : await TrackModel.findById(input.trackId).session(session).lean();
      if (
        academicSession === null ||
        term === null ||
        classLevel === null ||
        term.academicSessionId.toString() !== academicSession._id.toString()
      ) {
        throw new NotFoundError('The reporting context was not found.');
      }
      if (classLevel.stage === 'SENIOR' && track === null) {
        throw new ValidationError('Senior reporting contexts require a track.');
      }
      if (classLevel.stage === 'JUNIOR' && input.trackId !== undefined) {
        throw new ValidationError('Junior reporting contexts cannot include a track.');
      }

      const settings = await loadSettings(session);
      if (settings === null) {
        throw new DomainConflictError(
          'Configure the school identity and academic context before result settings.',
        );
      }
      if ((settings.version ?? 0) !== input.expectedVersion) throw preconditionFailed();
      const normalizedTrackKey = track?._id.toString() ?? 'NONE';
      const contexts = settings.classPositionContexts ?? [];
      const matchingIndex = contexts.findIndex(
        (context) =>
          context.academicSessionId.toString() === academicSession._id.toString() &&
          context.termId.toString() === term._id.toString() &&
          context.classLevelId.toString() === classLevel._id.toString() &&
          context.normalizedTrackKey === normalizedTrackKey,
      );
      const nextContext = {
        academicSessionId: academicSession._id,
        classLevelId: classLevel._id,
        enabled: input.enabled,
        normalizedTrackKey,
        termId: term._id,
        ...(track === null ? {} : { trackId: track._id }),
      };
      const nextContexts = [...contexts];
      if (matchingIndex < 0) nextContexts.push(nextContext);
      else nextContexts[matchingIndex] = nextContext;
      const changed = await SchoolSettingsModel.updateOne(
        { _id: settings._id, version: input.expectedVersion },
        {
          $inc: { version: 1 },
          $set: {
            classPositionContexts: nextContexts,
            updatedByUserId: input.actorUserId,
          },
        },
        { session },
      );
      if (changed.modifiedCount !== 1) throw preconditionFailed();
      await this.#auditWriter.append(
        {
          action: 'CLASS_POSITION_CONFIGURATION_CHANGED',
          ...(input.actorSessionId === undefined ? {} : { actorSessionId: input.actorSessionId }),
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
          changes: {
            after: input.enabled,
            before: matchingIndex < 0 ? false : contexts[matchingIndex]?.enabled,
            context: {
              academicSessionId: input.academicSessionId,
              classLevelId: input.classLevelId,
              termId: input.termId,
              ...(input.trackId === undefined ? {} : { trackId: input.trackId }),
            },
          },
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: settings._id.toString(),
          targetType: 'SchoolSettings',
        },
        session,
      );
    });
    const updated = await this.get();
    if (updated === null) throw new Error('Updated school settings could not be loaded.');
    return updated;
  }

  async #assertAcademicContextConsistency(settings: LeanSettings): Promise<void> {
    const [activeSessions, activeTerms] = await Promise.all([
      AcademicSessionModel.find({ status: 'ACTIVE' }).select({ _id: 1 }).limit(2).lean(),
      TermModel.find({ status: 'ACTIVE' }).select({ _id: 1, academicSessionId: 1 }).limit(2).lean(),
    ]);
    const activeSession = activeSessions[0];
    const activeTerm = activeTerms[0];
    if (
      activeSessions.length > 1 ||
      activeTerms.length > 1 ||
      (activeSession === undefined) !== (settings.currentAcademicSessionId === undefined) ||
      (activeSession !== undefined &&
        settings.currentAcademicSessionId?.toString() !== activeSession._id.toString()) ||
      (activeTerm === undefined) !== (settings.currentTermId === undefined) ||
      (activeTerm !== undefined &&
        (settings.currentTermId?.toString() !== activeTerm._id.toString() ||
          activeTerm.academicSessionId.toString() !== activeSession?._id.toString()))
    ) {
      throw new DomainConflictError(
        'School settings and the authoritative active academic context disagree.',
      );
    }
  }
}
