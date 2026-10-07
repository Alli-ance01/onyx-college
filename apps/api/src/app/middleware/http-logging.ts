import type { IncomingMessage } from 'node:http';

import type { Logger } from 'pino';
import { pinoHttp, type HttpLogger } from 'pino-http';

interface RequestWithId extends IncomingMessage {
  requestId?: string;
}

export function httpLogging(logger: Logger): HttpLogger<RequestWithId> {
  return pinoHttp<RequestWithId>({
    customProps: (request: RequestWithId) => ({ requestId: request.requestId }),
    logger,
    // Allowlist metadata here even when the caller supplies a logger without redaction.
    serializers: {
      req: (request: { id: unknown; method: string; url: string }) => ({
        id: request.id,
        method: request.method,
        url: request.url.split('?', 1)[0],
      }),
      res: (response: { statusCode: number }) => ({ statusCode: response.statusCode }),
    },
  });
}
