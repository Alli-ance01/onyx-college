# ADR 0008: MongoDB Outbox and Lightweight Background Worker

**Status:** Accepted with deferred implementation trigger

## Context

Notifications, file scanning, PDF rendering, cleanup, and later delivery channels should not block requests or be lost after a successful domain transaction. V1 does not justify operating Redis, Kafka, or RabbitMQ.

## Decision

Do not create or deploy a worker during the application-foundation phase. Keep module boundaries and ports ready for deferred work. When a concrete feature requires reliable asynchronous execution, write typed outbox records in the same MongoDB transaction as authoritative mutations and introduce a separate worker process from the API codebase. It will claim records/jobs with leases, validate versioned payloads, execute idempotent handlers, retry with backoff, and move exhausted work to an inspectable failed state. Use MongoDB indexes and bounded polling. Keep direct in-process events only for effects that can safely be lost.

## Alternatives Considered

- Fire-and-forget promises: rejected because process crashes lose work.
- Execute all effects before responding: rejected because external calls cannot join MongoDB transactions and PDF/scanning work harms latency.
- Redis/BullMQ: capable, but adds infrastructure before queue volume or scheduling needs justify it.
- Kafka/RabbitMQ: rejected as disproportionate operational complexity.

## Consequences

- The foundation carries no queue/outbox runtime or worker operational cost.
- The feature that triggers asynchronous execution must add MongoDB retention/index monitoring.
- At-least-once delivery means every future handler must be idempotent.
- API and future worker deploy from compatible releases and maintain payload compatibility.
- A dedicated broker can replace the adapter later if measured throughput or delivery needs require it.
