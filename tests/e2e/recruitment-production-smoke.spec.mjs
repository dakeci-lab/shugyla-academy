/**
 * Non-destructive production smoke.
 * Does not create/publish vacancies or mutate real recruitment data.
 */
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachConsoleGuard, HR_SOFT_PROBE_ALLOW } from './helpers/consoleGuard.mjs'
import { attachPublicNetworkGuard } from './helpers/publicNetworkGuard.mjs'
import { createAnonClient } from './helpers/env.mjs'
import { countGlobalE2eLeftovers, loadState } from './helpers/fixture.mjs'
import { appUrl, expectNoHorizontalScroll, loginAsHr } from './helpers/ui.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACT_DIR = path.resolve(__dirname, '../../test-results/e2e-recruitment/artifacts')

const FORBIDDEN_PUBLIC = [
  /Shugyla Platform/i,
  /Платформа/,
  /Админ-панель/,
  /Стандарты/,
  /Профиль/,
  /Выйти/,
]

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true })
})

async function assertPublicShell(page, label) {
  for (const re of FORBIDDEN_PUBLIC) {
    await expect(page.getByText(re)).toHaveCount(0)
  }
  const state = loadState()
  if (state?.login) {
    await expect(page.getByText(state.login, { exact: false })).toHaveCount(0)
  }
  if (state?.runId) {
    await expect(page.getByText(state.runId)).toHaveCount(0)
  }
  await expect(page.getByText('Shugyla Market').first()).toBeVisible()
  await expect(page.locator('.careers-header')).toBeVisible()
  await expect(page.locator('.header')).toHaveCount(0)
}

test('1. Hub RPC has no E2E leftovers', async () => {
  const state = loadState()
  // Ignore the temporary HR account created for this smoke run.
  const leftovers = await countGlobalE2eLeftovers(undefined, {
    ignoreRunId: state?.runId,
    ignoreLogin: state?.login,
    ignoreRoleId: state?.roleId,
  })
  expect(leftovers.vacancies).toEqual([])
  expect(leftovers.candidates).toEqual([])
  expect(leftovers.questions).toBe(0)
  const anon = createAnonClient()
  const { data, error } = await anon.rpc('list_published_vacancies_for_apply')
  expect(error).toBeFalsy()
  const rows = data || []
  expect(rows.some((v) => /E2E-HR-|e2e-hr-/i.test(JSON.stringify(v)))).toBe(false)
  expect(rows.map((v) => v.slug).sort()).toEqual(expect.arrayContaining(['kassir', 'prodavets']))
})

test('2. Anonymous /apply careers branding + network', async ({ page }) => {
  const guard = attachConsoleGuard(page)
  const net = attachPublicNetworkGuard(page, { mode: 'hub' })
  await page.goto(appUrl('/apply'), { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Shugyla Market|команды|командасының/i)
  await expect(page.getByText('Кассир')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Продавец')).toBeVisible()
  await assertPublicShell(page, 'anon-hub')
  await page.waitForTimeout(1200)
  net.assertIsolated('smoke-hub')
  guard.assertClean('smoke-hub')
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'smoke-apply-desktop.png'), fullPage: true })
})

test('3. Anonymous /apply/kassir form shell', async ({ page }) => {
  const guard = attachConsoleGuard(page)
  const net = attachPublicNetworkGuard(page, { mode: 'form' })
  await page.goto(appUrl('/apply/kassir'), { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: /Отправить анкету|Сауалнаманы жіберу/i })).toBeVisible({
    timeout: 30_000,
  })
  await assertPublicShell(page, 'anon-form')
  await expect(page.getByText('Анкета кандидата').or(page.getByText('Үміткер сауалнамасы'))).toBeVisible()
  await page.waitForTimeout(1200)
  net.assertIsolated('smoke-form')
  guard.assertClean('smoke-form')
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'smoke-apply-kassir-desktop.png'), fullPage: true })
})

test('4. Authenticated HR still sees public careers shell on /apply', async ({ page }) => {
  const guard = attachConsoleGuard(page, { allow: HR_SOFT_PROBE_ALLOW })
  await loginAsHr(page)
  await page.goto(appUrl('/apply'), { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Кассир')).toBeVisible({ timeout: 30_000 })
  await assertPublicShell(page, 'auth-hub')
  const state = loadState()
  if (state?.login) {
    await expect(page.getByText(new RegExp(state.login.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))).toHaveCount(0)
  }
  await expect(page.getByText(/E2E HR/i)).toHaveCount(0)
  guard.assertClean('auth-public-hub')
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'smoke-apply-authenticated.png'),
    fullPage: true,
  })
})

test('5. Internal platform header still works', async ({ page }) => {
  const guard = attachConsoleGuard(page, { allow: HR_SOFT_PROBE_ALLOW })
  await loginAsHr(page)
  await expect(page).toHaveURL(/\/platform\/hr\/vacancies/)
  await expect(page.getByRole('button', { name: '+ Создать вакансию' })).toBeVisible()
  await expect(page.locator('.careers-header')).toHaveCount(0)
  await expect(page.locator('.platform-layout__topbar')).toBeVisible()
  guard.assertClean('internal-hr')
})

test('6. Mobile public viewports', async ({ browser }) => {
  for (const vp of [
    { name: '320', width: 320, height: 640 },
    { name: '390', width: 390, height: 844 },
    { name: '768', width: 768, height: 1024 },
    { name: '1440', width: 1440, height: 900 },
  ]) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    const guard = attachConsoleGuard(page)
    await page.goto(appUrl('/apply'), { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Кассир')).toBeVisible({ timeout: 30_000 })
    await assertPublicShell(page, `mobile-hub-${vp.name}`)
    await expectNoHorizontalScroll(page)
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `smoke-apply-${vp.name}.png`),
      fullPage: true,
    })
    await page.goto(appUrl('/apply/prodavets'), { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: /Отправить анкету|Сауалнаманы жіберу/i })).toBeVisible({
      timeout: 30_000,
    })
    await expectNoHorizontalScroll(page)
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `smoke-apply-prodavets-${vp.name}.png`),
      fullPage: true,
    })
    guard.assertClean(`mobile-${vp.name}`)
    await context.close()
  }
})
