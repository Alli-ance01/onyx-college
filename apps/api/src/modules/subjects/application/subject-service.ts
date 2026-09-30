import type {
  CurriculumSubjectDto,
  EnrollmentSubjectOverrideDto,
  SubjectDto,
  SubjectOfferingDto,
} from '@onyx/contracts';
import mongoose from 'mongoose';

import { ConflictError, NotFoundError, ValidationError } from '../../../app/errors/app-error.js';
import {
  AcademicSessionModel,
  ClassLevelModel,
  TrackModel,
} from '../../academics/infrastructure/academic-models.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import { EnrollmentModel } from '../../enrollments/infrastructure/enrollment-model.js';
import {
  EnrollmentSubjectOverrideModel,
  SubjectModel,
  SubjectOfferingModel,
} from '../infrastructure/subject-models.js';

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

function subjectDto(subject: {
  _id: mongoose.Types.ObjectId;
  code: string;
  description?: string;
  name: string;
  status: 'ACTIVE' | 'RETIRED';
  version: number;
}): SubjectDto {
  return {
    code: subject.code,
    id: subject._id.toString(),
    name: subject.name,
    status: subject.status,
    version: subject.version,
    ...(subject.description === undefined ? {} : { description: subject.description }),
  };
}

export class SubjectService {
  readonly #audit = new AuditWriter();

  public async listSubjects(): Promise<SubjectDto[]> {
    const subjects = await SubjectModel.find().sort({ status: 1, name: 1 }).lean();
    return subjects.map(subjectDto);
  }

  public async createSubject(input: {
    actorUserId: string;
    code: string;
    description?: string;
    name: string;
    requestId: string;
  }): Promise<SubjectDto> {
    const code = input.code.trim().toLocaleUpperCase('en-US');
    const name = input.name.trim().replace(/\s+/gu, ' ');
    if (!/^[A-Z0-9_-]{2,20}$/u.test(code)) throw new ValidationError('Subject code is invalid.');
    try {
      const subject = await SubjectModel.create({
        code,
        name,
        normalizedName: normalizedName(name),
        status: 'ACTIVE',
        ...(input.description === undefined ? {} : { description: input.description.trim() }),
      });
      await this.#audit.append({
        action: 'SUBJECT_CREATED',
        actorType: 'USER',
        actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
        changes: { code, name },
        outcome: 'SUCCESS',
        requestId: input.requestId,
        targetId: subject._id.toString(),
        targetType: 'Subject',
      });
      return subjectDto(subject.toObject());
    } catch (error) {
      if (error instanceof Error && error.name === 'MongoServerError')
        throw new ConflictError('A subject with this code or name already exists.');
      throw error;
    }
  }

  public async updateSubject(input: {
    actorUserId: string;
    description?: string;
    name?: string;
    requestId: string;
    status?: 'ACTIVE' | 'RETIRED';
    subjectId: string;
  }): Promise<SubjectDto> {
    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name.trim().replace(/\s+/gu, ' ');
      changes.name = name;
      changes.normalizedName = normalizedName(name);
    }
    if (input.description !== undefined) changes.description = input.description.trim();
    if (input.status !== undefined) changes.status = input.status;
    const subject = await SubjectModel.findByIdAndUpdate(
      input.subjectId,
      { $set: changes },
      { new: true },
    );
    if (subject === null) throw new NotFoundError();
    await this.#audit.append({
      action: 'SUBJECT_UPDATED',
      actorType: 'USER',
      actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
      changes,
      outcome: 'SUCCESS',
      requestId: input.requestId,
      targetId: subject._id.toString(),
      targetType: 'Subject',
    });
    return subjectDto(subject.toObject());
  }

  public async listOfferings(filters: {
    academicSessionId?: string;
    classLevelId?: string;
    trackId?: string;
  }): Promise<SubjectOfferingDto[]> {
    const query: Record<string, unknown> = {};
    if (filters.academicSessionId !== undefined)
      query.academicSessionId = filters.academicSessionId;
    if (filters.classLevelId !== undefined) query.classLevelId = filters.classLevelId;
    if (filters.trackId !== undefined) query.trackId = filters.trackId;
    const offerings = await SubjectOfferingModel.find(query)
      .populate('academicSessionId', 'label')
      .populate('classLevelId', 'code name stage')
      .populate('subjectId', 'code name')
      .populate('trackId', 'code name')
      .sort({ academicSessionId: -1, classLevelId: 1 })
      .lean();
    return offerings.map((item) => {
      const session = item.academicSessionId as unknown as {
        _id: mongoose.Types.ObjectId;
        label: string;
      };
      const classLevel = item.classLevelId as unknown as {
        _id: mongoose.Types.ObjectId;
        code: string;
        name: string;
        stage: 'JUNIOR' | 'SENIOR';
      };
      const subject = item.subjectId as unknown as {
        _id: mongoose.Types.ObjectId;
        code: string;
        name: string;
      };
      const track = item.trackId as unknown as
        { _id: mongoose.Types.ObjectId; code: string; name: string } | undefined;
      return {
        academicSession: { id: session._id.toString(), label: session.label },
        classification: item.classification,
        classLevel: {
          code: classLevel.code,
          id: classLevel._id.toString(),
          name: classLevel.name,
          stage: classLevel.stage,
        },
        id: item._id.toString(),
        status: item.status,
        subject: { code: subject.code, id: subject._id.toString(), name: subject.name },
        version: item.version,
        ...(track === undefined
          ? {}
          : { track: { code: track.code, id: track._id.toString(), name: track.name } }),
      };
    });
  }

  public async createOffering(input: {
    academicSessionId: string;
    actorUserId: string;
    classification: 'OPTIONAL' | 'REQUIRED';
    classLevelId: string;
    requestId: string;
    subjectId: string;
    trackId?: string;
  }): Promise<string> {
    const [session, classLevel, subject, track] = await Promise.all([
      AcademicSessionModel.findById(input.academicSessionId).lean(),
      ClassLevelModel.findById(input.classLevelId).lean(),
      SubjectModel.findById(input.subjectId).lean(),
      input.trackId === undefined ? null : TrackModel.findById(input.trackId).lean(),
    ]);
    if (session === null || classLevel === null || subject?.status !== 'ACTIVE')
      throw new NotFoundError();
    if (classLevel.stage === 'JUNIOR' && input.trackId !== undefined)
      throw new ValidationError('Junior subject offerings cannot have a senior track.');
    if (classLevel.stage === 'SENIOR' && track === null)
      throw new ValidationError('Senior subject offerings require a valid track.');
    try {
      const offering = await SubjectOfferingModel.create({
        academicSessionId: session._id,
        classification: input.classification,
        classLevelId: classLevel._id,
        normalizedTrackKey: track?._id.toString() ?? 'NONE',
        status: session.status === 'DRAFT' ? 'PLANNED' : 'ACTIVE',
        subjectId: subject._id,
        ...(track === null ? {} : { trackId: track._id }),
      });
      await this.#audit.append({
        action: 'SUBJECT_OFFERING_CREATED',
        actorType: 'USER',
        actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
        changes: { classification: input.classification },
        outcome: 'SUCCESS',
        requestId: input.requestId,
        targetId: offering._id.toString(),
        targetType: 'SubjectOffering',
      });
      return offering._id.toString();
    } catch (error) {
      if (error instanceof Error && error.name === 'MongoServerError')
        throw new ConflictError('This subject offering already exists.');
      throw error;
    }
  }

  public async curriculumForEnrollment(enrollmentId: string): Promise<CurriculumSubjectDto[]> {
    const enrollment = await EnrollmentModel.findById(enrollmentId).lean();
    if (enrollment === null) throw new NotFoundError();
    const [offerings, overrides] = await Promise.all([
      SubjectOfferingModel.find({
        academicSessionId: enrollment.academicSessionId,
        classLevelId: enrollment.classLevelId,
        normalizedTrackKey: enrollment.trackId?.toString() ?? 'NONE',
        status: { $in: ['ACTIVE', 'PLANNED'] },
      })
        .populate('subjectId', 'code name')
        .lean(),
      EnrollmentSubjectOverrideModel.find({ enrollmentId, status: 'ACTIVE' }).lean(),
    ]);
    const overrideBySubject = new Map(
      overrides.map((item) => [item.subjectId.toString(), item.action]),
    );
    return offerings
      .filter((item) => {
        const action = overrideBySubject.get(item.subjectId._id.toString());
        return item.classification === 'REQUIRED' ? action !== 'REMOVE' : action === 'ADD';
      })
      .map((item) => {
        const subject = item.subjectId as unknown as {
          _id: mongoose.Types.ObjectId;
          code: string;
          name: string;
        };
        const action = overrideBySubject.get(subject._id.toString());
        return {
          classification: item.classification,
          offeringId: item._id.toString(),
          subject: { code: subject.code, id: subject._id.toString(), name: subject.name },
          ...(action === undefined ? {} : { overrideAction: action }),
        };
      });
  }

  public async setOverride(input: {
    action: 'ADD' | 'REMOVE';
    actorUserId: string;
    enrollmentId: string;
    reason: string;
    requestId: string;
    subjectId: string;
  }): Promise<EnrollmentSubjectOverrideDto> {
    const [enrollment, subject] = await Promise.all([
      EnrollmentModel.findById(input.enrollmentId).lean(),
      SubjectModel.findById(input.subjectId).lean(),
    ]);
    if (enrollment === null || subject === null) throw new NotFoundError();
    const offering = await SubjectOfferingModel.findOne({
      academicSessionId: enrollment.academicSessionId,
      classLevelId: enrollment.classLevelId,
      normalizedTrackKey: enrollment.trackId?.toString() ?? 'NONE',
      status: { $in: ['ACTIVE', 'PLANNED'] },
      subjectId: subject._id,
    }).lean();
    if (offering === null)
      throw new ConflictError('The subject is not offered for this placement.');
    if (input.action === 'ADD' && offering.classification !== 'OPTIONAL')
      throw new ConflictError('ADD is reserved for optional subject offerings.');
    if (input.action === 'REMOVE' && offering.classification !== 'REQUIRED')
      throw new ConflictError('REMOVE is reserved for required subject offerings.');
    const actorId = new mongoose.Types.ObjectId(input.actorUserId);
    const result = await mongoose.connection.transaction(async (session) => {
      const record = await EnrollmentSubjectOverrideModel.findOneAndUpdate(
        { enrollmentId: enrollment._id, subjectId: subject._id },
        {
          $set: {
            action: input.action,
            actorUserId: actorId,
            auditCorrelationId: input.requestId,
            reason: input.reason,
            status: 'ACTIVE',
          },
          $unset: { revokedAt: 1, revokedByUserId: 1 },
        },
        { new: true, session, upsert: true },
      );
      await this.#audit.append(
        {
          action: 'ENROLLMENT_SUBJECT_OVERRIDE_SET',
          actorType: 'USER',
          actorUserId: actorId,
          changes: { action: input.action, reason: input.reason },
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: record._id.toString(),
          targetType: 'EnrollmentSubjectOverride',
        },
        session,
      );
      return record;
    });
    return {
      action: result.action,
      createdAt: result.createdAt.toISOString(),
      enrollmentId: result.enrollmentId.toString(),
      id: result._id.toString(),
      reason: result.reason,
      status: result.status,
      subject: { code: subject.code, id: subject._id.toString(), name: subject.name },
    };
  }
}
