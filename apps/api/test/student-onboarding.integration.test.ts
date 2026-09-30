import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import mongoose from 'mongoose';
import pino from 'pino';
import request from 'supertest';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { loadEnvironment } from '../src/config/environment.js';
import { SyncAccessControlService } from '../src/modules/access-control/application/sync-access-control.js';
import { BootstrapSuperAdminService } from '../src/modules/identity/application/bootstrap-super-admin.js';
import { CredentialCrypto } from '../src/modules/identity/infrastructure/credential-crypto.js';
import { PasswordService } from '../src/modules/identity/infrastructure/password-service.js';
import { ensureStudentOnboardingReferenceData } from '../src/modules/student-registration/application/reference-data.js';
import { EnrollmentModel } from '../src/modules/enrollments/infrastructure/enrollment-model.js';
import { AuditLogModel } from '../src/modules/audit/infrastructure/audit-log-model.js';
import { StudentDocumentModel } from '../src/modules/documents/infrastructure/document-models.js';
import { StudentModel } from '../src/modules/students/infrastructure/student-models.js';
import { SequenceCounterModel } from '../src/modules/system/infrastructure/system-models.js';

const origin = 'http://localhost:5173';
const logger = pino({ level: 'error' });
let container: StartedMongoDBContainer | undefined;
let app: ReturnType<typeof createApp>;
let adminAccessToken: string;
let applicantAccessToken: string;
let approvedStudentAccessToken: string;
let activeAcademicSessionId: string;
let jss1ClassLevelId: string;

const apiEnvelopeSchema = z.object({ data: z.unknown() });
const unknownRecordSchema = z.record(z.string(), z.unknown());

function apiData(response: request.Response): unknown {
  return apiEnvelopeSchema.parse(response.body as unknown).data;
}

function valueAt(value: unknown, ...path: readonly (number | string)[]): unknown {
  let current = value;
  for (const part of path) {
    current =
      typeof part === 'number'
        ? z.array(z.unknown()).parse(current)[part]
        : unknownRecordSchema.parse(current)[part];
  }
  return current;
}

function objectAt(value: unknown, ...path: readonly (number | string)[]): Record<string, unknown> {
  return unknownRecordSchema.parse(valueAt(value, ...path));
}

function stringAt(value: unknown, ...path: readonly (number | string)[]): string {
  return z.string().parse(valueAt(value, ...path));
}

function numberAt(value: unknown, ...path: readonly (number | string)[]): number {
  return z.number().parse(valueAt(value, ...path));
}

function authentication(response: request.Response): { accessToken: string; csrfToken: string } {
  const data = apiData(response);
  return { accessToken: stringAt(data, 'accessToken'), csrfToken: stringAt(data, 'csrfToken') };
}

function replicaSetConnectionString(startedContainer: StartedMongoDBContainer): string {
  const connectionString = new URL(startedContainer.getConnectionString());
  connectionString.searchParams.set('directConnection', 'true');
  connectionString.searchParams.set('replicaSet', 'rs0');
  return connectionString.toString();
}

beforeAll(async () => {
  container = await new MongoDBContainer('mongo:8.0').start();
  const connectionString = replicaSetConnectionString(container);
  await mongoose.connect(connectionString, {
    dbName: 'onyx_onboarding_integration',
  });
  const environment = loadEnvironment({
    AUTH_LOGIN_RATE_LIMIT_MAX: '100',
    STUDENT_SIGNUP_RATE_LIMIT_MAX: '100',
    DOCUMENT_STORAGE_LOCAL_PATH: '.data/test-private-uploads',
    MONGODB_URI: connectionString,
    NODE_ENV: 'test',
    WEB_ORIGIN: origin,
  });
  app = createApp({ environment, logger, readiness: { isReady: () => true } });
  await new SyncAccessControlService(logger).execute();
  await ensureStudentOnboardingReferenceData();
  await mongoose.syncIndexes();
  const bootstrap = await new BootstrapSuperAdminService(
    new SyncAccessControlService(logger),
    new CredentialCrypto(environment.AUTH_REFRESH_TOKEN_PEPPER),
    new PasswordService(),
  ).execute({ username: 'onboarding.admin' });
  const browser = request.agent(app);
  const login = await browser
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .send({ identifier: 'onboarding.admin', password: bootstrap.temporaryPassword })
    .expect(200);
  const loggedIn = authentication(login);
  const changed = await browser
    .post('/api/v1/auth/change-password')
    .set('Origin', origin)
    .set('Authorization', `Bearer ${loggedIn.accessToken}`)
    .set('X-CSRF-Token', loggedIn.csrfToken)
    .send({
      currentPassword: bootstrap.temporaryPassword,
      newPassword: 'secure-admin-password-2026',
    })
    .expect(200);
  adminAccessToken = authentication(changed).accessToken;
});

afterAll(async () => {
  await mongoose.disconnect();
  await container?.stop();
});

async function createApplicant(username: string): Promise<string> {
  await request(app)
    .post('/api/v1/student-signups')
    .set('Origin', origin)
    .send({
      username,
      password: 'secure-student-password',
      passwordConfirmation: 'secure-student-password',
    })
    .expect(201);
  const login = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .send({ identifier: username, password: 'secure-student-password' })
    .expect(200);
  return authentication(login).accessToken;
}

async function completeAndSubmit(
  token: string,
  identity: {
    dateOfBirth: string;
    firstName: string;
    guardianPhone: string;
    surname: string;
  },
) {
  const draft = await request(app)
    .get('/api/v1/student-registrations/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const saved = await request(app)
    .patch('/api/v1/student-registrations/me')
    .set('Authorization', `Bearer ${token}`)
    .send({
      version: numberAt(apiData(draft), 'version'),
      personal: {
        surname: identity.surname,
        firstName: identity.firstName,
        dateOfBirth: identity.dateOfBirth,
        gender: 'Female',
        nationality: 'Ghanaian',
      },
      contact: { residentialAddress: '21 Onyx College Road' },
      guardian: {
        fullName: 'Primary Guardian',
        relationship: 'Guardian',
        phone: identity.guardianPhone,
        emergencyContact: true,
      },
      academic: { requestedClassLevelCode: 'JSS1' },
      medical: {},
      customResponses: {},
    })
    .expect(200);
  const requirements = await request(app)
    .get('/api/v1/document-requirements')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const passport = z
    .array(z.object({ code: z.string(), id: z.string() }))
    .parse(apiData(requirements))
    .find((item) => item.code === 'PASSPORT_PHOTOGRAPH');
  if (passport === undefined) throw new Error('Passport requirement fixture is missing.');
  await request(app)
    .put(`/api/v1/student-documents/${passport.id}/content`)
    .set('Origin', origin)
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'image/png')
    .set('X-File-Name', 'passport.png')
    .send(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]))
    .expect(201);
  const submitted = await request(app)
    .post('/api/v1/student-registrations/me/submit')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return { registrationId: stringAt(apiData(saved), 'id'), submitted: apiData(submitted) };
}

async function beginReviewAndVerify(registrationId: string): Promise<void> {
  await request(app)
    .post(`/api/v1/student-registrations/${registrationId}/start-review`)
    .set('Authorization', `Bearer ${adminAccessToken}`)
    .expect(200);
  const review = await request(app)
    .get(`/api/v1/student-registrations/${registrationId}`)
    .set('Authorization', `Bearer ${adminAccessToken}`)
    .expect(200);
  await request(app)
    .post(`/api/v1/student-documents/${stringAt(apiData(review), 'documents', 0, 'id')}/review`)
    .set('Authorization', `Bearer ${adminAccessToken}`)
    .send({ status: 'VERIFIED' })
    .expect(204);
}

describe('student onboarding integration', () => {
  it('creates a limited applicant account and exposes no public staff signup', async () => {
    await request(app)
      .post('/api/v1/student-signups')
      .set('Origin', origin)
      .send({
        username: 'student.one',
        email: 'student.one@example.test',
        phone: '08011112222',
        password: 'secure-student-password',
        passwordConfirmation: 'secure-student-password',
      })
      .expect(201);
    await request(app)
      .post('/api/v1/student-signups')
      .set('Origin', origin)
      .send({
        username: 'student.one',
        password: 'secure-student-password',
        passwordConfirmation: 'secure-student-password',
      })
      .expect(409);
    await request(app).post('/api/v1/teacher-signups').set('Origin', origin).send({}).expect(404);
    await request(app).post('/api/v1/admin-signups').set('Origin', origin).send({}).expect(404);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ identifier: 'student.one', password: 'secure-student-password' })
      .expect(200);
    expect(valueAt(apiData(login), 'principal')).toMatchObject({
      accountType: 'APPLICANT',
      portal: 'ONBOARDING',
      roles: [],
    });
    applicantAccessToken = authentication(login).accessToken;
    await request(app)
      .get('/api/v1/students/me/dashboard')
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .expect(404);
  });

  it('versions replacements, coordinates removal, and prevents document IDOR access', async () => {
    const registrationResponse = await request(app)
      .get('/api/v1/student-registrations/me')
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .expect(200);
    const registrationId = stringAt(apiData(registrationResponse), 'id');
    const requirementResponse = await request(app)
      .get('/api/v1/document-requirements')
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .expect(200);
    const requirement = z
      .array(z.object({ code: z.string(), id: z.string() }))
      .parse(apiData(requirementResponse))
      .find((item) => item.code === 'PASSPORT_PHOTOGRAPH');
    if (requirement === undefined) throw new Error('Passport requirement fixture is missing.');
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 4, 3, 2, 1]);

    for (const filename of ['passport-first.png', 'passport-replacement.png']) {
      await request(app)
        .put(`/api/v1/student-documents/${requirement.id}/content`)
        .set('Origin', origin)
        .set('Authorization', `Bearer ${applicantAccessToken}`)
        .set('Content-Type', 'image/png')
        .set('X-File-Name', filename)
        .send(png)
        .expect(201);
    }

    const activeRegistration = await request(app)
      .get('/api/v1/student-registrations/me')
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .expect(200);
    const activeDocumentId = stringAt(apiData(activeRegistration), 'documents', 0, 'id');
    expect(valueAt(apiData(activeRegistration), 'documents', 0, 'version')).toBe(2);
    await request(app)
      .get(`/api/v1/student-documents/${activeDocumentId}/download-url`)
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .expect(200)
      .expect((response) => {
        expect(valueAt(apiData(response), 'delivery')).toBe('PROXY');
      });

    const attackerToken = await createApplicant('storage.attacker');
    await request(app)
      .get(`/api/v1/student-documents/${activeDocumentId}/download-url`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .expect(404);
    await request(app)
      .delete(`/api/v1/student-documents/${activeDocumentId}`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .expect(404);

    await request(app)
      .delete(`/api/v1/student-documents/${activeDocumentId}`)
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .expect(204);
    const removed = await StudentDocumentModel.findById(activeDocumentId).lean();
    expect(removed).toMatchObject({
      provider: 'LOCAL',
      status: 'REMOVED',
      storageDeletionStatus: 'DELETED',
      uploadStatus: 'AVAILABLE',
      versionNumber: 2,
    });

    await request(app)
      .put(`/api/v1/student-documents/${requirement.id}/content`)
      .set('Origin', origin)
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .set('Content-Type', 'image/png')
      .set('X-File-Name', 'passport-current.png')
      .send(png)
      .expect(201);
    const current = await StudentDocumentModel.findOne({
      registrationId,
      status: 'ACTIVE',
    }).lean();
    expect(current).toMatchObject({
      originalFilename: 'passport-current.png',
      provider: 'LOCAL',
      providerDeliveryType: 'local',
      providerResourceType: 'image',
      uploadStatus: 'AVAILABLE',
      versionNumber: 3,
    });

    await request(app)
      .put(`/api/v1/student-documents/${requirement.id}/content`)
      .set('Origin', origin)
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .set('Content-Type', 'image/png')
      .set('X-File-Name', 'mismatched.png')
      .send(Buffer.from('%PDF-1.7 mismatched'))
      .expect(400);
  });

  it('persists, validates, submits, reviews, and atomically approves the registration', async () => {
    const academic = await request(app)
      .get('/api/v1/academic-setup')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const session = await request(app)
      .post('/api/v1/academic-setup/activate-initial-session')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ activeTermOrdinal: 1, label: '2026/2027' })
      .expect(201);
    const classLevel = z
      .array(z.object({ code: z.string(), id: z.string() }))
      .parse(valueAt(apiData(academic), 'classLevels'))
      .find((item) => item.code === 'JSS1');
    if (classLevel === undefined) throw new Error('JSS1 class-level fixture is missing.');
    activeAcademicSessionId = stringAt(apiData(session), 'activeSession', 'id');
    jss1ClassLevelId = classLevel.id;
    const draft = await request(app)
      .get('/api/v1/student-registrations/me')
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .expect(200);
    const registrationId = stringAt(apiData(draft), 'id');
    await request(app)
      .patch('/api/v1/student-registrations/me')
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .send({
        version: numberAt(apiData(draft), 'version'),
        personal: {
          surname: 'Okafor',
          firstName: 'Chidi',
          dateOfBirth: '2014-05-11',
          gender: 'Male',
          nationality: 'Nigerian',
          stateOfOrigin: 'Lagos',
          lga: 'Ikeja',
        },
        contact: { residentialAddress: '12 Onyx College Road' },
        guardian: {
          fullName: 'Ada Okafor',
          relationship: 'Mother',
          phone: '08012345678',
          emergencyContact: true,
        },
        academic: { requestedClassLevelCode: 'JSS1' },
        medical: { allergies: 'None known' },
        customResponses: {},
      })
      .expect(200);
    const requirement = await request(app)
      .get('/api/v1/document-requirements')
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .expect(200);
    const passportRequirement = z
      .array(z.object({ code: z.string(), id: z.string() }))
      .parse(apiData(requirement))
      .find((item) => item.code === 'PASSPORT_PHOTOGRAPH');
    if (passportRequirement === undefined)
      throw new Error('Passport requirement fixture is missing.');
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    await request(app)
      .put(`/api/v1/student-documents/${passportRequirement.id}/content`)
      .set('Origin', origin)
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .set('Content-Type', 'image/png')
      .set('X-File-Name', 'passport.png')
      .send(png)
      .expect(201);
    const submitted = await request(app)
      .post('/api/v1/student-registrations/me/submit')
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .expect(200);
    expect(stringAt(apiData(submitted), 'status')).toBe('SUBMITTED');
    await request(app)
      .patch('/api/v1/student-registrations/me')
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .send({
        ...objectAt(apiData(submitted), 'data'),
        version: numberAt(apiData(submitted), 'version'),
      })
      .expect(409);
    await request(app)
      .post(`/api/v1/student-registrations/${registrationId}/start-review`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const review = await request(app)
      .get(`/api/v1/student-registrations/${registrationId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const documentId = stringAt(apiData(review), 'documents', 0, 'id');
    await request(app)
      .post(`/api/v1/student-documents/${documentId}/review`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ status: 'VERIFIED' })
      .expect(204);
    const approved = await request(app)
      .post(`/api/v1/student-registrations/${registrationId}/approve`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .set('Idempotency-Key', 'approval-student-one-2026')
      .send({
        academicSessionId: stringAt(apiData(session), 'activeSession', 'id'),
        classLevelId: classLevel.id,
      })
      .expect(200);
    expect(stringAt(apiData(approved), 'studentId')).toBe('ONYX/0001');
    expect(await StudentModel.countDocuments()).toBe(1);
    expect(await EnrollmentModel.countDocuments()).toBe(1);
    const studentLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ identifier: 'student.one', password: 'secure-student-password' })
      .expect(200);
    expect(valueAt(apiData(studentLogin), 'principal')).toMatchObject({
      accountType: 'STUDENT',
      portal: 'STUDENT',
      roles: ['STUDENT'],
    });
    approvedStudentAccessToken = authentication(studentLogin).accessToken;
    await request(app)
      .get('/api/v1/students/me/dashboard')
      .set('Authorization', `Bearer ${authentication(studentLogin).accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(apiData(response)).toMatchObject({
          studentId: 'ONYX/0001',
          currentEnrollment: { session: { label: '2026/2027' } },
        });
      });
  });

  it('protects student ownership and sensitive registration medical data', async () => {
    await request(app)
      .get('/api/v1/student-registrations/000000000000000000000000')
      .set('Authorization', `Bearer ${applicantAccessToken}`)
      .expect(403);
    const list = await request(app)
      .get('/api/v1/student-registrations')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(valueAt(apiData(list), 0, 'data', 'medical')).toEqual({});
    await request(app)
      .get('/api/v1/students/000000000000000000000000')
      .set('Authorization', `Bearer ${approvedStudentAccessToken}`)
      .expect(403);
  });

  it('limits changes-requested editing, permits resubmission, and preserves the config version', async () => {
    const token = await createApplicant('changes.student');
    const { registrationId, submitted } = await completeAndSubmit(token, {
      dateOfBirth: '2013-03-09',
      firstName: 'Amaka',
      guardianPhone: '08022223333',
      surname: 'Eze',
    });
    await request(app)
      .post(`/api/v1/student-registrations/${registrationId}/start-review`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    await request(app)
      .post(`/api/v1/student-registrations/${registrationId}/request-changes`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        allowedCorrectionFields: ['personal.surname'],
        note: 'Correct the surname spelling.',
      })
      .expect(200);
    const editable = await request(app)
      .get('/api/v1/student-registrations/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app)
      .patch('/api/v1/student-registrations/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...objectAt(apiData(editable), 'data'),
        personal: {
          ...objectAt(apiData(editable), 'data', 'personal'),
          firstName: 'Ada',
          surname: 'Ezeh',
        },
        version: numberAt(apiData(editable), 'version'),
      })
      .expect(409);
    const corrected = await request(app)
      .patch('/api/v1/student-registrations/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...objectAt(apiData(editable), 'data'),
        personal: { ...objectAt(apiData(editable), 'data', 'personal'), surname: 'Ezeh' },
        version: numberAt(apiData(editable), 'version'),
      })
      .expect(200);
    const resubmitted = await request(app)
      .post('/api/v1/student-registrations/me/submit')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(apiData(resubmitted)).toMatchObject({
      status: 'SUBMITTED',
      configuration: { id: stringAt(submitted, 'configuration', 'id') },
    });
    expect(valueAt(apiData(corrected), 'allowedCorrectionFields')).toEqual(['personal.surname']);
  });

  it('flags strong duplicates and prevents rejected-registration bypass', async () => {
    const identity = {
      dateOfBirth: '2014-05-11',
      firstName: 'Chidi',
      guardianPhone: '08012345678',
      surname: 'Okafor',
    };
    const firstToken = await createApplicant('duplicate.one');
    const first = await completeAndSubmit(firstToken, identity);
    expect(valueAt(first.submitted, 'duplicateReview')).toMatchObject({ requiresReview: true });
    await request(app)
      .post(`/api/v1/student-registrations/${first.registrationId}/start-review`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    await request(app)
      .post(`/api/v1/student-registrations/${first.registrationId}/resolve-duplicate`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ reason: 'This is a duplicate attempt.', resolution: 'DUPLICATE_REJECTED' })
      .expect(200);

    const bypassToken = await createApplicant('duplicate.two');
    const bypass = await completeAndSubmit(bypassToken, identity);
    await request(app)
      .post(`/api/v1/student-registrations/${bypass.registrationId}/start-review`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const resolved = await request(app)
      .post(`/api/v1/student-registrations/${bypass.registrationId}/resolve-duplicate`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        reason: 'Reopen the original rejected application.',
        resolution: 'ORIGINAL_REOPENED',
      })
      .expect(200);
    expect(stringAt(apiData(resolved), 'status')).toBe('REJECTED');
    await request(app)
      .get(`/api/v1/student-registrations/${first.registrationId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200)
      .expect((response) => {
        expect(stringAt(apiData(response), 'status')).toBe('UNDER_REVIEW');
      });
  });

  it('applies or rejects audited profile corrections without direct authoritative edits', async () => {
    const created = await request(app)
      .post('/api/v1/students/me/profile-correction-requests')
      .set('Authorization', `Bearer ${approvedStudentAccessToken}`)
      .send({
        field: 'surname',
        reason: 'The official spelling is Okafor-Ada.',
        requestedValue: 'Okafor-Ada',
      })
      .expect(201);
    await request(app)
      .post(`/api/v1/profile-correction-requests/${stringAt(apiData(created), 'id')}/approve`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ reason: 'Verified against the admission document.' })
      .expect(200);
    await request(app)
      .get('/api/v1/students/me/profile')
      .set('Authorization', `Bearer ${approvedStudentAccessToken}`)
      .expect(200)
      .expect((response) => {
        expect(stringAt(apiData(response), 'biodata', 'surname')).toBe('Okafor-Ada');
      });

    const rejected = await request(app)
      .post('/api/v1/students/me/profile-correction-requests')
      .set('Authorization', `Bearer ${approvedStudentAccessToken}`)
      .send({ field: 'gender', reason: 'Request review of this field.', requestedValue: 'Other' })
      .expect(201);
    await request(app)
      .post(`/api/v1/profile-correction-requests/${stringAt(apiData(rejected), 'id')}/reject`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ reason: 'The supplied evidence does not support this change.' })
      .expect(200);
    expect(
      await AuditLogModel.countDocuments({
        action: { $in: ['PROFILE_CORRECTION_APPROVED', 'PROFILE_CORRECTION_REJECTED'] },
      }),
    ).toBe(2);
  });

  it('rolls back a failed allocation and generates unique IDs under concurrent approval', async () => {
    const rollbackToken = await createApplicant('rollback.student');
    const rollback = await completeAndSubmit(rollbackToken, {
      dateOfBirth: '2013-04-01',
      firstName: 'Rollback',
      guardianPhone: '08030000001',
      surname: 'Candidate',
    });
    await beginReviewAndVerify(rollback.registrationId);
    await SequenceCounterModel.updateOne({ key: 'STUDENT_ID' }, { $set: { value: 0 } });
    await request(app)
      .post(`/api/v1/student-registrations/${rollback.registrationId}/approve`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .set('Idempotency-Key', 'rollback-approval-attempt')
      .send({ academicSessionId: activeAcademicSessionId, classLevelId: jss1ClassLevelId })
      .expect(500);
    expect(await StudentModel.exists({ sourceRegistrationId: rollback.registrationId })).toBeNull();
    expect((await SequenceCounterModel.findOne({ key: 'STUDENT_ID' }).lean())?.value).toBe(0);
    await SequenceCounterModel.updateOne({ key: 'STUDENT_ID' }, { $set: { value: 1 } });

    const tokenA = await createApplicant('concurrent.student.a');
    const tokenB = await createApplicant('concurrent.student.b');
    const [candidateA, candidateB] = await Promise.all([
      completeAndSubmit(tokenA, {
        dateOfBirth: '2013-05-01',
        firstName: 'ConcurrentA',
        guardianPhone: '08030000002',
        surname: 'Candidate',
      }),
      completeAndSubmit(tokenB, {
        dateOfBirth: '2013-06-01',
        firstName: 'ConcurrentB',
        guardianPhone: '08030000003',
        surname: 'Candidate',
      }),
    ]);
    await Promise.all([
      beginReviewAndVerify(candidateA.registrationId),
      beginReviewAndVerify(candidateB.registrationId),
    ]);
    const approvals = await Promise.all([
      request(app)
        .post(`/api/v1/student-registrations/${candidateA.registrationId}/approve`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .set('Idempotency-Key', 'concurrent-approval-a')
        .send({ academicSessionId: activeAcademicSessionId, classLevelId: jss1ClassLevelId }),
      request(app)
        .post(`/api/v1/student-registrations/${candidateB.registrationId}/approve`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .set('Idempotency-Key', 'concurrent-approval-b')
        .send({ academicSessionId: activeAcademicSessionId, classLevelId: jss1ClassLevelId }),
    ]);
    expect(approvals.map(({ status }) => status)).toEqual([200, 200]);
    expect(new Set(approvals.map((approval) => stringAt(apiData(approval), 'studentId')))).toEqual(
      new Set(['ONYX/0002', 'ONYX/0003']),
    );
    expect(await StudentModel.countDocuments()).toBe(3);
    expect(await EnrollmentModel.countDocuments()).toBe(3);
  });
});
