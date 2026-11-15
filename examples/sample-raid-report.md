# Synthetic RAID report — ghost class 7 (check-then-act race)

**Demonstration only.** All entities, paths and numbers in this report are
fictional. No target repository was scanned and no code was executed.
This file is a format example, **not** evidence of a newly discovered bug.

## Scope and coverage

- Mode: RAID / chat-safe illustrative report
- Source: synthetic thought experiment; no actual code fetched
- Source revision: UNVERIFIED
- Coverage: PARTIAL (illustrative one-file hypothetical); no repository-wide scan
- Root-cause cluster: UNVERIFIED; only one candidate discussed
- Impact: possible duplicate order reservation, **not observed**

## Candidate GHOST-SYN-001

| Field | Value |
| --- | --- |
| Class | 7 — Check-then-act race |
| Code anchor | `fixtures/reservations.js:18` — **FICTIONAL**, not a real source anchor |
| Contract | At most one successful reservation per order, if required by product specification (INFERRED) |
| Trigger | Two authorized requests for the same order overlap between reading state and recording reservation |
| Derived behavior | If no constraint or serialization protects the state transition, both requests **may** see pending and both may write reserved |
| Runtime observation | NOT_OBSERVED |
| Expected state | One durable reservation, one request recognized as replay/conflict |
| Actual state | UNKNOWN — never substitute the predicted double-write for a measurement |
| Negative control | Distinct order keys should independently reserve; not run |
| Reproduction | NOT_RUN; requires disposable database, approved contract and concurrency harness |
| Falsifier | Durable unique key or correctly scoped transaction serializes both attempts |
| Evidence | E0 / SUSPECTED, inferred contract |
| Fix candidate | Make reservation atomic under a verified uniqueness/transaction guarantee; not implemented |

## Required proof before escalation

1. Establish the real API and database contract with authorized owners.
2. Identify an actual source file/line and schema/index implementation.
3. Run two identical requests under controlled isolation and capture durable
   row counts, transactions and unique-key semantics.
4. Run the independent negative control and repeat the run.
5. Record source SHA, exact input, environment, expected vs observed and a
   falsifying test. Only then consider evidence promotion.

## Safety

Do not execute the suggested test against a live payment or customer system.
Do not post private evidence to this public repository. See
[security policy](../SECURITY.md) and [evidence ledger](../references/evidence-ledger.md).
