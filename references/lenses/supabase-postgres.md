# Supabase / PostgreSQL — zero rows, RLS and transactional lens

**Activate:** actual `.from()`/PostgREST query or PostgreSQL/RLS migration
present. Record auth role, claims, tenant, query and schema revision.

Investigate:
- `update/delete` affected-row counts. Supabase JS does not return changed
  rows by default; chaining `.select()` requests a representation, but even
  that does not **by itself** prove the business update succeeded or why zero
  rows matched. Verify the affected IDs/state under authorized test role.
- RLS, view security context and policies that hide rows while leaving a
  seemingly successful empty response. A deliberately empty tenant is safe.
- `SELECT → if allowed → INSERT/UPDATE` without an appropriate durable
  guarantee; inspect unique indexes, isolation, row/advisory locks and atomic
  `UPDATE ... WHERE` predicates before suggesting a race.
- Referential actions (`ON DELETE`) and soft-delete propagation: choose
  RESTRICT/CASCADE/SET NULL according to explicit domain rules, not style.
- RPC retries after timeout: unknown commit and duplicate consequences.
- Page cap, stable ordering and duplicate keys on page boundaries.

**Negative controls:** legal idempotent zero-row update, correct tenant with
no data, unique-key-protected duplicate delivery, deliberate restrict delete.

**Reproducer:** disposable PostgreSQL database with the actual role and
claims; independently query affected rows and invariants, compare a safe
different-tenant control. Production owner timings do not substitute for
user-role behavior.
