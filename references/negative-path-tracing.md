# Negative-path tracing — targeted failure-state inversion

Run this extension during HUNT or after RAID identifies a candidate affecting
an external state boundary. Do **not** simulate every call indiscriminately:
prioritize non-reversible writes, external effects, user-visible financial/identity
state and high-blast-radius read dependencies.

For each **relevant actual boundary**, record its exact `file:line`,
contract and reachable callers. Examine these alternative outcomes:

| Variant | State question | Counterexample |
| --- | --- | --- |
| Empty or zero affected | Can a successful HTTP/SQL response imply no eligible rows? Does the UI claim completion? | An intentionally idempotent no-op may be correct |
| Timeout after commit | Can the server apply the effect while the client times out and retries? | Durable idempotency/unique key may make retry harmless |
| Partial batch or crash | Can a loop stop after earlier writes? Are results atomic or reported as partial? | Best-effort contract can allow visible partial completion |
| Auth/tenant mismatch | Can RLS or filters suppress visible rows while the API says success? | Correct tenant may legitimately have no rows |
| Duplicate delivery | Can a webhook, job or user action execute twice? | Transactional outbox or guarded mutation may serialize |
| Worker restart/cancellation | Does accepted work survive process failure, and what does accepted mean? | Non-critical tasks may be explicitly best effort |
| Stale client response | Can an earlier request overwrite newer state? | Generation tokens or ignore-on-cleanup may prevent it |

Output gate: **trigger → expected invariant → source-derived behavior →
falsifier → negative control → observation / NOT_OBSERVED**.
A thought experiment is E0 candidate, not a real crash log. Name unknown
callers, uninspected constraints and unverified deployment versions.

Use [stack lenses](lenses/README.md) only when matching stack evidence is
present. See [reproducer concept](reproducer-concept.md) before proposing tests.
