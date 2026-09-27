# ADR 0004: MongoDB Transactions and Consistency Boundaries

**Status:** Accepted

## Context

Registration approval, promotion, result publication/correction, and academic-context switching update several canonical entities. Partial success would corrupt identity, academic history, or student-visible results.

## Decision

Run MongoDB as a replica set and use bounded multi-document transactions for defined consistency boundaries. A UnitOfWork shares the MongoDB session across repositories, audit, idempotency, and outbox writes. Use majority durability, conditional state/version updates, database unique constraints, and bounded retries for transient transaction errors and unknown commit results. Never call external services inside a database transaction.

## Alternatives Considered

- Eventual consistency for core workflows: rejected because partially approved students or partially published reports are unacceptable.
- Denormalizing all workflow data into giant documents: rejected because canonical entities have independent lifecycle/history and unbounded growth risks.
- Two-phase commit with external services: rejected. Current bounded storage operations use explicit lifecycle states, verified provider responses, compensating cleanup, and idempotent retry outside transactions. Effects that must follow an authoritative business commit use the outbox and, once approved, idempotent jobs.
- Transactions for every write: rejected because single-document atomicity is enough for many low-risk operations.

## Consequences

- Production and integration environments require replica sets.
- Transactions remain short, bounded, and free of external I/O.
- Large cohort publication may require staged immutable candidates plus an atomic visibility marker.
- Transaction failure injection and concurrency tests are mandatory.
