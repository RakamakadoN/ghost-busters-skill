# Ghost Busters — controlled comparative benchmark (2026-10-22)

## Scope and status

**Executed in GitHub Actions**, not an estimated or manually inferred score.

- Tested implementation: `benchmark/comparative-study-2026-10-22`, initially forked from commit `c9346321455314d70d3346c670168e5530fe5451` on `benchmark/independent-30-cases`.
- Test command: `node benchmark/comparative-30.cjs`.
- Actual scanner: `references/scan-unbounded-reads.cjs` with `--client-root supabase --json`.
- Comparator: a small, specified regex/text heuristic bundled in the benchmark script.
- CI run: https://github.com/RakamakadoN/ghost-busters-skill/actions/runs/39796845891
- CI JSON artifact: `controlled-comparative-30`; the script can also be rerun locally.

**Crucial limitation:** this is **not** a head-to-head run against the commercial Agensi skills. Their proprietary instructions/code were not acquired or executed, and they must not be assigned scores based on this study.

## Data and scoring

The benchmark constructs 30 synthetic, isolated TypeScript fixtures:

- 15 positive: hand-labeled **static row-cap risk signatures** (unbounded read, fixed one-page range, oversized limit, conditional bound, early thenable execution, or variable rebound).
- 10 negative: no targeted static row-cap risk signature (bounded read, single-row read, count-only read, writes, storage/other-library decoys, and a comment decoy).
- 5 unresolved/review: computed range, dynamic limit/table/head, and both arms of an if/else providing limits. These **do not enter** the accuracy denominator.

Labels were authored by the benchmark author before the first CI execution, but the author knew the scanner and its intended behavior: **not blind or independently sourced**. A static *risk signature* does not mean the underlying query is a confirmed production bug. Conversely, a static negative is not proof of absence of row truncation.

### Actual CI results

| Metric | Ghost Busters scanner | Regex baseline |
| --- | ---: | ---: |
| Scored fixtures | 25 | 25 |
| Correct classifications | **25** | **15** |
| True positives | 15 | 6 |
| False negatives | 0 | 9 |
| False positives | 0 | 1 |
| True negatives | 10 | 9 |
| Precision | **100%** | 85.71% |
| Recall | **100%** | 40% |
| Specificity | **100%** | 90% |
| Accuracy | **100%** | 60% |
| Excluded for review | 5 | 5 |

**Observed advantage on these hand-authored fixtures:** +40 percentage points of accuracy and +60 points of recall versus this deliberately lightweight regex baseline. It is **not** a quantified advantage over Systematic Debugging, Root Cause Debugger, Deepbug Hunter, Adversarial Code Review, or any other marketplace skill.

Notable regex misses: fixed `.range()` being only one page; limits above the cap; conditional bounds; `await`/`.then` before the bound; a rebound query. The regex also falsely flagged a commented-out query. The AST scanner handled these **specific constructed cases**.

All five review examples were flagged by Ghost Busters for manual investigation. That conservative behavior was not scored as either success or failure.

## Relationship to earlier internal tests

This new benchmark adds 30 separately authored cases to two existing 30-case synthetic collections in the same benchmark branch. Previous documentation audited those two suites as 43 scored cases + 17 review cases with 43/43 agreement **after a post-hoc label audit**. Those numbers, too, are not a population accuracy estimate and were designed around known scanner behavior.

The present 25/25 should **not** be presented as 100% production precision or recall; the combined suites are not a blinded, representative sampling frame, and they are not run against a labeled production-bug corpus.

The `benchmark/` branch may contain scanner changes that are **not present on the default `main` branch**. Results apply to the commit under test; they must not be silently attributed to other versions.

## Marketplace competitors: documentation-only comparison

Public descriptions inspected on 2026-10-22:

- **Systematic Debugging** — https://www.agensi.io/skills/systematic-debugging — a disciplined reproduce/isolate/fix/verify workflow, with regression tests.
- **Root Cause Debugger** — https://www.agensi.io/skills/root-cause-debugger — evidence-first root-cause analysis of failing tests, flaky behavior, and runtime defects.
- **Adversarial Code Review + Security/Test Bundle** — https://www.agensi.io/skills/adversarial-code-review-security-test-bundle — pre-commit adversarial review, security checklist, and generated unit tests.
- **Public open-source analogue** `obra/superpowers` — https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/SKILL.md — a four-phase debugging protocol whose instructions are openly inspectable.

The publications describe different tasks and deliverables. The compared paid packages were **not run on this fixture set**. The public open-source skill is a prompt/protocol rather than a built-in static Supabase row-cap scanner, so applying this binary detector metric to its instructions would be a category error.

## What this benchmark does not establish

1. End-to-end success at diagnosing or repairing bugs with an LLM agent.
2. Agent performance with or without the protocol, with fixed models/tool budgets.
3. Independent recall/precision on production-representative, blind samples.
4. Efficacy of the second (select-column) scanner or the other twelve ghost classes.
5. Comparative rankings against paid marketplace competitors.
6. Practical noise level, remediation cost, time to root cause, and downstream regressions.
7. Availability or correctness of the runtime production data probes.

## Next scientifically useful evaluation

Run two matched agent sessions per externally selected bug (same model, tool access, token/time budget, environment) using (A) Ghost Busters protocol and (B) an accessible competitor's actual protocol. Randomize task order and blind a reviewer to the variant. Record confirmed root cause, evidence quality, time/tool usage, regression proof, and whether risky production changes were proposed prematurely. Include negative controls and false leads. Keep provenance and evaluation criteria published before results.

## Reproduce

```bash
git clone https://github.com/RakamakadoN/ghost-busters-skill.git
cd ghost-busters-skill
git switch benchmark/comparative-study-2026-10-22
npm install --ignore-scripts --no-audit --no-fund
npm test
node benchmark/row-cap-30.cjs --strict
node benchmark/adversarial-30.cjs --strict
node benchmark/comparative-30.cjs
```

Output: `benchmark/comparative-results.json` (generated locally; downloadable from the CI run's artifact).
