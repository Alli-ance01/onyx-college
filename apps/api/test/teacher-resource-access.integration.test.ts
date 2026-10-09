import { ResultCorrectionService } from '../src/modules/results/application/result-correction-service.js';
import { SequenceCounterModel } from '../src/modules/system/infrastructure/system-models.js';
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
  TermReportModel,
} from '../src/modules/results/infrastructure/result-models.js';
import { AuditWriter } from '../src/modules/audit/application/audit-writer.js';
import { TimetableService } from '../src/modules/timetable/application/timetable-service.js';
import { TimetableModel } from '../src/modules/timetable/infrastructure/timetable-model.js';
import {
  SubjectOfferingModel,
  EnrollmentSubjectOverrideModel,
  SubjectModel,
} from '../src/modules/subjects/infrastructure/subject-models.js';
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

describe('timetable ownership and atomic publication', () => {
  const service = new TimetableService();
  const admin = {
    accountType: 'ADMIN',
    userId: id('user').toString(),
    permissions: ['timetable.manage'],
  };
  const input = {
    version: 0,
    timeZone: 'Africa/Lagos',
    lessons: [
      {
        teachingAssignmentId: id('assignment').toString(),
        weekday: 1,
        startsAt: '08:00',
        endsAt: '09:00',
        room: 'Lab',
      },
    ],
  };
  beforeEach(async () => {
    await TimetableModel.deleteMany({});
    await TimetableModel.createIndexes();
    await SubjectOfferingModel.deleteMany({});
    await EnrollmentSubjectOverrideModel.deleteMany({});
    await AcademicSessionModel.updateOne({ _id: id('session') }, { status: 'ACTIVE' });
    await TermModel.updateOne({ _id: id('term') }, { status: 'ACTIVE' });
    await SubjectOfferingModel.create({
      academicSessionId: id('session'),
      classLevelId: id('level'),
      subjectId: id('subject'),
      normalizedTrackKey: 'NONE',
      classification: 'REQUIRED',
    });
  });
  it('exposes only the enrolled curriculum and own active teaching scope', async () => {
    await service.save(admin, id('term').toString(), input, 'schedule-scope');
    const student = await StudentModel.findById(id('student')).orFail();
    const outside = await StudentModel.findById(id('outsideStudent')).orFail();
    const actor = { accountType: 'STUDENT', userId: student.userId.toString(), permissions: [] };
    expect((await service.read(actor)).lessons).toHaveLength(1);
    expect(
      (await service.read({ ...actor, userId: outside.userId.toString() })).lessons,
    ).toHaveLength(0);
    expect((await service.read(teacher)).lessons).toHaveLength(1);
    await SubjectOfferingModel.updateMany({}, { classification: 'OPTIONAL' });
    expect((await service.read(actor)).lessons).toHaveLength(0);
    await TeachingAssignmentModel.updateOne({ _id: id('assignment') }, { status: 'REVOKED' });
    expect((await service.read(teacher)).lessons).toHaveLength(0);
    await expect(
      service.save(teacher, id('term').toString(), input, 'forbidden'),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.read(actor, new mongoose.Types.ObjectId().toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  it('allows only one winner when two editors save the same revision', async () => {
    await service.save(admin, id('term').toString(), input, 'schedule-initial');
    const attempts = await Promise.allSettled([
      service.save(
        admin,
        id('term').toString(),
        { ...input, version: 1, timeZone: 'UTC' },
        'schedule-a',
      ),
      service.save(admin, id('term').toString(), { ...input, version: 1 }, 'schedule-b'),
    ]);
    expect(attempts.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.find((x) => x.status === 'rejected')).toMatchObject({
      reason: { statusCode: 409 },
    });
    expect((await service.read(admin)).version).toBe(2);
  });
  it('rolls back the timetable when audit persistence fails and protects completed terms', async () => {
    vi.spyOn(AuditWriter.prototype, 'append').mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(
      service.save(admin, id('term').toString(), input, 'schedule-rollback'),
    ).rejects.toThrow('Audit unavailable');
    expect(await TimetableModel.countDocuments()).toBe(0);
    await TermModel.updateOne({ _id: id('term') }, { status: 'COMPLETED' });
    await expect(
      service.save(admin, id('term').toString(), input, 'historical'),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

it('publication rollback and correction retain immutable historical report values', async () => {
  await ResultBatchModel.deleteOne({ _id: id('batch') });
  await AssessmentSchemeModel.updateOne({ _id: id('assessment') }, { status: 'ACTIVE' });
  await GradingSchemeModel.updateOne({ _id: id('grading') }, { status: 'ACTIVE' });
  await SubjectOfferingModel.updateMany({}, { classification: 'REQUIRED' });
  const author = {
    ...teacher,
    permissions: [
      'results.enter',
      'results.submit',
      'results.request_correction',
      'results.approve',
      'results.approve_correction',
    ],
  };
  const reviewer = {
    accountType: 'ADMIN' as const,
    userId: new mongoose.Types.ObjectId().toString(),
    permissions: [
      'results.read_all',
      'results.review',
      'results.approve',
      'results.publish',
      'results.approve_correction',
    ],
  };
  const batchId = await results.createBatch({
    actor: author,
    assessmentSchemeId: id('assessment').toString(),
    gradingSchemeId: id('grading').toString(),
    teachingAssignmentId: id('assignment').toString(),
    termId: id('term').toString(),
    requestId: 'result-fixture',
  });
  const batch = await results.getBatch(reviewer, batchId);
  const entry = batch.entries[0];
  if (entry === undefined) throw new Error('Missing eligible student');
  await results.saveEntry({
    actor: author,
    entryId: entry.id,
    exempt: false,
    components: [{ key: 'exam', score: '75', state: 'SCORED' }],
    requestId: 'score',
  });
  await results.submit({ actor: author, batchId, requestId: 'submit' });
  await results.startReview({ actor: reviewer, batchId, requestId: 'review' });
  await expect(
    results.approve({ actor: author, batchId, requestId: 'self-approve' }),
  ).rejects.toMatchObject({ statusCode: 403 });
  await results.approve({ actor: reviewer, batchId, requestId: 'approve' });
  vi.spyOn(AuditWriter.prototype, 'append').mockRejectedValueOnce(new Error('Audit failure'));
  await expect(
    results.publish({ actor: reviewer, batchId, requestId: 'publish-fail' }),
  ).rejects.toThrow('Audit failure');
  expect(await TermReportModel.countDocuments()).toBe(0);
  expect(await ResultBatchModel.findById(batchId).lean()).toMatchObject({ status: 'APPROVED' });
  await results.publish({ actor: reviewer, batchId, requestId: 'publish' });
  const original = await TermReportModel.findOne({ enrollmentId: id('enrollment'), current: true })
    .orFail()
    .lean();
  expect(original.overallAverageRounded).toBe('75.00');
  const corrections = new ResultCorrectionService();
  const correction = await corrections.request({
    actor: author,
    resultEntryId: entry.id,
    exempt: false,
    components: [{ key: 'exam', score: '82', state: 'SCORED' }],
    reason: 'Verified original marked paper',
    requestId: 'correct',
  });
  await corrections.startReview({
    actor: reviewer,
    requestResourceId: correction.id,
    requestId: 'correction-review',
  });
  await expect(
    corrections.approve({
      actor: author,
      requestResourceId: correction.id,
      requestId: 'self-correction',
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
  await corrections.approve({
    actor: reviewer,
    requestResourceId: correction.id,
    requestId: 'correction-approve',
  });
  await corrections.apply({
    actor: reviewer,
    requestResourceId: correction.id,
    requestId: 'correction-apply',
  });
  expect(await TermReportModel.findById(original._id).lean()).toMatchObject({
    overallAverageRounded: '75.00',
    subjects: original.subjects,
    current: false,
    status: 'SUPERSEDED',
  });
  expect(
    await TermReportModel.findOne({ enrollmentId: id('enrollment'), current: true }).lean(),
  ).toMatchObject({ overallAverageRounded: '82.00', publicationVersion: 2 });
});

it('restores BSON documents, relationships, counters and unique indexes into a separate database', async () => {
  if (container === undefined) throw new Error('Disposable MongoDB is not running');
  await SequenceCounterModel.create({ key: 'STUDENT_ID', value: 2 });
  await mongoose.syncIndexes();
  const source = mongoose.connection.db;
  if (source === undefined) throw new Error('Source database unavailable');
  const startedAt = Date.now();
  const dump = await container.exec([
    'mongodump',
    '--db=onyx_teacher_resource_access',
    '--archive=/tmp/onyx-recovery.archive',
  ]);
  expect(dump.exitCode).toBe(0);
  const restore = await container.exec([
    'mongorestore',
    '--archive=/tmp/onyx-recovery.archive',
    '--nsFrom=onyx_teacher_resource_access.*',
    '--nsTo=onyx_recovery_rehearsal.*',
  ]);
  expect(restore.exitCode).toBe(0);
  const recovered = mongoose.connection.getClient().db('onyx_recovery_rehearsal');
  const collections = await source.listCollections().toArray();
  for (const collection of collections) {
    expect(await recovered.collection(collection.name).find().sort({ _id: 1 }).toArray()).toEqual(
      await source.collection(collection.name).find().sort({ _id: 1 }).toArray(),
    );
    const indexesByName = (left: { name?: string }, right: { name?: string }) =>
      (left.name ?? '').localeCompare(right.name ?? '');
    expect(
      (await recovered.collection(collection.name).listIndexes().toArray()).sort(indexesByName),
    ).toEqual(
      (await source.collection(collection.name).listIndexes().toArray()).sort(indexesByName),
    );
  }
  const student = await recovered.collection('students').findOne({ _id: id('student') });
  expect(student).not.toBeNull();
  await expect(
    recovered.collection('students').insertOne({
      ...student,
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      sourceRegistrationId: new mongoose.Types.ObjectId(),
    }),
  ).rejects.toMatchObject({ code: 11000, keyPattern: { studentId: 1 } });
  expect(
    await recovered.collection('enrollments').countDocuments({ studentId: id('student') }),
  ).toBeGreaterThan(0);
  expect(
    await recovered.collection('sequence_counters').findOne({ key: 'STUDENT_ID' }),
  ).toMatchObject({ value: 2 });
  process.stdout.write(
    `Restore rehearsal: ${String(collections.length)} collections and indexes verified in ${String(Date.now() - startedAt)}ms.\n`,
  );
});

describe('promotion preserves academic history', () => {
  it('rolls back on audit failure and permits only one concurrent progression', async () => {
    const destination = await AcademicSessionModel.create({ label: '2027/2028' });
    const input = {
      actorUserId: id('user').toString(),
      enrollmentId: id('enrollment').toString(),
      destinationSessionId: destination._id.toString(),
      destinationClassLevelId: id('outsideLevel').toString(),
      outcome: 'PROMOTE' as const,
      reason: 'Approved end of session promotion',
      requestId: 'promotion-rehearsal',
    };
    vi.spyOn(AuditWriter.prototype, 'append').mockRejectedValueOnce(new Error('Audit offline'));
    await expect(enrollments.progress(input)).rejects.toThrow('Audit offline');
    expect(await EnrollmentModel.findById(id('enrollment')).lean()).toMatchObject({
      status: 'ACTIVE',
      classLevelId: id('level'),
      academicSessionId: id('session'),
    });
    expect(
      await EnrollmentModel.countDocuments({
        studentId: id('student'),
        academicSessionId: destination._id,
      }),
    ).toBe(0);
    const outcomes = await Promise.allSettled([
      enrollments.progress(input),
      enrollments.progress(input),
    ]);
    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await EnrollmentModel.findById(id('enrollment')).lean()).toMatchObject({
      status: 'COMPLETED',
      classLevelId: id('level'),
      academicSessionId: id('session'),
    });
    expect(
      await EnrollmentModel.countDocuments({
        studentId: id('student'),
        academicSessionId: destination._id,
      }),
    ).toBe(1);
    expect(await StudentModel.findById(id('student')).lean()).toMatchObject({
      studentId: 'ONYX/0001',
    });
  });
});
