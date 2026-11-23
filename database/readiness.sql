-- READ ONLY. Run after the VAULT schema migrations; no secrets/private player data are selected.
-- This checks database prerequisites, NOT whether the application has been connected.
with required_tables(name) as (
  values ('vault_player_bindings'), ('vault_operator_roles'), ('vault_admin_audit'),
    ('vault_economy_head'), ('vault_economy_commits'), ('vault_source_archive'),
    ('vault_configurations'), ('vault_card_designs'), ('vault_cases'),
    ('vault_case_pool'), ('vault_updates')
),
checks as (
  select 1 as position, 'schema_and_rls'::text as check_name,
    count(c.oid) = 11 and coalesce(bool_and(c.relrowsecurity), false) as ok,
    count(c.oid)::text || '/11 required tables found; all must have RLS enabled' as details
  from required_tables r
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class c on c.relnamespace = n.oid and c.relname = r.name and c.relkind = 'r'
  union all
  select 2, 'private_economy_permissions',
    not has_table_privilege('anon', 'public.vault_economy_commits', 'select')
    and not has_table_privilege('authenticated', 'public.vault_economy_commits', 'select')
    and not has_table_privilege('anon', 'public.vault_economy_commits', 'insert')
    and not has_table_privilege('authenticated', 'public.vault_economy_commits', 'insert')
    and not has_table_privilege('service_role', 'public.vault_economy_commits', 'insert')
    and not has_any_column_privilege('anon', 'public.vault_economy_head', 'select')
    and not has_any_column_privilege('authenticated', 'public.vault_economy_head', 'select'),
    'Browsers cannot read raw private snapshots; commits must go through the atomic RPC'
  union all
  select 3, 'atomic_commit_permissions',
    not has_function_privilege('anon',
      'public.vault_append_commit(bigint,text,text,text,text,jsonb,jsonb,text)', 'execute')
    and not has_function_privilege('authenticated',
      'public.vault_append_commit(bigint,text,text,text,text,jsonb,jsonb,text)', 'execute')
    and has_function_privilege('service_role',
      'public.vault_append_commit(bigint,text,text,text,text,jsonb,jsonb,text)', 'execute'),
    'Only the trusted server role may append authoritative game outcomes'
  union all
  select 4, 'economy_head_consistent',
    (select count(*) = 1 from public.vault_economy_head)
    and (select case when to_regprocedure('public.vault_read_economy(bigint)') is not null then
      (h.last_sequence>0) = (nullif(to_jsonb(h)->'snapshot','null'::jsonb) is not null)
      and not exists (select 1 from public.vault_economy_commits)
      else h.last_sequence=coalesce((select max(sequence) from public.vault_economy_commits),0)
      end from public.vault_economy_head h where h.singleton),
    'Checks the legacy commit head or the retained World after cutover; no player data is returned'
  union all
  select 5, 'active_rules',
    count(*) = 1,
    count(*)::text || ' active published configuration(s); exactly one is required'
  from public.vault_configurations where active and status = 'published'
  union all
  select 6, 'enabled_card_catalog',
    count(*) >= 372,
    count(*)::text || ' enabled designs; the supplied export contains 372'
  from public.vault_card_designs where enabled
  union all
  select 7, 'standard_pack_definitions',
    count(*) >= 7,
    count(*)::text || ' standard case definitions; the supplied export contains 7'
  from public.vault_cases where kind = 'standard'
  union all
  select 8, 'published_pack_available_now',
    count(*) > 0,
    count(*)::text || ' published cases in their time window; imported draft packs are not playable'
  from public.vault_cases
  where status = 'published' and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  union all
  select 9, 'trusted_publishing_operator',
    count(*) > 0,
    count(*)::text || ' trusted economy operators; assignment must be explicit, never first-signup promotion'
  from public.vault_operator_roles where role in ('owner', 'operator', 'economy')
  union all
  select 10, 'application_connection',
    null::boolean,
    'NOT CHECKABLE IN SQL: app adapters target Supabase; check /api/backend-status and test real authenticated gameplay'
)
select check_name, ok, details from checks order by position;
