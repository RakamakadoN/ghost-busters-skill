---
name: diyaz-forge
description: >-
  Evidence-first engineering playbook for building or extending CRM, ERP, admin panels,
  back-office applications, and multi-tenant SaaS. Use for architecture, new modules,
  database schema, Supabase/PostgreSQL RLS, migration plans, role-based dashboards,
  integrations, payments, inventory, and safe releases. Invoke when the user requests
  a new business feature, data model, design review, implementation plan, or production
  readiness audit. Inspect the repository before assuming a framework or component library.
metadata:
  version: 2.1.0
  author: Diyaz Seysenbayev
  license: MIT
---

# Diyaz Forge — build business software that survives production

Use this skill as an engineering workflow, **not** as authorization to change production.
Base every important decision on observed repository state, domain invariants, test evidence,
and explicit owner approval for consequential actions. Never claim an unrun test has passed.

## Route to the relevant guide (load only what is needed)

| Task | Read |
|---|---|
| New CRM/ERP or SaaS | `references/new-project.md`, `references/architecture.md`, `references/database-security.md` |
| New module or screen | `references/new-module.md`, `references/architecture.md` |
| Permissions, SQL, auth, RLS, API/edge functions | `references/database-security.md` |
| Migration, deployment, rollback, production readiness | `references/migrations-release.md`, `references/production-lessons.md` |
| Accounting, inventory, external sync, payments | `references/integrations-finance.md` |
| Dashboard, workspace, navigation, role-based UX | `references/ux-design.md` |
| Incident, silent zeros, false success, suspected regressions | `references/production-lessons.md` and a dedicated incident investigation workflow if available |
| Final review | `references/review-checklist.md` |

## Operating contract

1. **Observe before designing.** Find the actual source of truth: stack, existing domain model, migration history, routing, security model, test commands, and deployment environment. Do not invent components, tables, credentials, or CI results. Clearly mark unknowns.
2. **Clarify the contract.** State users/roles, states, data ownership, write paths, failure modes, acceptance criteria, and what must not change. For a complex feature, write a short spec and executable plan before coding.
3. **Test business rules first.** Pure typed functions, deterministic inputs including `now`, colocated unit tests (RED → GREEN → REFACTOR). Only then implement IO adapters and UI.
4. **Reuse local primitives.** Prefer existing CRUD, layout, forms, navigation and error components. A project-specific `CrudResource` is an **optional example**, not a universal dependency.
5. **Enforce authorization server-side.** User identity and tenant ownership must be verified on the server/DB. UI visibility never substitutes for RLS or API authorization. Deny by default.
6. **Do not silently truncate data.** Read paths must handle pagination, stable ordering, row limits and independent reconciliation. A successful HTTP response is not proof of completeness.
7. **Protect money, stock and entitlements.** Atomic server-side operations, unique idempotency keys, append-only immutable ledgers where applicable, race-condition tests, and no optimistic balance claims before confirmation.
8. **Separate design from execution.** Planning and local tests are permitted by request; any production migration, write, data deletion, credential rotation, deployment or bulk business action requires **separate explicit owner approval** after risk/impact review. Never infer permission from a general “build a feature” request.
9. **Ship in compatible stages.** Expand schema → verified backfill/dual compatibility → application → cleanup in a separately approved change. Test migrations, permissions and real data freshness; plan rollback/forward recovery.
10. **Verify observable outcomes.** Show test commands/results, schema/version state, permissions matrix, sample production-safe observations, and unresolved risk. Distinguish `NOT_RUN` from `PASS`.

## Hard security rules

- Never suggest public `anon` role with unrestricted `SELECT/INSERT/UPDATE/DELETE` for CRM, ERP or user data. Never ship `USING (true) WITH CHECK (true)` for anonymous writes.
- Demo/local development must use isolated mock or ephemeral data. Do not expose a local all-powerful fallback identity in production builds.
- No “app_users empty, allow bootstrap” branch on normal public endpoints. Enrollment/bootstrap must be separately authenticated, time-limited, auditable, and disabled after setup.
- Do not expose `service_role`/service keys in browser, public bundle, logs, issues or examples. APIs using privileged credentials must validate the **caller and resource scope** before each privileged action.
- Do not trust tenant, owner, role or balance IDs supplied by the browser. Check membership and privileges against server-verified identity for reads *and* writes.
- Never resolve schema drift by blindly editing migration history, dropping existing migrations, or assuming `IF NOT EXISTS` proves compatibility.
- Never log personal/financial data or secrets into public artifacts, fixtures, prompts or marketplace demos.

## Standard workflow and checkpoints

### A. Discovery
- Inspect `git status`, project scripts, migrations, auth policy, similar modules, affected APIs, and available tests. If working offline, state limitations.
- Create impact map: UI → service → API/RPC → tables → async jobs → exports → integration consumers.

### B. Design + acceptance
- Record **Goal / Non-goals / Roles + tenants / Data invariants / Proposed diff / Backward compatibility / Rollout + recovery**.
- Define edge cases (double click, concurrent write, stale read, zero results, missing user, wrong tenant, partial sync).

### C. Implement
- Pure core → tests → service layer → secure DB rules → reused UI → registration and permissions.
- Keep diff minimal; do not refactor adjacent systems without permission.

### D. Verify and report
- Unit/integration/security tests; build; migration dry-run on disposable copy; pagination/freshness checks; access tests across two users/two tenants; idempotency and concurrency checks.
- Present result using the report below. Unknown or blocked checks remain explicit blockers.

## Definition of Done (evidence, not aspiration)

- [ ] Tests cover expected behavior and boundary cases; command and result documented.
- [ ] Build/typecheck/lint results documented (`NOT_RUN` is allowed but must be marked).
- [ ] Repository and schema changes reviewed, compatible with existing releases.
- [ ] Authorization tested for anonymous, regular user, wrong-tenant, and service paths.
- [ ] Lists and integrations use explicit pagination/completeness strategy.
- [ ] All finance/inventory writes are atomic and idempotent where relevant.
- [ ] Deployment dependencies, approvals and rollback/forward recovery documented.
- [ ] No secrets, customer data, privileged credentials or internal customer details in public outputs.
- [ ] Production state is independently observed before claiming a feature is live.

## Required final report

```
SUMMARY: what changed, scope, evidence
CHANGED: files/modules/migrations
SECURITY: authentication, tenant/role checks, negative tests
DATA: pagination, consistency, freshness, side effects
TESTS: command → PASS / FAIL / NOT_RUN (with reason)
RELEASE: local / staging / awaiting approval / production verified
RISKS: unresolved findings and recommended next action
```

## Language and style

Use the user's language; prefer clear Russian for a Russian-language project. Follow the
repository's existing naming, formatting and commit conventions. Keep code reviewable,
small, typed, and resilient. Preserve legacy behavior unless explicitly superseded.

## Scope and limitations

This is a **methodology/agent skill**, not a database connector, auto-deployer, security
certification, or autonomous production incident monitor. It needs a compatible AI agent
and repository/tool access appropriate to the requested task. Platform-specific features
are not guaranteed across all agents.
