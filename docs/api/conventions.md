# Onyx College Portal — API Conventions

## Scope and versioning

All application endpoints are under `/api/v1`. Health endpoints may live outside the versioned business surface. The major version changes only for an intentionally breaking contract; additive fields and endpoints do not require a new major version.

The API uses JSON over HTTPS except for direct object-storage transfers. Clients send `Accept: application/json`; mutation bodies send `Content-Type: application/json`. Unsupported media types are rejected.

Routes represent resources where that is clear and command endpoints for real domain transitions. Do not encode workflows as arbitrary field patches.

Examples:

```text
GET    /api/v1/student-registrations/:registrationId
POST   /api/v1/student-registrations/:registrationId/submit
POST   /api/v1/student-registrations/:registrationId/approve
POST   /api/v1/student-registrations/:registrationId/request-changes
POST   /api/v1/student-registrations/:registrationId/reopen

GET    /api/v1/result-batches/:batchId
POST   /api/v1/result-batches/:batchId/submit
POST   /api/v1/result-batches/:batchId/start-review
POST   /api/v1/result-batches/:batchId/return-for-correction
POST   /api/v1/result-batches/:batchId/approve
POST   /api/v1/result-batches/:batchId/publish

POST   /api/v1/enrollments/:enrollmentId/promote
POST   /api/v1/result-correction-requests/:requestId/approve
POST   /api/v1/result-correction-requests/:requestId/apply
```

Nouns are plural and kebab-case. Path nesting is shallow; filter by related resource rather than nesting several levels. Command names are verbs because they expose explicit state transitions.

## Resource identifiers

MongoDB object IDs are serialized as opaque strings. Clients must not parse or infer ordering from them. Human identifiers such as `ONYX/0042` are separate fields and are never substituted for authorization.

Path parameter names are descriptive (`studentId`, `batchId`), not generic `id` where multiple IDs may appear. The API may return a 404 instead of 403 when revealing resource existence would leak sensitive information.

## Request validation

Every endpoint validates path parameters, query parameters, headers, and body against an explicit schema before the handler. Mutation schemas reject unknown fields. Query/filter schemas allow only documented keys and operators.

Clients send decimals such as scores as strings with up to two fractional digits:

```json
{ "state": "SCORED", "score": "37.50" }
```

Date-only values use `YYYY-MM-DD`; instants use RFC 3339/ISO 8601 UTC with `Z`. The server does not infer a timezone from an ambiguous timestamp.

## Success responses

Single resource:

```json
{
  "data": {
    "id": "66f...",
    "status": "SUBMITTED",
    "version": 3
  }
}
```

Collection:

```json
{
  "data": [{ "id": "66f...", "status": "ACTIVE" }],
  "meta": {
    "pageSize": 25,
    "hasMore": true,
    "nextCursor": "opaque-cursor"
  },
  "links": {
    "next": "/api/v1/students?cursor=opaque-cursor&pageSize=25"
  }
}
```

`data` is always the primary successful payload. `meta` contains pagination or request-specific metadata; `links` is optional. Creation returns `201` and a `Location` header. A successful command can return the updated resource or `202` with a job/status resource when deferred. `204` is reserved for success with genuinely no response body.

Responses are explicit DTOs. Password/token hashes, raw secrets, internal storage keys, Mongoose metadata, and unauthorized sensitive fields never appear.

## Error responses

All expected and unexpected failures use:

```json
{
  "error": {
    "code": "RESULT_BATCH_STATE_CONFLICT",
    "message": "The result batch cannot be submitted in its current state.",
    "details": {
      "currentState": "PUBLISHED",
      "allowedStates": ["DRAFT", "RETURNED_FOR_CORRECTION"]
    },
    "requestId": "req_01..."
  }
}
```

Validation failure:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request contains invalid values.",
    "details": {
      "issues": [
        {
          "path": "components.0.score",
          "code": "INVALID_DECIMAL_SCALE",
          "message": "Use no more than two decimal places."
        }
      ]
    },
    "requestId": "req_01..."
  }
}
```

Error `code` is stable, uppercase snake case, and suitable for client branching/localization. `message` is safe for users but is not a stable programmatic contract. `details` is optional and allowlisted per error; it never contains stack traces, database errors, filesystem paths, secrets, raw query objects, or sensitive records.

### HTTP mapping

| Status | Meaning                                                                                                |
| -----: | ------------------------------------------------------------------------------------------------------ |
|    400 | Invalid syntax/shape/filter                                                                            |
|    401 | Authentication missing, expired, or invalid                                                            |
|    403 | Authenticated but forbidden by permission/ownership/scope/state policy                                 |
|    404 | Resource absent or existence intentionally concealed                                                   |
|    409 | Unique, duplicate, or domain-state conflict                                                            |
|    412 | `If-Match`/expected version is stale                                                                   |
|    413 | Request/upload exceeds declared limit                                                                  |
|    415 | Unsupported content type                                                                               |
|    422 | Reserved for semantically invalid commands only if a consistent need emerges; V1 should prefer 400/409 |
|    429 | Rate limit exceeded; include `Retry-After` when known                                                  |
|    500 | Unexpected safe failure                                                                                |
|    503 | Critical dependency unavailable/not ready                                                              |

## Pagination

Cursor pagination is the default for unbounded collections:

```text
?pageSize=25&cursor=<opaque>
```

Default and maximum page sizes are endpoint-specific and bounded. Cursors are opaque, integrity-protected encodings of the stable sort boundary and filter version. They do not grant access and are reauthorized on each request.

Offset/page pagination may be used for small, stable configuration lists or a deliberately designed report that needs page numbers. It is not the default for students, audit logs, notifications, or other growing collections.

## Filtering, sorting, and search

Filters use explicit keys:

```text
?filter[status]=PENDING_REVIEW&filter[classLevelId]=...&filter[termId]=...
```

Repeated values or comma-separated enums may be supported only when documented for the endpoint. Clients cannot submit raw MongoDB operators.

Sorting uses a documented comma-separated allowlist; `-` means descending:

```text
?sort=-submittedAt,surname
```

Every collection has a deterministic tie-breaker, normally ID. Unsupported sort/filter fields return validation errors rather than being ignored.

Free-text search uses `q`, is normalized and length-limited, and searches only documented fields. Email alone is never treated as student identity. Search behavior and ranking are endpoint-specific; regex supplied by users is not passed directly to MongoDB.

## Field representation

- JSON property names are camelCase.
- Domain enums are uppercase strings exactly as documented (`PENDING_REVIEW`, `RETURNED_FOR_CORRECTION`, `EXEMPT`).
- Booleans are true JSON booleans; absence is not overloaded as false.
- Money is not part of V1.
- Scores use decimal strings at the API boundary.
- Calculated percentages/averages are returned as fixed-scale strings plus raw exact operands where a specific administrative view needs them.
- Date-only data is `YYYY-MM-DD`; timestamps are UTC strings.
- Optional fields are omitted when not applicable. `null` is used only when the distinction from absent is part of the contract.
- Server-managed `createdAt`, `updatedAt`, and integer `version` are included where useful.

## Authentication and session endpoints

Protected resource requests send:

```text
Authorization: Bearer <short-lived-access-token>
```

The refresh credential is an HttpOnly cookie and is never returned in JSON. Refresh/logout requests include credentials, the required CSRF header, and originate from the allowed portal origin. The API returns `Cache-Control: no-store` for auth and sensitive responses.

401 means the client may attempt one coordinated refresh when appropriate. A retry that still returns 401 clears local authentication. 403 is not refreshed automatically.

The current-principal response may expose effective permissions and lifecycle/navigation facts but not refresh credentials or claims of broad teacher scope.

## Idempotency

Commands that allocate identifiers, create multi-document outcomes, publish records, or may be retried after an ambiguous network result accept:

```text
Idempotency-Key: <client-generated-random-key>
```

Required candidates include registration approval, promotion, result publication/correction application, invitation creation, and upload completion. The key is scoped to authenticated actor and command route. The server stores a canonical request hash and completed response for a bounded period. Reusing a key with a different request returns `409 IDEMPOTENCY_KEY_REUSED`.

Idempotency does not bypass current authorization. A replay returns the prior committed outcome only to an actor still permitted to know it, or a safe conflict.

## Optimistic concurrency

Mutable resources expose an integer `version` and an ETag such as:

```text
ETag: "registration-config-7"
```

Updates and sensitive commands send `If-Match`. A stale version returns `412 PRECONDITION_FAILED` with the current safe version metadata. Commands also enforce expected domain state, returning `409` when the version is current but the transition is illegal.

Use this for form configuration drafts, academic configuration, profiles, assignment drafts, announcements, result batches, and correction review. Published snapshots are not updated at all.

## File upload and download flow

Binary content is not proxied through normal JSON routes by default and is never stored in MongoDB.

1. `POST /api/v1/upload-intents` with purpose, related resource, safe filename, declared MIME, size, and checksum when supported.
2. API authorizes and returns an intent ID, expiry, required headers, and presigned PUT URL for a quarantine key.
3. Client uploads directly to object storage using exactly those headers.
4. `POST /api/v1/upload-intents/:intentId/complete` verifies and queues scanning.
5. The client polls/queries the associated document/attachment resource until it is `AVAILABLE`, `REJECTED`, or requires document review.

Presigned URLs are never embedded in durable resource DTOs. An authorized `POST .../:fileId/download-url` or equivalent action returns a short-lived signed GET URL. The API can instead redirect only if cache, audit, and browser behavior are acceptable.

Multipart API upload may be retained for very small controlled assets if implementation constraints justify it; it follows the same scanning and metadata lifecycle.

## Asynchronous commands

A command that commits authoritative state but defers delivery/rendering returns the committed resource state and optional job status:

```json
{
  "data": {
    "reportId": "66f...",
    "publicationStatus": "PUBLISHED",
    "pdfStatus": "PENDING"
  }
}
```

PDF failure does not roll back a valid published result; it becomes an observable retryable operational state. The API never reports a notification/PDF as delivered merely because work was queued.

## Request IDs and observability

The API accepts a syntactically safe `X-Request-Id` or generates one, returns it on every response, and includes it in logs, audit context where appropriate, and errors. Client-supplied values are length/character bounded and do not replace internal trace identifiers.

Deprecation and sunset headers accompany any future retired endpoint. API responses do not expose infrastructure topology or implementation version details beyond an approved release identifier.
