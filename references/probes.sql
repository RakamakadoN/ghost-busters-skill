-- Ghost Busters — production probes. All queries are READ-ONLY.
-- Written for PostgreSQL behind PostgREST/Supabase with pg_cron; adapt names
-- in CUSTOMIZE.md. Replace :'table', :'fn', :'view' with your objects.
-- Never run begin … rollback experiments on production without owner permission.

-- ──────────────────────────────────────────────────────────────────────────
-- 0. Is this production? How big is it?
-- ──────────────────────────────────────────────────────────────────────────
-- Identify the project by its id/ref, never by its display name. Sanity check:
select count(*) from public.<your_main_business_table>;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. MUTED WATCHDOG — pipeline liveness
-- ──────────────────────────────────────────────────────────────────────────
-- 1.1 Which scheduled jobs exist and which are disabled.
select jobid, jobname, schedule, active
  from cron.job
 order by active, jobname;

-- 1.2 Last runs: status and message (history may be purged on a schedule).
select j.jobname, d.status, d.start_time, left(d.return_message, 160) as msg
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
 order by d.start_time desc
 limit 30;

-- 1.3 Pipeline freshness: last row written by the pipeline vs last upstream row.
select
  (select max(created_at) from public.<pipeline_output_table> where <written_by_pipeline>) as last_pipeline_write,
  (select max(<doc_date>) from public.<upstream_table>)                                  as last_upstream_doc;

-- 1.4 The sync's own completeness check, if it has one.
select public.<sync_complete_fn>() as snapshot_complete;

-- 1.5 Sync log: last runs. Five failures in a row = it is down.
select started_at, ok, rows_imported, left(message, 160) as message
  from public.<sync_log_table>
 order by started_at desc
 limit 5;

-- 1.6 Watchdogs: which robots ever created tasks/alerts and when the last one was.
select source_key, count(*) as items, max(created_at) as last_item
  from public.<tasks_or_alerts_table>
 where source_key is not null
 group by source_key
 order by last_item desc;

-- 1.8 Two-source pulse: the downstream daily count against an independent
--     signal of the same day. A green sync with 0 downstream rows and 91
--     upstream documents is a frozen source. The class-1 watchdog is this
--     query on a schedule.
select d::date as day,
       (select count(*) from public.<downstream_table> t
         where t.created_at >= d and t.created_at < d + interval '1 day') as downstream,
       (select count(*) from public.<upstream_table> u
         where u.<doc_date> >= d and u.<doc_date> < d + interval '1 day')  as upstream
  from generate_series(date_trunc('day', now()) - interval '6 days',
                       date_trunc('day', now()), interval '1 day') d
 order by day desc;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. SILENT REFUSAL — row-level security on the target table
-- ──────────────────────────────────────────────────────────────────────────
-- 2.1 Policies. RLS filters, it does not refuse: 0 rows on update/delete
--     means "no permission", not "no data".
select policyname, cmd, roles, permissive, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = :'table';

-- 2.2 Is RLS enabled / forced.
select c.relname, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = :'table';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. ROW-CAP TRUNCATION — volumes and timeouts
-- ──────────────────────────────────────────────────────────────────────────
-- 3.1 Tables at or near the API row cap (PostgREST default 1000):
--     every screen reading them without a range is truncated silently.
--     n_live_tup is a planner ESTIMATE (off by hundreds) and does NOT see views
--     or materialized views: use it to shortlist, decide by count(*) (3.2) on the
--     object the screen actually reads. Do not filter by schema.
--     .limit(N) with N above the cap does not raise it — the API returns the cap.
select schemaname, relname, n_live_tup
  from pg_stat_user_tables
 where n_live_tup >= 500
 order by n_live_tup desc;

-- 3.2 Exact count of the object (table OR view) the screen reads vs rows on
--     screen. Count under the widest role: under a manager's RLS the set is
--     small, the executive's same screen is truncated.
select count(*) from public.<table_or_view>;

-- 3.4 Growth: the 30-day increase gives the threshold date ("on threshold" =
--     rows >= 800 or rows + 30-day growth >= 1000); zero inserts in 7 days
--     means the pipeline is stalled (class 1), not "the table isn't growing".
select count(*) as total,
       count(*) filter (where created_at >= now() - interval '30 days') as last_30d,
       count(*) filter (where created_at >= now() - interval '7 days')  as last_7d
  from public.<table>;

-- 3.5 Is the paging sort key unique? The difference is the number of repeats;
--     on a page boundary a repeated key is read twice or lost.
select count(*) as rows, count(distinct <sort_key>) as distinct_keys
  from public.<table>;

-- 3.6 The query plan AS THE APP ROLE, not as the owner: the owner bypasses
--     RLS, so its plan and timing prove nothing. explain only, never execute.
--     Under RLS an expression index (->>, btrim) is not used — look for
--     "Filter:" after the policy InitPlans instead of an Index Cond.
set local role <app_role>;
explain (costs off)
select * from public.<rpc_or_view>(<args>);
reset role;

-- 3.3 Role timeouts (PostgREST sessions inherit the role's statement_timeout).
select rolname, rolconfig
  from pg_roles
 where rolname in ('authenticated', 'anon', 'service_role', 'authenticator');

-- ──────────────────────────────────────────────────────────────────────────
-- 5. CODE ≠ PRODUCTION — what actually executes
-- ──────────────────────────────────────────────────────────────────────────
-- 5.1 Function body hash — compare with the migration file in the repo.
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       md5(p.prosrc) as body_md5, p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = :'fn';

-- 5.2 Overloads: two rows for one name — an added parameter created a second function.
select p.proname, count(*) as overloads
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
 group by p.proname having count(*) > 1
 order by 1;

-- 5.3 Triggers on a table — guards often live only here.
select tgname, tgenabled, pg_get_triggerdef(t.oid) as def
  from pg_trigger t
 where tgrelid = ('public.' || :'table')::regclass and not tgisinternal
 order by tgname;

-- 5.4 Migration history. The version may differ from the file name; migrations
--     run through a SQL editor leave NO row. "No version" ≠ "not applied".
select version, name
  from supabase_migrations.schema_migrations
 order by version desc
 limit 25;

-- 5.5 View definition — compare with the file, not with archived migrations.
select pg_get_viewdef(('public.' || :'view')::regclass, true);

-- (Deployed serverless/edge function versions: use the platform's listing. Code in main ≠ deployed.)

-- ──────────────────────────────────────────────────────────────────────────
-- 6. IDENTITY BY POSITION / STALE SNAPSHOT
-- ──────────────────────────────────────────────────────────────────────────
-- 6.1 Staging freshness per entity: a dictionary last read months ago is a ghost.
select entity, count(*) as rows, max(fetched_at) as last_fetched,
       count(*) filter (where missing_since is not null) as tombstoned
  from public.<staging_table>
 group by entity
 order by last_fetched;

-- ──────────────────────────────────────────────────────────────────────────
-- 7. RACE — actual invariant anomalies
-- ──────────────────────────────────────────────────────────────────────────
-- 7.1 Allocations exceeding the parent amount.
select a.<parent_id>, p.<amount>, sum(a.<amount>) as allocated
  from public.<allocations_table> a
  join public.<parent_table> p on p.id = a.<parent_id>
 group by a.<parent_id>, p.<amount>
having sum(a.<amount>) > p.<amount> + 0.01
 order by allocated - p.<amount> desc
 limit 20;

-- ──────────────────────────────────────────────────────────────────────────
-- 8. AXES — the date window
-- ──────────────────────────────────────────────────────────────────────────
-- 8.1 Any figure for a business that started on a date: count rows before/after it.
select count(*) filter (where <doc_date> <  '<start_date>') as before_start,
       count(*) filter (where <doc_date> >= '<start_date>') as in_window
  from public.<table>;

-- ──────────────────────────────────────────────────────────────────────────
-- 11. OPEN DOOR — anonymous role, PUBLIC, invoker
-- ──────────────────────────────────────────────────────────────────────────
-- 11.1 Policies for the anonymous role — platform advisors do NOT flag these. Expect 0 rows.
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public' and 'anon' = any(roles);

-- 11.2 Functions executable by anon or PUBLIC. Expect 0 rows.
select routine_name, grantee
  from information_schema.routine_privileges
 where routine_schema = 'public'
   and privilege_type = 'EXECUTE'
   and grantee in ('anon', 'PUBLIC')
 order by 1;

-- 11.3 Views without security_invoker — they bypass RLS.
select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'v'
   and not exists (
     select 1 from unnest(coalesce(c.reloptions, '{}')) o
      where o ~* '^security_invoker=(on|true)')
 order by 1;

-- 11.4 SECURITY DEFINER functions reachable by authenticated — each must be justified.
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and has_function_privilege('authenticated', p.oid, 'EXECUTE')
 order by 1;

-- 11.5 A queue is an RPC: tables the app role can write that a service-role
--     worker consumes. Candidates — INSERT/UPDATE policies for the app role
--     with no row restriction; the worker list is cron.job.
select tablename, policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and cmd in ('INSERT', 'UPDATE', 'ALL')
   and 'authenticated' = any(roles)
   and (with_check is null or with_check in ('true', '(true)'))
 order by tablename;

-- 11.6 Definer functions that read secrets (a vault) by an id that may come
--     from a user-editable row — an IDOR into the secret store.
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef and p.prosrc ilike '%vault.%'
 order by 1;

-- (Webhook secrets and edge-function gates live outside the database: list the
--  functions and their environment in the platform; a secret checked "if set"
--  is a secret that is not set.)

-- ──────────────────────────────────────────────────────────────────────────
-- 13. LYING DEFAULT — data that looks like a calculation
-- ──────────────────────────────────────────────────────────────────────────
-- 13.1 Sales rows whose product has no cost mapping → cost 0, result inflated.
select s.<period>, s.<product_name>, sum(s.<amount>) as revenue
  from public.<sales_mart> s
  left join public.<product_alias_table> a on a.<alias> = s.<product_name>
  left join public.<sku_table> k on k.<sku_code> = s.<product_name>
 where a.<id> is null and k.<id> is null
 group by 1, 2
 order by 1 desc, 3 desc
 limit 20;

-- 13.2 Stock moves without a product: a document without a product that
--     wrote off "any" lot. The write-off function body comes from pg_proc (5.1).
select doc_type, direction, count(*) as moves, min(moved_at), max(moved_at)
  from public.<stock_moves_table>
 where <sku_id> is null
 group by 1, 2
 order by 3 desc;

-- ──────────────────────────────────────────────────────────────────────────
-- 12. DROWNED SIGNAL — volume of automated items
-- ──────────────────────────────────────────────────────────────────────────
select status, count(*) as items
  from public.<tasks_or_alerts_table>
 where source_key is not null
 group by status;
