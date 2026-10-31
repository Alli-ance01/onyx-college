import type { StartedMongoDBContainer } from '@testcontainers/mongodb';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AcademicSessionModel,
  ClassLevelModel,
} from '../src/modules/academics/infrastructure/academic-models.js';
import { AuditLogModel } from '../src/modules/audit/infrastructure/audit-log-model.js';
import { EnrollmentModel } from '../src/modules/enrollments/infrastructure/enrollment-model.js';
import { StudentModel } from '../src/modules/students/infrastructure/student-models.js';
import { SubjectService } from '../src/modules/subjects/application/subject-service.js';
import {
  EnrollmentSubjectOverrideModel,
  SubjectModel,
  SubjectOfferingModel,
} from '../src/modules/subjects/infrastructure/subject-models.js';
import { SubjectChangeRequestModel } from '../src/modules/subjects/infrastructure/subject-change-request-model.js';
import { createMongoTestContainer, replicaSetConnectionString } from './mongodb-test-container.js';

let container: StartedMongoDBContainer | undefined;
const ids = {
  classLevel: new mongoose.Types.ObjectId(),
  enrollment: new mongoose.Types.ObjectId(),
  otherStudent: new mongoose.Types.ObjectId(),
  optionalSubject: new mongoose.Types.ObjectId(),
  requiredSubject: new mongoose.Types.ObjectId(),
  session: new mongoose.Types.ObjectId(),
  student: new mongoose.Types.ObjectId(),
  studentUser: new mongoose.Types.ObjectId(),
  otherUser: new mongoose.Types.ObjectId(),
};
const subjects = new SubjectService();

beforeAll(async () => {
  container = await createMongoTestContainer().start();
  await mongoose.connect(replicaSetConnectionString(container), {
    dbName: 'onyx_subject_change_requests',
  });
  await AcademicSessionModel.create({ _id: ids.session, label: '2026/2027', status: 'ACTIVE' });
  await ClassLevelModel.create({
    _id: ids.classLevel,
    code: 'JSS1',
    name: 'JSS1',
    order: 1,
    stage: 'JUNIOR',
  });
  await StudentModel.create({
    _id: ids.student,
    userId: ids.studentUser,
    sourceRegistrationId: new mongoose.Types.ObjectId(),
    studentId: 'ONYX/0001',
    firstName: 'Amina',
    surname: 'Student',
    dateOfBirth: '2013-01-01',
    gender: 'FEMALE',
    nationality: 'Nigerian',
    residentialAddress: 'Address',
    passportDocumentId: new mongoose.Types.ObjectId(),
  });
  await StudentModel.create({
    _id: ids.otherStudent,
    userId: ids.otherUser,
    sourceRegistrationId: new mongoose.Types.ObjectId(),
    studentId: 'ONYX/0002',
    firstName: 'Other',
    surname: 'Student',
    dateOfBirth: '2013-01-01',
    gender: 'FEMALE',
    nationality: 'Nigerian',
    residentialAddress: 'Address',
    passportDocumentId: new mongoose.Types.ObjectId(),
  });
  await EnrollmentModel.create({
    _id: ids.enrollment,
    studentId: ids.student,
    academicSessionId: ids.session,
    classLevelId: ids.classLevel,
    status: 'ACTIVE',
  });
  await SubjectModel.create([
    { _id: ids.optionalSubject, code: 'ART', name: 'Art', normalizedName: 'art' },
    { _id: ids.requiredSubject, code: 'MATH', name: 'Mathematics', normalizedName: 'mathematics' },
  ]);
  await SubjectOfferingModel.create([
    {
      academicSessionId: ids.session,
      subjectId: ids.optionalSubject,
      classLevelId: ids.classLevel,
      normalizedTrackKey: 'NONE',
      classification: 'OPTIONAL',
      status: 'ACTIVE',
    },
    {
      academicSessionId: ids.session,
      subjectId: ids.requiredSubject,
      classLevelId: ids.classLevel,
      normalizedTrackKey: 'NONE',
      classification: 'REQUIRED',
      status: 'ACTIVE',
    },
  ]);
});
beforeEach(async () => {
  await SubjectChangeRequestModel.deleteMany({});
  await EnrollmentSubjectOverrideModel.deleteMany({});
  await AuditLogModel.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await container?.stop();
});

describe('subject-change requests', () => {
  it('accepts an offered optional request, audits approval, and applies the override atomically', async () => {
    const request = await subjects.requestSubjectChange({
      action: 'ADD',
      enrollmentId: ids.enrollment.toString(),
      reason: 'I want to study visual design.',
      requestId: 'request-add',
      subjectId: ids.optionalSubject.toString(),
      studentUserId: ids.studentUser.toString(),
    });
    expect(request.status).toBe('PENDING');
    expect(await EnrollmentSubjectOverrideModel.countDocuments()).toBe(0);
    const approved = await subjects.decideSubjectChangeRequest({
      actorUserId: ids.otherUser.toString(),
      decision: 'APPROVE',
      decisionReason: 'The school approves this selection.',
      requestId: 'decision-add',
      requestRecordId: request.id,
    });
    expect(approved.status).toBe('APPROVED');
    expect(
      await EnrollmentSubjectOverrideModel.findOne({
        enrollmentId: ids.enrollment,
        subjectId: ids.optionalSubject,
      }).lean(),
    ).toMatchObject({ action: 'ADD', status: 'ACTIVE' });
    expect(
      await AuditLogModel.countDocuments({
        targetType: 'SubjectChangeRequest',
        outcome: 'SUCCESS',
      }),
    ).toBe(2);
  });
  it('rejects unoffered or unauthorized requests and leaves curriculum unchanged on rejection', async () => {
    await expect(
      subjects.requestSubjectChange({
        action: 'ADD',
        enrollmentId: ids.enrollment.toString(),
        reason: 'Please add this.',
        requestId: 'invalid',
        subjectId: new mongoose.Types.ObjectId().toString(),
        studentUserId: ids.studentUser.toString(),
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      subjects.requestSubjectChange({
        action: 'REMOVE',
        enrollmentId: ids.enrollment.toString(),
        reason: 'Please remove this.',
        requestId: 'unauthorized',
        subjectId: ids.requiredSubject.toString(),
        studentUserId: ids.otherUser.toString(),
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    const request = await subjects.requestSubjectChange({
      action: 'REMOVE',
      enrollmentId: ids.enrollment.toString(),
      reason: 'This should be removed.',
      requestId: 'request-remove',
      subjectId: ids.requiredSubject.toString(),
      studentUserId: ids.studentUser.toString(),
    });
    const rejected = await subjects.decideSubjectChangeRequest({
      actorUserId: ids.otherUser.toString(),
      decision: 'REJECT',
      decisionReason: 'The required subject remains part of the curriculum.',
      requestId: 'decision-remove',
      requestRecordId: request.id,
    });
    expect(rejected.status).toBe('REJECTED');
    expect(await EnrollmentSubjectOverrideModel.countDocuments()).toBe(0);
  });
});
