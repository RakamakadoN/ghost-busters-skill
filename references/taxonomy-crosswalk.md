# Stable Ghost taxonomy crosswalk (CLUBOK EXP-004)

**Do not renumber established identifiers.** The public Ghost Busters protocol
has 13 narrative classes (`ghost-class-1` through `ghost-class-13`).
Ghost Busters PRO separately has 30 versioned `GB-01`–`GB-30` codes and
multiple more granular rule IDs. They are **not numerically equivalent**.

A suggested six-code simplification collided with the established PRO registry.
Use semantic pattern slugs; a name is a discovery hint, not new evidence.

| Suggested search phrase | Public class | Existing PRO class(es) | Suggested stable slug |
| --- | --- | --- | --- |
| Swallowed Exception / Green Lie | 10, 2, 13 | GB-01, GB-02, GB-05 | `swallowed-failure-to-success` |
| Phantom Write / Partial Commit | 2, 7 | GB-22, GB-02 | `external-side-effect-before-commit` |
| Silent RLS / Filter Drop | 2, 11 | GB-16, GB-02, GB-03 | `rls-zero-row-success` |
| Schema Drift & Coercion | 5, 13 | GB-27, GB-24, GB-06 | `dto-nullability-drift` |
| Zombie Async | 1, 10 | GB-21, GB-14 | `orphaned-asynchronous-work` |
| Double-Tap Mutation | 7 | GB-15, GB-09, GB-10 | `duplicate-business-effect` |

**Compatibility rule:** IDs in a report keep their original meaning, provenance
and version. A semantic mapping may involve several classes; do not select all
of them automatically. A new subtype must include an independent contract,
trigger and falsifier. Unknown applicability stays `UNKNOWN`.

Source of PRO code meanings:
`RakamakadoN/ghost-busters-pro/references/ghost-taxonomy.md` on
`main` as inspected on 2026-11-15. Recheck on taxonomy changes.
A crosswalk does not establish that either implementation detects all cases.
