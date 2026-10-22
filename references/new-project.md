# New CRM/ERP or back-office from scratch

## Discover first

Confirm intended users, countries/privacy obligations, real data vs synthetic prototype, sales/inventory/accounting flows, tenant separation, deployment targets, current integrations, operational constraints, and the team's ability to maintain the stack. Identify what is *not* in MVP.

## Foundation sequence

1. Choose a maintainable stack based on requirements; React + TypeScript + PostgreSQL/Supabase is one option, not a universal mandate.
2. Set up strict types, formatting/lint, unit tests, integration tests, preview deploys and CI before business modules.
3. Model domain facts and sources of truth. Distinguish transactions from derived reports, and owned data from imported mirrors.
4. Choose real authentication **before** enabling customer, employee, financial or production data. Build deny-by-default RLS/API authorization with role/tenant matrix. No unrestricted anon CRUD.
5. Establish domain error codes, idempotency convention, audit trail, pagination strategy, data-retention/privacy rules and monitoring.
6. Build common shell/navigation, accessible controls, error/empty states and reusable CRUD only after validating at least one representative workflow. Avoid abstraction-first architecture without a consumer.
7. Implement a small first vertical slice end-to-end: pure logic → tests → API → secure migration → UI → integration tests → staging review.
8. Roll out with explicit approval and verify schema, identity, user access, data freshness and business outcome.

## Project-specific early choices

- **Money**: currency and integer minor-unit/DECIMAL policy, FX timestamps, rounding, append-only ledger, double-entry when needed, reconciliation and reversal flows.
- **Inventory**: movement ledger, allocations, batches, returns, idempotent posting, reservation/availability rules.
- **Integrations**: provider IDs, unique external keys, message/event inbox, explicit cursor/watermark, retries, dead-letter queue, reconciliation totals and stale-feed alerts.
- **Workflow states**: server-enforced transitions (draft → approved → fulfilled) with permission and audit checks.
- **User-facing numbers**: metric definitions, ownership and freshness indicators; never silently source from a similarly named but unused table.

## Delivery outputs

`architecture.md` (decisions, boundaries, risks); minimal schema; migration and RLS tests; sample fixture; CI; one production-like scenario; deployment approval checklist. A clickable screen alone is not a working ERP.
