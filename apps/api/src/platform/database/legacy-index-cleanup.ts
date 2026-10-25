import mongoose from 'mongoose';
import type { Logger } from 'pino';

import { applicationModels } from './application-models.js';

const legacyFieldNames = new Set([
  'admissionNumber',
  'admission_number',
  'student',
  'academicSession',
  'classLevel',
  'track',
  'guardian',
  'user',
  'teacher',
  'subject',
  'term',
]);

/**
 * Checks for and drops legacy or obsolete indexes (such as legacy `admissionNumber`
 * or `{ student: 1, academicSession: 1 }` unique indexes created by older schemas)
 * that conflict with current Onyx domain models.
 */
export async function cleanupLegacyIndexes(logger?: Logger): Promise<void> {
  const db = mongoose.connection.db;
  if (db === undefined) {
    return;
  }

  // 1. Direct collection inspection: drop any index containing legacy field names
  try {
    const collections = await db.listCollections().toArray();
    for (const colInfo of collections) {
      try {
        const collection = db.collection(colInfo.name);
        const indexes = await collection.indexes();
        for (const idx of indexes) {
          if (typeof idx.name !== 'string' || idx.name === '_id_') {
            continue;
          }

          const hasLegacyField = Object.keys(idx.key).some((field) => legacyFieldNames.has(field));
          if (hasLegacyField) {
            logger?.warn(
              { collection: colInfo.name, index: idx.name, key: idx.key },
              'Dropping legacy index conflicting with current schema',
            );
            await collection.dropIndex(idx.name);
          }
        }
      } catch (error) {
        logger?.warn(
          {
            collection: colInfo.name,
            error: error instanceof Error ? error.message : String(error),
          },
          'Could not inspect or drop legacy index on collection',
        );
      }
    }
  } catch (error) {
    logger?.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed listing collections for legacy index cleanup',
    );
  }

  // 2. Mongoose syncIndexes on all models: drop any remaining indexes not in schema
  for (const model of applicationModels) {
    try {
      if ('syncIndexes' in model && typeof model.syncIndexes === 'function') {
        const dropped = await (model as mongoose.Model<unknown>).syncIndexes({
          continueOnError: true,
        });
        if (Array.isArray(dropped) && dropped.length > 0) {
          logger?.info(
            { dropped, model: model.modelName },
            'Dropped obsolete indexes via Mongoose syncIndexes',
          );
        }
      }
    } catch (error) {
      logger?.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          model: model.modelName,
        },
        'syncIndexes completed with warnings for model',
      );
    }
  }
}
