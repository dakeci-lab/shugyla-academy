#!/usr/bin/env node
/**
 * Payment accounts module (PR 1): standalone reference list «Счета оплаты».
 * No consumers yet — suppliers keep payment_type/deferral_days until PR 2.
 *
 * Usage:
 *   npm run verify:payment-accounts-module
 */

import fs from 'node:fs'
import path from 'node:path'
import { register } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

const ROOT = path.join(__dirname, '..')

let testsRun = 0
let testsPassed = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  testsRun += 1
  if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`)
  testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

async function stagePureLogic() {
  console.log('Stage 1: pure normalize/sort/conflict helpers')
  const { normalizePaymentAccount, sortPaymentAccounts, findPaymentAccountNameConflict } =
    await import(pathToFileURL(path.join(ROOT, 'src/utils/paymentAccountsData.js')).href)

  assert(
    'normalizes snake_case row',
    (() => {
      const n = normalizePaymentAccount({ id: '1', name: 'Kaspi', is_active: false, sort_order: 5 })
      return n.id === '1' && n.name === 'Kaspi' && n.isActive === false && n.sortOrder === 5
    })()
  )
  assert('normalize null is null', normalizePaymentAccount(null) === null)
  assert(
    'normalize defaults isActive true, sortOrder 0',
    (() => {
      const n = normalizePaymentAccount({ id: '2', name: 'Наличные' })
      return n.isActive === true && n.sortOrder === 0
    })()
  )

  const sorted = sortPaymentAccounts([
    { id: 'b', name: 'Б', sortOrder: 10 },
    { id: 'a', name: 'А', sortOrder: 5 },
    { id: 'c', name: 'В', sortOrder: 5 },
  ])
  assert(
    'sorts by sortOrder then name (ru)',
    sorted.map((x) => x.id).join(',') === 'a,c,b'
  )

  const accounts = [
    { id: '1', name: 'Наличные' },
    { id: '2', name: 'Перевод' },
  ]
  assert(
    'detects case/whitespace-insensitive duplicate',
    findPaymentAccountNameConflict(accounts, ' наличные ')?.id === '1'
  )
  assert(
    'no conflict for a genuinely new name',
    findPaymentAccountNameConflict(accounts, 'Kaspi Gold') === null
  )
  assert(
    'exceptId excludes the account being edited',
    findPaymentAccountNameConflict(accounts, 'Наличные', { exceptId: '1' }) === null
  )
  console.log('')
}

function stageMigration() {
  console.log('Stage 2: migration — table, RLS, permissions, seed')
  const sql = read('supabase/migrations/20260914120000_payment_accounts.sql')

  assert('creates payment_accounts table', sql.includes('create table if not exists public.payment_accounts'))
  assert('is_active soft-delete column', sql.includes('is_active boolean not null default true'))
  assert('case-insensitive unique name index', sql.includes('idx_payment_accounts_name_ci'))
  assert('RLS enabled', sql.includes('alter table public.payment_accounts enable row level security'))
  assert('select policy is world-readable (like roles/permissions)', sql.includes('for select') && sql.includes('using (true)'))
  assert(
    'insert gated by payment_accounts.manage',
    sql.includes('for insert') && sql.includes("current_user_has_permission('payment_accounts.manage')")
  )
  assert(
    'update gated by payment_accounts.manage',
    sql.includes('for update') && sql.includes("current_user_has_permission('payment_accounts.manage')")
  )
  assert('registers payment_accounts.view permission', sql.includes("'payment_accounts.view'"))
  assert('registers payment_accounts.manage permission', sql.includes("'payment_accounts.manage'"))
  assert('grants both to admin role', sql.includes("r.code = 'admin'") && sql.includes("p.code in ('payment_accounts.view', 'payment_accounts.manage')"))
  assert('seeds Наличные', sql.includes("'Наличные'"))
  assert('seeds Перевод', sql.includes("'Перевод'"))
  assert('seed is idempotent (not exists guard)', sql.includes('where not exists'))
  console.log('')
}

function stagePermissionsWiring() {
  console.log('Stage 3: RBAC catalog + route + nav wiring')
  const catalog = read('src/config/permissionCatalog.js')
  const permissions = read('src/config/permissions.js')
  const nav = read('src/platform/platformNav.js')
  const app = read('src/App.jsx')

  assert('PERMISSION_CODES has PAYMENT_ACCOUNTS_VIEW', catalog.includes("PAYMENT_ACCOUNTS_VIEW: 'payment_accounts.view'"))
  assert('PERMISSION_CODES has PAYMENT_ACCOUNTS_MANAGE', catalog.includes("PAYMENT_ACCOUNTS_MANAGE: 'payment_accounts.manage'"))
  assert('module label registered', catalog.includes("payment_accounts: 'Счета оплаты'"))
  assert('module listed in RBAC matrix', catalog.includes("'payment_accounts',"))
  assert('catalog entries present with sortOrder', catalog.includes('PERMISSION_CODES.PAYMENT_ACCOUNTS_VIEW') && catalog.includes('PERMISSION_CODES.PAYMENT_ACCOUNTS_MANAGE'))

  assert('ROUTE_KEYS.SETTINGS_PAYMENT_ACCOUNTS defined', permissions.includes("SETTINGS_PAYMENT_ACCOUNTS: 'settings_payment_accounts'"))
  assert('route falls back to admin-only role access', permissions.includes('[ROUTE_KEYS.SETTINGS_PAYMENT_ACCOUNTS]: [ROLE_IDS.ADMIN]'))
  assert(
    'route permission-gated by view/manage (not suppliers.edit)',
    permissions.includes('[ROUTE_KEYS.SETTINGS_PAYMENT_ACCOUNTS]: [P.PAYMENT_ACCOUNTS_VIEW, P.PAYMENT_ACCOUNTS_MANAGE]')
  )

  assert('nav entry points at /platform/settings/payment-accounts', nav.includes("path: '/platform/settings/payment-accounts'"))
  assert('nav entry uses the new route key', nav.includes('routeKey: ROUTE_KEYS.SETTINGS_PAYMENT_ACCOUNTS'))

  assert('App.jsx lazy-imports the settings page', app.includes("import('./pages/platform/PlatformSettingsPaymentAccounts')"))
  assert(
    'App.jsx registers settings/payment-accounts route',
    app.includes('path="settings/payment-accounts"') && app.includes('routeKey={ROUTE_KEYS.SETTINGS_PAYMENT_ACCOUNTS}')
  )
  console.log('')
}

function stageDataLayer() {
  console.log('Stage 4: local/cloud adapters + service')
  const local = read('src/services/paymentAccountsLocalAdapter.js')
  const cloud = read('src/services/paymentAccountsSupabaseAdapter.js')
  const service = read('src/services/paymentAccountsService.js')

  assert('local adapter seeds Наличные/Перевод', local.includes("'Наличные'") && local.includes("'Перевод'"))
  assert('local adapter never hard-deletes (no delete export)', !/export\s+async\s+function\s+deletePaymentAccount/.test(local))
  assert('local exports listPaymentAccounts', local.includes('export async function listPaymentAccounts'))
  assert('local exports setPaymentAccountActive', local.includes('export async function setPaymentAccountActive'))

  assert('cloud adapter targets payment_accounts table', cloud.includes("const TABLE = 'payment_accounts'"))
  assert('cloud adapter maps 23505 to a friendly duplicate-name error', cloud.includes("error?.code === '23505'"))
  assert('cloud adapter never issues .delete(', !cloud.includes('.delete('))

  assert('service switches on isCloudMode', service.includes('isCloudMode() ? supabaseAdapter : localAdapter'))
  assert(
    'service supports includeInactive filter for future supplier-form dropdown',
    service.includes('includeInactive') && service.includes('account.isActive')
  )
  console.log('')
}

function stageUi() {
  console.log('Stage 5: settings UI (list + create/edit + activate/deactivate)')
  const panel = read('src/components/admin/paymentAccounts/PaymentAccountsPanel.jsx')
  const editor = read('src/components/admin/paymentAccounts/usePaymentAccountEditor.jsx')
  const modal = read('src/components/admin/paymentAccounts/PaymentAccountEditorModal.jsx')

  assert('panel gates create button behind PAYMENT_ACCOUNTS_MANAGE', panel.includes('PERMISSION_CODES.PAYMENT_ACCOUNTS_MANAGE'))
  assert('panel renders Активировать/Деактивировать per row', panel.includes('Активировать') && panel.includes('Деактивировать'))
  assert('editor checks for name conflicts before saving', editor.includes('findPaymentAccountNameConflict'))
  assert('editor never calls a delete API', !editor.includes('deletePaymentAccount'))
  assert('modal only shows the active toggle in edit mode', modal.includes("mode === 'edit'") && modal.includes('Активен'))
  console.log('')
}

async function main() {
  try {
    console.log('=== Payment accounts module (PR 1) ===\n')
    await stagePureLogic()
    stageMigration()
    stagePermissionsWiring()
    stageDataLayer()
    stageUi()
    console.log(`Passed ${testsPassed}/${testsRun}\n`)
  } catch (err) {
    console.error(`\nFAILED: ${err.message}\n`)
    process.exitCode = 1
  }
}

main()
