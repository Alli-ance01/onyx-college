import type { AcademicSetupDto } from '@onyx/contracts';
import mongoose from 'mongoose';

import { ConflictError, ValidationError } from '../../../app/errors/app-error.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import {
  AcademicSessionModel,
  ClassLevelModel,
  SchoolSettingsModel,
  TermModel,
  TrackModel,
} from '../infrastructure/academic-models.js';

const termNames = ['First Term', 'Second Term', 'Third Term'] as const;

export class AcademicSetupService {
  readonly #audit = new AuditWriter();

  public async get(): Promise<AcademicSetupDto> {
    const [activeSession, activeTerms, classLevels, tracks, settings] = await Promise.all([
      AcademicSessionModel.findOne({ status: 'ACTIVE' }).lean(),
      TermModel.find({ status: 'ACTIVE' }).lean(),
      ClassLevelModel.find({ status: 'ACTIVE' }).sort({ order: 1 }).lean(),
      TrackModel.find({ status: 'ACTIVE' }).sort({ name: 1 }).lean(),
      SchoolSettingsModel.findOne({ singletonKey: 'SCHOOL' }).lean(),
    ]);
    const activeTerm =
      activeTerms.length === 1 &&
      activeSession !== null &&
      activeTerms[0]?.academicSessionId.toString() === activeSession._id.toString()
        ? activeTerms[0]
        : null;
    const sessionId = activeSession?._id.toString();
    const termId = activeTerm?._id.toString();
    if (
      settings === null ||
      activeTerms.length > 1 ||
      (activeTerms.length === 1 && activeTerm === null) ||
      settings.currentAcademicSessionId?.toString() !== sessionId ||
      settings.currentTermId?.toString() !== termId
    )
      throw new ConflictError(
        'Academic session settings are inconsistent. An authorized administrator must resolve them.',
      );
    return {
      classLevels: classLevels.map((item) => ({
        code: item.code,
        id: item._id.toString(),
        name: item.name,
        stage: item.stage,
      })),
      tracks: tracks.map((item) => ({ code: item.code, id: item._id.toString(), name: item.name })),
      ...(activeSession === null
        ? {}
        : { activeSession: { id: activeSession._id.toString(), label: activeSession.label } }),
      ...(activeTerm === null
        ? {}
        : {
            activeTerm: {
              id: activeTerm._id.toString(),
              name: activeTerm.name,
              ordinal: activeTerm.ordinal,
            },
          }),
    };
  }

  public async activateInitialSession(
    input: { activeTermOrdinal: number; label: string },
    actorUserId: string,
    requestId: string,
  ): Promise<AcademicSetupDto> {
    if (!/^\d{4}\/\d{4}$/u.test(input.label))
      throw new ValidationError('Use an academic session such as 2026/2027.');
    const [start, end] = input.label.split('/').map(Number);
    if (start === undefined || end !== start + 1)
      throw new ValidationError('Academic session years must be consecutive.');
    if (![1, 2, 3].includes(input.activeTermOrdinal))
      throw new ValidationError('The active term must be First, Second, or Third Term.');
    if ((await AcademicSessionModel.exists({ status: 'ACTIVE' })) !== null)
      throw new ConflictError('An active academic session already exists.');

    await mongoose.connection.transaction(async (session) => {
      const [academicSession] = await AcademicSessionModel.create(
        [{ label: input.label, status: 'ACTIVE' }],
        { ordered: true, session },
      );
      if (academicSession === undefined) throw new Error('Academic session creation failed.');
      const terms = await TermModel.create(
        termNames.map((name, index) => ({
          academicSessionId: academicSession._id,
          name,
          ordinal: index + 1,
          status: input.activeTermOrdinal === index + 1 ? 'ACTIVE' : 'PLANNED',
        })),
        { ordered: true, session },
      );
      const activeTerm = terms.find(({ ordinal }) => ordinal === input.activeTermOrdinal);
      if (activeTerm === undefined) throw new Error('Active term creation failed.');
      await SchoolSettingsModel.updateOne(
        { singletonKey: 'SCHOOL' },
        { $set: { currentAcademicSessionId: academicSession._id, currentTermId: activeTerm._id } },
        { session },
      );
      await this.#audit.append(
        {
          action: 'ACADEMIC_SESSION_ACTIVATED',
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(actorUserId),
          changes: { activeTermOrdinal: input.activeTermOrdinal, label: input.label },
          outcome: 'SUCCESS',
          requestId,
          targetId: academicSession._id.toString(),
          targetType: 'AcademicSession',
        },
        session,
      );
    });
    return this.get();
  }
}
