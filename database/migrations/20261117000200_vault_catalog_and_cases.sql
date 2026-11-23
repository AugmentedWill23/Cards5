-- Run once after 20261117000100_vault_runtime.sql.
-- Catalog/case schema + publication validation. No seed/import or wallet writes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.vault_economy_commits') is null then
    raise exception 'Run the VAULT runtime migration first.';
  end if;
end $$;

create function public.vault_valid_weights(p_weights jsonb, p_length integer)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare v_weight jsonb; v_total numeric := 0;
begin
  if p_length is null or p_length < 1 or p_weights is null or jsonb_typeof(p_weights) <> 'array'
     or jsonb_array_length(p_weights) <> p_length then return false; end if;
  for v_weight in select value from jsonb_array_elements(p_weights) loop
    if jsonb_typeof(v_weight) <> 'number' then return false; end if;
    if v_weight::text::numeric < 0 or v_weight::text::numeric > 100 then return false; end if;
    v_total := v_total + v_weight::text::numeric;
  end loop;
  return abs(v_total - 100) <= 0.0000001;
end $$;

create function public.vault_valid_case_odds(p_odds jsonb, p_require_rarity boolean)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare v_key text;
begin
  if p_odds is null or jsonb_typeof(p_odds) <> 'object'
     or not public.vault_valid_weights(p_odds->'quality', 6) then return false; end if;
  if exists (select 1 from jsonb_object_keys(p_odds) k where k not in ('rarity','quality','grade','mutation','effect')) then return false; end if;
  foreach v_key in array array['grade','mutation','effect'] loop
    if not (p_odds ? v_key) or jsonb_typeof(p_odds->v_key) <> 'number' then return false; end if;
    if (p_odds->>v_key)::numeric < 0 or (p_odds->>v_key)::numeric > 100 then return false; end if;
  end loop;
  if p_require_rarity or p_odds ? 'rarity' then
    if not public.vault_valid_weights(p_odds->'rarity', 12) then return false; end if;
    if (p_odds->'rarity'->>9)::numeric < (p_odds->'rarity'->>10)::numeric then return false; end if;
  end if;
  return true;
end $$;

create function public.vault_valid_card_defaults(p_defaults jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
begin
  if p_defaults is null or jsonb_typeof(p_defaults) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p_defaults) k where k not in ('quality','grade','mutation','effect')) then return false; end if;
  if p_defaults ? 'quality' and not coalesce(
    jsonb_typeof(p_defaults->'quality') = 'string' and p_defaults->>'quality' = any(array[
      'Torn','Crumpled','Normal','Above Average','High Quality','Mint Condition'
    ]), false) then return false; end if;
  if p_defaults ? 'grade' and p_defaults->'grade' <> 'null'::jsonb and not coalesce(
    jsonb_typeof(p_defaults->'grade') = 'number' and p_defaults->>'grade' ~ '^(10|[1-9])$', false
  ) then return false; end if;
  if p_defaults ? 'mutation' and p_defaults->'mutation' <> 'null'::jsonb and not coalesce(
    jsonb_typeof(p_defaults->'mutation') = 'string' and p_defaults->>'mutation' = any(array[
      'Etched','Holo Foil','Chrome','Shiny','Prismatic','Beaming','Emberglass',
      'Gold','Aurora','Rainbow','Stardust','Blue Gem','Void Opal','Black Pearl'
    ]), false) then return false; end if;
  if p_defaults ? 'effect' and p_defaults->'effect' <> 'null'::jsonb and not coalesce(
    jsonb_typeof(p_defaults->'effect') = 'string' and length(p_defaults->>'effect') between 1 and 80, false
  ) then return false; end if;
  return true;
end $$;

create table public.vault_configurations (
  id text primary key default gen_random_uuid()::text,
  name text not null check (length(btrim(name)) between 2 and 100),
  version text not null unique check (length(version) between 1 and 80),
  rules jsonb not null check (jsonb_typeof(rules) = 'object'
    and rules ? 'version' and jsonb_typeof(rules->'version') = 'string'
    and rules->>'version' = version),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  active boolean not null default false check (not active or status = 'published'),
  updated_by uuid references auth.users(id) on delete restrict,
  edit_reason text not null check (length(btrim(edit_reason)) between 5 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vault_one_active_configuration on public.vault_configurations(active) where active;

create table public.vault_card_designs (
  id text primary key default gen_random_uuid()::text,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 160),
  name text not null check (length(btrim(name)) between 2 and 80),
  description text not null default '' check (length(description) <= 2000),
  rarity text not null check (rarity in (
    'Dumpster Dive','Common','Uncommon','Rare','Epic','Legendary','Mythical',
    'Extraordinary','Extreme','Sudo-Secret','Secret','Godly Secret'
  )),
  enabled boolean not null default true,
  availability text not null default 'standard' check (availability in ('standard','assigned-only','limited-only')),
  base_value_override bigint check (base_value_override between 1 and 1000000000000),
  default_attributes jsonb not null default '{}'::jsonb check (public.vault_valid_card_defaults(default_attributes)),
  visual_config jsonb not null default '{}'::jsonb check (jsonb_typeof(visual_config) = 'object' and octet_length(visual_config::text) <= 16384),
  updated_by uuid references auth.users(id) on delete restrict,
  edit_reason text not null check (length(btrim(edit_reason)) between 5 and 2000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vault_card_designs_roll_pool on public.vault_card_designs(rarity, availability) where enabled;

create table public.vault_cases (
  id text primary key default gen_random_uuid()::text,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 160),
  name text not null check (length(btrim(name)) between 2 and 100),
  subtitle text not null default '' check (length(subtitle) <= 500),
  kind text not null default 'standard' check (kind in ('standard','limited')),
  status text not null default 'draft' check (status in ('draft','published','paused','archived')),
  price bigint not null check (price between 0 and 1000000000000),
  cards_per_opening integer not null default 3 check (cards_per_opening between 1 and 5),
  pool_mode text not null default 'rarity' check (pool_mode in ('rarity','assigned')),
  odds jsonb not null check (public.vault_valid_case_odds(odds, pool_mode = 'rarity')),
  configuration_id text references public.vault_configurations(id) on delete restrict,
  starts_at timestamptz,
  ends_at timestamptz,
  max_total_openings bigint check (max_total_openings between 1 and 1000000000000),
  max_distinct_players bigint check (max_distinct_players between 1 and 1000000000000),
  per_player_limit integer check (per_player_limit between 1 and 1000000000),
  per_player_daily_limit integer check (per_player_daily_limit between 1 and 1000000000),
  cooldown_seconds integer not null default 0 check (cooldown_seconds between 0 and 86400),
  edition_cap bigint check (edition_cap between 1 and 9007199254740991),
  serial_scope text unique check (serial_scope ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(serial_scope) <= 160),
  perfect_qualifying_tier text check (perfect_qualifying_tier in ('Extraordinary','Extreme','Sudo-Secret','Secret','Godly Secret')),
  visual_config jsonb not null default '{}'::jsonb check (jsonb_typeof(visual_config) = 'object' and octet_length(visual_config::text) <= 16384),
  first_opened_at timestamptz,
  updated_by uuid references auth.users(id) on delete restrict,
  edit_reason text not null check (length(btrim(edit_reason)) between 5 and 2000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or starts_at < ends_at),
  check (max_total_openings is null or max_distinct_players is null or max_distinct_players <= max_total_openings),
  check (per_player_limit is null or per_player_daily_limit is null or per_player_daily_limit <= per_player_limit),
  check (kind <> 'limited' or (serial_scope is not null and (max_total_openings is not null or ends_at is not null))),
  check (kind = 'limited' or (serial_scope is null and edition_cap is null and perfect_qualifying_tier is null)),
  check (edition_cap is null or (
    kind = 'limited' and max_total_openings is not null
    and edition_cap::numeric = max_total_openings::numeric * cards_per_opening
  ))
);
create index vault_cases_publication_window on public.vault_cases(status, starts_at, ends_at);

create table public.vault_case_pool (
  case_id text not null references public.vault_cases(id) on delete restrict,
  design_id text not null references public.vault_card_designs(id) on delete restrict,
  weight numeric(12,6) not null check (weight between 0 and 100),
  updated_by uuid references auth.users(id) on delete restrict,
  edit_reason text not null check (length(btrim(edit_reason)) between 5 and 2000),
  created_at timestamptz not null default now(),
  primary key (case_id, design_id)
);

create table public.vault_updates (
  id text primary key default gen_random_uuid()::text,
  title text not null check (length(btrim(title)) between 2 and 200),
  category text not null check (category in ('New Feature','Event','Balance','Fix')),
  summary text not null check (length(btrim(summary)) between 1 and 2000),
  details text not null default '' check (length(details) <= 20000),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  updated_by uuid references auth.users(id) on delete restrict,
  edit_reason text not null check (length(btrim(edit_reason)) between 5 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);

create function public.vault_assert_case_publishable(p_case public.vault_cases)
returns void language plpgsql set search_path = pg_catalog as $$
declare
  v_total numeric;
  v_count integer;
  v_rarities text[] := array['Dumpster Dive','Common','Uncommon','Rare','Epic','Legendary',
    'Mythical','Extraordinary','Extreme','Sudo-Secret','Secret','Godly Secret'];
  v_index integer;
begin
  if p_case.updated_by is null or not exists (
    select 1 from public.vault_operator_roles r
    where r.user_id = p_case.updated_by and r.role in ('owner','operator','economy')
  ) then raise exception 'A trusted economy operator must publish a case.' using errcode = '42501'; end if;
  if p_case.configuration_id is not null and not exists (
    select 1 from public.vault_configurations c where c.id = p_case.configuration_id and c.status = 'published'
  ) then raise exception 'Choose a published configuration version.'; end if;
  if not public.vault_valid_case_odds(p_case.odds, p_case.pool_mode = 'rarity') then
    raise exception 'Case odds are invalid.';
  end if;
  if p_case.pool_mode = 'assigned' then
    select count(*), coalesce(sum(p.weight), 0) into v_count, v_total
      from public.vault_case_pool p where p.case_id = p_case.id and p.weight > 0;
    if v_count = 0 or abs(v_total - 100) > 0.0000001 then
      raise exception 'Assigned card weights must total 100 percent.';
    end if;
    if exists (
      select 1 from public.vault_case_pool p join public.vault_card_designs d on d.id = p.design_id
      where p.case_id = p_case.id and p.weight > 0
        and (not d.enabled or (d.availability = 'limited-only' and p_case.kind <> 'limited'))
    ) then raise exception 'The pool contains a disabled or ineligible Limited-only design.'; end if;
  else
    for v_index in 1..12 loop
      if (p_case.odds->'rarity'->>(v_index - 1))::numeric > 0 and not exists (
        select 1 from public.vault_card_designs d
        where d.enabled and d.availability = 'standard' and d.rarity = v_rarities[v_index]
      ) then raise exception 'No enabled standard designs for rarity %.', v_rarities[v_index]; end if;
    end loop;
  end if;
end $$;

create function public.vault_case_before_write()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  -- Serialize catalog edits so publishing cannot race a pool/design edit.
  perform pg_advisory_xact_lock(hashtextextended('vault:catalog-write', 0));
  if tg_op = 'UPDATE' then
    if old.first_opened_at is not null and (
      new.slug is distinct from old.slug or new.kind is distinct from old.kind
      or new.serial_scope is distinct from old.serial_scope
      or new.cards_per_opening is distinct from old.cards_per_opening
      or new.edition_cap is distinct from old.edition_cap
      or new.pool_mode is distinct from old.pool_mode
      or new.perfect_qualifying_tier is distinct from old.perfect_qualifying_tier
      or new.first_opened_at is distinct from old.first_opened_at
    ) then raise exception 'Opened release identity/edition fields are immutable; clone a new release.'; end if;
    new.updated_at := now();
    new.revision := old.revision + 1;
  end if;
  if new.status = 'published' then perform public.vault_assert_case_publishable(new); end if;
  return new;
end $$;
create trigger vault_case_validation before insert or update on public.vault_cases
  for each row execute function public.vault_case_before_write();

create function public.vault_pool_before_write()
returns trigger language plpgsql set search_path = pg_catalog as $$
declare v_case public.vault_cases%rowtype; v_case_id text;
begin
  perform pg_advisory_xact_lock(hashtextextended('vault:catalog-write', 0));
  if tg_op = 'UPDATE' and (new.case_id is distinct from old.case_id or new.design_id is distinct from old.design_id) then
    raise exception 'Remove and recreate a draft pool entry instead of changing its identity.';
  end if;
  if tg_op = 'DELETE' then v_case_id := old.case_id; else v_case_id := new.case_id; end if;
  select c.* into strict v_case from public.vault_cases c where c.id = v_case_id for update;
  if v_case.status = 'published' or v_case.first_opened_at is not null then
    raise exception 'Pause an unopened case before editing its pool; opened pools cannot be rewritten.';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
create trigger vault_case_pool_validation before insert or update or delete on public.vault_case_pool
  for each row execute function public.vault_pool_before_write();

create function public.vault_catalog_before_update()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('vault:catalog-write', 0));
  if tg_table_name = 'vault_configurations' then
    if new.rules is distinct from old.rules or new.version is distinct from old.version then
      raise exception 'Create a new configuration version instead of rewriting prior rules.';
    end if;
  end if;
  if tg_table_name = 'vault_card_designs' then
    new.revision := old.revision + 1;
    if (not new.enabled or new.rarity is distinct from old.rarity
        or new.availability is distinct from old.availability
        or new.base_value_override is distinct from old.base_value_override
        or new.default_attributes is distinct from old.default_attributes) and exists (
      select 1 from public.vault_case_pool p join public.vault_cases c on c.id = p.case_id
      where p.design_id = old.id and p.weight > 0 and c.status = 'published'
    ) then raise exception 'Pause affected cases before changing their card eligibility or value defaults.'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger vault_configuration_versions before update on public.vault_configurations
  for each row execute function public.vault_catalog_before_update();
create trigger vault_card_design_revision before update on public.vault_card_designs
  for each row execute function public.vault_catalog_before_update();
create trigger vault_update_timestamp before update on public.vault_updates
  for each row execute function public.vault_catalog_before_update();

create trigger vault_configurations_audit after insert or update on public.vault_configurations
  for each row execute function public.vault_audit_catalog_change();
create trigger vault_card_designs_audit after insert or update on public.vault_card_designs
  for each row execute function public.vault_audit_catalog_change();
create trigger vault_cases_audit after insert or update on public.vault_cases
  for each row execute function public.vault_audit_catalog_change();
create trigger vault_pool_audit after insert or update or delete on public.vault_case_pool
  for each row execute function public.vault_audit_catalog_change();
create trigger vault_updates_audit after insert or update on public.vault_updates
  for each row execute function public.vault_audit_catalog_change();

alter table public.vault_configurations enable row level security;
alter table public.vault_card_designs enable row level security;
alter table public.vault_cases enable row level security;
alter table public.vault_case_pool enable row level security;
alter table public.vault_updates enable row level security;
revoke all on table public.vault_configurations, public.vault_card_designs,
  public.vault_cases, public.vault_case_pool, public.vault_updates
  from public, anon, authenticated, service_role;
grant select, insert, update on public.vault_configurations, public.vault_card_designs,
  public.vault_cases, public.vault_case_pool, public.vault_updates to service_role;
grant delete on public.vault_case_pool to service_role;
revoke all on function public.vault_valid_weights(jsonb,integer),
  public.vault_valid_case_odds(jsonb,boolean), public.vault_valid_card_defaults(jsonb),
  public.vault_assert_case_publishable(public.vault_cases),
  public.vault_case_before_write(), public.vault_pool_before_write(),
  public.vault_catalog_before_update() from public, anon, authenticated, service_role;
grant execute on function public.vault_valid_weights(jsonb,integer),
  public.vault_valid_case_odds(jsonb,boolean), public.vault_valid_card_defaults(jsonb),
  public.vault_assert_case_publishable(public.vault_cases) to service_role;

-- Limits above are configuration, NOT an opening RPC. The trusted backend must
-- enforce time, participant/per-player/stock limits and serial allocation in
-- the SAME World commit that pays and mints cards. No counter tables are added
-- here to compete with World.counters or create a double-spend window.
commit;
