# Ghost impact axes (orthogonal to severity, confidence, evidence)

Do **not** replace severity or derive proof from numerical confidence.
Describe the consequence separately from whether the mechanism is evidenced.

| Axis | Allowed values | Interpretation |
| --- | --- | --- |
| Detectability | `SILENT`, `VISIBLE_TO_OPERATOR`, `USER_VISIBLE`, `UNKNOWN` | How the *specific* failure would surface |
| Persistence | `IRREVERSIBLE`, `RECOVERY_REQUIRED`, `TRANSIENT`, `UNKNOWN` | What recovery of affected state entails |
| Scope | `SINGLE_ACTION`, `TENANT`, `CROSS_TENANT`, `SYSTEM_WIDE`, `UNKNOWN` | Potential exposed population, **not** proof it was reached |
| Reachability | `OBSERVED`, `CODE_PLAUSIBLE`, `UNKNOWN` | Basis for whether trigger can occur |
| Confidence | `LOW`, `MEDIUM`, `HIGH`, `UNKNOWN` | Confidence in analysis, **not** evidence level |

Each non-UNKNOWN entry needs a reason tied to a source or an explicitly
marked assumption. Extrapolation beyond measured scope remains `UNKNOWN`.
For financial or regulated data, describe currency, period, authoritative
ledger and invariants before estimating the blast radius.

Example: `Detectability=SILENT (derived from catch → [])`,
`Persistence=UNKNOWN`, `Scope=UNKNOWN`, `Reachability=CODE_PLAUSIBLE`.
The example is **E0**, not a claim that data was permanently lost.
Existing impact and release guards remain the decision authority.
