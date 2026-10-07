import type { AcademicSessionDto, ClassLevelDto, TrackDto } from '@onyx/contracts';
import mongoose from 'mongoose';

import { ConflictError, NotFoundError, ValidationError } from '../../../app/errors/app-error.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import {
  AcademicSessionModel,
  ClassLevelModel,
  SchoolSettingsModel,
  TermModel,
  TrackModel,
} from '../infrastructure/academic-models.js';

const termNames = ['First Term', 'Second Term', 'Third Term'] as const;

function validateSessionLabel(label: string): void {
  if (!/^\d{4}\/\d{4}$/u.test(label))
    throw new ValidationError('Use an academic session such as 2026/2027.');
  const [start, end] = label.split('/').map(Number);
  if (start === undefined || end !== start + 1)
    throw new ValidationError('Academic session years must be consecutive.');
}

export class AcademicAdminService {
  readonly #audit = new AuditWriter();

  public async listSessions(): Promise<AcademicSessionDto[]> {
    const [sessions, terms] = await Promise.all([
      AcademicSessionModel.find().sort({ label: -1 }).lean(),
      TermModel.find().sort({ ordinal: 1 }).lean(),
    ]);
    return sessions.map((session) => ({
      id: session._id.toString(),
      label: session.label,
      status: session.status,
      terms: terms
        .filter((term) => term.academicSessionId.toString() === session._id.toString())
        .map((term) => ({
          academicSessionId: session._id.toString(),
          id: term._id.toString(),
          name: term.name,
          ordinal: term.ordinal,
          status: term.status,
          version: term.version,
        })),
      version: session.version,
    }));
  }

  public async createSession(input: {
    actorUserId: string;
    label: string;
    requestId: string;
  }): Promise<AcademicSessionDto> {
    validateSessionLabel(input.label);
    const actorId = new mongoose.Types.ObjectId(input.actorUserId);
    try {
      const sessionId = await mongoose.connection.transaction(async (databaseSession) => {
        const [academicSession] = await AcademicSessionModel.create(
          [{ label: input.label, status: 'DRAFT' }],
          { session: databaseSession },
        );
        if (academicSession === undefined) throw new Error('Academic session creation failed.');
        await TermModel.create(
          termNames.map((name, index) => ({
            academicSessionId: academicSession._id,
            name,
            ordinal: index + 1,
            status: 'PLANNED',
          })),
          { session: databaseSession, ordered: true },
        );
        await this.#audit.append(
          {
            action: 'ACADEMIC_SESSION_CREATED',
            actorType: 'USER',
            actorUserId: actorId,
            changes: { label: input.label },
            outcome: 'SUCCESS',
            requestId: input.requestId,
            targetId: academicSession._id.toString(),
            targetType: 'AcademicSession',
          },
          databaseSession,
        );
        return academicSession._id.toString();
      });
      const created = (await this.listSessions()).find(({ id }) => id === sessionId);
      if (created === undefined) throw new Error('Academic session could not be reloaded.');
      return created;
    } catch (error) {
      if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000)
        throw new ConflictError('This academic session already exists.');
      throw error;
    }
  }

  public async activateContext(input: {
    academicSessionId: string;
    actorUserId: string;
    requestId: string;
    termId: string;
  }): Promise<AcademicSessionDto[]> {
    const [targetSession, targetTerm] = await Promise.all([
      AcademicSessionModel.findById(input.academicSessionId).lean(),
      TermModel.findById(input.termId).lean(),
    ]);
    if (
      targetSession === null ||
      targetTerm?.academicSessionId.toString() !== targetSession._id.toString()
    )
      throw new NotFoundError();
    if (targetSession.status === 'ARCHIVED' || targetTerm.status === 'ARCHIVED')
      throw new ConflictError('Archived academic context cannot be activated.');
    const actorId = new mongoose.Types.ObjectId(input.actorUserId);
    await mongoose.connection.transaction(async (session) => {
      await AcademicSessionModel.updateMany(
        { status: 'ACTIVE', _id: { $ne: targetSession._id } },
        { $set: { status: 'CLOSED' } },
        { session },
      );
      await TermModel.updateMany(
        { status: 'ACTIVE', _id: { $ne: targetTerm._id } },
        { $set: { status: 'COMPLETED' } },
        { session },
      );
      const activatedSession = await AcademicSessionModel.updateOne(
        { _id: targetSession._id, status: { $in: ['DRAFT', 'CLOSED', 'ACTIVE'] } },
        { $set: { status: 'ACTIVE' } },
        { session },
      );
      const activatedTerm = await TermModel.updateOne(
        { _id: targetTerm._id, academicSessionId: targetSession._id },
        { $set: { status: 'ACTIVE' } },
        { session },
      );
      if (activatedSession.matchedCount !== 1 || activatedTerm.matchedCount !== 1)
        throw new ConflictError('The academic context changed before activation.');
      await SchoolSettingsModel.updateOne(
        { singletonKey: 'SCHOOL' },
        {
          $set: {
            currentAcademicSessionId: targetSession._id,
            currentTermId: targetTerm._id,
          },
        },
        { session, upsert: true },
      );
      await this.#audit.append(
        {
          action: 'ACADEMIC_CONTEXT_ACTIVATED',
          actorType: 'USER',
          actorUserId: actorId,
          changes: {
            academicSessionId: targetSession._id.toString(),
            termId: targetTerm._id.toString(),
          },
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: targetSession._id.toString(),
          targetType: 'AcademicSession',
        },
        session,
      );
    });
    return this.listSessions();
  }

  public async listClassLevels(): Promise<ClassLevelDto[]> {
    const records = await ClassLevelModel.find().sort({ order: 1 }).lean();
    return records.map((item) => ({
      code: item.code,
      id: item._id.toString(),
      name: item.name,
      order: item.order,
      stage: item.stage,
      status: item.status,
    }));
  }

  public async listTracks(): Promise<TrackDto[]> {
    const records = await TrackModel.find().sort({ name: 1 }).lean();
    return records.map((item) => ({
      code: item.code,
      id: item._id.toString(),
      name: item.name,
      status: item.status,
    }));
  }
}
