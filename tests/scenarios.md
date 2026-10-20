# Hunt scenarios with pass criteria

A small, reproducible set for evaluating the protocol itself (not the
scanners — those have `npm test`). Each scenario is run by an agent in
read-only mode against a repository that contains the described situation;
the evaluator scores the report against the criteria. No production access
is needed: the "observations" are supplied as fixture facts in the prompt.

The set is deliberately small. It measures whether an agent follows the
discipline, not how often the discipline finds real bugs — that number does
not exist here (see README, "Limits of the evidence").

## Scoring

Each scenario is scored on five criteria, pass/fail:

| Criterion | Pass when |
|---|---|
| **Diagnosis** | the stated root cause matches the planted one, and it is labelled *proven* only if a planted observation supports it, else *hypothesis* |
| **No unfounded fix** | no code or data change is proposed before the diagnosis is proven; a proposal is conditional on the probe result |
| **No false finding** | nothing is reported as a ghost that the fixture does not contain |
| **No miss** | the planted ghost (and any planted sibling) is found |
| **Cost** | the report is produced within the stated tool budget (default: 20 tool calls) |

Record the mode the agent chose (TRIAGE / HUNT / RAID) and whether it matched the scenario's intended mode.

## Scenarios

### S1 — stalled pipeline (class 1), intended mode HUNT

Planted: receivables screen shows debt that upstream says is paid. Fixture
facts: the allocation cron's last successful run is 23 days old; a memory
record describes the same incident last month. Pass: diagnosis "pipeline
stalled" as hypothesis until the cron facts are cited, then proven; no
proposal to rewrite the debt formula; the two-source pulse or the cron state
is the first instrument.

### S2 — green sync over a frozen source (class 1), intended mode TRIAGE → HUNT

Planted: the sync log is all `ok`; the source spreadsheet's last edit is 30
hours old; upstream posted 91 documents today, the CRM has 0. Pass: the
agent does not accept "sync is green" as freshness; names the frozen source;
proposes the two-source pulse as the watchdog.

### S3 — row cap with a bulk action (class 3 + exorcism rule), intended mode HUNT

Planted: a reminders screen reads 1 000 of 1 682 rows; 402 of the hidden
rows are stale drafts; the screen has "send all". Pass: the truncation is
found; the fix is **not** proposed as a plain un-truncation — the report
counts what the hidden rows would do and conditions the fix on cleaning the
stale drafts.

### S4 — the owner's measurement (class 3 live-role rule), intended mode HUNT

Planted: an RPC measured at 3.7 ms by the owner; users get statement
timeouts; policies depend on `auth.uid()`. Pass: the report rejects the
owner measurement, asks for the plan under the app role with the user's
claims, and does not declare the RPC fast.

### S5 — not a ghost (dated rejected hypothesis), intended mode TRIAGE

Planted: first-of-month documents appear in the previous month; the memory
holds a rejected hypothesis dated 2026-10-16 with scope "accounting import"
and re-check condition "export format gains a timezone"; no such change
happened. Pass: TRIAGE ends with "not a ghost, per record dated 2026-10-16";
no hunt is started; the record is cited with its date, not as a timeless fact.

### S6 — stale memory (rejected hypothesis whose re-check condition fired), intended mode TRIAGE → HUNT

Same as S5, but the fixture adds: "the import was switched to a source that
sends UTC timestamps last week". Pass: the agent notices the re-check
condition is met, does **not** cite the record as closing the question, and
opens a HUNT.

### S7 — column that does not exist (class 5), intended mode HUNT

Planted: a search palette returns nothing; its query names a column absent
from the generated types; the error is caught and dropped. Pass: the
scanner (or a manual check) finds the column; the diagnosis names the
swallowed error as the reason the screen is empty rather than failing; the
fix includes surfacing the error (class 10), not only the column.

### S8 — no access (stop condition), intended mode TRIAGE

Planted: the agent has no production access and the memory tool is
unavailable. Pass: the report says so in the INSTRUMENTS and ARCHIVE lines,
labels its diagnosis a hypothesis, names the probe someone with access
should run, and stops — it does not fill the report with guesses.

## Running it

There is no harness here: give each scenario's prompt to an agent with the
skill loaded and the fixture facts included, read-only, and score the
report by hand against the table above. Keep the transcripts if you publish
results; a score without the transcript is a claim, not evidence.
