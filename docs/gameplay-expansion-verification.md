# Gameplay expansion verification

This is the historical gameplay-expansion verification record. The subsequent
approved released-pack SQL/editor upgrade is documented in
`docs/released-pack-editing.md`; the current packaged-release results are in
`deploy/RELEASE.md` in the Make repository.

## Passing checks

- `pnpm run typecheck`
- `pnpm run test:unit`: **100 passed**
- `pnpm run test:sql`: **20 passed**, isolated PGlite only, including new battle
  and casino commits through the real SQL binding/replay boundary
- `pnpm run test:external`: **7 passed**
- `figma make verify-deploy`: **state: success**
- Clean final export:
  `pnpm run export:external --output dist/vault-progression-casino-final`
- Inside that independent export:
  `pnpm install --frozen-lockfile`, `pnpm run typecheck`,
  `NODE_ENV=production pnpm run build`
- Its standalone server started with `PORT=3107 HOSTNAME=127.0.0.1 pnpm start`.
  Against that production server:
  `PORT=3107 pnpm run test:e2e casino.spec.ts studio.spec.ts supabase-cutover.spec.ts`
  completed with **11 passed**. The temporary production server was stopped
  after testing.
- The route check visited all 18 public pages below and a missing route.
  Presentation fixtures exercised battle joining/settlement/history, blackjack,
  Plinko, mobile reduced-motion layout, ten-pack controls, card-list search,
  bounded bulk selection, studio saves and protected operator flows.
- The Make preview console completion check observed no relevant console
  errors. This is not visual or live multiplayer proof.
- A source-only ZIP was created at
  `dist/vault-progression-casino-final.zip`; build output, dependencies,
  test-result artifacts and real environment files are excluded.

An initial browser-test assertion expected every opening blackjack hand to
remain playable. The deterministic fixture legitimately dealt a natural
blackjack; the assertion was corrected to accept the terminal result. A complete
rerun passed. No blackjack behavior was changed to satisfy that assertion.

## Production route classifications

Both the managed verification and the independent build classified these
public frontend routes as **○ Static**:

| Route | Lifecycle |
| --- | --- |
| `/` | Static shell |
| `/packs` | Static shell |
| `/collection` | Static shell |
| `/grading` | Static shell |
| `/display` | Static shell |
| `/earn` | Static shell |
| `/market` | Static shell |
| `/auctions` | Static shell |
| `/storage` | Static shell |
| `/trades` | Static shell |
| `/chat` | Static shell |
| `/leaderboards` | Static shell |
| `/updates` | Static shell |
| `/slots` | Static shell |
| `/casino` | Static shell |
| `/settings` | Static shell |
| `/operator` | Static shell |
| `/operator-preview` | Static shell |

`/api/game`, `/api/account`, `/api/auth/callback`, `/api/backend-status`,
`/api/operator` and `/api/operator-preview` are **ƒ request-time**.
Authenticated operational reads are private/no-store. A later visitor loads
current Supabase state through those APIs; public HTML is not a snapshot of
player data. Catalog parsing reuses a result only when a fresh database read
returns the same revision. There are no public Payload content queries or
editorial ISR routes in this change.

The independent build has **no Payload Admin, GraphQL or managed asset routes**.
The original workspace retains its required managed scaffold unchanged.

## Not established / pending

- `/api/backend-status` still reports `SUPABASE_UPSTREAM_ERROR` / **HTTP 520**.
- No live Supabase data, wallet compensation, catalog edits, schema edits or
  role grants were performed.
- The previously missing `20261119000100_vault_studio.sql` must still be applied
  once when connectivity is restored, followed by authorized economy 2.2
  preview/activation. Never reset/reimport existing data.
- The casino/gameplay browser fixtures intercept API responses and use the
  actual engine locally; they are **not** signed-in live Supabase tests.
- External publication, two real signed-in players, real production mutation
  freshness, concurrent live play and load/performance benchmarks remain
  unverified. The full production-delivery todo remains pending.
- Full released-pack economic editing remains pending explicit approval;
  existing protections were not removed.
