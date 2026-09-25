import { z } from 'zod';

import type { AccessTokenProvider, SessionRefresher } from '../auth/auth-session.js';

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    message: z.string(),
    requestId: z.string(),
  }),
});

type ClientErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly details: Readonly<Record<string, unknown>> | undefined;
  public readonly requestId: string | undefined;
  public readonly status: number;

  public constructor(status: number, envelope?: ClientErrorEnvelope) {
    super(envelope?.error.message ?? 'The request could not be completed.');
    this.name = 'ApiClientError';
    this.status = status;
    this.code = envelope?.error.code ?? 'UNEXPECTED_RESPONSE';
    this.details = envelope?.error.details;
    this.requestId = envelope?.error.requestId;
  }
}

interface ApiClientOptions {
  accessTokenProvider?: AccessTokenProvider;
  baseUrl: string;
  fetchImplementation?: typeof fetch;
  sessionRefresher?: SessionRefresher;
}

interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown;
  headers?: HeadersInit;
}

export class ApiClient {
  readonly #accessTokenProvider: AccessTokenProvider | undefined;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #sessionRefresher: SessionRefresher | undefined;

  public constructor(options: ApiClientOptions) {
    this.#accessTokenProvider = options.accessTokenProvider;
    this.#baseUrl = options.baseUrl.replace(/\/$/u, '');
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#sessionRefresher = options.sessionRefresher;
  }

  public async request<TResponse>(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<TResponse> {
    return this.#request<TResponse>(path, options, false);
  }

  async #request<TResponse>(
    path: string,
    options: ApiRequestOptions,
    retriedAfterRefresh: boolean,
  ): Promise<TResponse> {
    const { body: requestBody, headers: requestHeaders, ...requestOptions } = options;
    const headers = new Headers(requestHeaders);
    const accessToken = this.#accessTokenProvider?.getAccessToken();

    headers.set('Accept', 'application/json');
    headers.set('X-Request-Id', `web_${crypto.randomUUID()}`);

    if (accessToken !== undefined && accessToken !== null) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const body = requestBody === undefined ? undefined : JSON.stringify(requestBody);
    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    const requestInit: RequestInit = {
      ...requestOptions,
      credentials: 'include',
      headers,
      ...(body === undefined ? {} : { body }),
    };
    const response = await this.#fetch(`${this.#baseUrl}${path}`, requestInit);

    if (
      response.status === 401 &&
      !retriedAfterRefresh &&
      this.#sessionRefresher !== undefined &&
      (await this.#sessionRefresher.refreshSession())
    ) {
      return this.#request<TResponse>(path, options, true);
    }

    if (!response.ok) {
      const errorPayload = await this.#readJson(response);
      const parsed = errorEnvelopeSchema.safeParse(errorPayload);
      throw new ApiClientError(response.status, parsed.success ? parsed.data : undefined);
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await response.json()) as TResponse;
  }

  async #readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }
}
