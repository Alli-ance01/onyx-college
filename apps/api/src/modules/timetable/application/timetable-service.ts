import type { SaveTimetableInput, TimetableDto } from '@onyx/contracts';
import mongoose from 'mongoose';
import { AuthorizationError, ConflictError, NotFoundError } from '../../../app/errors/app-error.js';
import {
  AcademicSessionModel,
  ClassLevelModel,
  TermModel,
  TrackModel,
} from '../../academics/infrastructure/academic-models.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import { EnrollmentModel } from '../../enrollments/infrastructure/enrollment-model.js';
import { StudentModel } from '../../students/infrastructure/student-models.js';
import { SubjectModel } from '../../subjects/infrastructure/subject-models.js';
import { SubjectService } from '../../subjects/application/subject-service.js';
import {
  TeacherModel,
  TeachingAssignmentModel,
} from '../../teachers/infrastructure/teacher-models.js';
import { TimetableModel } from '../infrastructure/timetable-model.js';
import { validateSchedule } from './timetable-policy.js';
interface Actor {
  accountType: string;
  permissions: readonly string[];
  userId: string;
}
export class TimetableService {
  public async terms(actor: Actor): Promise<NonNullable<TimetableDto['term']>[]> {
    let sessionIds: string[] | undefined;
    if (!actor.permissions.includes('timetable.manage')) {
      if (actor.accountType === 'STUDENT') {
        const student = await StudentModel.findOne({
          userId: actor.userId,
          lifecycleStatus: 'ACTIVE',
        }).lean();
        if (student === null) throw new NotFoundError();
        sessionIds = (await EnrollmentModel.find({ studentId: student._id }).lean()).map((x) =>
          x.academicSessionId.toString(),
        );
      } else if (actor.accountType === 'TEACHER') {
        const teacher = await TeacherModel.findOne({
          userId: actor.userId,
          status: 'ACTIVE',
        }).lean();
        if (teacher === null) throw new NotFoundError();
        sessionIds = (
          await TeachingAssignmentModel.find({ teacherId: teacher._id, status: 'ACTIVE' }).lean()
        ).map((x) => x.academicSessionId.toString());
      } else throw new AuthorizationError();
    }
    const sessions = await AcademicSessionModel.find(
      sessionIds === undefined ? {} : { _id: { $in: sessionIds } },
    )
      .sort({ label: -1 })
      .lean();
    const terms = await TermModel.find({ academicSessionId: { $in: sessions.map((x) => x._id) } })
      .sort({ ordinal: 1 })
      .lean();
    return sessions.flatMap((session) =>
      terms
        .filter((term) => term.academicSessionId.equals(session._id))
        .map((term) => ({
          id: term._id.toString(),
          name: term.name,
          sessionId: session._id.toString(),
          sessionLabel: session.label,
        })),
    );
  }
  public async read(actor: Actor, termId?: string): Promise<TimetableDto> {
    const permitted = await this.terms(actor);
    const activeSession = await AcademicSessionModel.findOne({ status: 'ACTIVE' }).lean();
    const activeTerm =
      activeSession === null
        ? null
        : await TermModel.findOne({
            academicSessionId: activeSession._id,
            status: 'ACTIVE',
          }).lean();
    const selected = termId ?? activeTerm?._id.toString();
    const context = permitted.find((term) => term.id === selected);
    if (context === undefined) {
      if (termId !== undefined) throw new NotFoundError();
      return { term: null, timeZone: 'Africa/Lagos', version: 0, published: false, lessons: [] };
    }
    const timetable = await TimetableModel.findOne({ termId: context.id }).lean();
    const [assignments, teachers, subjects, levels, tracks] = await Promise.all([
      TeachingAssignmentModel.find({
        academicSessionId: context.sessionId,
        ...(actor.permissions.includes('timetable.manage') ? {} : { status: 'ACTIVE' }),
      }).lean(),
      TeacherModel.find(actor.permissions.includes('timetable.manage') ? {} : { status: 'ACTIVE' })
        .select('firstName lastName userId')
        .lean(),
      SubjectModel.find().select('name').lean(),
      ClassLevelModel.find().select('name').lean(),
      TrackModel.find().select('name').lean(),
    ]);
    let allowed: Set<string> | undefined;
    if (!actor.permissions.includes('timetable.manage')) {
      if (actor.accountType === 'TEACHER') {
        const teacher = teachers.find((x) => x.userId.toString() === actor.userId);
        allowed = new Set(
          assignments
            .filter((x) => x.teacherId.toString() === teacher?._id.toString())
            .map((x) => x._id.toString()),
        );
      } else {
        const student = await StudentModel.findOne({
          userId: actor.userId,
          lifecycleStatus: 'ACTIVE',
        }).lean();
        const enrollment =
          student === null
            ? null
            : await EnrollmentModel.findOne({
                studentId: student._id,
                academicSessionId: context.sessionId,
              }).lean();
        if (enrollment === null) throw new NotFoundError();
        const subjectsForStudent = new Set(
          (await new SubjectService().curriculumForEnrollment(enrollment._id.toString())).map(
            (x) => x.subject.id,
          ),
        );
        allowed = new Set(
          assignments
            .filter(
              (x) =>
                x.classLevelId.equals(enrollment.classLevelId) &&
                x.normalizedTrackKey === (enrollment.trackId?.toString() ?? 'NONE') &&
                subjectsForStudent.has(x.subjectId.toString()),
            )
            .map((x) => x._id.toString()),
        );
      }
    }
    const lessons = (timetable?.lessons ?? [])
      .flatMap((lesson) => {
        if (allowed !== undefined && !allowed.has(lesson.teachingAssignmentId)) return [];
        const assignment = assignments.find(
          (x) => x._id.toString() === lesson.teachingAssignmentId,
        );
        const teacher = teachers.find((x) => x._id.equals(assignment?.teacherId));
        if (assignment === undefined || teacher === undefined) return [];
        const track = tracks.find((x) => x._id.equals(assignment.trackId));
        return [
          {
            ...lesson,
            subject:
              subjects.find((x) => x._id.equals(assignment.subjectId))?.name ??
              'Subject unavailable',
            teacher: `${teacher.firstName} ${teacher.lastName}`,
            className: `${levels.find((x) => x._id.equals(assignment.classLevelId))?.name ?? 'Class'}${track === undefined ? '' : ` · ${track.name}`}`,
          },
        ];
      })
      .sort((a, b) => a.weekday - b.weekday || a.startsAt.localeCompare(b.startsAt));
    return {
      term: context,
      timeZone: timetable?.timeZone ?? 'Africa/Lagos',
      version: timetable?.version ?? 0,
      published: timetable !== null,
      lessons,
    };
  }
  public async save(
    actor: Actor,
    termId: string,
    input: SaveTimetableInput,
    requestId: string,
  ): Promise<void> {
    if (!actor.permissions.includes('timetable.manage')) throw new AuthorizationError();
    try {
      await mongoose.connection.transaction(async (session) => {
        const term = await TermModel.findById(termId).session(session).lean();
        const academic =
          term === null
            ? null
            : await AcademicSessionModel.findById(term.academicSessionId).session(session).lean();
        if (term === null || academic === null) throw new NotFoundError();
        if (
          ['COMPLETED', 'ARCHIVED'].includes(term.status) ||
          ['CLOSED', 'ARCHIVED'].includes(academic.status)
        )
          throw new ConflictError('Historical timetables cannot be changed.');
        const teachers = await TeacherModel.find({ status: 'ACTIVE' }).session(session).lean();
        const assignments = await TeachingAssignmentModel.find({
          academicSessionId: academic._id,
          status: 'ACTIVE',
          teacherId: { $in: teachers.map((x) => x._id) },
        })
          .session(session)
          .lean();
        validateSchedule(
          input.lessons,
          new Map(
            assignments.map((x) => [
              x._id.toString(),
              {
                teacherId: x.teacherId.toString(),
                placement: `${x.classLevelId.toString()}:${x.normalizedTrackKey}`,
              },
            ]),
          ),
        );
        const values = {
          timeZone: input.timeZone,
          lessons: [...input.lessons],
          version: input.version + 1,
        };
        if (input.version === 0) await TimetableModel.create([{ termId, ...values }], { session });
        else if (
          (await TimetableModel.findOneAndUpdate(
            { termId, version: input.version },
            { $set: values },
            { session },
          )) === null
        )
          throw new ConflictError('The timetable changed. Reload it before saving your changes.');
        await new AuditWriter().append(
          {
            actorType: 'USER',
            actorUserId: new mongoose.Types.ObjectId(actor.userId),
            action: 'TIMETABLE_UPDATED',
            outcome: 'SUCCESS',
            requestId,
            targetType: 'Timetable',
            targetId: termId,
            changes: { previousVersion: input.version, ...values },
          },
          session,
        );
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
        throw new ConflictError('The timetable changed. Reload it before saving your changes.');
      throw error;
    }
  }
}
