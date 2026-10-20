# Ghost catalogue

Thirteen classes of silent bugs. Each was caught at least twice in a production
CRM/ERP (React + TypeScript + Supabase/PostgreSQL + an external accounting
system). Label precedents in your tracker `ghost-class-<N>` so the catalogue
grows from a query, not from memory. For each class: how it looks, where it lives, the first probe, the
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
forgotten. An idle cron over an empty table. **A green sync over a frozen
source**: the sync faithfully reads a spreadsheet nobody has edited for a day
and reports `ok`; the CRM gets 0 orders on a day the accounting system posted
91 invoices. Green means "read to the end", not "the source is alive".

**First probe.** `max(created_at)` of the target table vs the expected
cadence; scheduler `active` flags; last run details; automated tasks by source
key. **Two-source pulse** (probe 1.8): the downstream daily count against an
independent signal of the same day (upstream documents, bank statement rows);
a multiple-fold gap under a green sync is the frozen source.

**Trap.** An insert from the robot's role must land in the table (test runs
under that role, not the interactive one). A freshness watchdog: "last row
older than N hours → task to a human". **Standard watchdog for the class:**
the two-source pulse on a schedule ("N upstream documents today, 0 downstream
→ task to the owner").

**Precedent.** Three accounting-sync watchdogs produced zero tasks in their
entire life because of a muting trigger. The payment pipeline cron was switched
off before a fix and nobody switched it back on: 23 days of inflated receivables.
A frozen order sheet behind a green sync: 0 orders vs 91 upstream invoices in a day.

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
statement. **The owner's measurement lies**: the database owner bypasses RLS,
so its 3.7 ms say nothing about the user's query. Under RLS an expression
index (`->>`, `btrim`, `lower`) is not used for the app role: the functions
are not leakproof, the condition stays a `Filter` after the policy quals, and
the same RPC times out again. Measure RLS performance only as the app role
(`set local role …; explain`, probe 3.6). The cure when every policy is
row-independent: `SECURITY DEFINER` + an explicit gate equal to the policies
+ a guard on the policy texts. Verify production by `pg_stat_statements`
for the role; API logs arrive late.

**First probe.** `count(*)` of the object the screen reads vs rows on screen,
under the widest role (under a manager's RLS the set looks small; the
executive's same screen is truncated). `pg_stat_user_tables.n_live_tup` is
off by hundreds and **does not see views or materialized views** at all: use
it to shortlist candidates, decide the threshold by `count(*)` only. Is the
sort key unique: `count(*)` vs `count(distinct key)` (an order number was
1498/1484; task `created_at` 220/111). Growth from the probe; logs for
"statement timeout".

**Raid signature.** AST scan of every `.from(` chain in the frontend
(`references/scan-unbounded-reads.cjs`): RANGE / LIMIT / SINGLE / HEAD /
UNBOUNDED, excluding insert/update/delete/upsert, grouped by table — the same
dump gives the "readers" column. Grep reports false "unbounded" where a query
is assembled in parts. The first live raid: 916 chains, 280 unpaged reads over
181 tables, 4 screens truncating now, 4 on the threshold, 3 PRs the same day.

**Trap.** A fake API client with a fixture of 1 050–1 500 rows and a group of
equal keys on the page boundary. The fake passes through **every** filter
method of the client and applies `.limit()` capped at max-rows; add missing
methods all at once (two PRs each adding one collided). GREEN is pages of the
cap size with the **primary key** last in `ORDER BY`. Type-check the tests
before pushing: the main build does not compile them, and the first raid's
first PR failed CI exactly there. A view read by two screens with different
columns gets one shared reader module. New screens over heavy views read a
nightly snapshot. **Standard watchdog for the class:** a CI test over the AST
scan dump that fails on an UNBOUNDED or `.limit(N > cap)` read of a table on
the whitelist (`count(*) ≥ 500`), the whitelist refreshed weekly from the
volume probe.

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
history row at all**. **Code names an object or column that does not exist**:
a view that was never created in production; a search palette reading
`shipping_points.name`, a column that is not there — PostgREST rejects the
**whole** query, the client swallows the error, the screen says "nothing
found". A typed client catches this at compile time; an untyped one never does.

**First probe.** `md5` of the function body in the database vs the file;
migration history by version **and** by object; the deployed function
version; triggers on the table; `references/scan-select-columns.cjs` — every
`.from().select()/.eq()/.order()` against the generated schema types (their
freshness is a separate question: the script prints the file's git date).

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

**The raid after the fix is mandatory.** The tombstone sweep marked a deleted
invoice in staging, but three consumers stayed blind: the allocation engine
still consumed a payment against it, deleted payments lived on in the money
marts, the allocation audit did not see allocations on deleted documents. A
fix note named four more dictionaries outside the daily sync groups; nobody
raided them, and the next one surfaced two weeks later. A client-card merge
did not carry the upstream counterparty id of the duplicate, leaving 1M of
invoices unattached: any merge must carry every external identity.

**Precedent.** Inserting one row at the top of a spreadsheet would have
rewritten 70 orders. Two deleted invoices inflated monthly revenue and a
client's debt until a tombstone sweep was added — and then three downstream
consumers of the tombstone had to be fixed separately.

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
cut equalled the local calendar. **Its mirror ghost:** another report applied
+05:00 to that same zoneless local time, and period boundaries moved by five
hours — the evening of the 31st landed in the next month. One rule: the
timezone is decided **per source** — real UTC timestamps (CRM data, bank
imports) are cut in local time, zoneless local time from the external system
is taken as is. There is no single "switch to local" toggle.

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
Four more shapes, all found by scheduled hunters in one week:

- **A queue is an RPC.** A table consumed by a service-role worker (a
  notification queue → a cron worker → messages from the company's number)
  with INSERT open to "any active user": anyone sends anything to anyone.
  Whoever can write the queue executes the worker.
- **A secret "if set".** A webhook checks its signature only when the secret
  is configured, and in production it is not: anonymous callers write under
  the service role. An optional secret is an absent secret.
- **A service-role edge function bypasses `revoke`.** Rights removed from an
  RPC came back through a function that runs as the service role and gates
  nothing. The gate belongs inside the function, by the caller's role.
- **DEFINER + an id from the user's row = IDOR.** A definer function reads a
  secret by an id the user can edit through the API: a foreign id reads any
  secret, including the service key.

**First probe.** Policies where the anonymous role is in `roles`; routine
privileges for `anon`/`PUBLIC`; view `reloptions`; **tables writable by the
app role that a service-role worker consumes** (probe 11.5); the list of
serverless functions and their role gates; secrets the code checks
conditionally (`if (secret)`) — are they set in production.

**Trap.** A test from live roles (anonymous, authenticated, each business role);
`revoke execute … from public` immediately after every `create function`.
Queues: INSERT for the robot only, or an RPC with a gate. Webhooks: the
secret is mandatory, absence is a 503, never "skip the check".

**Precedent.** Nine RPCs executable by the anonymous key, writing into a
reconciliation table. Eight `using (true)` anonymous write policies the advisor
never reported. A notification queue open to every user, a webhook with an
unset secret, a service-role function without a gate, a vault lookup by a
user-editable id.

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

## 13. Lying default

**How it looks.** Nothing failed and nothing was swallowed: a default value
quietly replaced the truth. A tax estimate "falls back to the old formula"
when the day's cost of goods is missing — a week of 1.8M instead of "—". A
product without a mapping gets cost 0, and the period's result is inflated. A
document without a product writes off the oldest lot of **any** product. An
HTML page on HTTP 200 from the external system is logged as "unknown", and a
response without `value` is taken as the end of the set. A sync silently
dropped one field of the row.

**Where it lives.** `?? 0`, `?? []`, `|| legacyFormula`, "no mapping → 0",
"no product → any", "no secret → skip" (class 11), "not JSON → empty". The
difference from class 10: there an error existed and was eaten; here there
is no error, only a default that looks like data.

**First probe.** In money and stock calculations, grep for `?? 0`, `|| 0`,
`?? []`, `catch … return`, `default:` in mappings; for each, ask "what does
the screen show when the source is absent: zero, or 'no data'?". On the data:
sales rows with an empty mapping, cost 0 with sales > 0, a lot written off
under a product different from the document's.

**Trap.** A test "source absent → the screen shows '—' / UNKNOWN, not a
number"; the invariant "UNKNOWN is a visible line of its own and is
subtracted from the result"; for stock write-offs, a document without a
product is refused, never matched to "any".

**Precedent.** The tax tile, the unmapped product's cost, the any-lot
write-off, the HTML-on-200 response, the dropped field, and the earlier
"Expenses 0" tile that should have read "no data".

---

## Not ghosts — disproved hypotheses

Keep your own list. Re-checking a disproved hypothesis without reason costs
a day; trusting one after the world changed costs more. A record is a dated
observation, so every row carries when and where it was true, what proved
it, where it applies, and what would make it stale. Shape:

| Symptom | Rejected hypothesis | Evidence | Date · environment · version | Scope | Re-check when |
|---|---|---|---|---|---|
| automation run table is empty | the automation cron is broken | rules were never enabled; the engine runs client-side; the cron is a notification-queue worker | 2026-09-22 · production · (rules table, cron job id) | that cron and that rules engine | rules get enabled; the cron's command changes |
| first-of-month documents land in the previous month | UTC monthly cut is wrong | the external system exports local time without a zone; the UTC cut equals the local calendar (hour histogram of 18 860 documents) | 2026-10-16 · production · marts as of that day | the accounting import only | the export format gains a timezone; a new source with real UTC stamps joins the mart |
| chain branches appear as duplicates | one tax id = duplicate | a chain has one tax id for all outlets; normal | 2026-10-05 · production | client deduplication | the business decides to model chains explicitly |
| idle cron every N minutes | an outage | workers over empty queues; their fate is an owner decision | 2026-09-22 · production | those two queue workers | the queues start receiving rows |
| "no version in migration history" | migration not applied | SQL editor leaves no history row; the objects exist and their md5 matches | 2026-10-02 · production | migrations applied through the SQL editor | the project switches to a tool that records history |
| an order has no upstream document number although the document exists | the sync is broken / match by amount | the sync is insert-only by design and quarantines the late number; matching by amount yields wrong pairs (1 of 16 unambiguous) | 2026-10-19 · production · sync v2.1 | the spreadsheet sync | the sync's identity rules change |
| the RPC is fast when measured | safe to ship | measured as the owner, who bypasses RLS; under the app role it timed out | 2026-10-19 · production · before the definer fix | that RPC and any query under RLS | always re-measure under the app role after any change to policies or indexes |

A row whose "re-check when" condition has happened is a lead to re-test, not
a fact to cite.
