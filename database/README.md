# Supabase database prerequisites

Deployment does not change databases. Use the same Supabase project to retain
the catalog and any Supabase player data. Do not reset the database for a new
website domain.

## Existing project

If you already installed the schemas and catalog, do **not** reinstall them.
Check whether the runtime-adapter functions are present with this read-only
query in SQL Editor:

```sql
select
  to_regprocedure('public.vault_runtime_catalog()') is not null as catalog_rpc_installed,
  to_regprocedure('public.vault_commit_game(uuid,bigint,text,text,text,text,jsonb,jsonb,text,text,text)')
    is not null as commit_rpc_installed;
```

If both are `false`, apply
`migrations/20261118000100_vault_runtime_adapter.sql` once as `postgres`.
If only one exists or you get an incompatible-object error, stop and inspect
rather than dropping/recreating functions or tables.

`security-checks.sql` and `readiness.sql` are non-mutating diagnostics.
`catalog/verify.sql` compares the imported catalog snapshot exactly; intentional
later edits/publication can correctly appear as mismatches.

After the runtime adapter, apply `migrations/20261119000100_vault_studio.sql`
once if it is not installed. `vault_runtime_catalog()` then reports
`studioVersion: "2.2.0"`. Do not rerun an installed migration. This adds the
studio functions but does **not** activate new rules or compensate players:
an authorized operator must preview and confirm economy 2.2 at `/operator`.

## Forward-only editing of released packs

After the studio migration, apply
`migrations/20261120000100_vault_released_pack_editing.sql` once.
See `../docs/released-pack-editing.md` for installation checks, usage/edition
rules and the preservation contract. This changes no wallets or owned cards.
Reload `/operator` to enable the upgraded editor. Do not rerun installed SQL.

## Optional economy storage cutover

To clear existing economy commit rows and retain player data and replay
receipts, see `maintenance/README.md`. Deploy this compatible app first and
run `maintenance/clear-economy-commits-preserve-state.sql` manually during
maintenance after backing up. It is not executed by the build or deployment.

## Empty Supabase project only

Run each complete file in this order, stopping on any error:

1. `migrations/20261117000100_vault_runtime.sql`
2. `migrations/20261117000200_vault_catalog_and_cases.sql`
3. `catalog/import.sql`
4. `catalog/verify.sql`
5. `migrations/20261118000100_vault_runtime_adapter.sql`
6. `migrations/20261119000100_vault_studio.sql`
7. `migrations/20261120000100_vault_released_pack_editing.sql`
8. `security-checks.sql`
9. `readiness.sql`

Use Supabase SQL Editor's normal `postgres` role. Do not recreate Supabase Auth,
change database adapters, disable RLS or grant public economic writes.
The imported catalog contains 372 designs, 7 standard packs staged as drafts
and version 2.1.0 rules with all 14 mutations. No user accounts or wallets are
seeded. Sequence **0** is valid for an empty fresh economy.

## Explicit initial operator assignment

Use an existing confirmed Auth account. For an empty project, create/invite the
intended owner through Supabase Dashboard → Authentication → Users and complete
its normal confirmation flow first; public app registration stays closed until
economy 2.2 activation. In
**Authentication → Users**, copy that user's UUID. Substitute it in **both**
places below only after checking it is the account you want to trust:

```sql
insert into public.vault_operator_roles(user_id, role, updated_by, edit_reason)
values (
  'YOUR_SUPABASE_AUTH_USER_UUID'::uuid,
  'owner',
  'YOUR_SUPABASE_AUTH_USER_UUID'::uuid,
  'Explicit initial game owner assignment'
);
```

This grants privileges. Do not run it for every signup, use a Payload/Figma
identity, or automatically promote the first visitor. If a role already exists,
inspect it instead of overwriting it.

Sign in to the game with this account, visit `/operator`, review the imported
cases, enter an audit reason and publish the intended packs. Do not bypass
case-publication triggers. Then preview **Economy update**, review flagged
original welcome grants, and enter `CONFIRM` to activate economy 2.2 atomically.
It preserves balances and cards, grants verified existing players
`max(0, 1250 − original welcome grant) + 250` once, and adds Alloy/Aether packs.
Ambiguous original grants are flagged, not guessed. New players receive 1,250
after activation. Do not manually reset wallets or rerun catalog import.

All normal game accounts are created through Supabase Auth. The server resolves
their player binding and grants starter credits through one atomic economy
commit, not through SQL seed wallets or a separate Auth trigger.
