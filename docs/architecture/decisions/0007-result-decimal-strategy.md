# ADR 0007: Exact Result Arithmetic and Immutable Calculation Snapshots

**Status:** Accepted

## Context

Scores allow two decimal places. JavaScript floating-point arithmetic can produce incorrect totals, averages, boundaries, and tie rankings. Historical reports must not change when configuration or code changes.

## Decision

Accept scores as decimal strings, validate at most two fractional digits, and store scores/maxima as integer hundredths. Sum integers exactly. Use a decimal library for division/percentages and overall averages, with explicit precision and `ROUND_HALF_UP`; do not round intermediate calculations. Round the final authoritative/displayed overall average to two decimals. Persist calculation version, scheme/grading snapshots or immutable version references, exact operands, and final values in TermReport snapshots.

## Alternatives Considered

- JavaScript numbers/BSON doubles: rejected because binary floating-point is not authoritative decimal arithmetic.
- MongoDB Decimal128 throughout: viable, but conversion and cross-layer semantics are easier to misuse; integer hundredths fit the fixed score scale.
- Round every subject percentage first: rejected because accumulated rounding can alter averages and ranks.

## Consequences

- API decimal fields are strings and require deliberate serialization.
- A reviewed decimal library is still required for ratios.
- Ranking uses the final authoritative two-decimal average as specified; stable tie handling is tested.
- Changing rounding/calculation rules later requires a new calculation version and cannot rewrite published history.
