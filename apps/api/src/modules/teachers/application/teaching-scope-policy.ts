import mongoose from 'mongoose';

import { AuthorizationError, NotFoundError } from '../../../app/errors/app-error.js';
import { EnrollmentModel } from '../../enrollments/infrastructure/enrollment-model.js';
import {
  ClassTeacherAssignmentModel,
  TeacherModel,
  TeachingAssignmentModel,
} from '../infrastructure/teacher-models.js';

export interface TeachingScope {
  academicSessionId: string;
  classLevelId: string;
  subjectId: string;
  trackId?: string;
}

export async function activeTeachingAssignmentFilter(userId: string) {
  const teacher = await TeacherModel.findOne({ userId, status: 'ACTIVE' }).select('_id').lean();
  if (teacher === null) throw new AuthorizationError();
  const assignments = await TeachingAssignmentModel.find({
    teacherId: teacher._id,
    status: 'ACTIVE',
  })
    .select('_id')
    .lean();
  return {
    teacherId: teacher._id,
    teachingAssignmentId: { $in: assignments.map(({ _id }) => _id) },
  };
}

export async function teacherEnrollmentFilter(userId: string): Promise<Record<string, unknown>> {
  const teacher = await TeacherModel.findOne({ userId, status: 'ACTIVE' }).select('_id').lean();
  if (teacher === null) throw new AuthorizationError();
  const [teaching, classTeaching] = await Promise.all([
    TeachingAssignmentModel.find({ teacherId: teacher._id, status: 'ACTIVE' }).lean(),
    ClassTeacherAssignmentModel.find({ teacherId: teacher._id, status: 'ACTIVE' }).lean(),
  ]);
  const placements = [...teaching, ...classTeaching].map((assignment) => ({
    academicSessionId: assignment.academicSessionId,
    classLevelId: assignment.classLevelId,
    trackId: assignment.trackId ?? { $exists: false },
  }));
  return placements.length === 0 ? { _id: { $in: [] } } : { $or: placements };
}

export async function requireTeachingScope(
  userId: string,
  scope: TeachingScope,
): Promise<{ assignmentId: string; teacherId: string }> {
  const teacher = await TeacherModel.findOne({ userId, status: 'ACTIVE' }).lean();
  if (teacher === null) throw new AuthorizationError();
  const assignment = await TeachingAssignmentModel.findOne({
    teacherId: teacher._id,
    academicSessionId: scope.academicSessionId,
    classLevelId: scope.classLevelId,
    normalizedTrackKey: scope.trackId ?? 'NONE',
    subjectId: scope.subjectId,
    status: 'ACTIVE',
  }).lean();
  if (assignment === null) throw new AuthorizationError();
  return { assignmentId: assignment._id.toString(), teacherId: teacher._id.toString() };
}

export async function requireTeacherEnrollmentAccess(
  userId: string,
  enrollmentId: string,
  subjectId?: string,
): Promise<void> {
  if (subjectId === undefined) {
    const scope = await teacherEnrollmentFilter(userId);
    if ((await EnrollmentModel.exists({ $and: [{ _id: enrollmentId }, scope] })) === null)
      throw new NotFoundError();
    return;
  }
  const enrollment = await EnrollmentModel.findById(enrollmentId).lean();
  if (enrollment === null) throw new NotFoundError();
  const teacher = await TeacherModel.findOne({ userId, status: 'ACTIVE' }).lean();
  if (teacher === null) throw new NotFoundError();
  const query: Record<string, unknown> = {
    teacherId: teacher._id,
    academicSessionId: enrollment.academicSessionId,
    classLevelId: enrollment.classLevelId,
    normalizedTrackKey: enrollment.trackId?.toString() ?? 'NONE',
    status: 'ACTIVE',
  };
  query.subjectId = new mongoose.Types.ObjectId(subjectId);
  if ((await TeachingAssignmentModel.exists(query)) === null) throw new NotFoundError();
}
