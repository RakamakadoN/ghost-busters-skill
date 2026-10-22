# Architecture contract: business core, thin boundaries

Use existing project structure if it is coherent. The layout below is **illustrative** for React/TypeScript, not a compulsory file tree:

```
src/features/<domain>/
  <domain>Logic.ts            # deterministic business rules
  <domain>Logic.test.ts
  <domain>Service.ts          # network/database adapter
  <Domain>Module.tsx          # page composition
  components/                # views, forms, tables
src/shared/                  # approved reusable UI and data primitives
```

## Boundaries

- **Domain**: pure functions, explicit time/locale, immutable transformations, typed states. No fetch, SQL client, globals, localStorage or `new Date()` hidden in business decisions.
- **Service**: IO orchestration only. Validate/parse responses, propagate typed errors, enforce timeouts, retry only idempotent operations. For money/stock use an atomic server endpoint rather than multiple client calls.
- **API/DB**: definitive auth, tenant check, state machine and invariants. Never assume the visible module list is a security boundary.
- **UI**: compose existing shared primitives; loading / empty / error / partial states must be distinct. Surface timestamps and data freshness when important.
- **Agent**: may recommend actions, but irreversible execution requires explicit approval, scoped permissions and audit trail.

## Design sequence

1. Locate current entities, auth, routes, policy conventions and a comparable module.
2. Draw data flow and affected consumers, including jobs, exports and notification paths.
3. Specify invariants. Example: shipped quantity cannot exceed reserved quantity; payment cannot be applied more than once.
4. Define domain test cases and read/write authorization matrix before implementation.
5. Implement in small steps, without duplicating common helpers unless reuse creates a worse abstraction.
6. Include observability: request IDs, domain event IDs, failure reason codes and staleness indicators; exclude secrets and PII.

## Multi-tenant projects

Tenant/brand filtering must occur on the server and preferably at the DB policy layer. `role ∩ tenant` applies to **data rows and actions**, not only to navigation. Never take `tenant_id` from the request as proof of membership. Test both positive and negative paths, including indirect child resources and exports.

## Change budget

Limit modifications to agreed files/domains; never rewrite legacy code solely to match this pattern. When adopting in a non-React or non-Supabase stack, preserve the principles while adapting implementation mechanics. The user's repository is the source of truth, not this example.
