import mongoose from 'mongoose';
import type { Logger } from 'pino';

export interface DatabaseReadiness {
  isReady(): boolean;
}

export interface DatabaseConnection extends DatabaseReadiness {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export class MongoConnection implements DatabaseConnection {
  readonly #autoIndex: boolean;
  readonly #logger: Logger;
  readonly #uri: string;

  public constructor(uri: string, logger: Logger, autoIndex: boolean) {
    this.#uri = uri;
    this.#logger = logger;
    this.#autoIndex = autoIndex;
  }

  public async connect(): Promise<void> {
    this.#logger.info('Connecting to MongoDB');

    await mongoose.connect(this.#uri, {
      autoIndex: this.#autoIndex,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    });

    this.#logger.info('MongoDB connection established');
  }

  public async disconnect(): Promise<void> {
    if (mongoose.connection.readyState === mongoose.ConnectionStates.disconnected) {
      return;
    }

    await mongoose.disconnect();
    this.#logger.info('MongoDB connection closed');
  }

  public isReady(): boolean {
    return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
  }
}
