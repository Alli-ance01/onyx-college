import type { DatabaseReadiness } from '../database/mongo-connection.js';

export interface ReadinessProbe {
  isReady(): boolean;
}

export class ServiceReadiness implements ReadinessProbe {
  readonly #database: DatabaseReadiness;
  #acceptingTraffic = true;

  public constructor(database: DatabaseReadiness) {
    this.#database = database;
  }

  public beginShutdown(): void {
    this.#acceptingTraffic = false;
  }

  public isReady(): boolean {
    return this.#acceptingTraffic && this.#database.isReady();
  }
}
