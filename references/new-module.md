# Add a module to an existing business system

## 0. Map existing system

Identify current module/router registries, role/tenant permissions, API boundaries, migrations, test scripts, common components, relevant data sources and current production revision. Inspect Git status before edits. Do not assume generic filenames (`ModuleView`, `CrudResource`) exist.

## 1. Design spec and test plan

For nontrivial changes create a brief specification and checklist with Goal / Non-goals / Interfaces / Invariants / Roles+tenants / Failure modes / Backward compatibility / Staged rollout. A task should identify exact files and a falsifiable test. **Do not invent repository structure**.

## 2. Domain first

Pure, typed functions: calculations, transformations, state validation. Use explicit `now`/clock and locale/timezone as inputs. Write failing unit tests for boundaries: empty records, duplicates, stale state, inconsistent totals, wrong role, wrong tenant, retries, concurrent requests.

## 3. Service and API

Thin adapter around actual existing client. Validate responses and propagate actionable errors. Implement stable paginated reads. For writes to stock, money or entitlements use authenticated atomic backend transactions with unique operation identifiers. All final authorization lives in the server/DB.

## 4. UI and registration

Reuse existing shared primitives before inventing new ones. Register the route, navigation, lazy import, access matrix, feature flags, analytics and error boundary as applicable. Test unauthorized deep links and failed RPC responses; hiding menu items is not access control.

## 5. Database and release

Follow `database-security.md` and `migrations-release.md`. For production-affecting changes: prepare and test migration, get separate explicit owner approval, apply compatible schema first, verify, then deploy dependent UI. If authorization is missing, stop after preparing a reviewable change.

## 6. Evidence and handoff

Provide changed-file list, deterministic test commands with real outcomes, access matrix, migration status, unresolved impacts, rollback/forward recovery and whether production was actually touched.
