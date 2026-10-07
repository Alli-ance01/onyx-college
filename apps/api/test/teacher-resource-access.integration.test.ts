import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  AcademicSessionModel,
  ClassLevelModel,
  TermModel,
} from '../src/modules/academics/infrastructure/academic-models.js';
import { AssignmentService } from '../src/modules/assignments/application/assignment-service.js';
import { AssignmentModel } from '../src/modules/assignments/infrastructure/assignment-models.js';
import { LocalDocumentStorage } from '../src/modules/documents/infrastructure/local-document-storage.js';
import { EnrollmentService } from '../src/modules/enrollments/application/enrollment-service.js';
import { EnrollmentModel } from '../src/modules/enrollments/infrastructure/enrollment-model.js';
import { StudentService } from '../src/modules/students/application/student-service.js';
import { StudentModel } from '../src/modules/students/infrastructure/student-models.js';
import { requireTeacherEnrollmentAccess } from '../src/modules/teachers/application/teaching-scope-policy.js';
import { ResultBatchService } from '../src/modules/results/application/result-batch-service.js';
import {
  AssessmentSchemeModel,
  GradingSchemeModel,
  ResultBatchModel,
} from '../src/modules/results/infrastructure/result-models.js';
import { SubjectModel } from '../src/modules/subjects/infrastructure/subject-models.js';
import {
  TeacherModel,
  TeachingAssignmentModel,
  ClassTeacherAssignmentModel,
} from '../src/modules/teachers/infrastructure/teacher-models.js';

let container: StartedMongoDBContainer | undefined;
const ids = Object.fromEntries(
  [
    'user',
    'teacher',
    'session',
    'term',
    'level',
    'subject',
    'assignment',
    'assessment',
    'grading',
    'batch',
    'work',
    'student',
    'outsideStudent',
    'enrollment',
    'outsideEnrollment',
    'outsideLevel',
  ].map((key) => [key, new mongoose.Types.ObjectId()]),
);
function id(key: string) {
  const value = ids[key];
  if (value === undefined) throw new Error('Missing fixture ID');
  return value;
}
const teacher = {
  accountType: 'TEACHER' as const,
  permissions: ['results.enter', 'assignments.update'],
  userId: id('user').toString(),
};
const results = new ResultBatchService();
const enrollments = new EnrollmentService();
const students = new StudentService();
const assignments = new AssignmentService(
  new LocalDocumentStorage('.data/access-tests'),
  1024,
  120,
);

beforeAll(async () => {
  container = await new MongoDBContainer('mongo:8.0').start();
  const uri = new URL(container.getConnectionString());
  uri.searchParams.set('directConnection', 'true');
  uri.searchParams.set('replicaSet', 'rs0');
  await mongoose.connect(uri.toString(), { dbName: 'onyx_teacher_resource_access' });
  await AcademicSessionModel.create({ _id: id('session'), label: '2026/2027' });
  await ClassLevelModel.create({
    _id: id('level'),
    code: 'JSS1',
    name: 'JSS1',
    order: 1,
    stage: 'JUNIOR',
  });
  await TermModel.create({
    _id: id('term'),
    academicSessionId: id('session'),
    name: 'First Term',
    ordinal: 1,
  });
  await SubjectModel.create({
    _id: id('subject'),
    code: 'MATH',
    name: 'Mathematics',
    normalizedName: 'mathematics',
  });
  await TeacherModel.create({
    _id: id('teacher'),
    userId: id('user'),
    sourceRegistrationId: new mongoose.Types.ObjectId(),
    firstName: 'Ada',
    lastName: 'Teacher',
    status: 'ACTIVE',
  });
  const scope = {
    teacherId: id('teacher'),
    academicSessionId: id('session'),
    classLevelId: id('level'),
    subjectId: id('subject'),
    normalizedTrackKey: 'NONE',
  };
  await TeachingAssignmentModel.create({
    ...scope,
    _id: id('assignment'),
    assignedByUserId: id('user'),
    status: 'ACTIVE',
  });
  await AssessmentSchemeModel.create({
    _id: id('assessment'),
    academicSessionId: id('session'),
    code: 'STANDARD',
    name: 'Assessment',
    versionNumber: 1,
    components: [{ key: 'exam', label: 'Exam', maximumHundredths: 10000 }],
    totalMaximumHundredths: 10000,
    createdByUserId: id('user'),
  });
  await GradingSchemeModel.create({
    _id: id('grading'),
    academicSessionId: id('session'),
    code: 'STANDARD',
    name: 'Grading',
    versionNumber: 1,
    bands: [{ grade: 'A', minimumPercentageHundredths: 0, maximumPercentageHundredths: 10000 }],
    createdByUserId: id('user'),
  });
  await ResultBatchModel.create({
    ...scope,
    _id: id('batch'),
    teachingAssignmentId: id('assignment'),
    assessmentSchemeId: id('assessment'),
    gradingSchemeId: id('grading'),
    termId: id('term'),
  });
  await AssignmentModel.create({
    ...scope,
    _id: id('work'),
    teachingAssignmentId: id('assignment'),
    createdByUserId: id('user'),
    title: 'Fractions',
    instructions: 'Read chapter one.',
    dueAt: new Date('2026-10-20'),
  });
  await ClassLevelModel.create({
    _id: id('outsideLevel'),
    code: 'JSS2',
    name: 'JSS2',
    order: 2,
    stage: 'JUNIOR',
  });
  for (const [index, studentKey, enrollmentKey, levelKey] of [
    [1, 'student', 'enrollment', 'level'],
    [2, 'outsideStudent', 'outsideEnrollment', 'outsideLevel'],
  ] as const) {
    await StudentModel.create({
      _id: id(studentKey),
      userId: new mongoose.Types.ObjectId(),
      sourceRegistrationId: new mongoose.Types.ObjectId(),
      studentId: `ONYX/000${String(index)}`,
      firstName: 'Test',
      surname: studentKey,
      dateOfBirth: '2013-03-12',
      gender: 'FEMALE',
      nationality: 'Nigerian',
      residentialAddress: 'Test address',
      passportDocumentId: new mongoose.Types.ObjectId(),
    });
    await EnrollmentModel.create({
      _id: id(enrollmentKey),
      studentId: id(studentKey),
      academicSessionId: id('session'),
      classLevelId: id(levelKey),
    });
  }
});
beforeEach(async () => {
  await ClassTeacherAssignmentModel.deleteMany({});
  await TeacherModel.updateOne({ _id: id('teacher') }, { $set: { status: 'ACTIVE' } });
  await TeachingAssignmentModel.updateOne(
    { _id: id('assignment') },
    { $set: { status: 'ACTIVE' } },
  );
});
afterAll(async () => {
  await mongoose.disconnect();
  await container?.stop();
});

describe('current teacher authority over academic resources', () => {
  it('restricts rosters, student search, profiles and curricula to assigned placements', async () => {
    const teacherUserId = teacher.userId;
    expect((await enrollments.list({ teacherUserId })).map((item) => item.id)).toEqual([
      id('enrollment').toString(),
    ]);
    expect(
      await enrollments.list({ teacherUserId, classLevelId: id('outsideLevel').toString() }),
    ).toEqual([]);
    expect((await students.directory({ teacherUserId })).items.map((item) => item.id)).toEqual([
      id('student').toString(),
    ]);
    expect((await students.directory({ teacherUserId, q: 'outsideStudent' })).items).toEqual([]);
    await expect(
      students.profileForAdmin(id('outsideStudent').toString(), false, teacherUserId),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      requireTeacherEnrollmentAccess(teacherUserId, id('enrollment').toString()),
    ).resolves.toBeUndefined();
    await expect(
      requireTeacherEnrollmentAccess(teacherUserId, id('outsideEnrollment').toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  it('denies roster and profile access immediately when authority is revoked', async () => {
    await TeachingAssignmentModel.updateOne(
      { _id: id('assignment') },
      { $set: { status: 'REVOKED' } },
    );
    expect(await enrollments.list({ teacherUserId: teacher.userId })).toEqual([]);
    expect((await students.directory({ teacherUserId: teacher.userId })).items).toEqual([]);
    await expect(
      students.profileForAdmin(id('student').toString(), false, teacher.userId),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      requireTeacherEnrollmentAccess(teacher.userId, id('enrollment').toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  it('permits class teacher roster access without granting subject authority', async () => {
    await TeachingAssignmentModel.updateOne(
      { _id: id('assignment') },
      { $set: { status: 'REVOKED' } },
    );
    await ClassTeacherAssignmentModel.create({
      teacherId: id('teacher'),
      academicSessionId: id('session'),
      classLevelId: id('level'),
      normalizedTrackKey: 'NONE',
      assignedByUserId: id('user'),
      status: 'ACTIVE',
    });
    expect(await enrollments.list({ teacherUserId: teacher.userId })).toHaveLength(1);
    await expect(
      requireTeacherEnrollmentAccess(teacher.userId, id('enrollment').toString()),
    ).resolves.toBeUndefined();
    await expect(
      requireTeacherEnrollmentAccess(
        teacher.userId,
        id('enrollment').toString(),
        id('subject').toString(),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  it('allows assigned active teachers to read their batches and assignments', async () => {
    expect((await results.getBatch(teacher, id('batch').toString())).id).toBe(
      id('batch').toString(),
    );
    expect(await results.listBatches(teacher, {})).toHaveLength(1);
    expect(await assignments.listForPrincipal(teacher)).toHaveLength(1);
  });
  it.each(['REVOKED', 'COMPLETED', 'ARCHIVED', 'PLANNED'])(
    'removes access when a teaching assignment becomes %s',
    async (status) => {
      await TeachingAssignmentModel.updateOne({ _id: id('assignment') }, { $set: { status } });
      expect(await results.listBatches(teacher, {})).toEqual([]);
      await expect(results.getBatch(teacher, id('batch').toString())).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(await assignments.listForPrincipal(teacher)).toEqual([]);
      await expect(
        assignments.update({
          actor: teacher,
          assignmentId: id('work').toString(),
          title: 'Unauthorized change',
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect((await AssignmentModel.findById(id('work')).lean())?.title).toBe('Fractions');
    },
  );
  it('denies suspended teacher profiles even while their account and assignment remain active', async () => {
    await TeacherModel.updateOne({ _id: id('teacher') }, { $set: { status: 'SUSPENDED' } });
    await expect(results.getBatch(teacher, id('batch').toString())).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(assignments.listForPrincipal(teacher)).rejects.toMatchObject({ statusCode: 403 });
  });
  it('does not expose a batch through another teacher identity', async () => {
    const otherUser = new mongoose.Types.ObjectId();
    await TeacherModel.create({
      userId: otherUser,
      sourceRegistrationId: new mongoose.Types.ObjectId(),
      firstName: 'Other',
      lastName: 'Teacher',
      status: 'ACTIVE',
    });
    await expect(
      results.getBatch({ ...teacher, userId: otherUser.toString() }, id('batch').toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  it('retains explicitly authorized administrator access to historical batches', async () => {
    await TeachingAssignmentModel.updateOne(
      { _id: id('assignment') },
      { $set: { status: 'REVOKED' } },
    );
    const admin = {
      ...teacher,
      accountType: 'ADMINISTRATOR' as const,
      permissions: ['results.read_all'],
    };
    expect((await results.getBatch(admin, id('batch').toString())).id).toBe(id('batch').toString());
  });
});
