import { createServer, type Server } from 'node:http';

import { createApp } from './app.js';
import { loadEnvironment } from './config/environment.js';
import { MongoConnection } from './platform/database/mongo-connection.js';
import { ServiceReadiness } from './platform/health/service-readiness.js';
import { createLogger } from './platform/logging/logger.js';

const shutdownTimeoutMilliseconds = 10_000;

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function startServer(): Promise<void> {
  const environment = loadEnvironment();
  const logger = createLogger(environment);
  const database = new MongoConnection(
    environment.MONGODB_URI,
    logger,
    environment.NODE_ENV !== 'production',
  );
  const readiness = new ServiceReadiness(database);

  try {
    await database.connect();
  } catch (error) {
    logger.fatal(
      { errorType: error instanceof Error ? error.name : 'UnknownError' },
      'API startup failed because MongoDB is unavailable',
    );
    process.exitCode = 1;
    return;
  }

  const app = createApp({ environment, logger, readiness });
  const server = createServer(app);
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    readiness.beginShutdown();
    logger.info({ signal }, 'Graceful shutdown started');

    const forcedExit = setTimeout(() => {
      logger.fatal('Graceful shutdown deadline exceeded');
      process.exit(1);
    }, shutdownTimeoutMilliseconds);
    forcedExit.unref();

    try {
      await closeServer(server);
      await database.disconnect();
      clearTimeout(forcedExit);
      logger.info('Graceful shutdown completed');
    } catch (error) {
      logger.error(
        { errorType: error instanceof Error ? error.name : 'UnknownError' },
        'Graceful shutdown failed',
      );
      process.exitCode = 1;
    }
  };

  server.listen(environment.PORT, () => {
    logger.info({ port: environment.PORT }, 'API listening');
  });
  server.once('error', (error) => {
    readiness.beginShutdown();
    logger.fatal({ errorType: error.name }, 'HTTP server failed and will no longer accept traffic');
    void database.disconnect().finally(() => {
      process.exitCode = 1;
    });
  });

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

void startServer().catch((error: unknown) => {
  process.stderr.write(
    `API startup failed safely (${error instanceof Error ? error.name : 'UnknownError'}).\n`,
  );
  process.exitCode = 1;
});
