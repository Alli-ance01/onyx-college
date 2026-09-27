import { createInterface } from 'node:readline/promises';

import { loadEnvironment } from '../config/environment.js';
import { SyncAccessControlService } from '../modules/access-control/application/sync-access-control.js';
import { BootstrapSuperAdminService } from '../modules/identity/application/bootstrap-super-admin.js';
import { CredentialCrypto } from '../modules/identity/infrastructure/credential-crypto.js';
import { MongoConnection } from '../platform/database/mongo-connection.js';
import { createLogger } from '../platform/logging/logger.js';

async function main(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('SUPER_ADMIN bootstrap requires an interactive terminal.');
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const username = (await prompt.question('Initial SUPER_ADMIN username: ')).trim();
  const emailInput = (await prompt.question('Email (optional): ')).trim();
  const confirmation = (await prompt.question(`Create initial SUPER_ADMIN "${username}"? [y/N] `))
    .trim()
    .toLocaleLowerCase('en-US');
  prompt.close();

  if (username.length < 3 || confirmation !== 'y') {
    throw new Error('Bootstrap cancelled or username is too short.');
  }

  const environment = loadEnvironment();
  const logger = createLogger(environment);
  const database = new MongoConnection(environment.MONGODB_URI, logger, true);
  try {
    await database.connect();
    const accessSync = new SyncAccessControlService(logger);
    const service = new BootstrapSuperAdminService(
      accessSync,
      new CredentialCrypto(environment.AUTH_REFRESH_TOKEN_PEPPER),
    );
    const result = await service.execute({
      username,
      ...(emailInput.length === 0 ? {} : { email: emailInput }),
    });

    process.stdout.write('\nInitial SUPER_ADMIN created successfully.\n');
    process.stdout.write(`Username: ${result.username}\n`);
    process.stdout.write(`Temporary password (shown once): ${result.temporaryPassword}\n`);
    process.stdout.write('The account must change this password at first login.\n');
  } finally {
    await database.disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `SUPER_ADMIN bootstrap failed (${error instanceof Error ? error.message : 'unknown error'}).\n`,
  );
  process.exitCode = 1;
});
