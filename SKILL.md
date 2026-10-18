---
name: ghost-busters
description: Use when a number, screen, task feed, sync, cron job or report in a CRM/ERP looks wrong or suspiciously quiet — "the total doesn't match the accounting system", "the screen shows 0", "tasks are firing for no reason", "the sync is silent", "tests are green but the page is broken", "nothing arrived", a regression after a fix, any silent failure — and before proposing any fix. Also use for a proactive sweep ("raid") of a module for known ghost classes.
metadata:
  version: 1.1.0
  origin: distilled from ~60 production incidents in a React + Supabase CRM/ERP
---

# Ghost Busters — hunting bugs that never crash

## Why this exists

A ghost is a bug that does not fail. It shows 0 instead of an error, "success"
instead of 0 rows, green CI instead of a broken screen, silence instead of an
alarm. In the system this skill was distilled from, not one major incident
raised an exception: a spreadsheet sync lay dead for 4 days, the payment
pipeline stood still for 23 days, three watchdogs wrote into the void for a
year. None were found from a stack trace. All were found by asking "why is it
quiet here?"

**Principle:** ghosts are caught with instruments, not by reading code. Code
shows what *should* happen; production data, logs and history show what *does*.

**Violating the letter of this protocol is violating its spirit.** "Diagnosed
from the code, I'll check production later" is not a diagnosis. It is a hypothesis.

## When to use

- Any "doesn't match": CRM ↔ accounting system, screen ↔ database, plan ↔ fact,
  stock ↔ shipments.
- Any "nothing": empty list, 0 money, 0 tasks, no log rows, a cron job that
  never speaks.
- Any "after the fix something else got worse".
- Green tests plus a user complaint.
- Proactively: `/ghost-busters raid <area>` — sweep a module against the class
  catalogue.

Do not use for a plain feature with no symptom (use your TDD workflow) or for
reviewing a diff (use code review).

**REQUIRED BACKGROUND:** a systematic-debugging discipline (root cause before
fixes). Ghost Busters adds what breaks *silently* on top of it.

## The hunt

```
0 CALL ─► 1 ARCHIVE ─► 2 INSTRUMENTS ─► 3 TRAIL ─► 4 TRAP ─► 5 EXORCISM ─► 6 WATCHDOG ─► 7 RECORD
                                         │
                                         └─► RAID: siblings of the same class (parallel agents)
```

Every phase must leave a line in the Hunt Report (template below). An empty
line means the phase was skipped, not "not needed".

### 0. Call — what exactly is broken, and whose question is it

1. Restate the symptom in one sentence with a number, a screen, a period and a role.
2. Decide the **type of statement** and its canonical source (fill the table in
   `CUSTOMIZE.md`): data state → production; current code → main branch; "was
   it ever" → git history; "what should be" → the issue tracker.
3. Check the **date window and the axis**: which business, which contour, from
   which start date. A figure without its window is a figure to re-check.

### 1. Archive — memory before hypotheses

**Mandatory before the first hypothesis**, even when "the meeting is in 30 minutes":

- Engineering memory (vector store, incident notes, postmortems), 3–4 queries:
  ticket id + symptom; subsystem + "similar incident root cause"; the observed
  behaviour; subsystem + "rejected hypothesis". If the tool is unavailable,
  write that in the report; do not pretend.
- Project notes, audit and runbook folders for the subsystem.
- The ticket: current state, "do not repeat".

**Read REJECTED_HYPOTHESIS entries first.** Keep a list of known non-ghosts
(see `references/ghost-classes.md`, section "Not ghosts").

### 2. Instruments — observe before explaining

Identify the ghost class in `references/ghost-classes.md` and run its probes
from `references/probes.sql` (all read-only). Minimum set for any "money or
data doesn't match":

| Instrument | What it shows |
|---|---|
| pipeline liveness | job scheduler `active` flags, last run details, `max(created_at)` of the target table |
| snapshot completeness | the sync's own completeness check and its last 5 log rows |
| watchdogs | automated tasks/alerts by source key: when was the last one created |
| code ≠ production | `md5` of the function body in the database vs the file; deployed function version; migration history |
| volume | `count(*)` of the table vs rows on screen (API row caps) |

Rule: **production answers "what is", and only production does.** "No access
to production" = report line "INSTRUMENTS: not taken" and the diagnosis is
labelled "hypothesis". An empty result under row-level security is not proof
that data is absent.

### 3. Trail — the single proven path

- Build the chain "symptom → screen → service → RPC/view → table → who writes
  it → on what schedule". Every link is confirmed by a file, a function body in
  the database or a scheduler entry, not by a name.
- **Prove the path is the only one**: other callers in the database, the
  scheduler, the frontend, edge/serverless functions. A second writer is a
  frequent ghost. Memory and tickets do **not** prove uniqueness; grep does, in
  a minute. "I remember it's the only path" goes in the report as "single path:
  not verified".
- Ask of every link: "why doesn't it know?" Until the answer is "because nobody
  wrote it, and here is why nobody wrote it", the chain is not read to the end.

### 4. Trap — RED before the fix

A ghost you cannot catch twice will come back. Before any change:

- a test or script that **fails now** and describes the class, not the instance:
  fixture larger than the API row cap plus equal keys on the page boundary; a
  parallel run for races; an insert under the robot's role for watchdogs; a run
  from live roles for permissions; data invariants as SQL.
- Never run `begin … rollback` experiments on the production database without
  explicit owner permission. Use a local rebuild or fixtures.

### 5. Exorcism — fix with the neighbours in view

Three report lines before editing:

1. **What else hangs on this code** — every caller, every screen over the same
   view/RPC, every metric with the same predicate. A regression is the worst
   outcome: "fixed one, broke three" is worse than not fixing.
2. **Rollout order** — migration to production first, then merge the code;
   serverless functions and migrations do not deploy by pushing to main;
   verify the deployed version separately.
3. **Where the guarantee lives** — a data or permission invariant is held by
   the database (trigger, lock, policy), not by the client and not by an edge function.
4. **What the fix will open** — removing a truncation, a filter or a gate
   widens the set of rows and the actions over them. If the screen has a
   bulk action, first count what the hidden rows would do. In the first live
   raid, un-truncating a reminders queue would have exposed 682 more drafts,
   402 of them false payment demands; the fix was held until the stale drafts
   were dismissed. A class-3 ghost wakes a class-4 ghost.

Copy the home predicate; never invent a new one (see `CUSTOMIZE.md`, "Home predicates").

### 6. Watchdog — why nobody noticed

For every ghost caught, answer in writing:

- How long it lived and which signal **should** have fired.
- Does this class have an alarm channel, and **can it physically fire**
  (a muting trigger, the wrong role, a board row limit, a log nobody reads)?
- If there is no channel — propose a watchdog as a separate ticket, never silently.

A "green dashboard" without a proven alarm channel means nothing.

### 7. Record — write it down before it fades

Ticket: current state, evidence, next step, do not repeat → project state file
→ engineering memory, confirmed conclusions only (`INCIDENT`, `KNOWN_PITFALL`,
`REJECTED_HYPOTHESIS`, `PRODUCTION_BEHAVIOR`). Recording a rejected hypothesis
is mandatory: it saves the next engineer a day.

### Raid — after one catch, look for siblings

One instance of a class is almost never alone: a row-cap truncation turned up
in four money screens in a row; a check-then-act race in two. After the class
is confirmed:

1. Write a search signature: an AST scan, SQL over the catalogue, a view name.
   Grep does not work on multi-line query chains (broken by `as` casts and
   queries assembled in parts); for supabase-js reads use
   `references/scan-unbounded-reads.cjs`.
2. Parallel read-only agents only when the class signature cannot be
   expressed as a script or SQL. The first live raid mapped the whole class
   with one AST scan and one probe in about ten calls; agents would have cost more.
3. File siblings as one ticket per class, one PR per screen.

A raid may be postponed but never lost: if there is no time, the RAID line holds
the signature and a next step in the tracker, not "didn't run".

**Raid report** — not a hunt report. Twelve findings share one class, one
trap and one watchdog; each finding's trail is trivial, what matters is "who
else reads this table". Format proven by the first live raid:

```
GHOST       <class> · search signature (script / SQL) · area
ARCHIVE     as in a hunt
INSTRUMENTS class probes, timestamp UTC, which role the volumes were taken under
TABLE       file:line → table/view → count(*) → growth/month → ORDER BY (key unique?) → risk → readers
            risk: A cuts now · B threshold ≤ 5 weeks · C latent (signature present, volume small)
                  D watch · E off-class (another class — separate ticket)
ORDER       of fixing: live screens before experimental ones; one screen, one PR
WATCHDOG    one per class: the standard one from the catalogue, or a proposal
RECORD      one ticket per class + one PR per screen; TRAP and EXORCISM live in each PR
```

"On threshold" (B): rows ≥ 800 **or** rows + 30-day growth ≥ 1000. Take
growth from `created_at`, but zero inserts in the last 7 days means "the
pipeline is stalled" (class 1), not "the table isn't growing": a forecast of
"+17/day → three days" turned out to be zero because the upstream pipeline had
stopped. Volumes are `count(*)` under the widest role: under a manager's
row-level security "the portfolio is small", under the executive the same
table is truncated.

A raid's PRs merge one at a time: the next one only after merging main into
its branch and a green required check on the new head. Shared files (the fake
client, a helper) go in one commit in the first PR; the others take them by
merge. Two PRs each patching the fake "a little" collided in the first raid.

## Which agent for which class

| Class | Reviewer | Give it |
|---|---|---|
| swallowed error, silent refusal | silent-failure / error-handling reviewer | the trail from phase 3, the catch/fallback list |
| row cap, code ≠ prod, race, open door | database reviewer | view/RPC names, migrations, probes |
| open door, silent RLS refusal | security reviewer | policies, grants, roles |
| green tests / dead screen | frontend reviewer + a real preview | the component, both themes, mobile |
| trail through unfamiliar code | code explorer | the symptom and the entry point |

## Hunt Report (mandatory format)

```
GHOST       <class> · <symptom in one sentence: number, screen, period>
ARCHIVE     memory: <N entries, key ids> · notes: <files> · ticket: <id, do-not-repeat>
            REJECTED: <what is already disproved and will not be repeated>
INSTRUMENTS <probe → result> … (production read-only, timestamp UTC) | not taken: <why>
TRAIL       <screen → service → RPC → table → writer → schedule>; single path: yes/no/not verified
DIAGNOSIS   <root cause> · confidence: proven/hypothesis · what would disprove it
TRAP        <test/script> · RED: <output before the fix>
EXORCISM    <fix> · also hangs on it: <…> · order: migration → code → functions · guarantee in: DB/client
WATCHDOG    lived <N days> · channel: exists/none/muted · proposal: <…>
RAID        siblings: <list, or "none found, searched by …">
RECORD      ticket <id> · project state · memory <type>
```

## Excuses that mean "stop"

| Thought | Reality |
|---|---|
| "Need it fast, I'll check memory later" | Memory is the fastest instrument: a past incident answers in 10 seconds, code in an hour |
| "Diagnosis confirmed by the code" | Code is intent. Ghosts live in data, schedulers and permissions |
| "The invoices don't know about the payments" — and stop | The chain is unread: why don't they know? Who should have written it? Is it alive? |
| "Empty result, so there is no data" | Row-level security filters silently. A failed load looks like "0 debts" |
| "Tests are green" | jsdom does not see CSS; CI gets cancelled by the next merge; a NUL byte makes a file binary |
| "The migration is in the repo, so it's applied" | Check migration history and the function body hash; SQL editors leave no history |
| "I'll fix the function, the rest later" | "What else hangs on it" comes first. A regression costs more than the ghost |
| "It's a one-off" | It's a class. The raid is mandatory |
| "The watchdog is a separate topic" | Without a watchdog the ghost returns and lives another 23 days |
| "Hypothesis is obvious, test afterwards" | Trap before the fix, or there is no proof the fix works |
| "It's the only path, I remember" | Memory describes the past. Grep finds the second writer |
| "Raid later, no time" | Then the report holds the signature and a next step; "later" without them never comes |
| "It has `.limit(5000)`, so the ceiling is 5000" | The API sets the ceiling: any limit above the row cap is the row cap, silently |
| "The fix only widens the selection, it's safe" | The widened selection feeds the screen's bulk actions. Count the hidden rows first |

## Red flags

- A fix proposed in a report with no INSTRUMENTS line.
- An empty ARCHIVE line, or "didn't search".
- "Probably", "most likely" in DIAGNOSIS without the label "hypothesis".
- Editing a function whose callers are not listed.
- A report without a WATCHDOG line.

**All of them mean: go back to the skipped phase. Do not continue.**
