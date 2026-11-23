# VAULT gameplay expansion

## Delivered in source

- **Performance:** collection valuation and leaderboard summaries use one card
  pass rather than repeated per-player scans. Catalog validation/disclosure is
  reused only for an unchanged database revision; the revision is still fetched
  on every command. Hidden tabs skip refreshes; storage/auctions/battles sync
  every 2.5 seconds, chat every 5, display/jobs every 20. Large collection and
  utility grids render bounded batches with “show more” controls.
- **Economy:** on an activated economy 2.2, daily base reward is 225 rather than
  150, plus the existing streak bonus. Sorting jobs pay 60 rather than 40.
  Slot gross payouts double with unchanged probabilities. These are runtime
  bonuses; the saved 2.2 configuration and approved welcome compensation are
  not rewritten. Display income is unchanged: it was already very generous.
- **Progression:** XP from actual openings, daily claims, jobs, grading and
  objectives; six collector tiers requiring both level and peak net worth.
  Net worth includes owned non-burned card TV and credits in trade/bid/battle/
  active-blackjack escrow. Achieved wealth milestones are retained on commands.
  Price tiers and *guaranteed-rarity assigned pools* unlock with progression.
  Random rarity rolls are intentionally not capped, rerolled or silently
  reweighted. Acquiring an existing card through markets/trades is not level
  restricted. This is not an ownership ban on high rarities.
- **Slots:** Copper, Silver, Gold, Platinum and Obsidian tables. Both level and
  wealth are checked server-side. All use the existing daily spin limit.
- **Storage:** three districts with 1×/5×/20× starting bids and cash, up to twelve
  concurrent rooms, fixed NPC budgets capped at 85% of sealed reference value
  (cash + card TV + pack face prices). New room cards/designs are sealed at
  creation. NPC budgets cannot refill or exceed the displayed hard ceiling.
  Existing historical bids are preserved; active old rooms receive the cap at
  their next server tick. Another human can always outbid you.
- **Openings/identity:** one to ten packs per atomic paid opening. New cards
  receive per-design mint numbers. New Limited serials are per design within
  their release; Perfect serials are per design. A first allocation continues
  above the largest matching legacy serial. Historical cards, numbering,
  receipts and values are never bulk-renumbered or backfilled.
- **Casino `/casino`:** joinable 2–4 player lobbies with 1–10 pack rounds and
  highest-total, lowest-total, shared-opening or final-round modes. Entries
  reserve credits; last join resolves all outcomes/ownership in one commit.
  Waiting lobbies save their rules, designs and pack terms, so later catalog
  edits cannot change a participant's accepted terms. Host cancellation or
  ten-minute expiry refunds every entry once. Expiry catches up on the next
  authenticated request, not a separate scheduler. Stock-limited/Limited cases
  are deliberately excluded. Tied winners share the cards by server-rotated
  allocation, not necessarily equal TV. Shared mode keeps individual pulls.
- **Blackjack:** saved one-deck server-side hands, hit/stand, ace handling,
  dealer stands on all 17s, ordinary wins 1:1, natural blackjack 3:2 (half
  credits round down), pushes return the wager. No split/double/insurance.
  The hidden dealer card and remaining deck never enter the player view.
- **Plinko:** eight independent 50/50 decisions; disclosed bin probabilities
  and multipliers; 92.1875% expected gross return before integer rounding.
  All casino entries share the player's existing daily spending control.
  Refunded entries still count toward that limit. Blackjack/Plinko also share
  a 100-play UTC daily cap. No real money, deposits or cash-outs; no casino XP.
- **Studio:** Thanksgiving, Christmas, holiday and other visual themes, more
  surface finishes, custom cosmetic effect/mutation labels, and glow/sparkle/
  snow/embers/rays/scan/confetti VFX. Reduced motion is respected; decorative
  animation runs on hover/focus to avoid continuously animating every card.
  These are authoring controls, not seeded holiday packs. Cosmetic labels do
  not invent economic multipliers; guaranteed attributes and custom mint-time
  base values remain the economic controls.
- **Search/QoL:** grading, display inventory, community gallery, auction
  inventory/listings, storage, pack shop and casino lobbies; operator rarity
  and publication-state filters. Collection bulk selection is bounded to the
  server's 30-card quick-sell limit.

## Approved released-pack editing

The follow-up upgrade is now provided in
`supabase/migrations/20261120000100_vault_released_pack_editing.sql`.
It permits future-only economic/pool/card-count edits with preserved assets,
receipts, serial namespaces, battle terms and usage counters. Limited edition
caps use actual already-minted supply plus future remaining supply. See
`docs/released-pack-editing.md` for installation and the trusted server boundary.
The migration is provided and locally tested, not automatically run on Supabase.

## Deployment and verification

Export a **new** directory, never the original Make workspace:

```sh
pnpm run export:external --output dist/vault-progression-casino
```

The exporter includes the new source/tests and no Payload/Figma dependencies
or private environment values. Follow the generated README and database guide.
This expansion uses the existing private snapshot commit boundary; it needs no
new database tables or schema migration. The previously required, missing studio
migration still must be installed once, then economy 2.2 previewed/activated
through the authorized operator flow. Do not reset/reimport existing data.

Local fixtures, unit tests, isolated SQL tests and static route builds do not
establish a live multiplayer connection or an external deployment. As checked
during this task, `/api/backend-status` still reports `SUPABASE_UPSTREAM_ERROR`
with HTTP 520. No live compensation, catalog edits or player mutations were
performed. Production delivery remains pending until the real backend and
external host can be verified with two signed-in accounts.
