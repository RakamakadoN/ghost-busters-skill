# Ghost Busters v1.4 — Safety Toolkit

Version 1.4 turns three existing **protocol rules** into executable, offline evidence gates. The original 13 ghost classes and eight phases remain intact. The tools intentionally **do not connect to production**; they analyze JSON collected separately with authorized read-only access. No writes, messages, deployments, migrations or PR merges.

**Not a hosted monitoring daemon or native GitHub/hosting integration.** One invocation analyzes one evidence snapshot. Recurring alerts require separately configured collectors and schedulers.

## Quick start

Node.js 22+; the v1.4 CLIs have no runtime dependencies.

~~~bash
node references/ghost-pulse.cjs --input examples/ghost-pulse.json --json
node references/ghost-impact.cjs --input examples/ghost-impact.json --json
node references/ghost-release.cjs --input examples/ghost-release.json --json
npm test
~~~

Common options:

- `--input <file>`: required local UTF-8 JSON evidence document.
- `--json`: structured output for CI and agent integration.
- `--strict`: exit 1 if verdict is adverse or evidence insufficient; does not imply deployment permission.
- Exit 2: invalid evidence or arguments. Without `--strict`, a correctly generated report exits 0 even if it found a risk.

Timestamps must be ISO 8601 with explicit timezone information. All committed examples are **synthetic** and unrelated to customer records.

## Ghost Pulse — success signals over frozen content

See `examples/ghost-pulse.json`. Required fields:

- `pipeline` and `environmentId`: explicit identifiers for what is being measured.
- `observedAt` and `window.start/end`: timestamped, bounded measurement period.
- `activityExpected`: caller-confirmed working-time expectation, false on known business closures; cannot be guessed solely from a successful cron run.
- `minSuccessfulRuns` (default 3), `minSnapshots` (default 3), `maxSnapshotAgeMinutes` (default 120): decision thresholds.
- `runs[]`: `{at, ok, rowsImported}`, the attempts and their reported progress.
- `sourceSnapshots[]`: `{at, fingerprint, rows}`, repeated content-derived fingerprints; do not use an always-changing run ID as a hash.
- `upstreamEvents[]` / `downstreamEvents[]`: `{at, count}`, an independent activity signal and observed downstream progress.

A source hash repeating is **not** itself proof of failure. Nor is an upstream document necessarily a one-to-one match for a downstream record.

Statuses:

| Status | Meaning |
| --- | --- |
| `SUSPECTED_SILENT_FAILURE` | successful zero-import runs + repeated identical snapshots + independent upstream activity + no downstream progress |
| `SUSPECTED_PIPELINE_MISMATCH` | the same inconsistency while snapshots changed |
| `EXECUTION_FAILURE` | explicit failed executions instead of silent success |
| `PROGRESS_OBSERVED` | work happened, but completeness is not proven |
| `NO_ACTIVITY_EXPECTED` / `NO_INDEPENDENT_ACTIVITY` | zero imports are not by themselves a fault |
| `INSUFFICIENT_EVIDENCE` | not enough independent observations to decide |

Investigate the root cause with HUNT. The classifier alone establishes suspicion only.

## Ghost Impact — pre-fix widening and bulk action gate

See `examples/ghost-impact.json`. Required fields:

- `change`, `action`: identifiers for the proposed change and downstream action.
- `before` / `after`: `context` with matching `environment`, `role`, `query` and `ids` listing visible records.
- `records[]`: `{id, stale: boolean|null, actionable: boolean|null}` for each newly visible record. Unknown state fails closed.
- `dependencies[]`: `{id, satisfied}` for prerequisite repairs and safety controls.

Output only contains **counts**, not input row IDs, to limit leakage into CI logs.

| Status | Meaning |
| --- | --- |
| `BLOCKED` | at least one newly actionable stale record, or a prerequisite not satisfied |
| `SCOPE_MISMATCH` | different before/after environment, role, or query |
| `REVIEW_REQUIRED` | unknown classifications or records unexpectedly removed |
| `PASS_PREVIEW` | no known risk in the supplied simulation; **not authorization** to merge, send, or deploy |

The caller must calculate `stale` / `actionable` using current canonical business predicates and verify that before/after observations refer to the same data snapshot. A real send/payment requires server-side send-time/commit-time guards even after `PASS_PREVIEW`.

## Ghost Release — from code fix to actual live evidence

See `examples/ghost-release.json`. Required:

- `environmentId` and `expectedMergeSha`, `observedAt` and `maxSmokeAgeMinutes`.
- `pullRequest`: `{merged, mergeSha, evidenceRef}`.
- `main`: `{containsMergeSha, evidenceRef}`.
- `ci`: `{requiredChecksPassed, evidenceRef}`.
- `deployment`: `{environmentId, sha, containsMergeSha, evidenceRef}`.
- `migration`: `{required, applied?, schemaVerified?, evidenceRef?}`.
- `smoke`: `{environmentId, testedDeploymentSha, passed, observedAt, evidenceRef}`.

The tool rejects missing or conflicting evidence and stale/mismatched smoke checks. The hosting deployment commit might be later than the merge commit; `containsMergeSha` must be verified through ancestry, not assumed from branch name. A green PR check alone proves no runtime change.

A complete result is `RELEASE_EVIDENCE_COMPLETE` — **internally consistent claims with receipts**, not independent confirmation. The CLI does not follow the receipts. Only after an authorized operator or read-only adapter verifies the authoritative GitHub, hosting, DB and end-user observations should an incident be marked resolved.

Other statuses: `FIX_PREPARED`, `COMMIT_MISMATCH`, `AWAITING_MAIN`, `CI_NOT_GREEN`, `AWAITING_DEPLOYMENT`, `MIGRATION_BLOCKED`, `SMOKE_FAILED`, `ENVIRONMENT_MISMATCH` and `INSUFFICIENT_EVIDENCE`.

## Within the eight-phase protocol

- **Phase 2, INSTRUMENTS:** collect timestamped evidence and run Ghost Pulse when a process is green but has no observable business progress. Check the live role and independent source before concluding.
- **Phase 5, EXORCISM:** run Ghost Impact before widening access to rows/queues or changing bulk actions; block unsafe changes.
- **Phase 5/6, VERIFICATION:** collect merged-main, CI, deployed code, migration and end-user smoke receipts; run Ghost Release. Confirm actual data effects separately.

## Security and operational boundaries

1. Evidence collection on production is **read-only** and requires separate access authorization. No simulated live transactions without owner permission.
2. Never commit customer rows, phone numbers, payment details, raw messages, API keys or privileged project refs to public fixtures. Store real snapshots outside the repository.
3. Fingerprints should be stable content digests; hash sensitive snapshots at source without distributing their contents.
4. Do not auto-remediate or send alerts without independently configured recipients, deduplication, escalation and rate limits.
5. Verdicts are **hypotheses / input-attestation checks**, not proof of a product-level defect.
6. Use the explicit environment identity for every sample; a database display name is not sufficient to identify a live installation.
7. GitHub evidence and live data must be checked before claiming a fix is deployed.

## Follow-up engineering work

Native, read-only adapters for GitHub + hosting + database; a private evidence ledger; independently labelled real-world benchmarks; and an optional alert transport are **not implemented** in v1.4.
