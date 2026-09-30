import type { AssessmentSchemeDto, GradingSchemeDto } from '@onyx/contracts';
import mongoose from 'mongoose';

import { ConflictError, NotFoundError, ValidationError } from '../../../app/errors/app-error.js';
import { AcademicSessionModel } from '../../academics/infrastructure/academic-models.js';
import { AuditWriter } from '../../audit/application/audit-writer.js';
import {
  formatHundredths,
  parseDecimalToHundredths,
  validateAssessmentScheme,
  validateGradingScheme,
} from '../domain/result-engine.js';
import {
  AssessmentSchemeModel,
  GradingSchemeModel,
  type AssessmentSchemeRecord,
  type GradingSchemeRecord,
} from '../infrastructure/result-models.js';

function validCode(value: string): string {
  const code = value.trim().toLocaleUpperCase('en-US');
  if (!/^[A-Z0-9_-]{2,32}$/u.test(code)) {
    throw new ValidationError(
      'Scheme code must use 2 to 32 letters, numbers, hyphens, or underscores.',
    );
  }
  return code;
}

function assessmentDto(
  item: AssessmentSchemeRecord & { _id: mongoose.Types.ObjectId },
): AssessmentSchemeDto {
  return {
    academicSessionId: item.academicSessionId.toString(),
    code: item.code,
    components: item.components.map((component) => ({
      key: component.key,
      label: component.label,
      maximum: formatHundredths(component.maximumHundredths),
    })),
    id: item._id.toString(),
    name: item.name,
    status: item.status,
    totalMaximum: formatHundredths(item.totalMaximumHundredths),
    versionNumber: item.versionNumber,
  };
}

function gradingDto(
  item: GradingSchemeRecord & { _id: mongoose.Types.ObjectId },
): GradingSchemeDto {
  return {
    academicSessionId: item.academicSessionId.toString(),
    bands: item.bands.map((band) => ({
      grade: band.grade,
      maximumPercentage: formatHundredths(band.maximumPercentageHundredths),
      minimumPercentage: formatHundredths(band.minimumPercentageHundredths),
      ...(band.remark === undefined ? {} : { remark: band.remark }),
    })),
    code: item.code,
    id: item._id.toString(),
    name: item.name,
    status: item.status,
    versionNumber: item.versionNumber,
  };
}

function isDuplicateKey(error: unknown): boolean {
  return error instanceof Error && error.name === 'MongoServerError';
}

export class ResultConfigurationService {
  readonly #audit = new AuditWriter();

  public async listAssessmentSchemes(academicSessionId?: string): Promise<AssessmentSchemeDto[]> {
    const items = await AssessmentSchemeModel.find(
      academicSessionId === undefined ? {} : { academicSessionId },
    )
      .sort({ code: 1, versionNumber: -1 })
      .lean();
    return items.map((item) => assessmentDto(item));
  }

  public async listGradingSchemes(academicSessionId?: string): Promise<GradingSchemeDto[]> {
    const items = await GradingSchemeModel.find(
      academicSessionId === undefined ? {} : { academicSessionId },
    )
      .sort({ code: 1, versionNumber: -1 })
      .lean();
    return items.map((item) => gradingDto(item));
  }

  public async createAssessmentScheme(input: {
    academicSessionId: string;
    actorUserId: string;
    code: string;
    components: readonly { key: string; label: string; maximum: string }[];
    name: string;
    requestId: string;
    totalMaximum: string;
  }): Promise<AssessmentSchemeDto> {
    const sessionExists = await AcademicSessionModel.exists({ _id: input.academicSessionId });
    if (sessionExists === null) throw new NotFoundError();
    const code = validCode(input.code);
    const components = input.components.map((component) => ({
      key: component.key.trim(),
      label: component.label.trim(),
      maximumHundredths: parseDecimalToHundredths(component.maximum, 'Component maximum'),
    }));
    const totalMaximumHundredths = parseDecimalToHundredths(
      input.totalMaximum,
      'Assessment scheme maximum',
    );
    validateAssessmentScheme({ components, totalMaximumHundredths });
    const previous = await AssessmentSchemeModel.findOne({
      academicSessionId: input.academicSessionId,
      code,
    })
      .sort({ versionNumber: -1 })
      .select('versionNumber')
      .lean();
    try {
      return await mongoose.connection.transaction(async (mongoSession) => {
        const [created] = await AssessmentSchemeModel.create(
          [
            {
              academicSessionId: input.academicSessionId,
              code,
              components,
              createdByUserId: input.actorUserId,
              name: input.name.trim(),
              status: 'DRAFT',
              totalMaximumHundredths,
              versionNumber: (previous?.versionNumber ?? 0) + 1,
            },
          ],
          { session: mongoSession },
        );
        if (created === undefined) throw new Error('Assessment scheme creation failed.');
        await this.#audit.append(
          {
            action: 'ASSESSMENT_SCHEME_CREATED',
            actorType: 'USER',
            actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
            changes: { code, versionNumber: created.versionNumber },
            outcome: 'SUCCESS',
            requestId: input.requestId,
            targetId: created._id.toString(),
            targetType: 'AssessmentScheme',
          },
          mongoSession,
        );
        return assessmentDto(created.toObject());
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('This assessment scheme version already exists.');
      }
      throw error;
    }
  }

  public async createGradingScheme(input: {
    academicSessionId: string;
    actorUserId: string;
    bands: readonly {
      grade: string;
      maximumPercentage: string;
      minimumPercentage: string;
      remark?: string;
    }[];
    code: string;
    name: string;
    requestId: string;
  }): Promise<GradingSchemeDto> {
    const sessionExists = await AcademicSessionModel.exists({ _id: input.academicSessionId });
    if (sessionExists === null) throw new NotFoundError();
    const code = validCode(input.code);
    const bands = input.bands.map((band) => ({
      grade: band.grade.trim(),
      maximumPercentageHundredths: parseDecimalToHundredths(
        band.maximumPercentage,
        'Grade maximum',
      ),
      minimumPercentageHundredths: parseDecimalToHundredths(
        band.minimumPercentage,
        'Grade minimum',
      ),
      ...(band.remark === undefined ? {} : { remark: band.remark.trim() }),
    }));
    validateGradingScheme(bands);
    const previous = await GradingSchemeModel.findOne({
      academicSessionId: input.academicSessionId,
      code,
    })
      .sort({ versionNumber: -1 })
      .select('versionNumber')
      .lean();
    try {
      return await mongoose.connection.transaction(async (mongoSession) => {
        const [created] = await GradingSchemeModel.create(
          [
            {
              academicSessionId: input.academicSessionId,
              bands,
              code,
              createdByUserId: input.actorUserId,
              name: input.name.trim(),
              status: 'DRAFT',
              versionNumber: (previous?.versionNumber ?? 0) + 1,
            },
          ],
          { session: mongoSession },
        );
        if (created === undefined) throw new Error('Grading scheme creation failed.');
        await this.#audit.append(
          {
            action: 'GRADING_SCHEME_CREATED',
            actorType: 'USER',
            actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
            changes: { code, versionNumber: created.versionNumber },
            outcome: 'SUCCESS',
            requestId: input.requestId,
            targetId: created._id.toString(),
            targetType: 'GradingScheme',
          },
          mongoSession,
        );
        return gradingDto(created.toObject());
      });
    } catch (error) {
      if (isDuplicateKey(error))
        throw new ConflictError('This grading scheme version already exists.');
      throw error;
    }
  }

  public async activateAssessmentScheme(input: {
    actorUserId: string;
    requestId: string;
    schemeId: string;
  }): Promise<void> {
    await mongoose.connection.transaction(async (session) => {
      const scheme = await AssessmentSchemeModel.findOne({ _id: input.schemeId, status: 'DRAFT' })
        .session(session)
        .lean();
      if (scheme === null)
        throw new ConflictError('Only a draft assessment scheme can be activated.');
      await AssessmentSchemeModel.updateMany(
        {
          _id: { $ne: scheme._id },
          academicSessionId: scheme.academicSessionId,
          code: scheme.code,
          status: 'ACTIVE',
        },
        { $set: { status: 'RETIRED' } },
        { session },
      );
      const result = await AssessmentSchemeModel.updateOne(
        { _id: scheme._id, status: 'DRAFT' },
        { $set: { status: 'ACTIVE' } },
        { session },
      );
      if (result.modifiedCount !== 1) throw new ConflictError();
      await this.#audit.append(
        {
          action: 'ASSESSMENT_SCHEME_ACTIVATED',
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: scheme._id.toString(),
          targetType: 'AssessmentScheme',
        },
        session,
      );
    });
  }

  public async activateGradingScheme(input: {
    actorUserId: string;
    requestId: string;
    schemeId: string;
  }): Promise<void> {
    await mongoose.connection.transaction(async (session) => {
      const scheme = await GradingSchemeModel.findOne({ _id: input.schemeId, status: 'DRAFT' })
        .session(session)
        .lean();
      if (scheme === null) throw new ConflictError('Only a draft grading scheme can be activated.');
      await GradingSchemeModel.updateMany(
        {
          _id: { $ne: scheme._id },
          academicSessionId: scheme.academicSessionId,
          code: scheme.code,
          status: 'ACTIVE',
        },
        { $set: { status: 'RETIRED' } },
        { session },
      );
      const result = await GradingSchemeModel.updateOne(
        { _id: scheme._id, status: 'DRAFT' },
        { $set: { status: 'ACTIVE' } },
        { session },
      );
      if (result.modifiedCount !== 1) throw new ConflictError();
      await this.#audit.append(
        {
          action: 'GRADING_SCHEME_ACTIVATED',
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(input.actorUserId),
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: scheme._id.toString(),
          targetType: 'GradingScheme',
        },
        session,
      );
    });
  }
}
