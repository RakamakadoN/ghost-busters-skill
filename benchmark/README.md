# Independent row-cap scanner benchmark (30 cases)

Run: `npm install && node benchmark/row-cap-30.cjs`

This is a **new, fixed test set** separate from `tests/scanners.test.cjs`. It creates 30 temporary TypeScript examples, runs the unchanged `scan-unbounded-reads.cjs` against them, and emits JSON with a confusion matrix and per-case classifications.

* 15 positive cases: static row-cap risk signatures.
* 10 negative cases: no static row-cap risk signature.
* 5 ambiguous cases: reported but excluded from accuracy scores.

**Important:** The labels are manually authored expectations for *static risk signatures*, not independently observed production bugs. For example a fixed range of 100 is flagged as a one-page query even if the actual table contains only 20 rows. Dynamic bounds may be assumed to indicate pagination by the scanner, but that is not proof of completeness. A genuine external evaluation of the full eight-phase protocol needs a separate blinded agent study with matched tasks and tool budgets.

No network/database access, production changes, secrets or existing code changes are required. This benchmark does not cover the column scanner or all 13 ghost classes. Results must not be advertised until the script has actually run.
