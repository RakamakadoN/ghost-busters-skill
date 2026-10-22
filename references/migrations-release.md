# Expand / migrate / contract: safe change delivery

**No production mutation without specific owner approval.** Reading this playbook or requesting a feature is not such approval.

## 1. Baseline inventory

Capture expected and actual schemas, current deployed app revision, migration history, row counts, triggers, RLS policies, integration consumers and backward compatibility. Stop if the DB identity is uncertain.

## 2. Plan the sequence

- **EXPAND**: additive columns, tables, indexes and compatible RPC signatures. Consider `CREATE INDEX CONCURRENTLY` for large tables, outside transaction constraints.
- **BACKFILL**: resumable batches; checkpoint/watermark; validation of counts, checksums and totals; bounded locks; monitor errors. Never assume `IF NOT EXISTS` implies correct type, constraints or policy.
- **DUAL-COMPAT**: old and new app versions must coexist during deployment, including rollback window.
- **SWITCH**: stage flags and verify data and role behavior; deploy app only when schema ready.
- **CONTRACT**: remove old schema in a separately scheduled, explicitly approved operation after compatibility evidence.

## 3. Validate on a disposable clone/staging environment

Replay migration from actual prior version; test idempotent **effects**, not merely SQL replay; inspect policy diff and dependent views/RPCs/triggers; run integration and concurrent-writer tests. Confirm no data is silently erased or duplicated.

## 4. Preflight approval brief

```
PRODUCTION ACTION: exact SQL/deploy/job to execute
ENVIRONMENT: verified project, branch, database, release SHA
IMPACT: rows, users, linked systems, locks, downtime, downstream bulk actions
BACKUP/RECOVERY: snapshot and tested restoration or compensating forward migration
CHECKS: SQL assertions + negative auth tests + metrics/freshness
OWNER APPROVAL: pending / explicit reference
```

If approval is pending, **do not execute**. Never modify `schema_migrations` to make a failing migration look applied; document and reconcile history deliberately.

## 5. Release and verify

Apply approved schema first, inspect actual DB objects, deploy compatible app, verify actual live endpoint/revision, tenant permissions and business invariants. Green CI is not proof of production health. Monitor errors, cron age, data lag, background queues and user-visible outcomes.

## 6. Recovery

Prefer a compatible forward fix when a destructive down-migration is unsafe. Test rollback assumptions. Keep precise timelines, affected IDs/counts and evidence in a post-release report with no secrets or PII.
