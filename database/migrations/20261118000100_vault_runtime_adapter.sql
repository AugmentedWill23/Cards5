-- Run once AFTER the two existing VAULT schema migrations.
-- Additive: no tables/data/roles are dropped, reset, seeded or auto-published.
begin;
set local lock_timeout = '5s';

-- Trusted-server catalog read, coherent with the commit gate below.
create function public.vault_runtime_catalog()
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_catalog jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('vault:catalog-write', 0));
  select jsonb_build_object(
    'configurations', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.id) from public.vault_configurations c
      where c.active and c.status = 'published'
    ), '[]'::jsonb),
    'designs', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.id) from public.vault_card_designs d where d.enabled
    ), '[]'::jsonb),
    'cases', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.price,c.id) from public.vault_cases c
      where c.status = 'published'
    ), '[]'::jsonb),
    'updates', coalesce((
      select jsonb_agg(to_jsonb(u) order by u.published_at desc,u.id)
      from public.vault_updates u where u.status = 'published' and u.published_at <= now()
    ), '[]'::jsonb)
  ) into v_catalog;
  -- Freshness token, not an authentication token or a cryptographic outcome proof.
  return v_catalog || jsonb_build_object('revision', md5(v_catalog::text));
end $$;

create function public.vault_commit_game(
  p_user_id uuid, p_expected_sequence bigint, p_idempotency_key text,
  p_actor text, p_action text, p_request_hash text, p_snapshot jsonb,
  p_result jsonb, p_formula_version text, p_catalog_revision text,
  p_opened_case_id text default null
) returns table(sequence bigint, result jsonb, replayed boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare v_binding text; v_catalog jsonb; v_case public.vault_cases%rowtype;
begin
  select b.player_id into v_binding from public.vault_player_bindings b where b.user_id = p_user_id;
  if v_binding is null or v_binding is distinct from p_actor then
    raise exception 'The authenticated player binding does not match.' using errcode = '42501';
  end if;
  if p_action in ('admin','moderateChat') and not exists (
    select 1 from public.vault_operator_roles r where r.user_id = p_user_id
      and r.role in ('owner','operator','economy')
  ) then raise exception 'A Supabase economy operator role is required.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vault:catalog-write', 0));
  -- A confirmed retry remains valid even when the catalog has since changed.
  if exists (select 1 from public.vault_economy_commits c where c.idempotency_key=p_idempotency_key) then
    return query select * from public.vault_append_commit(
      p_expected_sequence,p_idempotency_key,p_actor,p_action,p_request_hash,
      p_snapshot,p_result,p_formula_version);
    return;
  end if;
  v_catalog := public.vault_runtime_catalog();
  if p_catalog_revision is distinct from v_catalog->>'revision' then
    raise exception 'Catalog changed; reload and revalidate.' using errcode = '40001';
  end if;
  if not exists (
    select 1 from public.vault_configurations c
    where c.active and c.status='published' and c.version=p_formula_version
  ) then raise exception 'The active rules changed.' using errcode = '40001'; end if;
  if p_action = 'open' then
    select c.* into v_case from public.vault_cases c where c.id=p_opened_case_id and c.status='published';
    if not found or (v_case.starts_at is not null and v_case.starts_at > clock_timestamp())
      or (v_case.ends_at is not null and v_case.ends_at <= clock_timestamp()) then
      raise exception 'The selected case is not currently available.' using errcode = '22023';
    end if;
  elsif p_opened_case_id is not null then
    raise exception 'Unexpected opened case.' using errcode = '22023';
  end if;
  return query select * from public.vault_append_commit(
    p_expected_sequence,p_idempotency_key,p_actor,p_action,p_request_hash,
    p_snapshot,p_result,p_formula_version);
  if p_action='open' and v_case.first_opened_at is null then
    update public.vault_cases set first_opened_at=clock_timestamp(),
      edit_reason='System first opening by ' || p_actor
    where id=p_opened_case_id;
  end if;
end $$;

revoke all on function public.vault_runtime_catalog(),
  public.vault_commit_game(uuid,bigint,text,text,text,text,jsonb,jsonb,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.vault_runtime_catalog(),
  public.vault_commit_game(uuid,bigint,text,text,text,text,jsonb,jsonb,text,text,text)
  to service_role;
commit;
