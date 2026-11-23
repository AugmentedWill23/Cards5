-- Run once, in Supabase SQL Editor (postgres), before 20261117000200.
-- Additive database preparation only. Does NOT import Payload or switch the app.
-- Existing vault_* objects cause an error and roll back this entire file.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null
     or not exists (select 1 from pg_roles where rolname = 'service_role')
     or not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'anon') then
    raise exception 'Run this migration in a Supabase project, not a plain PostgreSQL database.';
  end if;
end $$;

-- Public player IDs stay text: existing IDs include p_... and seeded legacy IDs.
-- No emails, passwords, password hashes, tokens or wallet balances belong here.
create table public.vault_player_bindings (
  user_id uuid primary key references auth.users(id) on delete restrict,
  player_id text not null unique check (player_id ~ '^[A-Za-z0-9:_-]{1,160}$'),
  legacy_user_id text unique,
  link_method text not null check (link_method in ('new-signup', 'verified-legacy-link')),
  created_at timestamptz not null default now(),
  check (
    (link_method = 'new-signup' and legacy_user_id is null)
    or (link_method = 'verified-legacy-link' and legacy_user_id is not null and length(legacy_user_id) > 0)
  )
);

create table public.vault_operator_roles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role text not null check (role in ('owner', 'operator', 'economy', 'content')),
  updated_by uuid references auth.users(id) on delete restrict,
  edit_reason text not null check (length(btrim(edit_reason)) between 5 and 2000),
  updated_at timestamptz not null default now()
);

create table public.vault_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete restrict,
  database_actor text not null,
  action text not null,
  entity_table text not null,
  entity_id text not null,
  reason text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

-- The current game commits one whole World snapshot atomically. Keep that
-- contract; don't introduce a second independently writable wallet database.
create table public.vault_economy_head (
  singleton boolean primary key default true check (singleton),
  last_sequence bigint not null default 0
    check (last_sequence between 0 and 9007199254740991)
);
insert into public.vault_economy_head(singleton, last_sequence) values (true, 0);

create function public.vault_valid_snapshot(p_snapshot jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object'
     or octet_length(p_snapshot::text) > 16777216 then return false; end if;
  if p_snapshot ? 'encoding' then
    return coalesce(
      p_snapshot->>'encoding' = 'gzip-base64-v1'
      and jsonb_typeof(p_snapshot->'data') = 'string'
      and length(p_snapshot->>'data') > 0
      and (p_snapshot->>'data') ~ '^[A-Za-z0-9+/]+={0,2}$', false);
  end if;
  return coalesce(
    jsonb_typeof(p_snapshot->'players') = 'object'
    and jsonb_typeof(p_snapshot->'cards') = 'object'
    and jsonb_typeof(p_snapshot->'listings') = 'object'
    and jsonb_typeof(p_snapshot->'trades') = 'object'
    and jsonb_typeof(p_snapshot->'counters') = 'object'
    and jsonb_typeof(p_snapshot->'requests') = 'object'
    and jsonb_typeof(p_snapshot->'receipts') = 'array'
    and jsonb_typeof(p_snapshot->'ledger') = 'array'
    and jsonb_typeof(p_snapshot->'sales') = 'array'
    and (not (p_snapshot ? 'expansion') or jsonb_typeof(p_snapshot->'expansion') = 'object'),
    false);
end $$;

create table public.vault_economy_commits (
  sequence bigint primary key check (sequence between 1 and 9007199254740991),
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9:_-]{8,120}$'),
  actor text not null check (length(actor) between 1 and 160),
  action text not null check (length(action) between 1 and 80),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null check (public.vault_valid_snapshot(snapshot)),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  formula_version text not null check (length(formula_version) between 1 and 80),
  created_at timestamptz not null default now()
);
create index vault_economy_commits_actor_time on public.vault_economy_commits(actor, created_at desc);

-- Optional immutable source archive for a separately confirmed migration.
-- Do not put auth exports/credential fields in this table.
create table public.vault_source_archive (
  source_collection text not null check (source_collection in
    ('game-events', 'packs', 'card-designs', 'game-configurations', 'game-updates', 'admin-audit')),
  source_id text not null,
  source_document jsonb not null check (jsonb_typeof(source_document) = 'object'),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz not null default now(),
  primary key (source_collection, source_id)
);

create function public.vault_prevent_rewrite()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'VAULT immutable record: % cannot be updated or deleted.', tg_table_name
    using errcode = '55000';
end $$;
create trigger vault_commits_immutable before update or delete on public.vault_economy_commits
  for each row execute function public.vault_prevent_rewrite();
create trigger vault_audit_immutable before update or delete on public.vault_admin_audit
  for each row execute function public.vault_prevent_rewrite();
create trigger vault_archive_immutable before update or delete on public.vault_source_archive
  for each row execute function public.vault_prevent_rewrite();
create trigger vault_bindings_immutable before update or delete on public.vault_player_bindings
  for each row execute function public.vault_prevent_rewrite();

create function public.vault_audit_catalog_change()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_record jsonb;
begin
  if tg_op <> 'INSERT' then v_before := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_after := to_jsonb(new); end if;
  v_record := coalesce(v_after, v_before);
  insert into public.vault_admin_audit(
    actor_user_id, database_actor, action, entity_table, entity_id,
    reason, before_data, after_data
  ) values (
    case when tg_op = 'DELETE' then null else nullif(v_record->>'updated_by', '')::uuid end,
    session_user, tg_op, tg_table_name,
    coalesce(v_record->>'id', v_record->>'user_id',
      concat(v_record->>'case_id', ':', v_record->>'design_id')),
    case when tg_op = 'DELETE' then 'Privileged database delete'
      else coalesce(v_record->>'edit_reason', 'Database catalog operation') end,
    v_before, v_after
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
create trigger vault_operator_roles_audit after insert or update or delete on public.vault_operator_roles
  for each row execute function public.vault_audit_catalog_change();

-- Only a trusted server may call this. It must validate the user's token,
-- resolve player_id from vault_player_bindings, run the existing game engine,
-- validate/decompress its snapshot, and compute the request hash itself.
create function public.vault_append_commit(
  p_expected_sequence bigint,
  p_idempotency_key text,
  p_actor text,
  p_action text,
  p_request_hash text,
  p_snapshot jsonb,
  p_result jsonb,
  p_formula_version text
) returns table (sequence bigint, result jsonb, replayed boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_head bigint;
  v_previous public.vault_economy_commits%rowtype;
  v_next bigint;
begin
  if p_expected_sequence is null or p_expected_sequence < 0
     or p_expected_sequence >= 9007199254740991 then
    raise exception 'Invalid expected sequence.' using errcode = '22023';
  end if;
  select h.last_sequence into strict v_head from public.vault_economy_head h
    where h.singleton for update;
  select c.* into v_previous from public.vault_economy_commits c
    where c.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.actor is distinct from p_actor
       or v_previous.action is distinct from p_action
       or v_previous.request_hash is distinct from p_request_hash then
      raise exception 'Idempotency key belongs to another actor or request.' using errcode = '22023';
    end if;
    return query select v_previous.sequence, v_previous.result, true;
    return;
  end if;
  if v_head <> p_expected_sequence then
    raise exception 'Economy sequence changed; reload and revalidate the command.'
      using errcode = '40001';
  end if;
  v_next := v_head + 1;
  insert into public.vault_economy_commits(
    sequence, idempotency_key, actor, action, request_hash, snapshot, result, formula_version
  ) values (
    v_next, p_idempotency_key, p_actor, p_action, p_request_hash,
    p_snapshot, p_result, p_formula_version
  );
  update public.vault_economy_head set last_sequence = v_next where singleton;
  return query select v_next, p_result, false;
end $$;

-- Do NOT call until a source export and identity-preservation plan are approved.
-- Imports one initial checkpoint into an EMPTY target stream, preserving its
-- source sequence. Old request replay results remain inside the World snapshot.
create function public.vault_import_checkpoint(
  p_source_sequence bigint,
  p_import_key text,
  p_snapshot jsonb,
  p_formula_version text,
  p_checksum_sha256 text
) returns bigint language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_head bigint;
  v_previous public.vault_economy_commits%rowtype;
begin
  if p_source_sequence is null or p_source_sequence < 1 or p_source_sequence >= 9007199254740991 then
    raise exception 'Invalid source sequence.' using errcode = '22023';
  end if;
  select h.last_sequence into strict v_head from public.vault_economy_head h
    where h.singleton for update;
  select c.* into v_previous from public.vault_economy_commits c
    where c.idempotency_key = p_import_key;
  if found then
    if v_previous.action <> 'import_checkpoint' or v_previous.actor <> 'system:migration'
       or v_previous.sequence <> p_source_sequence
       or v_previous.request_hash is distinct from p_checksum_sha256
       or v_previous.snapshot is distinct from p_snapshot
       or v_previous.formula_version is distinct from p_formula_version then
      raise exception 'Checkpoint retry does not match the original import.' using errcode = '22023';
    end if;
    return v_previous.sequence;
  end if;
  if v_head <> 0 or exists (select 1 from public.vault_economy_commits) then
    raise exception 'Checkpoint import requires an empty economy stream.' using errcode = '55000';
  end if;
  insert into public.vault_economy_commits(
    sequence, idempotency_key, actor, action, request_hash, snapshot, result, formula_version
  ) values (
    p_source_sequence, p_import_key, 'system:migration', 'import_checkpoint',
    p_checksum_sha256, p_snapshot, jsonb_build_object('message', 'Legacy checkpoint imported'),
    p_formula_version
  );
  update public.vault_economy_head set last_sequence = p_source_sequence where singleton;
  return p_source_sequence;
end $$;

alter table public.vault_player_bindings enable row level security;
alter table public.vault_operator_roles enable row level security;
alter table public.vault_admin_audit enable row level security;
alter table public.vault_economy_head enable row level security;
alter table public.vault_economy_commits enable row level security;
alter table public.vault_source_archive enable row level security;

revoke all on table public.vault_player_bindings, public.vault_operator_roles,
  public.vault_admin_audit, public.vault_economy_head, public.vault_economy_commits,
  public.vault_source_archive from public, anon, authenticated, service_role;
grant select on public.vault_player_bindings, public.vault_operator_roles to authenticated;
create policy vault_binding_self_read on public.vault_player_bindings for select to authenticated
  using (user_id = (select auth.uid()));
create policy vault_role_self_read on public.vault_operator_roles for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.vault_player_bindings, public.vault_operator_roles,
  public.vault_admin_audit, public.vault_economy_head, public.vault_economy_commits,
  public.vault_source_archive to service_role;
grant insert on public.vault_player_bindings, public.vault_source_archive to service_role;
grant insert, update, delete on public.vault_operator_roles to service_role;

revoke all on function public.vault_valid_snapshot(jsonb),
  public.vault_prevent_rewrite(), public.vault_audit_catalog_change(),
  public.vault_append_commit(bigint,text,text,text,text,jsonb,jsonb,text),
  public.vault_import_checkpoint(bigint,text,jsonb,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.vault_append_commit(bigint,text,text,text,text,jsonb,jsonb,text),
  public.vault_import_checkpoint(bigint,text,jsonb,text,text) to service_role;

commit;
