-- Additive studio/runtime upgrade. Apply after the three existing migrations.
-- Does NOT activate new rewards, compensate wallets, or create/publish packs.
begin;
set local lock_timeout = '5s';

create function public.vault_studio_save(
  p_user_id uuid, p_entity text, p_id text, p_expected_revision integer,
  p_data jsonb, p_pool jsonb, p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_design public.vault_card_designs%rowtype;
  v_case public.vault_cases%rowtype;
  v_next public.vault_cases%rowtype;
  v_json jsonb; v_saved jsonb; v_old_pool jsonb; v_new_pool jsonb;
  v_id text := coalesce(p_id,gen_random_uuid()::text);
  v_status text; v_rules jsonb; v_config text;
begin
  if not exists(select 1 from public.vault_operator_roles where user_id=p_user_id and role in ('owner','operator','economy')) then
    raise exception 'An economy operator is required.' using errcode='42501';
  end if;
  if length(btrim(p_reason)) not between 5 and 2000 or p_reason is null then raise exception 'An audit reason is required.'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid studio input.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vault:catalog-write',0));
  select id,rules into v_config,v_rules from public.vault_configurations where active and status='published';
  if v_config is null then raise exception 'Publish an active configuration first.'; end if;
  if p_entity='design' then
    if exists(select 1 from jsonb_object_keys(p_data) k where k not in
      ('name','slug','description','rarity','enabled','availability','base_value_override','default_attributes','visual_config')) then
      raise exception 'Unsupported design fields.';
    end if;
    if p_id is not null then
      select * into v_design from public.vault_card_designs where id=p_id for update;
      if not found then raise exception 'Design not found.'; end if;
      if v_design.revision is distinct from p_expected_revision then raise exception 'Design changed; reload it.' using errcode='40001'; end if;
    end if;
    v_json := jsonb_build_object('description','','enabled',true,'availability','standard',
      'default_attributes','{}'::jsonb,'visual_config','{}'::jsonb) ||
      case when p_id is null then '{}'::jsonb else to_jsonb(v_design) end || p_data;
    select * into v_design from jsonb_populate_record(null::public.vault_card_designs,v_json);
    if v_design.default_attributes->>'effect' is not null and (
      not (v_rules->'effects' ? (v_design.default_attributes->>'effect')) or
      coalesce((v_rules->'effects'->(v_design.default_attributes->>'effect')->>'enabled')::boolean,true)=false or
      coalesce((v_rules->'effects'->(v_design.default_attributes->>'effect')->>'archived')::boolean,false)
    ) then raise exception 'Choose an enabled special effect.'; end if;
    if p_id is null then
      insert into public.vault_card_designs(id,name,slug,description,rarity,enabled,availability,base_value_override,default_attributes,visual_config,updated_by,edit_reason)
      values(v_id,v_design.name,v_design.slug,v_design.description,v_design.rarity,v_design.enabled,v_design.availability,v_design.base_value_override,v_design.default_attributes,v_design.visual_config,p_user_id,p_reason)
      returning to_jsonb(vault_card_designs) into v_saved;
    else
      update public.vault_card_designs set name=v_design.name,slug=v_design.slug,description=v_design.description,
        rarity=v_design.rarity,enabled=v_design.enabled,availability=v_design.availability,
        base_value_override=v_design.base_value_override,default_attributes=v_design.default_attributes,
        visual_config=v_design.visual_config,updated_by=p_user_id,edit_reason=p_reason
      where id=v_id returning to_jsonb(vault_card_designs) into v_saved;
    end if;
    return v_saved;
  elsif p_entity<>'case' then raise exception 'Unsupported studio entity.'; end if;
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in
    ('name','slug','subtitle','kind','status','price','cards_per_opening','pool_mode','odds','configuration_id',
    'starts_at','ends_at','max_total_openings','max_distinct_players','per_player_limit','per_player_daily_limit',
    'cooldown_seconds','edition_cap','serial_scope','perfect_qualifying_tier','visual_config')) then
    raise exception 'Unsupported case fields.';
  end if;
  if jsonb_typeof(p_pool) is distinct from 'array' or jsonb_array_length(p_pool)>200 then raise exception 'Invalid assigned pool.'; end if;
  if p_id is not null then
    select * into v_case from public.vault_cases where id=p_id for update;
    if not found then raise exception 'Case not found.'; end if;
    if v_case.revision is distinct from p_expected_revision then raise exception 'Case changed; reload it.' using errcode='40001'; end if;
  end if;
  v_json:=jsonb_build_object('subtitle','','kind','standard','status','draft','cards_per_opening',3,
    'pool_mode','rarity','cooldown_seconds',0,'visual_config','{}'::jsonb) ||
    case when p_id is null then '{}'::jsonb else to_jsonb(v_case) end || p_data;
  select * into v_next from jsonb_populate_record(null::public.vault_cases,v_json);
  if v_next.price<1 then raise exception 'Case prices must be positive.'; end if;
  if v_next.configuration_id is not null and v_next.configuration_id<>v_config then raise exception 'Choose the active configuration or inherit active rules.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('design_id',p.design_id,'weight',p.weight) order by p.design_id),'[]'::jsonb)
    into v_old_pool from public.vault_case_pool p where case_id=v_id;
  select coalesce(jsonb_agg(jsonb_build_object('design_id',x.design_id,'weight',x.weight) order by x.design_id),'[]'::jsonb)
    into v_new_pool from jsonb_to_recordset(p_pool) x(design_id text,weight numeric);
  if v_next.pool_mode='rarity' and jsonb_array_length(p_pool)>0 then raise exception 'Rarity cases cannot contain assigned pool rows.'; end if;
  if v_next.pool_mode='assigned' and (
      jsonb_array_length(p_pool)=0 or
      abs((select coalesce(sum(weight),0) from jsonb_to_recordset(p_pool) x(weight numeric))-100)>0.0000001 or
      exists(select 1 from jsonb_to_recordset(p_pool) x(weight numeric) where weight is null or weight<=0 or weight>100) or
      (select count(distinct design_id) from jsonb_to_recordset(p_pool) x(design_id text))<>jsonb_array_length(p_pool)
  ) then raise exception 'Unique assigned card weights must total 100 percent.'; end if;
  if v_case.first_opened_at is not null and (
      to_jsonb(v_next)-array['name','subtitle','visual_config','status'] is distinct from
      to_jsonb(v_case)-array['name','subtitle','visual_config','status'] or
      v_old_pool is distinct from v_new_pool
  ) then raise exception 'Opened case economics and pool are immutable. Clone a new release.'; end if;
  v_status:=v_next.status;
  if p_id is null then
    insert into public.vault_cases(id,name,slug,subtitle,kind,status,price,cards_per_opening,pool_mode,odds,configuration_id,
      starts_at,ends_at,max_total_openings,max_distinct_players,per_player_limit,per_player_daily_limit,cooldown_seconds,
      edition_cap,serial_scope,perfect_qualifying_tier,visual_config,updated_by,edit_reason)
    values(v_id,v_next.name,v_next.slug,v_next.subtitle,v_next.kind,'draft',v_next.price,v_next.cards_per_opening,v_next.pool_mode,v_next.odds,v_next.configuration_id,
      v_next.starts_at,v_next.ends_at,v_next.max_total_openings,v_next.max_distinct_players,v_next.per_player_limit,v_next.per_player_daily_limit,v_next.cooldown_seconds,
      v_next.edition_cap,v_next.serial_scope,v_next.perfect_qualifying_tier,v_next.visual_config,p_user_id,p_reason);
  elsif v_case.first_opened_at is null then
    update public.vault_cases set status='draft',updated_by=p_user_id,edit_reason=p_reason where id=v_id;
  end if;
  if v_case.first_opened_at is null then
    delete from public.vault_case_pool where case_id=v_id;
    insert into public.vault_case_pool(case_id,design_id,weight,updated_by,edit_reason)
      select v_id,x.design_id,x.weight,p_user_id,p_reason from jsonb_to_recordset(p_pool) x(design_id text,weight numeric);
  end if;
  update public.vault_cases set name=v_next.name,slug=v_next.slug,subtitle=v_next.subtitle,kind=v_next.kind,
    status=v_status,price=v_next.price,cards_per_opening=v_next.cards_per_opening,pool_mode=v_next.pool_mode,
    odds=v_next.odds,configuration_id=v_next.configuration_id,starts_at=v_next.starts_at,ends_at=v_next.ends_at,
    max_total_openings=v_next.max_total_openings,max_distinct_players=v_next.max_distinct_players,
    per_player_limit=v_next.per_player_limit,per_player_daily_limit=v_next.per_player_daily_limit,
    cooldown_seconds=v_next.cooldown_seconds,edition_cap=v_next.edition_cap,serial_scope=v_next.serial_scope,
    perfect_qualifying_tier=v_next.perfect_qualifying_tier,visual_config=v_next.visual_config,
    updated_by=p_user_id,edit_reason=p_reason
  where id=v_id returning to_jsonb(vault_cases) into v_saved;
  return v_saved;
end $$;

create or replace function public.vault_runtime_catalog()
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_catalog jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('vault:catalog-write',0));
  select jsonb_build_object(
    'studioVersion','2.2.0',
    'configurations',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.vault_configurations c where active and status='published'),'[]'::jsonb),
    'designs',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from public.vault_card_designs d where enabled),'[]'::jsonb),
    'cases',coalesce((select jsonb_agg(to_jsonb(c) order by c.price,c.id) from public.vault_cases c where status='published'),'[]'::jsonb),
    'pools',coalesce((select jsonb_agg(to_jsonb(p) order by p.case_id,p.design_id) from public.vault_case_pool p join public.vault_cases c on c.id=p.case_id where c.status='published'),'[]'::jsonb),
    'updates',coalesce((select jsonb_agg(to_jsonb(u) order by u.published_at desc,u.id) from public.vault_updates u where status='published' and published_at<=now()),'[]'::jsonb)
  ) into v_catalog;
  return v_catalog||jsonb_build_object('revision',md5(v_catalog::text));
end $$;

create function public.vault_protect_released_design()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare v_rarities text[]:=array['Dumpster Dive','Common','Uncommon','Rare','Epic','Legendary','Mythical',
  'Extraordinary','Extreme','Sudo-Secret','Secret','Godly Secret'];
begin
  if (new.rarity is distinct from old.rarity or
      new.base_value_override is distinct from old.base_value_override or
      new.default_attributes is distinct from old.default_attributes or
      new.availability is distinct from old.availability) and exists (
    select 1 from public.vault_case_pool p join public.vault_cases c on c.id=p.case_id
    where p.design_id=old.id and c.first_opened_at is not null
  ) then raise exception 'This design backs an opened assigned release; clone the design and release instead.'; end if;
  if new.enabled is distinct from old.enabled and exists (
    select 1 from public.vault_case_pool p join public.vault_cases c on c.id=p.case_id
    where p.design_id=old.id and c.first_opened_at is not null and c.status<>'archived'
  ) then raise exception 'Archive opened assigned releases before disabling their design.'; end if;
  if exists (
    select 1 from public.vault_cases c
    cross join lateral jsonb_array_elements(c.odds->'rarity') with ordinality r(weight,position)
    where c.status='published' and c.pool_mode='rarity' and (r.weight::text)::numeric>0
      and not (new.enabled and new.availability='standard' and new.rarity=v_rarities[r.position::integer])
      and not exists (
        select 1 from public.vault_card_designs d where d.id<>old.id and d.enabled
          and d.availability='standard' and d.rarity=v_rarities[r.position::integer]
      )
  ) then raise exception 'A published standard pack would lose its last eligible design in a rarity. Pause it first.'; end if;
  return new;
end $$;
create trigger vault_immutable_released_design before update on public.vault_card_designs
  for each row execute function public.vault_protect_released_design();
revoke all on function public.vault_protect_released_design() from public,anon,authenticated,service_role;

create function public.vault_activate_economy22(
  p_user_id uuid,p_actor text,p_expected_sequence bigint,p_catalog_revision text,
  p_snapshot jsonb,p_result jsonb,p_request_hash text,p_rules jsonb,p_packs jsonb,p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_old public.vault_configurations%rowtype; v_head bigint; v_prior jsonb; v_pack jsonb;
begin
  if not exists(select 1 from public.vault_operator_roles where user_id=p_user_id and role in ('owner','operator','economy')) or
     not exists(select 1 from public.vault_player_bindings where user_id=p_user_id and player_id=p_actor) then
    raise exception 'A bound economy operator is required.' using errcode='42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 5 and 2000 then raise exception 'An audit reason is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vault:catalog-write',0));
  select result into v_prior from public.vault_economy_commits where idempotency_key='economy-upgrade:2_2_0';
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

revoke all on function public.vault_studio_save(uuid,text,text,integer,jsonb,jsonb,text),
  public.vault_activate_economy22(uuid,text,bigint,text,jsonb,jsonb,text,jsonb,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.vault_studio_save(uuid,text,text,integer,jsonb,jsonb,text),
  public.vault_activate_economy22(uuid,text,bigint,text,jsonb,jsonb,text,jsonb,jsonb,text)
  to service_role;
-- CREATE OR REPLACE preserves the original catalog function's service-only ACL.
commit;
