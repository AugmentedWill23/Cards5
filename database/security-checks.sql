-- Read-only checks after both migrations. No user data or secrets are selected.
-- Expect 11 vault_* tables, all with rls_enabled = true.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'vault_%'
order by c.relname;

-- Expect false for both browser roles and true for service_role.
select role_name,
  has_function_privilege(role_name,
    'public.vault_append_commit(bigint,text,text,text,text,jsonb,jsonb,text)', 'execute') as may_append_economy,
  has_function_privilege(role_name,
    'public.vault_import_checkpoint(bigint,text,jsonb,text,text)', 'execute') as may_import_checkpoint
from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name);

-- Browser roles must not read the raw World (it includes private/sealed data).
select role_name,
  has_table_privilege(role_name, 'public.vault_economy_commits', 'select') as may_read_raw_world,
  has_table_privilege(role_name, 'public.vault_economy_commits', 'insert') as may_insert_raw_commit,
  has_table_privilege(role_name, 'public.vault_operator_roles', 'insert') as may_grant_operator_role
from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name);

-- On a fresh setup these counts are all zero, except the singleton head row.
select 'player_bindings' as entity, count(*) as records from public.vault_player_bindings
union all select 'operator_roles', count(*) from public.vault_operator_roles
union all select 'economy_commits', count(*) from public.vault_economy_commits
union all select 'card_designs', count(*) from public.vault_card_designs
union all select 'cases', count(*) from public.vault_cases
union all select 'configurations', count(*) from public.vault_configurations
union all select 'updates', count(*) from public.vault_updates
union all select 'source_archive', count(*) from public.vault_source_archive;

select last_sequence from public.vault_economy_head where singleton;
