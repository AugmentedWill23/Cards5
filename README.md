# VAULT — standalone Next.js + Supabase

This is the **external deployment project**. Deploy this extracted directory,
not the original Figma Make workspace.

It contains the game, Supabase APIs and `/operator` console. It does **not**
contain Payload, `@payloadcms/figma`, the managed CMS, Figma lifecycle scripts,
Figma SSO, or platform credentials. **No Figma EID or Figma account is required.**

The Figma-ID error in the original workspace comes from its managed
`payload build` / CMS integration. Do not fix it by copying a sandbox identifier
or secret onto your external host. This project's build uses plain `next build`.

## 1. Configure your external host

Use a host with **Node.js / Next.js server support**, such as Vercel, a Node
service, or Docker. This is not a static HTML site: GitHub Pages or uploading
only `public/` cannot run authentication, private wallets or game commands.

Toolchain: **Node 24.22.1+ (24.x), pnpm 10.34.3**. Versions and the lockfile are
included. Do not replace the Next.js server with a static-export command.

Set these variables in the **external host's** environment/secrets dashboard:

| Variable                    | Where / purpose                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`      | Your real public HTTPS origin, with no path, such as `https://YOUR_DOMAIN`. Set at **build time and runtime**. Not a secret. |
| `SUPABASE_URL`              | Supabase Project Settings → API → Project URL                                                                                |
| `SUPABASE_ANON_KEY`         | The current public/publishable or legacy anon key for that same project                                                      |
| `SUPABASE_SERVICE_ROLE_KEY` | The private service-role/server secret for that project; **server only**                                                     |
| `VAULT_OPERATOR_PASSWORD`   | Optional extra password for operator POSTs; a staff role is always required                                                  |

`.env.example` lists names only. It contains no real secrets and is not loaded
automatically. For local development, copy it to `.env.local`, replace its
example values, and keep that file out of Git.

Do not add the service key to `NEXT_PUBLIC_*`, `next.config.ts`'s `env` block,
SQL rows or client code. Do not copy a Figma-managed database secret.
Environment values saved in Make are not transferred to a different host.

The app has **no built-in Supabase project fallback** in this export: point all
three Supabase variables at your intended project. Changing the public site
origin requires a rebuild because metadata/callback origins are build-time
configuration.

## 2. Reuse your existing database

If you use the **same Supabase project**, your imported catalog and existing
Supabase game data stay there. Hosting elsewhere does not require resetting,
reimporting or copying the economy.

See `database/README.md` for schema prerequisites and migration order. It
includes the runtime-adapter and `20261119000100_vault_studio.sql` migrations
added after the initial catalog import. Run each once if not installed. Do not rerun installed schema
creation scripts or drop tables to get past conflicts.

Nothing in `pnpm install`, `pnpm run build` or `pnpm start` applies migrations,
publishes drafts, creates users, resets balances or grants staff roles.

## 3. Set Supabase Auth redirects

In **Supabase Dashboard → Authentication → URL Configuration**:

- Set Site URL to your external site's real public origin.
- Add `https://YOUR_DOMAIN/api/auth/callback` to Redirect URLs, substituting your
  actual domain.
- Enable email/password signup with your intended confirmation policy.
- Configure reliable production email delivery for real verification messages.

The app uses the official Supabase SSR SDK, HTTP-only cookies and PKCE. When
confirmation is enabled, confirm the email in the browser that registered,
then sign in. Registration never bypasses verification.

## 4. Build and run

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm start
```

Builds do **not** need Supabase credentials or connect to your database. You
should still provide `NEXT_PUBLIC_SITE_URL` during the production build so
metadata and confirmation callbacks use the correct domain.

`pnpm run build` builds Next.js and copies `public/` plus browser assets into
`.next/standalone`. `pnpm start` starts that packaged server. The host supplies
`PORT`; `HOSTNAME` defaults to `0.0.0.0`. TLS should terminate at your hosting
provider or reverse proxy.

### Vercel / another native Next.js host

- Import this directory/repository, with **Next.js** as the framework.
- Install: `pnpm install --frozen-lockfile`.
- Build: `pnpm run build`.
- Let the platform manage the output and start command; do not set `out/` as
  an output directory.
- Add the environment variables before building and redeploy after changing
  the public site origin.
- Configure your actual production/preview domains in Supabase Auth as needed.

### Docker

```sh
docker build --build-arg NEXT_PUBLIC_SITE_URL=https://YOUR_DOMAIN -t vault-game .
docker run --env-file .env.local -p 3000:3000 vault-game
```

The runtime image contains only the standalone production server and assets.
Real `.env` files are excluded from the build context. Pass private keys at
runtime through your host; never as Docker build arguments. If overriding
`PORT`, update the container port mapping to match it.

## 5. Check deployment

1. Install any missing migrations in the order in `database/README.md`.
2. Sign in with an explicitly authorized staff account at **`/operator`**,
   review/publish intended draft packs, then preview **Economy update** and
   enter `CONFIRM` to activate 2.2. This atomically adds Alloy/Aether and
   verified existing-player compensation without resetting balances. Missing
   or ambiguous original welcome grants are flagged for review.
3. Require `/api/backend-status` to report `backend: "supabase"` and
   `code: "CONNECTED"`. Register a real account, confirm its email if required,
   and check the **1,250-credit first grant exactly once**.
4. Open a pack, reload and check ownership/balance/history persisted.
5. Verify gameplay across two accounts: sales/trades/auctions, income and chat.

`/admin`, the old generic Payload API and CMS SSO do not exist here. Operator
roles are checked in Supabase; public signup never grants staff permissions.

For an upstream HTTP 520/5xx, check the Supabase connection/project and the
host's network logs. Do not add Figma environment variables or disable RLS.
The application never silently falls back to Payload.

## Checks and limitations

```sh
pnpm run test:unit
pnpm exec playwright install chromium
pnpm run test:e2e supabase-cutover.spec.ts
pnpm run test:e2e studio.spec.ts
```

Run browser tests against an already-running app with matching `PORT`. They
check public routes and unauthenticated protection, not a fully verified live
economy. Real sign-in/gameplay still requires configured Supabase credentials,
Auth, RPCs and published packs.

This export includes the custom card and normal/Limited case studios,
assigned pools, mint-time base values/guarantees, audited player grants and the
2.2 economy activation workflow. Studio browser tests use mocked operator
responses; they do not prove live database connectivity or apply migrations.
See `docs/supabase-runtime.md`.

The current throttle is process-local and the economy is a whole-World append
stream. Add shared rate limiting and load-test before significant
multi-instance production traffic. Auction timers settle on authenticated game
requests, not a new background scheduler. This export does not include old
Payload accounts, private records, CMS media or transaction history.

Public site metadata/custom snippets are snapshotted in `src/site-settings.json`
and can be edited as normal source. The text-only game does not use Payload
media routes or a managed image loader.
