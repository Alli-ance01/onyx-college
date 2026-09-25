# ADR 0003: Short-Lived Access Tokens and Rotating Refresh Sessions

**Status:** Accepted

## Context

The React SPA needs secure browser authentication, prompt account/session revocation, future multi-device management, and protection from both XSS credential persistence and CSRF. Roles and teacher assignments can change during a session.

## Decision

Issue a short-lived signed access token stored only in browser memory and sent as a Bearer header. Keep claims minimal and resolve current account/authorization data server-side. Transport an opaque rotating refresh credential in a narrowly scoped Secure, HttpOnly, SameSite cookie; store only its keyed hash in AuthSession. Detect refresh reuse and revoke the token family. Protect cookie-authorized refresh/logout endpoints with exact origin checks, Fetch Metadata, and a session-bound CSRF header.

Use Argon2id passwords, one-time hashed reset/invitation tokens, audited session revocation, and forced password changes for temporary credentials. Bootstrap the first SUPER_ADMIN through an idempotent one-time server command, not HTTP.

## Alternatives Considered

- Access and refresh tokens in localStorage: rejected because persistent bearer-token theft amplifies XSS.
- Long-lived JWTs with embedded permissions: rejected because revocation and authority changes would be delayed.
- Cookie-based access session for every API request: viable, but requires universal CSRF handling; the chosen split makes ordinary API authorization non-ambient.
- Stateful opaque access sessions only: viable, but short signed access tokens reduce database work while AuthSession still supplies revocation boundaries.

## Consequences

- Page reload performs a secure session bootstrap before protected routes render.
- The client must coordinate concurrent refreshes and keep tokens out of persistent storage.
- XSS and CSRF controls remain necessary; HttpOnly is not a complete XSS defense.
- API instances remain horizontally scalable with shared MongoDB session state.
