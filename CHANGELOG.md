# Changelog

## 1.6.0 — Evidence closure without overclaiming

- Introduces three new **pure offline** gates:
  - `runtime-identity`: corroborates separate deployment-provider, live-runtime
    artifact/binding and read-only database evidence, with timestamp/freshness checks.
  - `human-alert`: detects missing, unverified, late and undelivered human
    notifications; records optional escalation evidence without treating it as ACK.
  - `regression`: validates operator-supplied isolated RED/GREEN chronology,
    negative controls and evidence references.
- Extends the CLI and read-only Autonomous Hunter without changing its
  `version:1` config/state schema.
- Makes these gates explicit in the HUNT protocol, report, adaptation checklist
  and marketplace packaging workflow.
- Adds 32 targeted deterministic regression tests and fully synthetic fixtures.
- No production calls, notification sends, live collectors, patches or
  migrations are included; positive gate results are only corroborated assertions.

### Migration from 1.5.0

No migration needed for existing Pulse, Impact, Release, Environment gates or
Autonomous Hunter state. To use a v1.6 mode, add one new check to the existing
private collector configuration using the schemas in
[references/v1.6-guards.md](references/v1.6-guards.md).

### Safety

Never publish production refs, private URLs, customer messages, permissions
tokens, personal data, private CI logs or privileged endpoints in this repository
or marketplace ZIP. Real delivery/ACK and provider/runtime provenance still
require independent verification by the authorized operator.

## 1.5.0 — Autonomous Hunter

Added local read-only aggregate evidence collection, stateful BAD/GOOD/UNKNOWN
transitions, deduplicated synthetic alert lifecycle and a private scheduling
template, without automatic remediation or external notifications.

## 1.4.0 — Evidence Gates

Introduced deterministic Pulse, Impact, Release and Environment evidence
assessments to complement the eight-phase HUNT and AST scanners.
