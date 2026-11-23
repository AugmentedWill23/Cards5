import { test, expect } from '@playwright/test'

const routes = [
  '/',
  '/packs',
  '/collection',
  '/grading',
  '/display',
  '/earn',
  '/market',
  '/auctions',
  '/storage',
  '/trades',
  '/chat',
  '/leaderboards',
  '/updates',
  '/slots',
  '/casino',
  '/settings',
  '/operator',
  '/operator-preview',
]
test('Supabase cutover keeps all public shells static-compatible and requires real app sign-in', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // A legacy Payload cookie must not authenticate the new game.
  await page.context().addCookies([
    {
      name: 'app-session',
      value: 'legacy-session-is-not-supabase',
      url: `http://localhost:${process.env.PORT || 3000}`,
    },
  ])
  for (const route of routes) {
    const response = await page.goto(route)
    expect(response?.status(), route).toBe(200)
    if (route === '/operator') {
      await expect(
        page.getByRole('heading', { name: 'Operator console', exact: true }),
      ).toBeVisible()
      await expect(
        page.getByText('Public signup never grants staff permissions.', { exact: false }),
      ).toBeVisible()
    } else if (route === '/operator-preview') {
      await expect(page.locator('main [role="alert"]')).toContainText('Supabase operator role')
    } else {
      await expect(
        page.getByRole('heading', { name: 'Enter the vault.', exact: true }),
      ).toBeVisible()
    }
  }
  expect((await page.goto('/missing-vault-route'))?.status()).toBe(404)
  expect(errors).toEqual([])
})

test('Supabase cutover APIs reject unauthenticated gameplay, Payload sessions, demo and public operators', async ({
  request,
}) => {
  const game = await request.get('/api/game')
  expect(game.status()).toBe(401)
  const command = await request.post('/api/game', {
    data: { action: 'daily', key: 'unsigned-request' },
  })
  expect(command.status()).toBe(401)
  const operator = await request.get('/api/operator')
  expect((await operator.json()).authorized).toBe(false)
  const forge = await request.post('/api/operator', {
    data: { action: 'caseStatus', id: 'any', status: 'published', reason: 'Forged publication' },
  })
  expect(forge.status()).toBe(403)
  expect((await request.get('/api/operator-preview?kind=event&id=1')).status()).toBe(403)
  expect((await request.post('/api/account', { data: { action: 'demo' } })).status()).toBe(400)
  const status = await request.get('/api/backend-status')
  const result = await status.json()
  expect(result.backend).toBe('supabase')
  expect(Object.keys(result).sort()).toEqual(['backend', 'code', 'message', 'ready'])
  if (!result.ready) {
    expect(status.status()).toBe(503)
    expect([
      'SERVER_KEY_MISSING',
      'SERVER_KEY_REJECTED',
      'SUPABASE_CONFIG_MISSING',
      'RUNTIME_SQL_REQUIRED',
      'STUDIO_SQL_REQUIRED',
      'ECONOMY_ACTIVATION_REQUIRED',
      'SUPABASE_UPSTREAM_ERROR',
      'DATABASE_NOT_READY',
      'CONFIGURATION_REQUIRED',
    ]).toContain(result.code)
  } else expect(status.status()).toBe(200)
})
