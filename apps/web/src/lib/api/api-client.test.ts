import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient, ApiClientError } from './api-client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function response(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('ApiClient authentication recovery', () => {
  it.each(['error', 'timeout', 'abort'])(
    'settles an upload after %s instead of leaving it pending',
    async (event) => {
      vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(function (
        this: XMLHttpRequest,
      ) {
        expect(this.timeout).toBe(120_000);
        this.dispatchEvent(new Event(event));
      });
      const client = new ApiClient({ baseUrl: '/api/v1' });
      await expect(
        client.upload(
          '/student-documents/passport/content',
          new File(['test'], 'test.png', { type: 'image/png' }),
        ),
      ).rejects.toMatchObject({
        status: 0,
        message:
          event === 'timeout'
            ? 'The upload timed out. Please try again.'
            : 'The connection was interrupted. Check your connection and try again.',
      });
    },
  );
  it('invokes fetch with the global receiver', async () => {
    const fetchMock = vi.fn<typeof fetch>(function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(response({ data: { ok: true } }, 200));
    });
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImplementation: fetchMock });

    await expect(client.request('/resource')).resolves.toEqual({ data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('refreshes and retries an idempotent read once', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          {
            error: {
              code: 'AUTHENTICATION_REQUIRED',
              message: 'Authentication is required.',
              requestId: 'req_one',
            },
          },
          401,
        ),
      )
      .mockResolvedValueOnce(response({ data: { ok: true } }, 200));
    const refreshSession = vi.fn(() => Promise.resolve(true));
    const client = new ApiClient({
      baseUrl: '/api/v1',
      fetchImplementation: fetchMock,
      sessionRefresher: { refreshSession },
    });

    await expect(client.request('/resource')).resolves.toEqual({ data: { ok: true } });
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refreshes session state but never replays a failed mutation', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response(
        {
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication is required.',
            requestId: 'req_two',
          },
        },
        401,
      ),
    );
    const refreshSession = vi.fn(() => Promise.resolve(true));
    const client = new ApiClient({
      baseUrl: '/api/v1',
      fetchImplementation: fetchMock,
      sessionRefresher: { refreshSession },
    });

    await expect(client.request('/command', { body: {}, method: 'POST' })).rejects.toBeInstanceOf(
      ApiClientError,
    );
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
