import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AcademicAdminService } from '../src/modules/academics/application/academic-admin-service.js';
import {
  AcademicSessionModel,
  TermModel,
} from '../src/modules/academics/infrastructure/academic-models.js';
import { AuditWriter } from '../src/modules/audit/application/audit-writer.js';
import { AuditLogModel } from '../src/modules/audit/infrastructure/audit-log-model.js';

let container: StartedMongoDBContainer | undefined;
const academics = new AcademicAdminService();
const actor = {
  actorUserId: new mongoose.Types.ObjectId().toString(),
  requestId: 'academic-session-test',
};

beforeAll(async () => {
  container = await new MongoDBContainer('mongo:8.0').start();
  const uri = new URL(container.getConnectionString());
  uri.searchParams.set('directConnection', 'true');
  uri.searchParams.set('replicaSet', 'rs0');
  await mongoose.connect(uri.toString(), { dbName: 'academic_session_tests' });
  await Promise.all([AcademicSessionModel.init(), TermModel.init(), AuditLogModel.init()]);
});
afterAll(async () => {
  await mongoose.disconnect();
  await container?.stop();
});

describe('academic session creation', () => {
  it('creates exactly three ordered terms and one audit event atomically', async () => {
    const created = await academics.createSession({ ...actor, label: '2027/2028' });
    expect(created.status).toBe('DRAFT');
    expect(created.terms.map(({ name, ordinal, status }) => ({ name, ordinal, status }))).toEqual([
      { name: 'First Term', ordinal: 1, status: 'PLANNED' },
      { name: 'Second Term', ordinal: 2, status: 'PLANNED' },
      { name: 'Third Term', ordinal: 3, status: 'PLANNED' },
    ]);
    expect(
      await AuditLogModel.countDocuments({
        action: 'ACADEMIC_SESSION_CREATED',
        targetId: created.id,
      }),
    ).toBe(1);
    await expect(academics.createSession({ ...actor, label: '2027/2028' })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(await TermModel.countDocuments({ academicSessionId: created.id })).toBe(3);
  });
  it('rolls back the session and terms when the audit write fails', async () => {
    const before = await TermModel.countDocuments();
    const audit = vi
      .spyOn(AuditWriter.prototype, 'append')
      .mockRejectedValueOnce(new Error('Audit unavailable'));
    try {
      await expect(academics.createSession({ ...actor, label: '2028/2029' })).rejects.toThrow(
        'Audit unavailable',
      );
      expect(await AcademicSessionModel.exists({ label: '2028/2029' })).toBeNull();
      expect(await TermModel.countDocuments()).toBe(before);
    } finally {
      audit.mockRestore();
    }
  });
  it('does not misreport other database failures as a duplicate session', async () => {
    const failure = new mongoose.mongo.MongoServerError({
      message: 'Database unavailable',
      code: 91,
    });
    const transaction = vi.spyOn(mongoose.connection, 'transaction').mockRejectedValueOnce(failure);
    try {
      await expect(academics.createSession({ ...actor, label: '2029/2030' })).rejects.toBe(failure);
    } finally {
      transaction.mockRestore();
    }
  });
});
