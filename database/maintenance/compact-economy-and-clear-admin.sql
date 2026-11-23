-- MANUAL, DESTRUCTIVE MAINTENANCE. NOT an application migration.
-- Export a backup first, pause gameplay, and run this ENTIRE file as postgres
-- in Supabase SQL Editor. Do not run only its individual statements.
--
-- Preserves every economy row and replay receipt, the exact latest snapshot,
-- the head sequence, accounts/bindings/roles, catalog and current game history.
-- Discards redundant older full-state payloads and ALL current admin audit rows.
-- Original import_checkpoint snapshots are retained for exact import retries.
-- This does NOT stop the game from writing new snapshots or future audit rows.
--
-- UPDATE frees old snapshot space for reuse after vacuum; it does not promise
-- an immediate decrease in allocated disk/quota. See README.md before running.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local search_path = pg_catalog;

do $vault_log_cleanup$
declare
  v_head bigint;
  v_max bigint;
  v_rows_before bigint;
  v_rows_after bigint;
  v_audit_rows bigint;
  v_compacted bigint;
  v_bytes_before bigint;
  v_bytes_after bigint;
  v_latest jsonb;
  -- data is gzip/base64 for {"_vault_compacted_snapshot":1}, NOT an empty
  -- World. Existing app decoders reject it if historical state is requested,
  -- rather than misrepresenting a pruned sequence as a real empty economy.
  v_marker constant jsonb := '{
    "encoding":"gzip-base64-v1",
    "data":"H4sIAAAAAAAAA6tWii9LLM0piU/Ozy1ITC5JTYkvzkssKM7IL1GyMqwFAFxvUMAfAAAA",
    "_vault_compacted_snapshot":true
  }'::jsonb;
begin
  if to_regprocedure('public.vault_read_economy(bigint)') is not null then
    raise exception 'Economy storage was already cut over. Do not run the old compaction script.';
  end if;
  -- No public/admin-panel RPC or permanent permission bypass is installed.
  if not exists (
    select 1 from pg_roles r where r.rolname=current_user and (
      r.rolsuper or r.oid=(
        select c.relowner from pg_class c where c.oid='public.vault_economy_commits'::regclass
      )
    )
  ) then
    raise exception 'Run this maintenance as postgres/the economy table owner, not an application role.'
      using errcode='42501';
  end if;

  -- Match gameplay/catalog lock order; all locks are released by COMMIT or
  -- rollback. Existing long-running requests can make the 5s lock timeout fail.
  perform pg_advisory_xact_lock(hashtextextended('vault:catalog-write',0));
  select last_sequence into strict v_head
    from public.vault_economy_head where singleton for update;
  lock table public.vault_economy_commits in access exclusive mode;
  lock table public.vault_admin_audit in access exclusive mode;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.vault_economy_commits'::regclass
      and tgname='vault_commits_immutable' and not tgisinternal
      and tgenabled='O' and tgfoid='public.vault_prevent_rewrite()'::regprocedure
  ) or exists (
    select 1 from pg_trigger where tgrelid='public.vault_economy_commits'::regclass
      and not tgisinternal and tgname<>'vault_commits_immutable'
  ) then
    raise exception 'Unexpected economy triggers; stop for manual review. No cleanup was committed.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.vault_admin_audit'::regclass
      and tgname='vault_audit_immutable' and not tgisinternal and tgenabled='O'
      and tgfoid='public.vault_prevent_rewrite()'::regprocedure
  ) or exists (
    select 1 from pg_trigger where tgrelid='public.vault_admin_audit'::regclass
      and not tgisinternal and tgname<>'vault_audit_immutable'
  ) then
    raise exception 'Unexpected audit guard; stop for manual review.';
  end if;

  select coalesce(max(sequence),0),count(*),coalesce(sum(pg_column_size(snapshot)::bigint),0)
    into v_max,v_rows_before,v_bytes_before from public.vault_economy_commits;
  if v_head is distinct from v_max then
    raise exception 'Economy head does not match the latest commit. No cleanup was committed.';
  end if;
  if v_head>0 then
    select snapshot into strict v_latest from public.vault_economy_commits where sequence=v_head;
    if not public.vault_valid_snapshot(v_latest)
       or v_latest @> '{"_vault_compacted_snapshot":true}'::jsonb
       or (v_latest->>'encoding'='gzip-base64-v1' and v_latest->>'data'=v_marker->>'data') then
      raise exception 'The current game snapshot is missing, invalid or already compacted. Restore/review it first.';
    end if;
  end if;

  select count(*) into v_audit_rows from public.vault_admin_audit;
  -- Only the audit table is truncated. No CASCADE, no identity reset, and
  -- future audit generation/its immutable trigger remain enabled.
  truncate table public.vault_admin_audit;

  -- The one known update guard is disabled ONLY inside this locked transaction.
  -- An error rolls back both this ALTER and all data changes, including TRUNCATE.
  alter table public.vault_economy_commits disable trigger vault_commits_immutable;
  update public.vault_economy_commits
    set snapshot=v_marker
    where sequence<v_head
      and action<>'import_checkpoint'
      and not (snapshot @> '{"_vault_compacted_snapshot":true}'::jsonb)
      and pg_column_size(snapshot)>pg_column_size(v_marker);
  get diagnostics v_compacted=row_count;
  alter table public.vault_economy_commits enable trigger vault_commits_immutable;

  select count(*),coalesce(sum(pg_column_size(snapshot)::bigint),0)
    into v_rows_after,v_bytes_after from public.vault_economy_commits;
  if v_rows_after<>v_rows_before
     or (select last_sequence from public.vault_economy_head where singleton) is distinct from v_head
     or (v_head>0 and (select snapshot from public.vault_economy_commits where sequence=v_head) is distinct from v_latest)
     or not exists (
       select 1 from pg_trigger where tgrelid='public.vault_economy_commits'::regclass
         and tgname='vault_commits_immutable' and tgenabled='O'
     ) then
    raise exception 'Post-cleanup preservation check failed; all cleanup changes are rolled back.';
  end if;
  raise notice 'Preserved head sequence: %. Economy rows/receipts kept: %. Old snapshots compacted: %. Admin audit entries cleared: %.',
    v_head,v_rows_after,v_compacted,v_audit_rows;
  raise notice 'Stored snapshot value bytes: % before / % after. This is NOT a physical disk/quota savings measurement.',
    v_bytes_before,v_bytes_after;
end
$vault_log_cleanup$;
commit;

-- Read-only confirmation at the time of this query. New app requests may
-- already have appended another commit or produced new admin audit entries.
select
  (select last_sequence from public.vault_economy_head where singleton) as current_head,
  (select coalesce(max(sequence),0) from public.vault_economy_commits) as latest_commit,
  (select count(*) from public.vault_economy_commits) as replay_receipts_kept,
  (select count(*) from public.vault_economy_commits
    where snapshot @> '{"_vault_compacted_snapshot":true}'::jsonb) as compacted_snapshots,
  (select count(*) from public.vault_admin_audit) as admin_audit_rows_now;
