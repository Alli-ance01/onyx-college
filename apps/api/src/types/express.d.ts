import type { AuthenticatedPrincipal } from '@onyx/contracts';

declare global {
  namespace Express {
    interface Request {
      authPrincipal?: AuthenticatedPrincipal;
      requestId: string;
    }
  }
}

export {};
