-- APPROVED ONE-TIME CUTOVER. Run the entire file as postgres during downtime.
-- Back up and deploy the compatible app first; see the maintenance README.
-- Keeps the exact current World, sequence, and all replay receipts. Permanently
-- discards intermediate full snapshots. Does not touch admin audit or accounts.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local search_path = pg_catalog;

select pg_advisory_xact_lock(hashtextextended('vault:catalog-write',0));
lock table public.vault_economy_head, public.vault_economy_commits in access exclusive mode;

do $preflight$
declare
  v_head bigint;
  v_latest jsonb;
begin
  if to_regclass('public.vault_economy_receipts') is not null then
    raise exception 'Economy receipts already exist. Do not rerun this cutover; inspect the installed schema.';
  end if;
  if to_regprocedure('public.vault_activate_economy22(uuid,text,bigint,text,jsonb,jsonb,text,jsonb,jsonb,text)') is null then
    raise exception 'Install the VAULT studio migration before this cutover.';
  end if;
  select last_sequence into strict v_head from public.vault_economy_head where singleton;
  if v_head is distinct from (select coalesce(max(sequence),0) from public.vault_economy_commits) then
    raise exception 'Economy head does not match the newest commit. No cleanup was committed.';
  end if;
  if v_head>0 then
    select snapshot into strict v_latest from public.vault_economy_commits where sequence=v_head;
    if public.vault_valid_snapshot(v_latest) is not true or v_latest ? '_vault_compacted_snapshot'
       or v_latest->>'data'='H4sIAAAAAAAAA6tWii9LLM0piU/Ozy1ITC5JTYkvzkssKM7IL1GyMqwFAFxvUMAfAAAA' then
      raise exception 'Invalid current World. Restore it before clearing old snapshots.';
    end if;
  end if;
  if exists (
    select 1 from pg_trigger where tgrelid='public.vault_economy_commits'::regclass
      and not tgisinternal and (tgtype::integer & 32)<>0
  ) then
    raise exception 'Unexpected TRUNCATE trigger on old economy table. Review before proceeding.';
  end if;
end
$preflight$;

alter table public.vault_economy_head add column snapshot jsonb;
update public.vault_economy_head h set snapshot=c.snapshot
from public.vault_economy_commits c where h.singleton and c.sequence=h.last_sequence;
alter table public.vault_economy_head add constraint vault_head_has_current_world check (
  (last_sequence=0 and snapshot is null) or
  (last_sequence>0 and snapshot is not null and public.vault_valid_snapshot(snapshot)
    and not (snapshot ? '_vault_compacted_snapshot')
    and (snapshot->>'data') is distinct from 'H4sIAAAAAAAAA6tWii9LLM0piU/Ozy1ITC5JTYkvzkssKM7IL1GyMqwFAFxvUMAfAAAA')
);

create table public.vault_economy_receipts (
  sequence bigint primary key check (sequence between 1 and 9007199254740991),
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9:_-]{8,120}$'),
  actor text not null check (length(actor) between 1 and 160),
  action text not null check (length(action) between 1 and 80),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result)='object'),
  formula_version text not null check (length(formula_version) between 1 and 80),
  created_at timestamptz not null default now(),
  -- Exact legacy import replays still compare the original imported World.
  import_snapshot jsonb check (import_snapshot is null or (action='import_checkpoint'
    and public.vault_valid_snapshot(import_snapshot) and not (import_snapshot ? '_vault_compacted_snapshot')))
);
alter table public.vault_economy_receipts enable row level security;
revoke all on table public.vault_economy_receipts from public,anon,authenticated,service_role;
create trigger vault_economy_receipts_immutable before update or delete on public.vault_economy_receipts
  for each row execute function public.vault_prevent_rewrite();

insert into public.vault_economy_receipts
  (sequence,idempotency_key,actor,action,request_hash,result,formula_version,created_at,import_snapshot)
select sequence,idempotency_key,actor,action,request_hash,result,formula_version,created_at,
  case when action='import_checkpoint' then snapshot end
from public.vault_economy_commits;

create function public.vault_read_economy(p_sequence bigint default null)
returns table(sequence bigint,snapshot jsonb)
language sql stable security definer set search_path = pg_catalog as $$
  select h.last_sequence,h.snapshot from public.vault_economy_head h
  where h.singleton and (p_sequence is null or (p_sequence>0 and p_sequence=h.last_sequence));
$$;

create function public.vault_read_economy_receipt(p_key text)
returns table(actor text,action text,request_hash text,result jsonb)
language sql stable security definer set search_path = pg_catalog as $$
  select r.actor,r.action,r.request_hash,r.result
  from public.vault_economy_receipts r where r.idempotency_key=p_key;
$$;

revoke all on function public.vault_read_economy(bigint), public.vault_read_economy_receipt(text)
  from public,anon,authenticated,service_role;
grant execute on function public.vault_read_economy(bigint), public.vault_read_economy_receipt(text)
  to service_role;
-- The existing head grants must not implicitly grant direct access to its new
-- private snapshot column. Released-case RPCs still check the same sequence.
revoke all on table public.vault_economy_head from public,anon,authenticated,service_role;
grant select (singleton,last_sequence) on public.vault_economy_head to service_role;

create or replace function public.vault_append_commit(
  p_expected_sequence bigint,p_idempotency_key text,p_actor text,p_action text,p_request_hash text,
  p_snapshot jsonb,p_result jsonb,p_formula_version text
) returns table(sequence bigint,result jsonb,replayed boolean)
language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_head bigint;
  v_previous public.vault_economy_receipts%rowtype;
  v_next bigint;
begin
  if p_expected_sequence is null or p_expected_sequence<0 or p_expected_sequence>=9007199254740991 then
    raise exception 'Invalid expected sequence.' using errcode='22023';
  end if;
  select h.last_sequence into strict v_head from public.vault_economy_head h where h.singleton for update;
  select r.* into v_previous from public.vault_economy_receipts r where r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.actor is distinct from p_actor or v_previous.action is distinct from p_action
      or v_previous.request_hash is distinct from p_request_hash then
      raise exception 'Idempotency key belongs to another actor or request.' using errcode='22023';
    end if;
    return query select v_previous.sequence,v_previous.result,true;
    return;
  end if;
  if v_head<>p_expected_sequence then
    raise exception 'Economy sequence changed; reload and revalidate the command.' using errcode='40001';
  end if;
  if p_action='import_checkpoint' then
    raise exception 'Use the dedicated checkpoint importer.' using errcode='22023';
  end if;
  v_next:=v_head+1;
  insert into public.vault_economy_receipts(sequence,idempotency_key,actor,action,request_hash,result,formula_version)
    values(v_next,p_idempotency_key,p_actor,p_action,p_request_hash,p_result,p_formula_version);
  update public.vault_economy_head set last_sequence=v_next,snapshot=p_snapshot where singleton;
  return query select v_next,p_result,false;
end $$;

create or replace function public.vault_import_checkpoint(
  p_source_sequence bigint,p_import_key text,p_snapshot jsonb,p_formula_version text,p_checksum_sha256 text
) returns bigint
language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_head bigint;
  v_previous public.vault_economy_receipts%rowtype;
begin
  if p_source_sequence is null or p_source_sequence<1 or p_source_sequence>=9007199254740991 then
    raise exception 'Invalid source sequence.' using errcode='22023';
  end if;
  select h.last_sequence into strict v_head from public.vault_economy_head h where h.singleton for update;
  select r.* into v_previous from public.vault_economy_receipts r where r.idempotency_key=p_import_key;
  if found then
    if v_previous.action<>'import_checkpoint' or v_previous.actor<>'system:migration'
      or v_previous.sequence<>p_source_sequence or v_previous.request_hash is distinct from p_checksum_sha256
      or v_previous.import_snapshot is distinct from p_snapshot or v_previous.formula_version is distinct from p_formula_version then
      raise exception 'Checkpoint retry does not match the original import.' using errcode='22023';
    end if;
    return v_previous.sequence;
  end if;
  if v_head<>0 or exists(select 1 from public.vault_economy_receipts) then
    raise exception 'Checkpoint import requires an empty economy stream.' using errcode='55000';
  end if;
  insert into public.vault_economy_receipts(sequence,idempotency_key,actor,action,request_hash,result,formula_version,import_snapshot)
    values(p_source_sequence,p_import_key,'system:migration','import_checkpoint',p_checksum_sha256,
      jsonb_build_object('message','Legacy checkpoint imported'),p_formula_version,p_snapshot);
  update public.vault_economy_head set last_sequence=p_source_sequence,snapshot=p_snapshot where singleton;
  return p_source_sequence;
end $$;

create or replace function public.vault_commit_game(
  p_user_id uuid,p_expected_sequence bigint,p_idempotency_key text,p_actor text,p_action text,
  p_request_hash text,p_snapshot jsonb,p_result jsonb,p_formula_version text,p_catalog_revision text,
  p_opened_case_id text default null
) returns table(sequence bigint,result jsonb,replayed boolean)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_binding text; v_catalog jsonb; v_case public.vault_cases%rowtype;
begin
  select b.player_id into v_binding from public.vault_player_bindings b where b.user_id=p_user_id;
  if v_binding is null or v_binding is distinct from p_actor then
    raise exception 'The authenticated player binding does not match.' using errcode='42501';
  end if;
  if p_action in ('admin','moderateChat') and not exists (
    select 1 from public.vault_operator_roles r where r.user_id=p_user_id and r.role in ('owner','operator','economy')
  ) then raise exception 'A Supabase economy operator role is required.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vault:catalog-write',0));
  if exists (select 1 from public.vault_economy_receipts r where r.idempotency_key=p_idempotency_key) then
    return query select * from public.vault_append_commit(p_expected_sequence,p_idempotency_key,p_actor,p_action,
      p_request_hash,p_snapshot,p_result,p_formula_version);
    return;
  end if;
  v_catalog:=public.vault_runtime_catalog();
  if p_catalog_revision is distinct from v_catalog->>'revision' then
    raise exception 'Catalog changed; reload and revalidate.' using errcode='40001';
  end if;
  if not exists (select 1 from public.vault_configurations c
      where c.active and c.status='published' and c.version=p_formula_version) then
    raise exception 'The active rules changed.' using errcode='40001';
  end if;
  if p_action='open' then
    select c.* into v_case from public.vault_cases c where c.id=p_opened_case_id and c.status='published';
    if not found or (v_case.starts_at is not null and v_case.starts_at>clock_timestamp())
      or (v_case.ends_at is not null and v_case.ends_at<=clock_timestamp()) then
      raise exception 'The selected case is not currently available.' using errcode='22023';
    end if;
  elsif p_opened_case_id is not null then
    raise exception 'Unexpected opened case.' using errcode='22023';
  end if;
  return query select * from public.vault_append_commit(p_expected_sequence,p_idempotency_key,p_actor,p_action,
    p_request_hash,p_snapshot,p_result,p_formula_version);
  if p_action='open' and v_case.first_opened_at is null then
    update public.vault_cases set first_opened_at=clock_timestamp(),
      edit_reason='System first opening by '||p_actor where id=p_opened_case_id;
  end if;
end $$;

create or replace function public.vault_activate_economy22(
  p_user_id uuid,p_actor text,p_expected_sequence bigint,p_catalog_revision text,
  p_snapshot jsonb,p_result jsonb,p_request_hash text,p_rules jsonb,p_packs jsonb,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_old public.vault_configurations%rowtype; v_head bigint; v_prior jsonb; v_pack jsonb;
begin
  if not exists(select 1 from public.vault_operator_roles where user_id=p_user_id and role in ('owner','operator','economy')) or
     not exists(select 1 from public.vault_player_bindings where user_id=p_user_id and player_id=p_actor) then
    raise exception 'A bound economy operator is required.' using errcode='42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 5 and 2000 then raise exception 'An audit reason is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vault:catalog-write',0));
  select result into v_prior from public.vault_economy_receipts where idempotency_key='economy-upgrade:2_2_0';
  if found then return v_prior; end if;
  select last_sequence into v_head from public.vault_economy_head where singleton for update;
  if v_head is distinct from p_expected_sequence or
     public.vault_runtime_catalog()->>'revision' is distinct from p_catalog_revision then
    raise exception 'Economy changed since preview; preview again.' using errcode='40001';
  end if;
  select * into v_old from public.vault_configurations where active and status='published' for update;
  if v_old.id is null or p_rules->>'version' is distinct from '2.2.0' or
     p_rules->'rewards' is distinct from '{"starter":1250,"daily":150}'::jsonb or
     p_rules-array['version','rewards','expansion'] is distinct from v_old.rules-array['version','rewards','expansion'] then
    raise exception 'The upgrade must preserve existing value rules and use the approved rewards.';
  end if;
  if jsonb_typeof(p_packs) is distinct from 'array' or jsonb_array_length(p_packs)<>2 then raise exception 'The upgrade requires exactly two intermediate packs.'; end if;
  update public.vault_configurations set active=false,updated_by=p_user_id,edit_reason=p_reason where id=v_old.id;
  insert into public.vault_configurations(id,name,version,rules,status,active,updated_by,edit_reason)
    values('vault-economy-2-2-0','VAULT · Progression 2.2','2.2.0',p_rules,'published',true,p_user_id,p_reason);
  update public.vault_cases set configuration_id='vault-economy-2-2-0',updated_by=p_user_id,edit_reason=p_reason
    where configuration_id=v_old.id;
  for v_pack in select value from jsonb_array_elements(p_packs) loop
    insert into public.vault_cases(id,name,slug,subtitle,kind,status,price,cards_per_opening,pool_mode,odds,configuration_id,visual_config,updated_by,edit_reason)
    values(v_pack->>'id',v_pack->>'name',v_pack->>'slug',v_pack->>'subtitle','standard','published',
      (v_pack->>'price')::bigint,3,'rarity',v_pack->'odds','vault-economy-2-2-0',
      jsonb_build_object('color',v_pack->>'color'),p_user_id,p_reason);
  end loop;
  perform public.vault_append_commit(v_head,'economy-upgrade:2_2_0',p_actor,'economyUpgrade',
    p_request_hash,p_snapshot,p_result,'2.2.0');
  return p_result;
end $$;

do $verify$
declare
  v_head bigint;
  v_count bigint;
begin
  select last_sequence into strict v_head from public.vault_economy_head where singleton;
  select count(*) into v_count from public.vault_economy_receipts;
  if v_count<>(select count(*) from public.vault_economy_commits) or exists (
    select 1 from public.vault_economy_commits c left join public.vault_economy_receipts r using(sequence)
    where r.sequence is null or (c.idempotency_key,c.actor,c.action,c.request_hash,c.result,c.formula_version,c.created_at,
      case when c.action='import_checkpoint' then c.snapshot end) is distinct from
      (r.idempotency_key,r.actor,r.action,r.request_hash,r.result,r.formula_version,r.created_at,r.import_snapshot)
  ) or (v_head>0 and (select snapshot from public.vault_economy_head where singleton) is distinct from
    (select snapshot from public.vault_economy_commits where sequence=v_head)) then
    raise exception 'Preservation check failed. No cleanup was committed.';
  end if;
  -- Old app builds must fail closed, not mistake an empty table for new players.
  revoke all on table public.vault_economy_commits from public,anon,authenticated,service_role;
  if has_table_privilege('service_role','public.vault_economy_commits','select')
      or has_any_column_privilege('service_role','public.vault_economy_commits','select') then
    raise exception 'Legacy economy reads are still permitted. Review role inheritance before the cutover.';
  end if;
  truncate table public.vault_economy_commits;
  raise notice 'Cleared % old commit rows; preserved head sequence % and % replay receipts.',v_count,v_head,v_count;
end
$verify$;

-- Refresh PostgREST metadata after commit so the app can call the new RPCs.
notify pgrst, 'reload schema';
commit;

select
  (select count(*) from public.vault_economy_commits) as old_commit_rows_remaining,
  (select last_sequence from public.vault_economy_head where singleton) as preserved_sequence,
  (select snapshot is not null from public.vault_economy_head where singleton) as current_world_saved,
  (select count(*) from public.vault_economy_receipts) as replay_receipts_kept;
