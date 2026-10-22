# Finance, inventory and integrations: correctness gates

## Financial events

- Money types: integer minor units or PostgreSQL `numeric` with explicit rounding; never IEEE floating-point for ledger calculations.
- Allocate/refund/post through authenticated server transactions with idempotency keys and uniqueness enforcement. The client shows confirmed balances after a server response and fresh read.
- Use immutable journal of posted entries, compensating reversals, and reconciliation against bank/acquirer/import totals.
- Enforce allocation cannot exceed receivable unless an explicit overpayment workflow exists; never infer paid status from an unrelated row count.
- Test retries, duplicates, concurrent requests, partial failures, date/time boundaries and currency conversion rate provenance.

## Inventory movements

- Use movement ledger and derived stock; separate on-hand, reserved and available balances. Enforce negative stock policy and location/tenant scoping at the DB boundary.
- Posting and unposting must be atomic and idempotent; reversals must link to original operation. Avoid negative quantities as an ad hoc deletion mechanism without clear semantics.
- Batch/lot movements require immutable batch IDs and traceability; verify stock invariant before/after a release.

## External sync

- Treat an upstream success status as transport information, not data correctness. Store cursor/watermark, source timestamp, expected cadence, imported/rejected count, sample keys and reconciliation total.
- Separate raw mirror data from normalized domain entities. Raw mirrors are immutable or append-only where practical; parsers are deterministic and versioned.
- Use upsert with stable external unique key, bounded retries, dead-letter tracking and quarantined invalid rows; never duplicate on reprocessing.
- Detect silent success with stagnant source or unchanged destination; confirm independent activity before declaring incident.

## Impact analysis before fixing a filter

Compute how many previously excluded rows/actions become eligible when a guard changes. For reminders, charges, stock posting or notification queues, block bulk operations until stale records and side effects are independently reviewed.

## Evidence checklist

Before declaring a financial/inventory/sync fix shipped: source-vs-destination totals, unique keys, operation idempotency, permission checks, timestamp freshness, downstream side effects and reconciliation exception count must be reviewed. Record what was actually checked vs assumed.
