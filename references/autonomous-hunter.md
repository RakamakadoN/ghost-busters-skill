# Ghost Busters v1.5 — Autonomous Hunter (read-only)

**Status:** functional local runner and **opt-in private GitHub Actions scheduling template**. No live customer deployment or continuously running production monitor is enabled in the public skill repository. Connecting a real environment requires its owner's private read-only evidence collector and deployment settings.

v1.5 adds a deterministic evidence collection and **stateful alert lifecycle** on top of the v1.4 Pulse, Impact, Release, and Environment evaluators. It does not replace the 8-phase investigative skill, generate patches, run SQL, or perform remediation.

## What it does

1. Loads a strictly defined config with 1–30 checks, one of four v1.4 modes each.
2. Fetches a **prepared aggregate JSON evidence document** for each check:
   - `file` (local fixture or local private export, restricted to config directory); or
   - `https` (GET only, explicit DNS-host allowlist, TLS, optional bearer token from environment, no redirects).
3. Evaluates it with the existing v1.4 rules.
4. Tracks `BAD`, `GOOD`, and `UNKNOWN` across runs in a local JSON state.
5. Opens an alert after **two consecutive bad** evaluations by default; resolves after **two consecutive good** evaluations.
6. Reports `OPENED` and `RECOVERED` **once per lifecycle**, and records continuing incidents without repeating the alert.
7. Writes aggregate-only JSON and Markdown reports; secrets and raw evidence are not included in the reports.

**Unknown is never good.** A partial deployment, missing evidence, failed data collection or stale user permissions must not automatically close an open incident. Connection/validation errors are `EVIDENCE_ERROR`, not `PROGRESS_OBSERVED`.

## Local smoke test (fully synthetic)

Node.js 20+ required; no package install needed for the runtime.

```bash
node references/ghost-hunter.cjs \
  --config examples/hunter.config.json \
  --state .ghost-hunter/state.json \
  --report .ghost-hunter/report.json \
  --markdown .ghost-hunter/report.md
```

Run the same command again after the first run. Two repeated synthetic failures become an `OPENED` alert; later unchanged runs do not re-alert. You can inspect `.ghost-hunter/report.md`. This **does not mean** any real production system is down: the examples are intentionally synthetic.

```bash
npm test
npm run test:hunter
```

Do not commit the `.ghost-hunter` directory. A state reset can re-alert a long-running incident; cache-backed scheduling provides **best-effort** deduplication, not exactly-once delivery.

## Production configuration (private only)

Begin with [examples/hunter.live.example.json](../examples/hunter.live.example.json) and store your customized `hunter.config.json` only in a **private** project/repository. Supply:

- `allowedHosts`: exact HTTPS DNS names of trusted read-only aggregate endpoints; wildcard patterns, IPs, query-string bearer tokens, redirects, custom ports, HTTP and local hosts are rejected.
- `checks[].source.kind`: `https` for an explicit monitored resource, `file` for locally prepared summaries.
- `checks[].source.url`: preaggregated, access-controlled JSON resource — **not** arbitrary SQL, raw CRM data, service-role RPC, or an executable job.
- `checks[].source.tokenEnv`: environment-variable name beginning with `GHOST_HUNTER_`, such as `GHOST_HUNTER_TOKEN`, passed to the process by its secure host.
- `openAfter`, `resolveAfter`: 1–20 successive observations (default 2).

The endpoint **must be provided by the customer/operator** and serve the appropriate input shape in [v1.4-guards.md](./v1.4-guards.md). The tool does not create that endpoint or provision access. Prefer a strictly read-only, row-restricted database/view/service credential. Never use Supabase `service_role`, credentials embedded in public URLs, or a token permitting writes as a monitoring token.

### Recommended schedule: every four hours in a private repository

Copy [examples/private-hunter-workflow.yml](../examples/private-hunter-workflow.yml) to `.github/workflows/ghost-hunter.yml` **inside a private repository**. Update its placeholder `PIN_REVIEWED_SHA` to the exact audited release commit. Store `hunter.config.json` there; configure `GHOST_HUNTER_TOKEN` as an Actions secret.

The template:

- Runs at minute 17 every four hours (GitHub Actions cron in UTC), or on manual dispatch.
- Refuses to execute if the repository is public.
- Uses `contents: read`, without PR/issue writes or database operations.
- Keeps reports as **private** GitHub Actions artifacts.
- Uses GitHub Actions cache to preserve alert state between runs.
- Writes summary to the **private** workflow run.
- Marks the job failed only for **newly opened** incidents, not on every subsequent observation; notifications depend on the repository's GitHub Actions settings.
- Does not write GitHub issues/Jira tickets, send WhatsApp, invoke an LLM, merge, deploy, or apply migrations.

**Important:** never paste the real collector configuration, logs, artifacts, SQL, production metrics or secret-bearing URLs into the public `ghost-busters-skill` repository.

### Data handling and limits

- HTTP: only GET, TLS, exact allowlisted hosts, no redirects or URL credentials, 12-second timeout per check, 256 KiB maximum per response.
- Files: relative paths only, canonical-path containment within the config directory, 256 KiB maximum.
- The collector cannot prove data came from the correct production system; verify environment identity using v1.4's Environment gate and independent deployment evidence.
- A generated JSON report is an assessment of operator-provided evidence, not a diagnosis or validated fix.
- Evidence errors cause a candidate alert after the configured confirmation threshold: persistent loss of monitoring is itself a problem.
- Schedule delays and cache evictions may produce gaps or re-opened alerts. GitHub Actions is not a low-latency incident paging system.
- The process does not continue running after completing a run. Continuous operation requires the private workflow, a separate trusted scheduler, or manual invocation.

## Status transitions

| Result | Meaning | Action |
| --- | --- | --- |
| `BAD` below threshold | Potential incident | Retest later |
| `OPENED` | Bad for N consecutive observations | New alert |
| `BAD` while open | Continuing unresolved incident | Report, no duplicate notification |
| `UNKNOWN` | Incomplete/uncertain/partial evidence | Keep open incidents open; do not claim healthy |
| `RECOVERED` | Good for N consecutive observations | Recovery notification |
| `GOOD` while closed | No targeted symptom in these observations | Remain closed |

The monitored predicates and the operator's independent source evidence determine whether the signal really means a business failure. For example, an order import with no changes over a holiday may be perfectly healthy. Pulse additionally requires working hours and independent activity to suspect a frozen source.

## Suggested next milestone

A private **evidence collector** for a chosen system (Supabase read-only views, GitHub releases and independent accounting snapshots) can feed these gates. Build and test that integration separately, respecting RLS and permission boundaries. Do not put production credentials or customer evidence into this public repository.

For case provenance and honest evaluation tiers, see [evidence-ledger.md](./evidence-ledger.md).
