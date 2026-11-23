# Manual economy/admin log cleanup

## Clear every old economy commit row

Use **[`clear-economy-commits-preserve-state.sql`](clear-economy-commits-preserve-state.sql)**,
not the compaction script below. This is a **one-time storage cutover**. It
leaves `public.vault_economy_commits` empty and stops new writes to it. The
current full World moves to the existing `vault_economy_head` singleton;
`vault_economy_receipts` keeps the exact prior request keys, actors, actions,
hashes, results, sequences, formula versions and timestamps. The original
import snapshot, if present, stays available for exact import retries.

1. Back up the database outside the project and verify you can restore it.
   Make sure you have enough free space to copy the receipts and current
   snapshot and write WAL before the old table is cleared.
2. Pause gameplay, operator activity and other writers. Deploy the current
   compatible app **before** the SQL. A fresh external export includes both the
   updated app and this file at `database/maintenance/clear-economy-commits-preserve-state.sql`.
   The previous deployment ZIP/branch does not include this change.
3. Confirm the current snapshot is readable by the app before cutting over.
   The SQL checks the snapshot envelope and preserves it unchanged; SQL does
   not decode gzip. The runtime and studio schema upgrades must already be
   installed. The script does not install missing prerequisites.
4. In **Supabase Dashboard → SQL Editor**, run the **entire file** as `postgres`.
   Do not run a standalone `TRUNCATE`. The script must copy and verify state
   and receipts, switch RPCs, and clear the old table in the same transaction.
5. Expect `old_commit_rows_remaining = 0`, the original sequence,
   `current_world_saved = true` (unless the original sequence was `0`), and
   `replay_receipts_kept` equal to the number of cleared rows. Recheck
   `readiness.sql`, sign in, verify inventory/balances, replay a confirmed
   transaction key without charging again, and perform a new action before
   reopening the game. New actions should leave the old table at zero rows.

No wallets, cards, accounts, trade/bid/battle state, counters, or admin audit
rows are cleared by this script. The only history discarded is historical full
World snapshots (the original import replay is an exception); the operator
snapshot preview can only open the current sequence after cutover. Older app
builds deliberately lose permission to read the now-empty table, so they
cannot treat existing players as new. Do **not** roll back the app alone.
An error rolls the SQL transaction back; if your client leaves it aborted,
run `ROLLBACK;`. After a successful cutover, use the verified backup if you
need the discarded snapshots. Do not run either cleanup again on the cutover
schema.

`TRUNCATE` reclaims the old commit table's storage at commit. The retained
receipts, current snapshot, WAL, and other tables still take space, and the
Supabase dashboard can take time to update. The new path no longer stores a
full snapshot for every action; receipt history and the current World can
still grow. If the project cannot write due to quota, restore write capacity
before attempting the copy; do not delete anything to force the cutover.

## Older compaction option: keep the old commit table populated

**Destructive, separately confirmed maintenance—not a migration or an economy
reset. Nothing here is run by the app, exporter, build, or deployment.**

### Run the older compaction

1. Export a database backup outside this database and confirm it can be restored.
   These files do not make a backup. Leave some disk/WAL headroom for maintenance.
2. Pause gameplay/operator writes and use a maintenance window. Ensure the game
   can read its current snapshot before proceeding.
3. In Supabase Dashboard → SQL Editor, run `storage-report.sql` as `postgres`.
   This read-only report shows actual table sizes; don't assume the audit table
   is the largest one.
4. Run the **entire** `compact-economy-and-clear-admin.sql` file as `postgres`
   (or the table owner with the necessary privileges), not as a browser role,
   app user or through a public endpoint. Run one cleanup at a time.
5. Review the notices and final result. Head/latest sequence must agree.
   Test sign-in, balance/inventory, a new action and retrying a previous action
   before reopening the game.

A lock timeout, unexpected schema/trigger, mismatched head or other error aborts
the cleanup transaction. If your SQL client keeps a failed transaction open,
run `ROLLBACK;` before doing anything else. Do not bypass the guards, disable RLS,
use `DISABLE TRIGGER ALL`, or manually truncate the economy table.

## Precisely what is preserved

- The latest full `vault_economy_commits.snapshot`, byte content unchanged in
  JSONB terms, and `vault_economy_head.last_sequence`.
- **Every economy commit row**, including sequence, request key, actor, action,
  canonical request hash, result, formula version and creation timestamp.
  Normal replay checks can still reject changed commands and return the same
  previously committed result without charging or rolling again.
- Original `import_checkpoint` full snapshots, because exact import retries
  compare their original snapshot as well as the checksum.
- All accounts/auth bindings/operator roles, published/draft catalog records,
  and the entire current World: balances, cards, serial/usage counters, trades,
  bid escrow, battles, ledgers, sales and in-game receipt history.
- Existing permissions and immutable guards; no permanent cleanup RPC or
  public/anonymous write capability is installed.

## What is permanently lost

- Redundant older full-state snapshots are replaced with small marked,
  gzipped **non-World** placeholders when that reduces the stored value size.
  Tiny snapshots are left alone; the current head and import checkpoints are
  always excluded. Older operator full-state previews will become unavailable
  (the old decoder returns `Invalid economy snapshot`) rather than pretending
  they represent a real empty economy. Existing receipt results remain readable.
- **All admin audit entries present at cleanup time** are truncated. Their
  historical before/after details are lost unless backed up. Catalog/role
  records themselves remain, and future changes still generate new audit rows.

Running the script again is possible but destructive again: it clears any new
admin audit entries and compacts any new eligible historical snapshots. It is
not scheduled or automatically recurring. Original backups are the only way to
restore the discarded historical detail; a code rollback does not restore it.

## Disk space versus reusable space

Truncating the audit table releases its old table/index storage on commit.
Updating older economy snapshots creates dead tuples/TOAST values first.
Ordinary vacuum/autovacuum makes those reusable, but **may not reduce allocated
database size or the storage number shown by Supabase**.

After the cleanup has committed, these optional commands can be run as separate
statements outside a transaction:

```sql
VACUUM (ANALYZE) public.vault_economy_commits;
VACUUM (ANALYZE) public.vault_admin_audit;
```

To shrink allocated economy storage, a DBA may consider `VACUUM FULL` or an
equivalent managed-platform maintenance operation. That requires another
exclusive maintenance window and temporary disk headroom; **do not run it on a
completely full disk or expect it to be online/non-blocking**. It is deliberately
not included in the runnable cleanup. Ask Supabase support about reclamation or
temporarily increase capacity if quota/headroom is exhausted.

This is temporary relief, not a fix for ongoing growth. The current game writes
a full World snapshot per commit and retains replay results. Its current state
and history will continue growing; a separate retention/storage redesign is
needed for a durable size bound.

No live database execution is performed by preparing or testing these files.

## Local verification

`pnpm run test:sql` passed all 28 isolated PGlite tests, including five cleanup
tests covering current-state/replay preservation, future gameplay/auditing,
original checkpoint retries, legacy/empty economies, denied application roles,
inconsistent heads and full rollback/restored guards after a forced failure.
TypeScript and the seven external-export/connection checks also passed. These
are local tests, not execution or storage-reclamation measurements on Supabase.
