import mongoose from 'mongoose';
import type { Logger } from 'pino';

/**
 * Checks for and drops legacy or obsolete indexes (such as legacy `admissionNumber` unique indexes
 * created by older prototypes or external database schemas) that conflict with Onyx domain models.
 */
export async function cleanupLegacyIndexes(logger?: Logger): Promise<void> {
  const db = mongoose.connection.db;
  if (db === undefined) {
    return;
  }

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
          if ('admissionNumber' in idx.key || 'admission_number' in idx.key) {
            logger?.warn(
              { collection: colInfo.name, index: idx.name },
              'Dropping legacy index conflicting with student schema',
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
}
