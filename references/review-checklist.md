# Review rubric and release decision

For each item report `PASS`, `FAIL`, `NOT_RUN`, `NOT_APPLICABLE` with concrete evidence, not generic confidence.

| Gate | Minimum evidence |
|---|---|
| Scope | requested behavior and unchanged existing flows |
| Architecture | inspected repo paths, core/domain separation, correct source of truth |
| Security | auth, data ownership, tenant isolation, cross-tenant negative cases, secrets protected |
| Data completeness | pagination, stable ordering, fresh timestamps, reconciliation independent of UI |
| Transactions | idempotent keys, atomicity, concurrency and replay tests for side effects |
| Tests | exact commands, output/CI links, new regression test present |
| Migration | schema diff, replay on disposable DB, compatibility and explicit production approval |
| Release | actual deployed version, schema applied, production checks without destructive writes |
| UX | permissions and loading/empty/stale/errors understandable to target role |
| Observability | meaningful structured errors, lag/stall indicators without PII leakage |

## STOP conditions

Stop changes and state blockers when: production target cannot be authenticated; approval is missing; data could be overwritten/deleted without reversible plan; unauthenticated writes to sensitive data are possible; cross-tenant read/write succeeds; finance operation can double-post; unrelated migrations are inconsistent; “success” masks unavailable progress.

## Agent self-evaluation

Use `evals/scenarios.json` as a set of expected guardrail decisions. Automated script checks file integrity and minimal safety clauses but **does not run LLM behavioral evaluations**. A real evaluation must run scenarios against a chosen agent/model, score its actual outputs and disclose prompt/model/tool conditions.
