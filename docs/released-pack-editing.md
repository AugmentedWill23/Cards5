# Released pack editing and deployment

## SQL file

Apply **`supabase/migrations/20261120000100_vault_released_pack_editing.sql`**
once in Supabase Dashboard → SQL Editor, using the normal `postgres` role.
In the external package it is
`database/migrations/20261120000100_vault_released_pack_editing.sql`.

The existing runtime, catalog, runtime-adapter and studio migrations must already
be installed. If the studio migration is missing, install
`20261119000100_vault_studio.sql` first. Do not reset the database, reimport the
catalog, rerun installed migrations or manually change balances.

The script is transactional, changes no player documents, grants no roles and
does not activate/compensate economy 2.2. Back up the live project and test in
staging before execution. Code rollback does not undo schema or content edits.

Check installation using this read-only query:

```sql
select
  to_regprocedure('public.vault_released_editing_version()') is not null as capability_installed,
  to_regprocedure('public.vault_studio_save_released(uuid,text,text,integer,jsonb,jsonb,text,bigint,jsonb)')
    is not null as save_rpc_installed;
```

Reload `/operator` after installation. The editor unlocks existing release
economics only when the private capability RPC reports version `1`.

## Approved forward-only contract

- Edit prices, pool mode, assigned cards/weights, card count, odds, schedules,
  stock, player limits, cooldowns, future Perfect eligibility and edition caps.
- Opened release IDs, slugs, categories, original first-opening timestamps and
  serial namespaces stay fixed. Clone a new release to change identity.
- No owned card, mint-time value/edition, historical serial, receipt, wallet,
  usage counter or waiting battle definition is rewritten.
- Caps cannot be lower than used total openings, distinct collectors, the
  largest player's lifetime use, or the largest player's current UTC-day use.
- A Limited card cap must equal **already-minted cards + (total opening stock −
  used openings) × new cards per opening**. With no prior use, this is the old
  stock × count formula. Historical cards keep their original edition metadata.
- The engine independently checks remaining Limited card supply before charging.
- Design guarantees backing opened releases remain protected. Assign a new or
  cloned design to change future guarantees rather than rewriting that design.

The private save RPC checks operator roles, field/pool allowlists, case revision
and current economy sequence under the same lock order as gameplay commits.
Pool replacement and final publication occur in one transaction; invalid
publication restores the original pool/status by rollback. Audit entries retain
the change reason and before/after records.

The app server derives usage from the decoded current compressed World snapshot;
usage is never accepted from a browser request. SQL requires that exact economy
head and current UTC day, and checks supplied usage consistency and cap floors.
As with the existing snapshot commit RPC, **the service-role app server is a
trusted boundary**. PostgreSQL does not decompress or independently replay the
gzip snapshot inside this RPC. Never expose service credentials in a browser or
grant these RPCs to `anon`/`authenticated`.

## Deployment package

The build/release process exports a clean, independent Next.js app, installs its
locked dependencies, runs its typecheck/build and packages its Linux standalone
server. The prepared ZIP lives under `deploy/` alongside its checksum and
release notes. It is not a static-site export: APIs and Supabase auth require
a Node.js server.

Reproduce packaging after a successful independent build:

```sh
python3 scripts/package-deployment.py --source dist/YOUR_BUILT_EXPORT --output deploy/YOUR_NEW_RELEASE.zip
```

The built runtime targets **Linux x64/glibc, Node 24** (including native traced
dependencies). For Windows, macOS, Alpine/musl, ARM, Netlify builds or another
target, rebuild the included source on that target using the included lockfile
and normal `pnpm run build`. Do not expect a Wasmer/WASI static host to run it.

Extract the package into a fresh directory, configure server-side environment
variables from `.env.example` on the host, then run `pnpm start` (or
`node scripts/start.mjs`). The included `.next/standalone` contains the built
server, runtime dependencies, public files and browser assets. No Figma ID,
Payload package, platform secret, real `.env` file or player data is included.

Always require `/api/backend-status` → `CONNECTED` on the actual public host,
then test two real accounts, pack changes, bids, battle settlement and retries.
Local/mocked tests cannot establish live multiplayer or external publication.
