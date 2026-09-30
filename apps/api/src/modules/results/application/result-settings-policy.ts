import type { ClientSession } from 'mongoose';

import { SchoolSettingsModel } from '../../academics/infrastructure/academic-models.js';
import type {
  ClassPositionContext,
  ClassPositionPolicy,
  SchoolIdentityProvider,
} from './result-batch-service.js';

export class MongoResultSettingsPolicy implements ClassPositionPolicy, SchoolIdentityProvider {
  public async enabledFor(context: ClassPositionContext, session: ClientSession): Promise<boolean> {
    const settings = await SchoolSettingsModel.findOne({ singletonKey: 'SCHOOL' })
      .session(session)
      .lean();
    if (settings === null) return false;
    const trackKey = context.trackId ?? 'NONE';
    return (settings.classPositionContexts ?? []).some(
      (candidate) =>
        candidate.enabled &&
        candidate.academicSessionId.toString() === context.academicSessionId &&
        candidate.termId.toString() === context.termId &&
        candidate.classLevelId.toString() === context.classLevelId &&
        candidate.normalizedTrackKey === trackKey,
    );
  }

  public async schoolName(session: ClientSession): Promise<string> {
    const settings = await SchoolSettingsModel.findOne({ singletonKey: 'SCHOOL' })
      .session(session)
      .select('schoolIdentity.displayName')
      .lean();
    return settings?.schoolIdentity?.displayName ?? 'Onyx College';
  }
}
