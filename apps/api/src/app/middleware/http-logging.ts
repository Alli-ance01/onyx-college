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
  });
}
