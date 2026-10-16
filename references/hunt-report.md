# Hunt Report — template and a worked example

## Template

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

## Worked example (anonymised, real)

Owner's message: *"The manager dashboard tile 'Debt · bank fact' shows 9.4M,
but accounting says half of those clients have already paid. 'Overdue payment'
tasks are spamming managers. Find out why and tell me what to fix. Meeting in
30 minutes."*

```
GHOST       Muted watchdog (class 1) · tile "Debt · bank fact" 9.4M vs accounting; false
            "overdue" tasks to managers; 2026-10-17
ARCHIVE     memory: 4 queries, 5 entries. Key: PROD-204 (payment pipeline cron was OFF for
            ~23 days; invoices did not see upstream payments; "not a code defect"); PROD-170
            (home page moved to accounting-system debt; invoice table remains the source for
            manager tasks) · ticket: PROD-204 do-not-repeat: "do not run the allocation
            function by hand"
            REJECTED: "cancelled invoices counted as debt" (closed PROD-145); "bug in the
            debt formula" (PROD-204: pipeline, not code)
INSTRUMENTS not taken: production not queried in this run → diagnosis = hypothesis.
            Required: cron jobs 54/55 active?; last run details; max(payments.created_at
            where entered_by = pipeline) vs max(receipts.doc_date); last pulse row's
            debt_basis; md5 of the pulse function body
TRAIL       tile ← pulse panel ← saved summary row (agent_suggestions) ← ai_pulse_run()
            (nightly); tasks ← ar_overdue_manager_tasks() (daily 04:05) ← invoices
            (open/partially_paid) ← payment allocations ← pipeline cron 54/55 ← receipts
            from accounting. single path for payments: not verified (grep pending)
DIAGNOSIS   H1 pipeline stalled or lagging again (repeat of PROD-204) → invoices unaware of
            payments → false overdue · hypothesis · disproved by: cron active, fresh
            successful runs, pipeline max(created_at) within a day of upstream.
            H2 the tile shows a stale summary (label "bank fact" belongs to the old method)
            · disproved by: today's summary row with the new basis
TRAP        SQL invariant: per client, open invoice balance − upstream payments since the
            start date must not diverge beyond threshold without an anomaly row.
            RED: pending (read-only run)
EXORCISM    no code change proposed until H1/H2 confirmed. If H1: re-enable cron by owner
            decision only. If H2: restore the function body by migration (hash check), then
            rerun the pulse. Also hangs on the invoice table: reminders, "my day" panel,
            manager alerts, broadcast stop-list, logistics routes. Guarantee belongs in the
            DB: a freshness watchdog, not client logic
WATCHDOG    if H1, lived as long as the cron stood (23 days last time) · channel: none
            (cron history is read by nobody) · proposal: task to owner when the pipeline's
            last write lags upstream by > 2 days or the cron is inactive; plus "last pulse
            older than 36 h"
RAID        siblings: screens built on two debt models (invoice table vs accounting view):
            reminders, routes, stop-list · signature: grep for the invoice status predicate
            outside the shared helper · next step: ticket
RECORD      nothing confirmed yet → after probes: comment on PROD-204 or a new ticket;
            project state; memory type PRODUCTION_BEHAVIOR / INCIDENT
```

The same scenario run **without** the skill produced a code-only diagnosis, a
proposal to rewrite the task-generating function and pause its cron, no memory
lookup ("needed to understand the code fast"), no pipeline-liveness check, no
watchdog question. The root cause recorded in memory was one query away.
