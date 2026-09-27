# ADR 0009: Cloudinary Production Object Storage

**Status:** Accepted

## Context

Student passport photographs, birth certificates, admission documents, other configured student documents, and future assignment attachments must remain outside MongoDB. The storage boundary was deliberately provider-neutral, but ADR 0005 left Cloudflare R2 as the preferred provider. The production provider has now been approved as Cloudinary, and sensitive student files must never rely on public delivery.

## Decision

Use Cloudinary as the concrete production implementation of the existing document-storage port. Upload sensitive assets with Cloudinary's `authenticated` delivery type and opaque provider public IDs. The API validates the authenticated actor, ownership or document permission, resource state, declared MIME type, detected file signature, purpose allowlist, and size before persisting an available file record. MongoDB stores metadata and lifecycle state only, including provider identifiers required to address the asset; binary or base64 content is never stored there.

The current onboarding flow sends a bounded raw JPEG, PNG, or PDF body to the API. After validation, the API uploads it through the Cloudinary adapter and verifies the provider response before committing metadata. The API authorizes every protected read, then returns a short-lived signed Cloudinary URL. Cloudinary credentials and signing authority remain backend-only. Local private storage remains a development/test adapter and is refused in production.

Replacement creates a new asset and metadata version rather than overwriting the prior evidence. Removal uses an explicit pending state, an idempotent provider delete, and a final metadata transition so partial failures are visible and retryable. Provider calls do not occur inside MongoDB transactions. The same storage port is available to future assignment attachments without coupling that domain to Cloudinary.

No background worker is created by this decision. Cleanup or reconciliation may move to the already documented deferred worker only when a concrete operational feature justifies it.

## Alternatives Considered

- Cloudflare R2/AWS S3-compatible storage: remains a viable future adapter and was the original recommendation, but it is no longer the selected production provider.
- Public Cloudinary delivery: rejected for student documents because an unguessable URL is not authorization.
- MongoDB GridFS or embedded binary/base64 data: rejected because it mixes file delivery with the authoritative database and enlarges backups.
- Production local disk: rejected because hosted disks may be ephemeral and do not provide the required private delivery model.

## Consequences

- Production requires `DOCUMENT_STORAGE_DRIVER=cloudinary`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
- Protected URLs are short-lived bearer credentials; they must not be logged, cached, embedded in durable DTOs, or treated as revocable sessions.
- Cloudinary resource type, delivery type, public ID, asset ID/version when returned, format, original filename, MIME type, size, checksum, requirement, upload state, and review state remain explicit metadata.
- A Cloudinary outage can make uploads, replacements, removals, and newly signed downloads temporarily unavailable without weakening authorization.
- Provider-contract tests and a credentialed pre-production smoke test are required before accepting real student files.
- Malware scanning remains a separate launch decision; choosing Cloudinary does not provide or imply malware clearance.
