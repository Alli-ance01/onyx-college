# ADR 0005: Private S3-Compatible Object Storage

**Status:** Superseded by [ADR 0009](0009-cloudinary-production-storage.md)

## Context

Student documents, assignment attachments, school assets, and report-card PDFs must not be stored in MongoDB. Most are sensitive, files may be large, and direct API proxying would waste application capacity.

## Decision

Use Cloudflare R2 as the preferred private S3-compatible provider behind a storage port. Upload through short-lived presigned PUT URLs to quarantine keys, then verify metadata/content and malware-scan before availability. Issue short-lived signed GET URLs only after current authorization. Store metadata, lifecycle, checksum, versions, and resource relationships in MongoDB. Keep public school assets explicitly separated.

## Alternatives Considered

- AWS S3: fully viable and the fallback provider; R2 is preferred initially for simple S3 compatibility and cost profile.
- Cloudinary: useful for public/media transformation but less natural as the primary store for private academic documents and arbitrary attachments.
- MongoDB GridFS: rejected because it increases database load/backup size and provides weaker object-delivery economics.
- Local disk: rejected because it is ephemeral, hard to scale, and unsuitable for independent backups.

## Consequences

- The application needs orphan/quarantine cleanup and explicit replacement/deletion workflows.
- Presigned URLs are bearer credentials and require narrow operations, short expiry, and log redaction.
- Provider-specific calls stay in one adapter, preserving an S3 migration path.
- Malware scanning provider and per-purpose size/type limits need production approval.

This record remains as the history of the original recommendation. The production-provider decision and implemented delivery model are now defined by ADR 0009.
