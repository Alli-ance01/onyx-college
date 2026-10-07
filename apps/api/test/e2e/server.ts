import { MongoDBContainer } from '@testcontainers/mongodb';
import { z } from 'zod';
import { accounts, testPassword } from './accounts.js';
import mongoose from 'mongoose';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadEnvironment } from '../../src/config/environment.js';
import { SyncAccessControlService } from '../../src/modules/access-control/application/sync-access-control.js';
import { BootstrapSuperAdminService } from '../../src/modules/identity/application/bootstrap-super-admin.js';
import { CredentialCrypto } from '../../src/modules/identity/infrastructure/credential-crypto.js';
import { PasswordService } from '../../src/modules/identity/infrastructure/password-service.js';
import { ensureStudentOnboardingReferenceData } from '../../src/modules/student-registration/application/reference-data.js';

function value(response: request.Response, ...path: readonly (string | number)[]): unknown {
  let result: unknown = response.body;
  for (const key of path)
    result =
      typeof key === 'number'
        ? z.array(z.unknown()).parse(result)[key]
        : z.record(z.string(), z.unknown()).parse(result)[key];
  return result;
}
function text(response: request.Response, ...path: readonly (string | number)[]): string {
  return z.string().parse(value(response, ...path));
}

const origin = 'http://localhost:4173';
const container = await new MongoDBContainer('mongo:8.0').start();
const connection = new URL(container.getConnectionString());
connection.searchParams.set('replicaSet', 'rs0');
connection.searchParams.set('directConnection', 'true');
const uri = connection.toString();
await mongoose.connect(uri, { dbName: 'onyx_browser_tests' });
const environment = loadEnvironment({
  MONGODB_URI: uri,
  NODE_ENV: 'test',
  WEB_ORIGIN: origin,
  AUTH_LOGIN_RATE_LIMIT_MAX: '100',
  AUTH_REFRESH_RATE_LIMIT_MAX: '1000',
  STUDENT_SIGNUP_RATE_LIMIT_MAX: '100',
  DOCUMENT_STORAGE_LOCAL_PATH: '.data/browser-test-uploads',
});
const logger = pino({ enabled: false });
const app = createApp({ environment, logger, readiness: { isReady: () => true } });
await new SyncAccessControlService(logger).execute();
await ensureStudentOnboardingReferenceData();
await mongoose.syncIndexes();
const bootstrap = await new BootstrapSuperAdminService(
  new SyncAccessControlService(logger),
  new CredentialCrypto(environment.AUTH_REFRESH_TOKEN_PEPPER),
  new PasswordService(),
).execute({ username: accounts.admin });
const password = testPassword;
const agent = request.agent(app);
const login = await agent
  .post('/api/v1/auth/login')
  .set('Origin', origin)
  .send({ identifier: accounts.admin, password: bootstrap.temporaryPassword })
  .expect(200);
const changed = await agent
  .post('/api/v1/auth/change-password')
  .set('Origin', origin)
  .auth(text(login, 'data', 'accessToken'), { type: 'bearer' })
  .set('X-CSRF-Token', text(login, 'data', 'csrfToken'))
  .send({ currentPassword: bootstrap.temporaryPassword, newPassword: password })
  .expect(200);
const adminToken = text(changed, 'data', 'accessToken');
const setup = await agent
  .post('/api/v1/academic-setup/activate-initial-session')
  .auth(adminToken, { type: 'bearer' })
  .send({ label: '2026/2027', activeTermOrdinal: 1 })
  .expect(201);
const classLevel = z
  .array(z.object({ code: z.string(), id: z.string() }))
  .parse(value(setup, 'data', 'classLevels'))
  .find((x) => x.code === 'JSS1');
if (classLevel === undefined) throw new Error('Missing class fixture');
for (const [username, firstName, surname, phone, approve] of [
  [accounts.student, 'Amara', 'Okafor', '08012345678', true],
  [accounts.applicant, 'David', 'Adeyemi', '08012345679', false],
  [accounts.uploader, 'Fola', 'Adams', '08012345680', false],
] as const) {
  await request(app)
    .post('/api/v1/student-signups')
    .set('Origin', origin)
    .send({ username, password, passwordConfirmation: password })
    .expect(201);
  const studentLogin = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .send({ identifier: username, password })
    .expect(200);
  const token = text(studentLogin, 'data', 'accessToken');
  const draft = await request(app)
    .get('/api/v1/student-registrations/me')
    .auth(token, { type: 'bearer' })
    .expect(200);
  await request(app)
    .patch('/api/v1/student-registrations/me')
    .auth(token, { type: 'bearer' })
    .send({
      version: z.number().parse(value(draft, 'data', 'version')),
      personal: {
        surname,
        firstName,
        dateOfBirth: '2014-05-11',
        gender: 'Female',
        nationality: 'Nigerian',
        stateOfOrigin: 'Lagos',
        lga: 'Ikeja',
      },
      contact: { residentialAddress: '12 College Road, Lagos' },
      guardian: { fullName: 'Ada Okafor', relationship: 'Mother', phone, emergencyContact: true },
      academic: { requestedClassLevelCode: 'JSS1' },
      medical: {},
      customResponses: {},
    })
    .expect(200);
  if (username === accounts.uploader) continue;
  const requirements = await request(app)
    .get('/api/v1/document-requirements')
    .auth(token, { type: 'bearer' })
    .expect(200);
  const passport = z
    .array(z.object({ code: z.string(), id: z.string() }))
    .parse(value(requirements, 'data'))
    .find((x) => x.code === 'PASSPORT_PHOTOGRAPH');
  if (passport === undefined) throw new Error('Missing passport fixture');
  await request(app)
    .put(`/api/v1/student-documents/${passport.id}/content`)
    .set('Origin', origin)
    .auth(token, { type: 'bearer' })
    .set('Content-Type', 'image/png')
    .set('X-File-Name', 'passport.png')
    .send(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE1kAAAAASUVORK5CYII=',
        'base64',
      ),
    )
    .expect(201);
  await request(app)
    .post('/api/v1/student-registrations/me/submit')
    .auth(token, { type: 'bearer' })
    .expect(200);
  if (approve) {
    const registrationId = text(draft, 'data', 'id');
    await request(app)
      .post(`/api/v1/student-registrations/${registrationId}/start-review`)
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    const review = await request(app)
      .get(`/api/v1/student-registrations/${registrationId}`)
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    await request(app)
      .post(`/api/v1/student-documents/${text(review, 'data', 'documents', 0, 'id')}/review`)
      .auth(adminToken, { type: 'bearer' })
      .send({ status: 'VERIFIED' })
      .expect(204);
    await request(app)
      .post(`/api/v1/student-registrations/${registrationId}/approve`)
      .auth(adminToken, { type: 'bearer' })
      .set('Idempotency-Key', 'review-student-approval')
      .send({
        academicSessionId: text(setup, 'data', 'activeSession', 'id'),
        classLevelId: classLevel.id,
      })
      .expect(200);
  }
}

const server = app.listen(4001, '127.0.0.1', () =>
  process.stdout.write('Isolated browser-test API ready.\n'),
);
async function stop() {
  server.close();
  await mongoose.disconnect();
  await container.stop();
  process.exit(0);
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
