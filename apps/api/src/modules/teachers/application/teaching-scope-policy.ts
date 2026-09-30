import mongoose from 'mongoose';

import { AuthorizationError, NotFoundError } from '../../../app/errors/app-error.js';
import { EnrollmentModel } from '../../enrollments/infrastructure/enrollment-model.js';
import { TeacherModel, TeachingAssignmentModel } from '../infrastructure/teacher-models.js';

export interface TeachingScope {
  academicSessionId: string;
  classLevelId: string;
  subjectId: string;
  trackId?: string;
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
  if (subjectId !== undefined) query.subjectId = new mongoose.Types.ObjectId(subjectId);
  if ((await TeachingAssignmentModel.exists(query)) === null) throw new NotFoundError();
}
