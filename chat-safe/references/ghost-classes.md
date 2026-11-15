# The thirteen Ghost Busters classes

The canonical detailed catalogue remains in the full local skill:
references/ghost-classes.md (source-version 1.6.0).
This compact index is for reasoning only; entries are hypotheses until
tested against a specific contract.

1. **Muted watchdog** — task green but no downstream progression.
2. **Silent refusal** — mutation reports success with zero affected rows.
3. **Row-cap truncation** — page cap or unstable boundary omits rows.
4. **Home-made predicate** — filters disagree with their business definition.
5. **Code ≠ production** — deployed SQL/function differs from repository code.
6. **Identity by position** — unstable list order used as persistent identity.
7. **Check-then-act race** — concurrent read/modify/write without a guarantee.
8. **Crossed axes** — wrong tenant, time window, unit, currency or status scope.
9. **Green tests, dead screen** — tested path differs from executed UI path.
10. **Swallowed error** — failure becomes empty/zero/success without error state.
11. **Open door** — privileges or RLS permit unintended visibility or mutation.
12. **Drowned signal** — telemetry detects trouble but no actionable human signal.
13. **Lying default** — fallback masks an absent or invalid authoritative value.

A class label does not itself prove a bug. Verify intended behavior, supplied
source and any negative control independently. For security-class findings,
do not publish private exploit details.
