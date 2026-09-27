import { loadEnvironment } from '../config/environment.js';
import { SyncAccessControlService } from '../modules/access-control/application/sync-access-control.js';
import { MongoConnection } from '../platform/database/mongo-connection.js';
import { createLogger } from '../platform/logging/logger.js';

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const logger = createLogger(environment);
  const database = new MongoConnection(environment.MONGODB_URI, logger, true);

  try {
    await database.connect();
    const result = await new SyncAccessControlService(logger).execute();
    process.stdout.write(
      `Access control synchronized: ${String(result.permissionCount)} permissions, ${String(result.roleCount)} roles, changed=${String(result.changed)}.\n`,
    );
  } finally {
    await database.disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Access-control synchronization failed (${error instanceof Error ? error.message : 'unknown error'}).\n`,
  );
  process.exitCode = 1;
});
