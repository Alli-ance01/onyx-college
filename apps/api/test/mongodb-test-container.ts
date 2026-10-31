/**
 * Shared MongoDB test container factory.
 *
 * Centralises the container image, environment workarounds, and
 * replica-set connection string builder so every integration test
 * and E2E server uses the same proven configuration.
 *
 * Workarounds applied:
 * - `GLIBC_TUNABLES=glibc.pthread.rseq=1` prevents a MongoDB 8.0
 *   crash/hang on hosts running Linux kernels ≥ 6.19 where the
 *   default glibc rseq implementation conflicts with MongoDB's
 *   bundled TCMalloc/rseq usage.
 */

import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';

export type { StartedMongoDBContainer };

/** The pinned image used by every integration and E2E test. */
const MONGO_IMAGE = 'mongo:8.0';

/**
 * Start a disposable MongoDB 8.0 replica-set container with all
 * CI-required environment workarounds pre-applied.
 */
export function createMongoTestContainer(): MongoDBContainer {
  return new MongoDBContainer(MONGO_IMAGE).withEnvironment({
    GLIBC_TUNABLES: 'glibc.pthread.rseq=1',
  });
}

/**
 * Build a connection string that forces the Mongoose/driver to use
 * `directConnection` mode and the replica-set name `rs0` set up by
 * `@testcontainers/mongodb`.
 */
export function replicaSetConnectionString(startedContainer: StartedMongoDBContainer): string {
  const url = new URL(startedContainer.getConnectionString());
  url.searchParams.set('directConnection', 'true');
  url.searchParams.set('replicaSet', 'rs0');
  return url.toString();
}
