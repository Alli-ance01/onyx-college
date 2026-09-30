import type { EnrollmentDto, ProgressionOutcome } from '@onyx/contracts';
import mongoose from 'mongoose';

import { ConflictError, NotFoundError, ValidationError } from '../../../app/errors/app-error.js';
import {
  AcademicSessionModel,
  ClassLevelModel,
  TrackModel,
} from '../../academics/infrastructure/academic-models.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import { StudentModel } from '../../students/infrastructure/student-models.js';
import { OutboxEventModel } from '../../system/infrastructure/system-models.js';
import { EnrollmentModel } from '../infrastructure/enrollment-model.js';

export class EnrollmentService {
  readonly #audit = new AuditWriter();

  public async list(filters: {
    academicSessionId?: string;
    classLevelId?: string;
    studentId?: string;
    trackId?: string;
  }): Promise<EnrollmentDto[]> {
    const query: Record<string, unknown> = {};
    if (filters.academicSessionId !== undefined)
      query.academicSessionId = filters.academicSessionId;
    if (filters.classLevelId !== undefined) query.classLevelId = filters.classLevelId;
    if (filters.studentId !== undefined) query.studentId = filters.studentId;
    if (filters.trackId !== undefined) query.trackId = filters.trackId;
    const records = await EnrollmentModel.find(query)
      .populate('academicSessionId', 'label')
      .populate('classLevelId', 'code name stage')
      .populate('studentId', 'firstName middleName surname studentId')
      .populate('trackId', 'code name')
      .sort({ enrolledAt: -1 })
      .lean();
    return records.map((item) => {
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
      const student = item.studentId as unknown as {
        _id: mongoose.Types.ObjectId;
        firstName: string;
        middleName?: string;
        studentId: string;
        surname: string;
      };
      const track = item.trackId as unknown as
        { _id: mongoose.Types.ObjectId; code: string; name: string } | undefined;
      return {
        academicSession: { id: session._id.toString(), label: session.label },
        classLevel: {
          code: classLevel.code,
          id: classLevel._id.toString(),
          name: classLevel.name,
          stage: classLevel.stage,
        },
        enrolledAt: item.enrolledAt.toISOString(),
        id: item._id.toString(),
        status: item.status,
        student: {
          id: student._id.toString(),
          name: [student.surname, student.firstName, student.middleName].filter(Boolean).join(' '),
          studentId: student.studentId,
        },
        version: item.version,
        ...(track === undefined
          ? {}
          : { track: { code: track.code, id: track._id.toString(), name: track.name } }),
      };
    });
  }

  public async progress(input: {
    actorUserId: string;
    destinationClassLevelId?: string;
    destinationSessionId?: string;
    destinationTrackId?: string;
    enrollmentId: string;
    outcome: ProgressionOutcome;
    reason: string;
    requestId: string;
  }): Promise<{ destinationEnrollmentId?: string; outcome: ProgressionOutcome }> {
    const source = await EnrollmentModel.findById(input.enrollmentId).lean();
    if (source === null) throw new NotFoundError();
    if (source.status !== 'ACTIVE')
      throw new ConflictError('Only an active enrollment can progress.');
    const student = await StudentModel.findById(source.studentId).lean();
    if (student === null) throw new NotFoundError();

    if (['PROMOTE', 'REPEAT'].includes(input.outcome)) {
      if (input.destinationSessionId === undefined || input.destinationClassLevelId === undefined)
        throw new ValidationError('A destination session and class level are required.');
      const [sourceSession, destinationSession, sourceLevel, destinationLevel, track] =
        await Promise.all([
          AcademicSessionModel.findById(source.academicSessionId).lean(),
          AcademicSessionModel.findById(input.destinationSessionId).lean(),
          ClassLevelModel.findById(source.classLevelId).lean(),
          ClassLevelModel.findById(input.destinationClassLevelId).lean(),
          input.destinationTrackId === undefined
            ? null
            : TrackModel.findById(input.destinationTrackId).lean(),
        ]);
      if (
        sourceSession === null ||
        destinationSession === null ||
        sourceLevel === null ||
        destinationLevel === null
      )
        throw new NotFoundError();
      const sourceStart = Number(sourceSession.label.split('/').at(0));
      const destinationStart = Number(destinationSession.label.split('/').at(0));
      if (!Number.isInteger(sourceStart) || !Number.isInteger(destinationStart))
        throw new ConflictError('Academic session labels must use YYYY/YYYY format.');
      if (destinationStart !== sourceStart + 1)
        throw new ConflictError('Progression must target the next academic session.');
      if (
        input.outcome === 'REPEAT' &&
        destinationLevel._id.toString() !== sourceLevel._id.toString()
      )
        throw new ConflictError('A repeat must retain the same class level.');
      if (input.outcome === 'PROMOTE' && destinationLevel.order !== sourceLevel.order + 1)
        throw new ConflictError('A promotion must advance exactly one class level.');
      if (destinationLevel.stage === 'SENIOR' && track === null)
        throw new ValidationError('A senior destination requires a valid track.');
      if (destinationLevel.stage === 'JUNIOR' && input.destinationTrackId !== undefined)
        throw new ValidationError('A junior destination cannot have a track.');
    }

    if (input.outcome === 'GRADUATE') {
      const sourceLevel = await ClassLevelModel.findById(source.classLevelId).lean();
      if (sourceLevel?.code !== 'SS3') throw new ConflictError('Only SS3 completion can graduate.');
    }

    const actorId = new mongoose.Types.ObjectId(input.actorUserId);
    return mongoose.connection.transaction(async (session) => {
      const sourceStatus =
        input.outcome === 'REPEAT'
          ? 'REPEATED'
          : input.outcome === 'WITHDRAW'
            ? 'WITHDRAWN'
            : input.outcome === 'TRANSFER'
              ? 'TRANSFERRED'
              : input.outcome === 'GRADUATE'
                ? 'GRADUATED'
                : 'COMPLETED';
      const updated = await EnrollmentModel.updateOne(
        { _id: source._id, status: 'ACTIVE' },
        { $set: { outcome: input.outcome, status: sourceStatus } },
        { session },
      );
      if (updated.modifiedCount !== 1)
        throw new ConflictError('The enrollment changed before progression completed.');

      let destinationEnrollmentId: string | undefined;
      if (input.outcome === 'PROMOTE' || input.outcome === 'REPEAT') {
        if (input.destinationSessionId === undefined || input.destinationClassLevelId === undefined)
          throw new ValidationError('A destination session and class level are required.');
        const destination = new EnrollmentModel({
          academicSessionId: new mongoose.Types.ObjectId(input.destinationSessionId),
          classLevelId: new mongoose.Types.ObjectId(input.destinationClassLevelId),
          enrolledAt: new Date(),
          progressionSourceEnrollmentId: source._id,
          status: 'ACTIVE',
          studentId: source.studentId,
          ...(input.destinationTrackId === undefined
            ? {}
            : { trackId: new mongoose.Types.ObjectId(input.destinationTrackId) }),
        });
        await destination.save({ session });
        destinationEnrollmentId = destination._id.toString();
      }

      if (
        input.outcome === 'WITHDRAW' ||
        input.outcome === 'TRANSFER' ||
        input.outcome === 'GRADUATE'
      ) {
        const lifecycleStatus =
          input.outcome === 'WITHDRAW'
            ? 'WITHDRAWN'
            : input.outcome === 'TRANSFER'
              ? 'TRANSFERRED'
              : 'GRADUATED';
        await StudentModel.updateOne(
          { _id: source.studentId, lifecycleStatus: 'ACTIVE' },
          { $set: { lifecycleStatus } },
          { session },
        );
      }

      await this.#audit.append(
        {
          action: `ENROLLMENT_${input.outcome}`,
          actorType: 'USER',
          actorUserId: actorId,
          changes: {
            destinationEnrollmentId,
            reason: input.reason,
            sourceStatus,
          },
          outcome: 'SUCCESS',
          reason: input.reason,
          requestId: input.requestId,
          targetId: source._id.toString(),
          targetType: 'Enrollment',
        },
        session,
      );
      await OutboxEventModel.create(
        [
          {
            aggregateId: source.studentId.toString(),
            aggregateType: 'Student',
            eventId: `enrollment:${source._id.toString()}:${input.outcome}`,
            eventType: 'STUDENT_PROGRESSION_RECORDED',
            occurredAt: new Date(),
            payload: { outcome: input.outcome, sourceEnrollmentId: source._id.toString() },
            status: 'PENDING',
            transactionActorId: actorId,
          },
        ],
        { session },
      );
      return {
        outcome: input.outcome,
        ...(destinationEnrollmentId === undefined ? {} : { destinationEnrollmentId }),
      };
    });
  }
}
