# Incident-derived lessons (generalized and anonymized)

Each lesson is a failure class that must be checked, not proof that every project currently has the defect.

## Application deployed before schema

An app can compile yet call a column/RPC absent from the target database. Verify target identity and applied migration **before** enabling dependent UI. Never use green CI as proof.

## Data table with believable name but no real records

A dashboard displayed zero from a similarly named unused table while business activity lived elsewhere. Trace ingestion, prove actual source-of-truth population and reconcile an independent sample before claiming metric correctness.

## Role navigation hides data but API does not

A UI brand/role gate did not guard underlying resource requests. Apply deny-by-default authorization server-side, test cross-tenant access and negative paths. UI and DB policies must agree without depending on each other.

## Success flag without progress

Scheduled integration completed “successfully” but data delivery stalled. Track source timestamps, destination growth, source-side independent activity, rejected rows and alerts for lack of progress.

## Backfilled workflow unexpectedly activates actions

Widening a filter can expose years of backlog and trigger bulk reminders or posting. Compute impact, mark stale records and get approval for side effects **before** switching action gates.

## Dirty working tree causes misleading build failure

Another workstream left uncommitted changes unrelated to the feature. Inspect Git state before attributing test or build failures; isolate branch/worktree and record exact failing file/command.

## Retry duplicates money/stock

Check-then-act and client-side multi-call flows fail under concurrent retries. Use database-enforced uniqueness, atomic transaction and replay tests. Reversals are explicit entries, not silent ledger edits.

## Hidden schema drift

`IF NOT EXISTS` can succeed on a table with wrong constraints, types or index definitions. Compare effective schema and verify postconditions. Never edit migration metadata to disguise drift.

## Do not extrapolate

Reported historical incidents are illustrations; any actual production diagnosis needs fresh evidence from the user's environment and explicit permission for access.
