# Cross-organization open-source security triage (read-only)

This guide is for defensive audits of explicitly public source code or repositories
whose owner has granted permission. It never authorizes probing production systems
or testing real accounts. A finding is not a vulnerability until the applicable
security contract and a defensible reproduction establish impact.

## Five gates (record YES / NO / UNKNOWN for each)

1. **Source identity:** record canonical repository URL, immutable 40-character
   commit SHA, affected path, version, and source date. HEAD is not a stable reference.
2. **Trust model:** identify public API, untrusted input, attacker capability,
   configuration, and the specific confidentiality/integrity/availability invariant.
   Don't confuse an option consciously controlled by the user with untrusted input.
3. **History + policy:** read security policy, tests, issue/PR discussions, recent
   fixes, supported versions and CVE/advisory history. A previously reviewed
   design decision is a counterexample, not a new discovery. Search for duplicates
   using behavior and root cause, not just CWE labels.
4. **Evidence:** follow input -> code path -> output across relevant components;
   specify assumptions, a *falsifier* and an independent negative control.
   Test only in an isolated environment on authorized code and deterministic local
   fixtures. Keep tests read-only against third-party services.
5. **Disclosure:** if impact remains plausible and sensitive, prepare a private
   report through the vendor's SECURITY.md channel. Do not publicize exploit
   details or open a public issue/PR before coordination.

## Confidence ledger

| Level | Minimum evidence | Not permitted to claim |
|---|---|---|
| E0 candidate | One source observation and a hypothesis | Confirmed vulnerability |
| E1 traced | Multiple connected source sites and explicit assumptions | Reproduction of impact |
| E2 reproduced | Pinned target code, isolated test, oracle, negative control | Independent validation |
| E3 reviewed | Independent confirmation of reproduction and affected contract | Real-world exploit by default |

**UNKNOWN is a first-class result.** A tool timeout, missing source, unresolved
workflow, failure to install dependencies, or expected behavior ambiguity is UNKNOWN,
not a bug. Historical issue closure may disprove a candidate's interpretation.

## Case format

- Repository, SHA, supported versions, exact paths
- Threat model and violated invariant
- Observation and separate inference
- Strongest disconfirming evidence; prior advisories and linked discussions
- Isolated reproduction, negative control, environment and red/green outcomes
- Confidence level; impact with boundaries and uncertainty
- Vendor policy, private reporting route, owner response and next step

## Negative examples from actual public history

- Google OSV-Scanner issue #3160: a time-limited package override shadows a
  later broader override. Maintainers explicitly chose visibility of expired
  exceptions and implemented better warning messages in PR #3173 instead of
  changing the selection algorithm. Its shape resembles a bug, but it is not
  a new flaw under the confirmed contract.
  https://github.com/google/osv-scanner/issues/3160
  https://github.com/google/osv-scanner/pull/3173
- Node.js undici has published fixes for certain redirect/cache isolation
  failures. Finding a matching signature in an older commit cannot be
  described as discovering a new vulnerability. Read the actual advisory,
  affected versions, tests and subsequent changes before proposing a patch.
  https://github.com/nodejs/undici/security/advisories

## Practical review checklist

- Verify whether the input can be supplied by someone *without* the trust
  granted to a legitimate caller.
- Check abort, timeout, retry, close and duplicate callbacks in every state.
- Check credentials, privacy-bearing URLs, cache keys and permissions on local
  files; verify whether parent directories already restrict access.
- For cross-user/cross-origin behavior, isolate test identities and data.
- For parser candidates, feed valid edge cases alongside invalid data
  and assert both acceptance and rejection.
- Link fixes to a regression test that fails *before* the change and passes
  *after* it. Record tests not executed as NOT_RUN rather than PASS.

No finding or security claim should be added to a public portfolio before
its evidence threshold and responsible-disclosure conditions are met.
