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
    super(
      envelope?.error.message ??
        (status === 0
          ? 'The connection was interrupted. Check your connection and try again.'
          : 'The request could not be completed.'),
    );
    this.name = 'ApiClientError';
    this.status = status;
    this.code = envelope?.error.code ?? 'UNEXPECTED_RESPONSE';
    this.details = envelope?.error.details;
    this.requestId = envelope?.error.requestId;
  }

  public static async fromResponse(response: Response): Promise<ApiClientError> {
    try {
      const payload: unknown = await response.json();
      const parsed = errorEnvelopeSchema.safeParse(payload);
      return new ApiClientError(response.status, parsed.success ? parsed.data : undefined);
    } catch {
      return new ApiClientError(response.status);
    }
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
    this.#fetch = (options.fetchImplementation ?? globalThis.fetch).bind(globalThis);
    this.#sessionRefresher = options.sessionRefresher;
  }

  public async request<TResponse>(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<TResponse> {
    return this.#request<TResponse>(path, options, false);
  }

  public upload<TResponse>(
    path: string,
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<TResponse> {
    return this.uploadWithMethod(path, file, 'PUT', onProgress);
  }

  public async uploadWithMethod<TResponse>(
    path: string,
    file: File,
    method: 'POST' | 'PUT',
    onProgress?: (percent: number) => void,
  ): Promise<TResponse> {
    try {
      return await this.#upload<TResponse>(path, file, method, onProgress);
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status === 401 &&
        this.#sessionRefresher !== undefined
      ) {
        if (await this.#sessionRefresher.refreshSession()) {
          error.message = 'Your session was refreshed. Please try the upload again.';
        }
      }
      throw error;
    }
  }

  #upload<TResponse>(
    path: string,
    file: File,
    method: 'POST' | 'PUT',
    onProgress?: (percent: number) => void,
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open(method, `${this.#baseUrl}${path}`);
      request.responseType = 'json';
      request.withCredentials = true;
      request.timeout = 120_000;
      request.setRequestHeader('Accept', 'application/json');
      request.setRequestHeader('Content-Type', file.type);
      request.setRequestHeader('X-File-Name', file.name);
      request.setRequestHeader('X-Request-Id', `web_${crypto.randomUUID()}`);
      const accessToken = this.#accessTokenProvider?.getAccessToken();
      if (accessToken !== undefined && accessToken !== null)
        request.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
      });
      request.addEventListener('load', () => {
        const parsed = errorEnvelopeSchema.safeParse(request.response);
        if (request.status >= 200 && request.status < 300) resolve(request.response as TResponse);
        else reject(new ApiClientError(request.status, parsed.success ? parsed.data : undefined));
      });
      request.addEventListener('error', () => {
        reject(new ApiClientError(0));
      });
      request.addEventListener('timeout', () => {
        const error = new ApiClientError(0);
        error.message = 'The upload timed out. Please try again.';
        reject(error);
      });
      request.addEventListener('abort', () => {
        reject(new ApiClientError(0));
      });
      request.send(file);
    });
  }

  public async download(path: string, retriedAfterRefresh = false): Promise<Blob> {
    const headers = new Headers({ Accept: '*/*', 'X-Request-Id': `web_${crypto.randomUUID()}` });
    const accessToken = this.#accessTokenProvider?.getAccessToken();
    if (accessToken !== undefined && accessToken !== null)
      headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      credentials: 'include',
      headers,
    });
    if (
      response.status === 401 &&
      !retriedAfterRefresh &&
      this.#sessionRefresher !== undefined &&
      (await this.#sessionRefresher.refreshSession())
    )
      return this.download(path, true);
    if (!response.ok) throw await ApiClientError.fromResponse(response);
    return response.blob();
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

    const method = (requestOptions.method ?? 'GET').toUpperCase();
    const safeToRetry = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
    if (response.status === 401 && !retriedAfterRefresh && this.#sessionRefresher !== undefined) {
      const refreshed = await this.#sessionRefresher.refreshSession();
      if (refreshed && safeToRetry) {
        return this.#request<TResponse>(path, options, true);
      }
    }

    if (!response.ok) {
      throw await ApiClientError.fromResponse(response);
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await response.json()) as TResponse;
  }
}
