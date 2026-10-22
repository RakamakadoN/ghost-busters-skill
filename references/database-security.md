# Database, authentication, RLS and privileged APIs

## Safe defaults

- Production data requires authenticated identities and deny-by-default authorization. RLS is a **data** control; the UI permission matrix is only presentation.
- `anon` access is allowed only for explicitly public, non-sensitive, read-only resources after a documented review. Never grant public mutation for CRM/ERP tables.
- Do not copy blanket `USING (true)` / `WITH CHECK (true)` policies into operational tables.
- Service keys and credentials belong only in secured server execution and secret management. Never in browser env vars, sample fixtures, generated client code or logs.
- Authorization must verify authenticated principal, resource ownership/tenant, action and target state; client-provided IDs are selectors, not proof.

## Minimal single-owner Supabase example

See `examples/secure-rls.sql`. The example grants operations only to authenticated users **for their own rows**, uses `auth.uid()` and restricts anon. It is a teaching example, not a substitute for tenant-specific access tests.

A multi-tenant policy requires a trusted membership check and explicit role. Avoid RLS recursion, poorly scoped SECURITY DEFINER routines and SQL built from unsanitized identifiers. Review `search_path`, function owner and EXECUTE grants when privileged helpers are needed.

## Dangerous bootstrap shortcut (prohibited)

Never treat an empty `app_users` table as automatic authorization on public endpoints. Initial administrator enrollment must use a one-time, authenticated, time-bounded procedure with out-of-band secret and audit record, then be disabled. A privileged service credential is not interchangeable with end-user JWT.

## Atomic writes

Use a transactionally consistent stored procedure/server endpoint for multi-row posting. Under concurrency, avoid check-then-act races: use unique constraints, row locks/serializable strategy where appropriate and an idempotency key scoped to actor+operation. An immutable ledger requires DB permissions that forbid UPDATE/DELETE for application roles, not only an assertion in app code.

## RLS verification matrix

| Identity | Own/tenant row | Other tenant row | Privileged action |
|---|---|---|---|
| anonymous | DENY | DENY | DENY |
| authenticated member | role-scoped | DENY | only explicit role |
| disabled / removed member | DENY | DENY | DENY |
| service integration | minimal scoped access | DENY unless audited | explicit scope |

Test every operation (SELECT / INSERT / UPDATE / DELETE), not just reading. Add API-level negative tests, bulk-import paths, exports and child records. Simulate forged `tenant_id`, actor ID and roles.

## Query completeness and correctness

- A successful `.select()` can return a partial page because of row caps. Require explicit page size, stable sort key, cursor/range or server pagination, and completeness verification.
- Use `count: 'exact'` when appropriate but don't mistake a count for a consistent snapshot; concurrent data changes can alter totals. Use source watermarks, transaction snapshots or business-key reconciliation if exact reconciliation matters.
- Guard against silent null/empty fallbacks that mask errors. Distinguish `EMPTY_VALID`, `PARTIAL`, `STALE` and `ERROR`.
- See `examples/paginated-read.ts` for a defensive sample adapter and its limitations.

## Security review before release

Review grants, RLS enablement, owner privileges, function execution rights, JWT validation, secret scope, audit immutability, API rate limits, PII exposure, import/export behavior and restore/incident procedures. Do not claim “secure” merely because RLS is enabled.
