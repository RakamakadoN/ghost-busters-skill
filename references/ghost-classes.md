# Ghost catalogue

Twelve classes of silent bugs. Each was caught at least twice in a production
CRM/ERP (React + TypeScript + Supabase/PostgreSQL + an external accounting
system). For each class: how it looks, where it lives, the first probe, the
trap that keeps it caught, and a real precedent (anonymised). SQL probes are in
`probes.sql`; section numbers match.

Classes overlap: a row-cap truncation often hides behind a swallowed error,
and code ≠ prod behind a muted watchdog. Once you identify one class, check its neighbour.

---

## 1. Muted watchdog

**How it looks.** A pipeline (sync, cron, allocation, broadcast) stands still
for days; the dashboard is green; nobody got a task. Figures are "old but plausible".

**Where it lives.** A log nobody reads. An alarm that physically cannot fire (a
BEFORE INSERT trigger returning NULL for every role except the interactive
one, so robots' tasks silently vanish). A cron job disabled "temporarily" and
forgotten. An idle cron over an empty table.

**First probe.** `max(created_at)` of the target table vs the expected
cadence; scheduler `active` flags; last run details; automated tasks by source key.

**Trap.** An insert from the robot's role must land in the table (test runs
under that role, not the interactive one). A freshness watchdog: "last row
older than N hours → task to a human".

**Precedent.** Three accounting-sync watchdogs produced zero tasks in their
entire life because of a muting trigger. The payment pipeline cron was switched
off before a fix and nobody switched it back on: 23 days of inflated receivables.

---

## 2. Silent refusal

**How it looks.** The button says "done", nothing changed. The screen says "0
debts", "all quiet", "Unknown error".

**Where it lives.** Row-level security **filters, it does not refuse**: an
`update`/`delete` through the API returns 0 rows and no error. The API client's
error is a plain object, not an `Error` instance, so a local `instanceof Error`
helper drops the message. A failed load of money data becomes an empty list.

**First probe.** For a mutation from the browser, select the affected ids and
count them. Three screen states must be distinguishable: error / empty / zero.

**Trap.** A test from the live role with the expected row count; a shared
`describeError` helper that reads the API error object; a visible "sources
did not answer" state.

**Precedent.** "Dismiss employee" looked successful; access was never revoked
because the browser `update` hit 0 rows under RLS. Six HR screens showed
"Unknown error" for every database refusal.

---

## 3. Row-cap truncation

**How it looks.** A total is short by exactly a tail; rows vanish or
duplicate; a screen says "unavailable" after data growth.

**Where it lives.** The API's default row cap (PostgREST `max-rows = 1000`):
a query without a range is truncated silently. **`.limit(N)` with N above the
cap is a false ceiling**: the API still returns the cap (`.limit(50000)` on
1 361 rows returned 1 000). Paging with `order by` on a non-unique column:
Postgres does not guarantee the order of equal keys between `LIMIT/OFFSET`
requests, so a boundary row is read twice or lost; a business number is not
unique, the tiebreaker is the primary key. Heavy views read live hit the
role's `statement_timeout`; `ALTER FUNCTION SET` does not re-arm a running
statement.

**First probe.** `count(*)` of the table vs rows on screen, under the widest
role (under a manager's RLS the set looks small; the executive's same screen
is truncated); `pg_stat_user_tables.n_live_tup` is a planner estimate,
confirm the threshold with `count(*)`; growth from inserts over the last 7
days; logs for "statement timeout".

**Raid signature.** Scan every `.from(` chain in the frontend: no range and
no limit / with limit / paged; group by table; volumes from the catalogue
probe plus `count(*)`. The first live raid: 916 chains, 280 unpaged reads over
181 tables, 4 screens truncating now, 4 on the threshold, 3 PRs the same day.

**Trap.** A fake API client with a fixture larger than the cap and a group of
equal keys on the page boundary (the fake must apply `.limit()` capped at
max-rows); a unique key last in every `ORDER BY`; new screens over heavy views
read a nightly snapshot. Watchdog for the class: a CI test that fails on
`.from(<table with ≥ 500 rows>)…select` without a range and on `.limit(N > cap)`,
the table whitelist refreshed from the volume probe.

**Before the exorcism.** A removed truncation exposes hidden rows to the
screen's bulk actions: the reminders queue would have gained 682 drafts, 402
of them false payment demands. Count what the hidden rows will do first.

**Precedent.** Four money screens in a row: a KPI read 1 000 of 1 055 invoices;
an import "already loaded" check forgot keys beyond 1 000 and offered old rows
again; daily receipts paged by a non-unique date. The raid: a sales agent's
summary over 1 000 of 1 498 orders, analytics with `.limit(50000)`, demand
lines for planning, a reminders queue.

---

## 4. Home-made predicate

**How it looks.** A new metric or screen counts "differently from the rest":
cancelled invoices are debt, a tasting is a sale, chain branches are duplicates,
a phone number is not found.

**Where it lives.** The developer wrote their own filter instead of the home
one. Every domain has a few: "collectible invoice statuses", "order = sale",
"phone normalisation", "duplicate = id + address".

**First probe.** Find the reference place with the same concept and diff the
predicates line by line. Data check: the set "clients with a purchase" must
not include tasting-only clients.

**Trap.** A test that feeds both predicates one fixture and requires equal sets;
export the home predicate from one module and import it everywhere.

**Precedent.** "Hasn't ordered for a while" counted any request as an order: 36
clients got a wrong last-order date, 29 of them had never bought anything.
Cancelled invoices counted as debt: 183 invoices, 83 clients, 20 of them owed nothing.

---

## 5. Code ≠ production

**How it looks.** The fix is in the repo, the symptom lives in production. Or
the reverse: a guard works in production, is absent from the repo, and a
"fix by file" rolls it back.

**Where it lives.** A migration merged but not applied. A serverless function
in main while production runs an older version. Half the triggers exist only
in the database. The migration version in history differs from the file name
(the tool wrote its own). A migration run through the SQL editor **leaves no
history row at all**.

**First probe.** `md5` of the function body in the database vs the file;
migration history by version **and** by object; the deployed function
version; triggers on the table.

**Trap.** A guard on the body hash inside the migration; a parity check after
rollout; the rule "no version in history ≠ not applied: compare objects".

**Precedent.** Two race-fix migrations sat merged and unapplied for nine days.
An accounting-sync function was deployed from an old tree and overwrote a
fix. A dictionary fix waited for a function redeploy nobody did.

---

## 6. Identity by position

**How it looks.** Another client's order got someone else's amount; a document
deleted upstream lives on in reports; a new product has no name and no category flag.

**Where it lives.** The key is a row number, not a business key (spreadsheet
sync). Staging is written by `upsert` and **never sees deletions**. A
dictionary is outside the daily sync groups and was last read months ago.
Document numbers with trailing spaces.

**First probe.** Tombstone columns (`missing_since`); `max(fetched_at)` per
entity; the quarantine table; strict `=` on numbers replaced by `trim`.

**Trap.** Dry-run of the new logic against the old on a copy of production
data, counting overwrites (must be 0); a key-sweep with a fail-safe for
truncated runs.

**Precedent.** Inserting one row at the top of a spreadsheet would have
rewritten 70 orders. Two deleted invoices inflated monthly revenue and a
client's debt until a tombstone sweep was added.

---

## 7. Check-then-act race

**How it looks.** Allocations exceed the invoice; the "last administrator" is
deactivated; two parallel shipments write off the same stock.

**Where it lives.** The invariant check and the write are in different
transactions, or without a lock, in the client or in an edge function.

**First probe.** Find "read → compare → write" without `FOR … UPDATE` or an
advisory lock. Check for actual anomalies: sum of allocations greater than amount.

**Trap.** A parallel script that is RED before the fix; the lock on the parent
row (`FOR NO KEY UPDATE` where child rows hold `KEY SHARE`, or you get a deadlock).

**Precedent.** Two parallel allocations of one order: 700 allocated on a 300
payment. Two parallel deactivations left zero administrators.

---

## 8. Crossed axes

**How it looks.** A manager of business A was given access to business B; the
debt of a six-month-old business includes two years of its sibling; an
average "drifts" to the older business; a date shifts by a month.

**Where it lives.** Two naming systems for the same businesses, one of them
inverted for historical reasons; aggregates with no period; a start-date
horizon nobody applies; timezone assumptions about the external system.

**First probe.** Name the axis and the window in the first line of the report.
A figure without its window is a figure to re-check, not to use.

**Trap.** Queries with an explicit `>= start_date`; a test that the two naming
axes are never compared or assigned to each other.

**Precedent.** Access handed out wrong twice because the UI brand id was the
inverse of the accounting contour. A receivables figure flipped 180° because
one date filter was missing.

**Not a ghost:** a suspected timezone shift in monthly cuts turned out to be
correct: the external system exported local time without a zone, so the UTC
cut equalled the local calendar.

---

## 9. Green tests, dead screen

**How it looks.** CI is green; the user sees dark text on a black canvas, a
vanished style, an "unused" function, a cancelled run.

**Where it lives.** jsdom does not see CSS or theme cascade (a theme rule's
specificity beats the component class). `*/` inside CSS comment text closes
it early; an unclosed `/*` eats the next rule; the build is green. A NUL byte
in the first 8 000 bytes makes the file binary for git and grep. CI on main
cancelled by the next merge (shared concurrency group). A red check that fails
in 2 seconds with no log is billing or a runner, not code.

**First probe.** `getComputedStyle` in a real preview with all CSS, both
themes, mobile width; `git diff --numstat <empty-tree> HEAD | awk '$1=="-"'`
for binary-looking sources; the run's conclusion **and** reason.

**Trap.** A CSS comment-leak test; a CI concurrency test; screenshots in both
themes before merge.

**Precedent.** Section headings invisible on mobile light theme with all tests
green. A function reported "unused" by search was live: the file was binary
to grep because of a raw NUL in a template string.

---

## 10. Swallowed error

**How it looks.** Import "succeeded" with lost rows; an RPC call treated an
empty body as success; 404 instead of 503; `catch → []`.

**Where it lives.** A heuristic drops real rows as "totals"; an amount
`240,841` is parsed as 240.841; parse errors never surface; a secret read
failure looks like "not found".

**First probe.** A silent-failure review of the trail from phase 3; `parse_errors`
in the import response; "skipped" vs "processed" counters.

**Trap.** A test where a failing source must become a visible state (a "sources
did not answer" banner), never an empty list.

**Precedent.** A bank statement importer silently lost "turnover/total" rows and
read thousands separators as decimals. A sync client took an empty body from a
void RPC as success.

---

## 11. Open door

**How it looks.** The anonymous role executes an RPC and writes into
dictionaries; a view bypasses row-level security; the advisor is clean and
the hole is there.

**Where it lives.** `create function` grants `EXECUTE` to `PUBLIC` by default.
An `anon` policy with `using (true)` that the platform advisor **does not
flag**. A view without `security_invoker`. `SECURITY DEFINER` without need.
Adding a parameter creates an overload instead of replacing the function.

**First probe.** Policies where the anonymous role is in `roles`; routine
privileges for `anon`/`PUBLIC`; view `reloptions`.

**Trap.** A test from live roles (anonymous, authenticated, each business role);
`revoke execute … from public` immediately after every `create function`.

**Precedent.** Nine RPCs executable by the anonymous key, writing into a
reconciliation table. Eight `using (true)` anonymous write policies the advisor
never reported.

---

## 12. Drowned signal

**How it looks.** The system deliberately continues on a discrepancy
(fail-open), records the shortfall and creates a task — and the task drowns
among 2 446 auto-generated cards while the board is capped at 1 000 rows.
Then auto-tasks are switched off "as a class" and the signal is gone.

**Where it lives.** No dedup key per signal; no named consumer; a display
limit that cuts the most important rows.

**First probe.** `count(*)` of automated tasks by source key; does the signal
have a named reader and an SLA.

**Trap.** A dedup key per signal; a dedicated alerts table instead of the
shared board; the invariant "shortfall without a task = 0".

**Precedent.** 111 short shipments (19 tonnes) were each flagged by the system,
and every flag drowned.

---

## Not ghosts — disproved hypotheses

Keep your own list. Re-checking a disproved hypothesis costs a day. Shape:

| Symptom | Rejected hypothesis | Fact | Source |
|---|---|---|---|
| automation run table is empty | the automation cron is broken | rules were never enabled; the engine runs client-side; the cron is a notification-queue worker | ticket id |
| first-of-month documents land in the previous month | UTC monthly cut is wrong | the external system exports local time without a zone; UTC cut = local calendar | ticket id |
| chain branches appear as duplicates | one tax id = duplicate | a chain has one tax id for all outlets; normal | ticket id |
| idle cron every N minutes | an outage | workers over empty queues; their fate is an owner decision | ticket id |
| "no version in migration history" | migration not applied | SQL editor leaves no history; compare objects | ticket id |
