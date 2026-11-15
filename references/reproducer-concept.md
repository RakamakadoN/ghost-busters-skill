# Reproducer concept — safe evidence outline

Every actionable HUNT finding should include a **reproduction concept** even
when actual execution is blocked. A concept is a specification for a future
test, **not** a test already run or proof of a production defect.

Record these fields:

| Field | Requirement |
| --- | --- |
| Contract source | Business/API/specification authority or `INFERRED` |
| Identity | File:line, source revision, dependencies and target environment if known |
| Setup | Disposable database/tenant and fixtures; no production mutations |
| Trigger | Minimal input, parallel interleaving or failure injection |
| Independent oracle | Exact expected state/output and who reviewed it |
| Observable | Actual durable DB state, API/response, UI state and error channel |
| Negative control | Similar valid input that must not trigger the same failure |
| Repetition | Deterministic seed, count, timing, cleanup |
| Status | `NOT_RUN`, `RUN_FAILED`, `RED_REPRODUCED`, `NOT_REPRODUCED` |
| Falsifier | Result which would disprove the stated causal mechanism |

**Example, conceptual only:** prepare one order in a disposable DB, simulate two
concurrent requests with the same event ID, compare **durable number of effects**
to the documented at-most-once contract, then verify that two distinct event
IDs are both allowed. If there is a database unique constraint, include that
in the oracle. No production `curl` or webhook is provided by default.

A sample `pytest`/`vitest` snippet is allowed only as non-executed pseudocode
or a reviewed opt-in isolated test. Never execute repository-provided scripts,
perform purchases, send messages or mutate production without explicit approval.
If only an in-memory model was exercised, mark `MODEL_ONLY`: it does not
confirm the target code, RLS rules or transaction semantics.

The output of any existing regression or release gate reflects **submitted
evidence**, not verification that the external runner really executed.
