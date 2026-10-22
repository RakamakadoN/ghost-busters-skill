# Adapting Ghost Busters to your project

The algorithm and the class catalogue are universal. Six foundational things are yours, plus optional v1.4 evidence-gate settings.
Fill them in once, keep them next to the skill (a `project.md` in the skill
folder, or your `CLAUDE.md` / `AGENTS.md`), and the hunt stops asking.

## 1. Canonical source per statement type

Ghosts hide in the gap between "what the code says" and "what the data says".
Decide once which source answers which question, and never let one source
answer another's question.

| Statement type | Canonical source | Yours |
|---|---|---|
| deployed / runtime / data state | production database, hosting platform | |
| current merged implementation | main branch | |
| "was it ever committed or exposed" | reachable git history, remote refs | |
| scope, acceptance, remaining work | issue tracker | |
| architectural and business invariants | rules / ADRs / specs | |
| rationale, decisions, investigation context | project notes / decision log | |
| past incidents, root causes, rejected hypotheses | engineering memory (vector store, postmortems) | |

A source that physically cannot answer a type of question does not take part
in resolving a discrepancy of that type.

## 2. Home predicates

List the places that define a business concept. New code copies them; it
never re-derives them.

| Concept | Home | Yours |
|---|---|---|
| "this invoice is still collectible" | `isCollectible` / status list | |
| "this request is a sale" | the purpose predicate | |
| "same phone number" | the phone normaliser | |
| "duplicate client" | id **and** address | |
| "this business, from this date" | start-date constant | |

## 3. Pipelines and their watchdogs

Every pipeline that moves money or stock. For each: who writes, how often, and
which signal fires when it stops. "None" is an answer, and a ticket.

| Pipeline | Writer | Cadence | Freshness probe | Alarm channel |
|---|---|---|---|---|
| upstream payments → invoices | cron job N | twice daily | `max(created_at)` vs upstream | none → ticket |
| spreadsheet → orders | serverless fn | every 30 min | sync log last 5 | none → ticket |

## 4. Axes and windows

Name every way your system distinguishes businesses, contours, brands or
tenants, and whether any of them is inverted for historical reasons. Name the
start date of each business. A figure without its axis and window is not a figure.

## 5. Rollout pipeline

What pushing to main actually deploys in this project, and what does not.
The skill's "compatibility plan" (phase 5) needs these facts, not a rule.

| Piece | Deployed by | Verified by |
|---|---|---|
| frontend | CI on merge to main → hosting platform | deployment id / build hash |
| database migrations | (CI on merge / a manual step / a tool) | migration history **and** object md5 |
| edge / serverless functions | (CI on merge / manual deploy) | deployed version number |
| cron / scheduled jobs | (migration / dashboard) | job list with `active` flags |

The order of a change follows the dependency between these pieces: a
compatible addition first, readers next, removals last; old jobs and old
clients counted separately.

## 6. Memory tools

Name the tool and the queries. The skill's phase 1 queries memory before the
first hypothesis until it has a relevant answer or can say there is none —
usually one to four queries, never a fixed count. If you have no memory store yet, start one: a
folder of postmortems with a consistent header (symptom, root cause,
resolution, rejected hypotheses, future guidance) is enough for grep.

## 7. v1.4 evidence-gate settings (optional)

The guards are offline checkers. **Do not put secrets or private live data
into this skill repository.** Provide only authorized aggregate summaries.

| Gate | Configuration to collect | Provenance / reviewer |
|---|---|---|
| Environment | expected project reference, reference observed from connection, reference configured in the *deployed* app, nonempty anchor count, read-only operator role | deployment environment settings + database count (no full data export) |
| Pulse | actual business timezone, weekdays and business hours; expected latency; upstream independent activity signal; source fingerprints; downstream progress; sampling cadence | two independent systems, timestamped; exceptions for holidays and inactivity |
| Impact | bulk-action inventory, newly visible row counts, source-of-truth eligibility predicate, stale record classification, blocker/dependency checks | review by module owner; **no actual sending** |
| Release | PR+merge revision, required checks, deployed artifact containing fix, manually approved/applied migrations, actual post-deploy smoke under correct role | CI + hosting platform + database + business-role observation |
| Ledger | project-private ticket and evidence storage; export permissions and sanitization policy | independently reviewed where possible |

Examples and command syntax: [references/v1.4-guards.md](references/v1.4-guards.md).

A gate that cannot be supplied with valid evidence reports an unknown or
blocked state. **Never fake `environmentVerified`, `deploymentContainsFix`,
or `hiddenRecordsReviewed` to silence it.**

## Stack notes

- **Supabase / PostgREST**: class 3 (row cap 1000, order without a unique
  tiebreaker), class 11 (`create function` grants `PUBLIC EXECUTE`; `anon`
  `using (true)` policies pass the advisor; views need `security_invoker`),
  class 5 (migrations via the SQL editor leave no history row).
- **Other Postgres APIs** (Hasura, Prisma, Django): keep the classes, replace
  the probes' object names; the row cap is your API's page size.
- **Non-Postgres**: classes 1, 2, 4, 6, 7, 8, 9, 10, 12 apply unchanged; rewrite
  `probes.sql` for your store.
