# Evidence Ledger — production-grade case tracking (v1.4)

Goal: keep a reproducible, auditable chain from suspicious behavior through observed production evidence to a verified fix. An issue count is *not* a detection-accuracy statistic.

## Privacy and IP boundary

**Never copy a customer's production data, business identifiers, client names, phone numbers, partner system details, payment records, tokens, private code or internal URLs into this public repository.** Obtain permission before publishing any anonymized true case. When in doubt, publish a new synthetic fixture and retain the real evidence in the customer's access-controlled issue tracker.

## Required fields

| Field | Meaning |
| --- | --- |
| `case_id` | Stable non-identifying ID, never a customer/ticket number in public |
| `kind` | Real incident (private only), synthetic reproduction, or counterexample |
| `ghost_class` | Class 1–13, or `unclassified` |
| `symptom` | Observable effect, no customer details |
| `environment` | Redacted identity evidence + role + deployment version |
| `period` | Exact ISO observation window and timezone |
| `initial_evidence` | Independent read-only observations and where private originals reside |
| `hypotheses` | Confirmed, disproved, and currently unresolved, each with dates |
| `reproduction` | Test command and synthetic fixture, ideally RED before fix |
| `impact` | Hidden population and reachable downstream actions |
| `fix_link` | Private PR reference; public sanitized code sample when permitted |
| `release_status` | `FIX_PREPARED`, `MERGED_NOT_DEPLOYED`, `DEPLOYED_UNVERIFIED`, `BLOCKED`, or `VERIFIED_IN_PRODUCTION` |
| `post_fix_evidence` | Timestamped result from the actual running release, not just CI |
| `limitations` | What was not measured; external provenance missing |
| `independent_review` | Who established ground truth without seeing the detector output |

## Evidence tiers

- **T0 — hypothesis:** code-only suspicion, no live evidence.
- **T1 — observed:** current read-only production discrepancy, source and role stated.
- **T2 — reproduced:** deterministic RED test and independent matching production observation.
- **T3 — mitigated:** fix merged/deployed with verified post-deployment observation.
- **T4 — independently reviewed:** third-party/blinded case validation, negative controls, reproducible raw materials available under suitable access controls.

A static AST match is T0 until validated in the live system. A green PR pipeline without deployment verification is at most T2. Never upgrade a case's tier from a narrative alone.

## Synthetic example (not an actual business record)

```yaml
case_id: SYN-ROWCAP-001
kind: synthetic reproduction
ghost_class: 3
symptom: summary computed on only 1000 of 1500 fixture rows
environment: local fixture; no real production system
period: simulated
initial_evidence: fixed source fixture and row-cap emulation
hypotheses:
  - observed: API cap limits one unpaged read to 1000
reproduction: node --test tests/scanners.test.cjs
impact: 500 fixture rows omitted; no external bulk actions
fix_link: none
release_status: FIX_PREPARED
post_fix_evidence: none
limitations: not a production observation
independent_review: pending
evidence_tier: T0
```

## Independent benchmark protocol

1. Write the outcome rubric *before* running the agent; choose failures from a different source than the tool's development fixtures.
2. Keep the full input, versions, random assignment, model, tool budget and expected diagnosis (under appropriate access controls).
3. Compare **matched agent sessions** with identical model, permissions, time/token limits and no hidden source leaks.
4. Score evidence quality, confirmed root cause, unsafe remediation attempts, valid negative controls, fix verification, cost and time to diagnosis.
5. Require an independent reviewer blinded to which tool produced each result. Report denominators, exclusions and confidence intervals where applicable.
6. Never call untested commercial competitor descriptions a measured baseline.

The sample and guard tests supplied with v1.4 are developer regression fixtures, not an independent benchmark.
