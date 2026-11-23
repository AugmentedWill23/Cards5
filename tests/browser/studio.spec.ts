import { test, expect, type Page } from '@playwright/test'
import { defaultRules } from '../../src/game/rules'
import { upgradedRules } from '../../src/game/economy-update'

// Presentation-only fixtures; these routes never create real accounts or mutate Supabase.
async function workspace(page: Page, ambiguousGrant = false, releasedEditing = false) {
  const rules = upgradedRules(defaultRules),
    requests: any[] = []
  const designs: any[] = [
    {
      id: 'anchor',
      name: 'Anchor',
      slug: 'anchor',
      description: 'An ordinary constant.',
      rarity: 'Common',
      enabled: true,
      availability: 'standard',
      base_value_override: null,
      default_attributes: {},
      visual_config: { color: 'rarity' },
      revision: 1,
    },
    {
      id: 'comet',
      name: 'Comet',
      slug: 'comet',
      description: 'A flash of possibility.',
      rarity: 'Rare',
      enabled: true,
      availability: 'assigned-only',
      base_value_override: 777,
      default_attributes: { mutation: 'Chrome' },
      visual_config: { color: 'blue' },
      revision: 1,
    },
  ]
  const cases: any[] = [
    {
      id: 'scrapyard',
      name: 'Scrapyard Pack',
      slug: 'scrapyard',
      subtitle: 'A starting point.',
      kind: 'standard',
      status: 'published',
      price: 100,
      cards_per_opening: 3,
      pool_mode: 'rarity',
      odds: {
        rarity: [0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        quality: [5, 10, 50, 25, 8, 2],
        grade: 10,
        mutation: 5,
        effect: 1,
      },
      configuration_id: 'config22',
      starts_at: null,
      ends_at: null,
      max_total_openings: null,
      max_distinct_players: null,
      per_player_limit: null,
      per_player_daily_limit: null,
      cooldown_seconds: 0,
      edition_cap: null,
      serial_scope: null,
      perfect_qualifying_tier: null,
      visual_config: { color: 'violet' },
      first_opened_at: '2026-11-17T10:00:00Z',
      revision: 2,
      pool: [],
    },
  ]
  const players = [
    { id: 'p_collector', name: 'Existing collector', balance: 800, cards: 4, suspended: false },
  ]
  let grantKey: string | null = null
  await page.route('**/api/operator', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          authorized: true,
          releasedEditing,
          role: 'owner',
          passwordRequired: false,
          designs,
          cases,
          players,
          rules,
          configurations: [
            {
              id: 'config22',
              name: 'Progression rules',
              version: '2.2.0',
              active: true,
              status: 'published',
            },
          ],
        },
      })
      return
    }
    const body = route.request().postDataJSON()
    requests.push(body)
    if (body.action === 'saveDesign') {
      const record = {
        ...body.data,
        id: body.id ?? `new-design-${designs.length}`,
        revision: body.revision ? body.revision + 1 : 1,
      }
      const index = designs.findIndex((d) => d.id === record.id)
      if (index < 0) designs.push(record)
      else designs[index] = record
      await route.fulfill({ json: { success: true, record } })
      return
    }
    if (body.action === 'saveCase') {
      const record = {
        ...body.data,
        id: body.id ?? `new-case-${cases.length}`,
        revision: body.revision ? body.revision + 1 : 1,
        pool: body.pool,
        first_opened_at: null,
      }
      cases.push(record)
      await route.fulfill({ json: { success: true, record } })
      return
    }
    if (body.action === 'command') {
      if (!grantKey) {
        grantKey = body.command.key
        players[0].balance += Number(body.command.amount ?? 0)
        if (ambiguousGrant) {
          await route.fulfill({
            status: 503,
            json: { error: 'The commit was not confirmed. Retry the same key.' },
          })
          return
        }
      }
      await route.fulfill({ json: { result: { message: 'Verified support grant committed' } } })
      return
    }
    if (body.action === 'previewEconomy') {
      await route.fulfill({
        json: {
          preview: {
            applied: false,
            eligible: 1,
            total: 1000,
            reviewRequired: 1,
            sequence: 12,
            revision: 'preview-revision',
            rules,
            packs: [
              { name: 'Alloy Pack', price: 500 },
              { name: 'Aether Pack', price: 2500 },
            ],
            grants: [
              {
                id: 'p_collector',
                name: 'Existing collector',
                balance: 800,
                originalWelcome: 500,
                grant: 1000,
                reviewRequired: false,
              },
              {
                id: 'review',
                name: 'Review record',
                balance: 300,
                originalWelcome: null,
                grant: 0,
                reviewRequired: true,
              },
            ],
          },
        },
      })
      return
    }
    if (body.action === 'activateEconomy') {
      await route.fulfill({
        json: { result: { message: 'Upgrade committed once; old balances preserved.' } },
      })
      return
    }
    await route.fulfill({ status: 400, json: { error: 'Unexpected mock operation' } })
  })
  await page.goto('/operator')
  await expect(page.getByText('OWNER · SUPABASE')).toBeVisible()
  await page.getByLabel('Audit reason · required for all writes').fill('Reviewed studio release')
  return { requests, designs, cases, players }
}
test('card studio saves custom values, named mutations and scoped availability with a live preview', async ({
  page,
}) => {
  const { requests } = await workspace(page)
  await page.getByRole('tab', { name: 'Card studio', exact: true }).click()
  const editor = page.getByRole('form', { name: 'Card design editor' })
  await editor.getByLabel('Card name', { exact: true }).fill('Archive of Dawn')
  await editor.getByLabel('Stable design slug').fill('archive-of-dawn')
  await editor.getByLabel('Custom base value').fill('777')
  await editor.getByLabel('Availability', { exact: true }).selectOption('assigned-only')
  await editor.getByLabel('Default mutation / finish').selectOption('Chrome')
  await editor.getByLabel('Default quality', { exact: true }).selectOption('Mint Condition')
  await expect(editor.locator('[data-card-finish="chrome"]')).toBeVisible()
  await expect(editor.getByText('Archive of Dawn', { exact: true })).toBeVisible()
  await editor.getByRole('button', { name: 'Save card design', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Saved in Supabase')
  const saved = requests.find((r) => r.action === 'saveDesign')
  expect(saved.data).toMatchObject({
    name: 'Archive of Dawn',
    base_value_override: 777,
    availability: 'assigned-only',
    default_attributes: { quality: 'Mint Condition', mutation: 'Chrome' },
  })
  expect(saved.id).toBeNull()
})
test('case studio exposes assigned weights, limits, exact contents, normal packs and clone-safe opened releases', async ({
  page,
}) => {
  const { requests } = await workspace(page)
  await page.getByRole('tab', { name: 'Packs & cases', exact: true }).click()
  const editor = page.getByRole('form', { name: 'Pack and case editor' })
  await editor.getByLabel('Pack / case name').fill('Curated Comet Case')
  await editor.getByLabel('Case slug', { exact: true }).fill('curated-comet')
  await editor.getByLabel('Contents mode').selectOption('assigned')
  await editor.getByRole('button', { name: 'Add assigned card', exact: true }).click()
  await editor.getByRole('button', { name: 'Add assigned card', exact: true }).click()
  await editor.getByRole('button', { name: 'Split weights equally' }).click()
  await editor.getByLabel('Cards per opening', { exact: true }).fill('5')
  await editor.getByText('Schedule, stock and participation', { exact: true }).click()
  await editor.getByLabel('Total opening stock', { exact: true }).fill('5')
  await editor.getByLabel('Distinct-player cap', { exact: true }).fill('2')
  await editor.getByLabel('Per-player lifetime openings', { exact: true }).fill('2')
  await editor.getByLabel('Per-player UTC daily openings', { exact: true }).fill('1')
  await editor.getByLabel('Cooldown seconds', { exact: true }).fill('60')
  await expect(editor.getByText('Exact assigned contents', { exact: false })).toBeVisible()
  await expect(editor.getByText('5 CARDS · INFINITE POSSIBILITIES')).toBeVisible()
  await editor.getByRole('button', { name: 'Save pack / case', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Saved in Supabase')
  const saved = requests.find((r) => r.action === 'saveCase')
  expect(saved.pool).toEqual([
    { design_id: 'anchor', weight: 50 },
    { design_id: 'comet', weight: 50 },
  ])
  expect(saved.data).toMatchObject({
    pool_mode: 'assigned',
    cards_per_opening: 5,
    max_total_openings: 5,
    max_distinct_players: 2,
    per_player_limit: 2,
    per_player_daily_limit: 1,
    cooldown_seconds: 60,
  })
  await page.getByRole('button', { name: /Scrapyard Pack.*100/ }).click()
  await expect(editor.getByLabel('Price in credits')).toBeDisabled()
  await page.getByRole('button', { name: 'Clone as new release' }).click()
  await expect(editor.getByLabel('Price in credits')).toBeEnabled()
  await editor.getByLabel('Pack / case name').fill('Normal bridge pack')
  await editor.getByLabel('Case slug', { exact: true }).fill('normal-bridge')
  await editor.getByRole('button', { name: 'Save pack / case', exact: true }).click()
  const normal = requests.filter((r) => r.action === 'saveCase').at(-1)
  expect(normal.id).toBeNull()
  expect(normal.data.pool_mode).toBe('rarity')
  expect(normal.pool).toEqual([])
})
test('support grants retain the same idempotency key after an ambiguous response', async ({
  page,
}) => {
  const { requests, players } = await workspace(page, true)
  await page.getByRole('tab', { name: 'Player support', exact: true }).click()
  await page.getByLabel('Target collector').selectOption('p_collector')
  await page.getByLabel('Credits to add', { exact: true }).fill('250')
  await page.getByLabel('Type CONFIRM to authorize this grant').fill('CONFIRM')
  await page.getByRole('button', { name: 'Commit credit grant', exact: true }).click()
  await expect(page.getByText('A grant is unconfirmed.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Retry pending grant', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Verified support grant committed')
  const grants = requests.filter((r) => r.action === 'command')
  expect(grants).toHaveLength(2)
  expect(grants[0].command.key).toBe(grants[1].command.key)
  expect(players[0].balance).toBe(1050)
})

test('opened packs allow acknowledged future economics edits but keep identity fixed with the new SQL capability',async({page})=>{
  const {requests}=await workspace(page,false,true)
  await page.getByRole('tab',{name:'Packs & cases',exact:true}).click()
  await page.getByRole('button',{name:/Scrapyard Pack.*100/}).click()
  const editor=page.getByRole('form',{name:'Pack and case editor'})
  await expect(editor.getByLabel('Price in credits')).toBeEnabled()
  await expect(editor.getByLabel('Cards per opening',{exact:true})).toBeEnabled()
  await expect(editor.getByLabel('Case slug',{exact:true})).toBeDisabled()
  await expect(editor.getByLabel('Release category')).toBeDisabled()
  await editor.getByLabel('Price in credits').fill('175')
  await editor.getByLabel('Cards per opening',{exact:true}).fill('2')
  await expect(editor.getByRole('button',{name:'Save pack / case',exact:true})).toBeDisabled()
  await editor.getByRole('checkbox',{name:/I authorize these future-only release changes/}).check()
  await editor.getByRole('button',{name:'Save pack / case',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Saved in Supabase')
  const saved=requests.find(r=>r.action==='saveCase')
  expect(saved.data.price).toBe(175);expect(saved.data.cards_per_opening).toBe(2)
  expect(saved.data.slug).toBe('scrapyard')
})
test('economy upgrade requires preview and typed confirmation, preserving the preview revision', async ({
  page,
}) => {
  const { requests } = await workspace(page)
  await page.getByRole('tab', { name: 'Economy update', exact: true }).click()
  await page.getByRole('button', { name: 'Preview verified player upgrade' }).click()
  await expect(page.getByText('1 eligible collectors')).toBeVisible()
  await expect(page.getByText('1 need review')).toBeVisible()
  const button = page.getByRole('button', { name: 'Activate upgrade atomically' })
  await expect(button).toBeDisabled()
  await page.getByLabel('Type CONFIRM to activate economy 2.2').fill('CONFIRM')
  await button.click()
  await expect(page.getByRole('status')).toContainText('old balances preserved')
  expect(requests.find((r) => r.action === 'activateEconomy')).toMatchObject({
    sequence: 12,
    revision: 'preview-revision',
    confirmation: 'CONFIRM',
    reason: 'Reviewed studio release',
  })
})
test('operator studios remain usable on a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await workspace(page)
  for (const name of ['Card studio', 'Packs & cases', 'Player support', 'Economy update']) {
    await page.getByRole('tab', { name, exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  }
  expect(errors).toEqual([])
})
