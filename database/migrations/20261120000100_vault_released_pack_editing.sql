-- Apply ONCE after 20261119000100_vault_studio.sql, as postgres.
-- Approved forward-only editing. No wallet, card, receipt, counter or role writes.
-- Compressed World snapshots remain immutable. The trusted app decodes their
-- usage, then this private RPC checks that the economy head has not changed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare v_names text[];
begin
  if to_regprocedure('public.vault_studio_save(uuid,text,text,integer,jsonb,jsonb,text)') is null then
    raise exception 'Install the studio migration first.';
  end if;
  select array_agg(conname::text) into v_names from pg_constraint
    where conrelid='public.vault_cases'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%edition_cap%'
      and pg_get_constraintdef(oid) like '%max_total_openings%'
      and pg_get_constraintdef(oid) like '%cards_per_opening%';
  if coalesce(cardinality(v_names),0)<>1 then
    raise exception 'Unexpected edition constraint or migration already installed; stop and inspect.';
  end if;
  -- Old stock * current-count arithmetic is wrong after a forward card-count
  -- change. The new RPC enforces minted + remaining-openings * new-count.
  execute format('alter table public.vault_cases drop constraint %I',v_names[1]);
end $$;
alter table public.vault_cases add constraint vault_edition_has_stock
  check (edition_cap is null or (kind='limited' and max_total_openings is not null));

create or replace function public.vault_case_before_write()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('vault:catalog-write',0));
  if tg_op='UPDATE' then
    if new.id is distinct from old.id or (old.first_opened_at is not null and (
      new.slug is distinct from old.slug or new.kind is distinct from old.kind or
      new.serial_scope is distinct from old.serial_scope or
      new.first_opened_at is distinct from old.first_opened_at
    )) then raise exception 'Opened release identity and serial namespace are immutable; clone a new release.'; end if;
    new.updated_at:=now();
    new.revision:=old.revision+1;
  end if;
  if new.status='published' then perform public.vault_assert_case_publishable(new); end if;
  return new;
end $$;

create or replace function public.vault_pool_before_write()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare v_case public.vault_cases%rowtype; v_id text;
begin
  perform pg_advisory_xact_lock(hashtextextended('vault:catalog-write',0));
  if tg_op='UPDATE' and (new.case_id is distinct from old.case_id or new.design_id is distinct from old.design_id) then
    raise exception 'Remove and recreate a pool entry instead of changing its identity.';
  end if;
  if tg_op='DELETE' then v_id:=old.case_id; else v_id:=new.case_id; end if;
  select * into strict v_case from public.vault_cases where id=v_id for update;
  if v_case.status='published' then raise exception 'Pause the case before editing its pool.'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;

create function public.vault_released_editing_version()
returns text language sql stable set search_path=pg_catalog as $$ select '1'::text $$;

create function public.vault_studio_save_released(
  p_user_id uuid,p_entity text,p_id text,p_expected_revision integer,
  p_data jsonb,p_pool jsonb,p_reason text,p_expected_sequence bigint,p_usage jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_case public.vault_cases%rowtype; v_next public.vault_cases%rowtype;
  v_head bigint; v_config text; v_saved jsonb; v_status text; v_key text;
  v_openings bigint; v_minted bigint; v_distinct bigint; v_lifetime bigint; v_daily bigint;
begin
  if not exists(select 1 from public.vault_operator_roles where user_id=p_user_id and role in ('owner','operator','economy')) then
    raise exception 'An economy operator is required.' using errcode='42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 5 and 2000 then raise exception 'An audit reason is required.'; end if;
  if p_entity is distinct from 'case' or p_id is null then raise exception 'Choose an existing case.'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or exists(
    select 1 from jsonb_object_keys(p_data) k where k not in (
      'name','slug','subtitle','kind','status','price','cards_per_opening','pool_mode','odds','configuration_id',
      'starts_at','ends_at','max_total_openings','max_distinct_players','per_player_limit','per_player_daily_limit',
      'cooldown_seconds','edition_cap','serial_scope','perfect_qualifying_tier','visual_config'
    )
  ) then raise exception 'Unsupported case fields.'; end if;
  if jsonb_typeof(p_pool) is distinct from 'array' or jsonb_array_length(p_pool)>200 then raise exception 'Invalid assigned pool.'; end if;
  if jsonb_typeof(p_usage) is distinct from 'object' or
     p_usage->>'day' is distinct from to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD') or exists (
       select 1 from jsonb_object_keys(p_usage) k where k not in ('openings','minted','distinct','maxLifetime','maxDaily','day')
     ) then raise exception 'Reload current UTC usage before saving.' using errcode='40001'; end if;
  foreach v_key in array array['openings','minted','distinct','maxLifetime','maxDaily'] loop
    if jsonb_typeof(p_usage->v_key) is distinct from 'number' or
       coalesce(p_usage->>v_key,'') !~ '^(0|[1-9][0-9]*)$' then raise exception 'Invalid case usage.'; end if;
    if (p_usage->>v_key)::numeric>9007199254740991 then raise exception 'Usage exceeds safe bounds.'; end if;
  end loop;
  v_openings:=(p_usage->>'openings')::bigint; v_minted:=(p_usage->>'minted')::bigint;
  v_distinct:=(p_usage->>'distinct')::bigint; v_lifetime:=(p_usage->>'maxLifetime')::bigint; v_daily:=(p_usage->>'maxDaily')::bigint;
  if v_distinct>v_openings or v_lifetime>v_openings or v_daily>v_lifetime or v_minted<v_openings then
    raise exception 'Inconsistent case usage.';
  end if;
  -- Same lock order as the commit gate: catalog, head, then case.
  perform pg_advisory_xact_lock(hashtextextended('vault:catalog-write',0));
  select last_sequence into strict v_head from public.vault_economy_head where singleton for update;
  if p_expected_sequence is distinct from v_head then
    raise exception 'Economy changed; reload usage and retry.' using errcode='40001';
  end if;
  select * into v_case from public.vault_cases where id=p_id for update;
  if not found then raise exception 'Case not found.'; end if;
  if p_expected_revision is distinct from v_case.revision then raise exception 'Case changed; reload it.' using errcode='40001'; end if;
  if v_case.first_opened_at is not null and v_openings=0 then raise exception 'Missing usage for an opened release; manual review required.'; end if;
  select * into v_next from jsonb_populate_record(null::public.vault_cases,to_jsonb(v_case)||p_data);
  select id into v_config from public.vault_configurations where active and status='published';
  if v_config is null or (v_next.configuration_id is not null and v_next.configuration_id<>v_config) then
    raise exception 'Choose the active configuration or inherit active rules.';
  end if;
  if v_next.price<1 then raise exception 'Case prices must be positive.'; end if;
  if (v_next.max_total_openings is not null and v_next.max_total_openings<v_openings) or
     (v_next.max_distinct_players is not null and v_next.max_distinct_players<v_distinct) or
     (v_next.per_player_limit is not null and v_next.per_player_limit<v_lifetime) or
     (v_next.per_player_daily_limit is not null and v_next.per_player_daily_limit<v_daily) then
    raise exception 'Limits cannot be lower than already-used openings or participation.';
  end if;
  if v_next.edition_cap is not null and (
    v_next.max_total_openings is null or v_next.edition_cap::numeric<>
      v_minted::numeric+(v_next.max_total_openings-v_openings)::numeric*v_next.cards_per_opening
  ) then raise exception 'Edition cap must equal minted cards plus remaining openings times new card count.'; end if;
  if exists(select 1 from jsonb_array_elements(p_pool) e where jsonb_typeof(e)<>'object' or exists(
    select 1 from jsonb_object_keys(e) k where k not in ('design_id','weight')
  )) then raise exception 'Unsupported pool fields.'; end if;
  if v_next.pool_mode='rarity' and jsonb_array_length(p_pool)>0 then raise exception 'Rarity cases cannot contain assigned pool rows.'; end if;
  if v_next.pool_mode='assigned' and (
    jsonb_array_length(p_pool)=0 or
    abs((select coalesce(sum(weight),0) from jsonb_to_recordset(p_pool) x(weight numeric))-100)>0.0000001 or
    exists(select 1 from jsonb_to_recordset(p_pool) x(weight numeric) where weight is null or weight<=0 or weight>100) or
    (select count(distinct design_id) from jsonb_to_recordset(p_pool) x(design_id text))<>jsonb_array_length(p_pool)
  ) then raise exception 'Unique assigned card weights must total 100 percent.'; end if;
  v_status:=v_next.status;
  -- Draft/pool/final publication is ONE transaction under the catalog lock.
  -- Invalid publication rolls back both the old pool and its temporary status.
  update public.vault_cases set status='draft',updated_by=p_user_id,edit_reason=p_reason where id=p_id;
  delete from public.vault_case_pool where case_id=p_id;
  insert into public.vault_case_pool(case_id,design_id,weight,updated_by,edit_reason)
    select p_id,x.design_id,x.weight,p_user_id,p_reason from jsonb_to_recordset(p_pool) x(design_id text,weight numeric);
  update public.vault_cases set name=v_next.name,slug=v_next.slug,subtitle=v_next.subtitle,kind=v_next.kind,
    status=v_status,price=v_next.price,cards_per_opening=v_next.cards_per_opening,pool_mode=v_next.pool_mode,
    odds=v_next.odds,configuration_id=v_next.configuration_id,starts_at=v_next.starts_at,ends_at=v_next.ends_at,
    max_total_openings=v_next.max_total_openings,max_distinct_players=v_next.max_distinct_players,
    per_player_limit=v_next.per_player_limit,per_player_daily_limit=v_next.per_player_daily_limit,
    cooldown_seconds=v_next.cooldown_seconds,edition_cap=v_next.edition_cap,serial_scope=v_next.serial_scope,
    perfect_qualifying_tier=v_next.perfect_qualifying_tier,visual_config=v_next.visual_config,
    updated_by=p_user_id,edit_reason=p_reason
    where id=p_id returning to_jsonb(vault_cases) into v_saved;
  return v_saved;
end $$;

revoke all on function public.vault_released_editing_version(),
  public.vault_studio_save_released(uuid,text,text,integer,jsonb,jsonb,text,bigint,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.vault_released_editing_version(),
  public.vault_studio_save_released(uuid,text,text,integer,jsonb,jsonb,text,bigint,jsonb)
  to service_role;
-- CREATE OR REPLACE retains the private trigger-function ACLs.
commit;
