# Diyaz Forge v2.1 — CRM/ERP Engineering Skill

**From feature request to safe release.** A reusable, evidence-first engineering playbook for AI coding agents working with CRM, ERP, administrative and multi-tenant business systems.

> "Build it fast" is not permission to deploy it unsafely.

## What it does

- Routes a request to focused guides for architecture, new modules, database security, migrations, integration/finance, UX and production lessons.
- Enforces **pure domain logic → deterministic tests → thin service → authorized API/DB → reusable UI → verified release**.
- Requires real production approval, negative tenant/RLS tests, bounded/paginated reads, idempotent transaction processing and independent post-release evidence.
- Preserves incidents-as-lessons without publishing private customer data.

## Quick start

Install by placing `SKILL.md` and `references/` in an AI agent's skills directory as documented by that agent. The runtime reads the YAML frontmatter and selects guides according to your task. Agents without native SKILL.md support may load `SKILL.md` manually.

The skill is **instructions and examples**, not a deployed service, autonomous agent or security scanner. Tool and model compatibility varies by host application.

## Example invocation

> "Add a stock-transfer module to this existing ERP. Inspect the repository first, define authorization and idempotency invariants, write tests for duplicate posting, prepare a compatible migration but do **not** apply it to production without my separate approval."

Expected artifact: implementation plan, focused code/tests where tool access permits, RLS/tenant gate review, safe migration plan and evidence report with explicit `PASS/FAIL/NOT_RUN`.

## Safety improvements over the legacy `diyaz.skill`

| Legacy risk | v2.1 policy |
|---|---|
| Anonymous `CRUD` policies | Authenticated ownership checks; deny anon writes |
| Empty-user bootstrap bypass | Explicit one-time authenticated enrollment; no public bypass |
| Privileged service key use | Server-only, caller-scoped; never browser-side |
| Unpaginated `.select('*')` | Paginated bounded retrieval + completeness/reconciliation |
| Automatic production migration | Separate owner approval and staged compatible rollout |
| `IF NOT EXISTS` as proof | Post-migration effective-schema assertions |
| Project-specific primitives | Optional adapters; repo-first reuse |

## Contents

- [`SKILL.md`](SKILL.md): triggering instructions, routes and safety contract
- [`references/`](references/): focused methodology and checklists
- [`examples/secure-rls.sql`](examples/secure-rls.sql): authenticated own-row RLS demo
- [`examples/paginated-read.ts`](examples/paginated-read.ts): bounded read demo, with consistency caveat
- [`evals/scenarios.json`](evals/scenarios.json): 12 adversarial behavioral cases, **not** model benchmark results
- [`scripts/`](scripts/): structural and security-fixture checks

## Validate

```sh
npm test
```

The tests validate document structure, presence of guardrails and evaluation cases. They **do not** execute an LLM or establish comparative accuracy, production security, or compatibility with every agent.

## Relationship to Ghost Busters

**Diyaz Forge** helps agents design and ship business systems; **Ghost Busters** helps investigate misleading success indicators and silent production failures. They can be used together without hard dependency.

## Provenance, license and privacy

Authored by Diyaz Seysenbayev, distilled from real business-software engineering and publicly generalized incident classes. Specific customer databases, credentials, internal paths and names are not included. MIT License.

For package-based marketplaces, upload `diyaz-forge-v2.1.0.zip`, with `SKILL.md` at the **root of the ZIP**.
