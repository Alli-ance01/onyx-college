import { loadEnvironment } from '../config/environment.js';
import { ensureStudentOnboardingReferenceData } from '../modules/student-registration/application/reference-data.js';
import { applicationModels } from '../platform/database/application-models.js';
import { cleanupLegacyIndexes } from '../platform/database/legacy-index-cleanup.js';
import { MongoConnection } from '../platform/database/mongo-connection.js';
import { createLogger } from '../platform/logging/logger.js';

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const logger = createLogger(environment);
  const database = new MongoConnection(environment.MONGODB_URI, logger, false);

  try {
    await database.connect();
    await cleanupLegacyIndexes(logger);

    for (const model of applicationModels) {
      await model.createIndexes();
      logger.info({ model: model.modelName }, 'Database indexes verified');
    }

    await ensureStudentOnboardingReferenceData();

    process.stdout.write(
      'Database indexes verified and student reference data initialized for ' +
        String(applicationModels.length) +
        ' models.\n',
    );
  } finally {
    await database.disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    'Database index creation failed (' +
      (error instanceof Error ? error.name : 'UnknownError') +
      ').\n',
  );
  process.exitCode = 1;
});
