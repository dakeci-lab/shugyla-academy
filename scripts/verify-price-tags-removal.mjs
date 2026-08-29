#!/usr/bin/env node
/**
 * Verifies the complete removal of the «Печать ценников» (Price Tags)
 * feature: runtime files, routes, nav, RBAC catalog entries, and the
 * permission-cleanup migration that retires price_tags.view/manage from
 * the database. DB-side effects of the migration itself require a real
 * Supabase instance and are out of scope here — this checks the migration
 * SQL's shape and safety properties statically.
 *
 * Usage:
 *   npm run verify:price-tags-removal
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
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

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath))
}

function findMigration() {
  const dir = path.join(ROOT, 'supabase/migrations')
  const match = fs.readdirSync(dir).find((name) => name.includes('remove_price_tags_permissions'))
  if (!match) fail('cleanup migration file not found in supabase/migrations')
  return `supabase/migrations/${match}`
}

function stageRuntimeGone() {
  console.log('Stage 1: Price Tags runtime removed')

  assert('page removed', !exists('src/pages/platform/price-tags/PriceTagsPage.jsx'))
  assert('page dir removed', !exists('src/pages/platform/price-tags'))
  assert('components dir removed', !exists('src/components/priceTags'))
  assert('utils dir removed', !exists('src/utils/priceTags'))

  const app = read('src/App.jsx')
  assert('lazy import removed from App.jsx', !app.includes('PriceTagsPage'))
  assert('route removed from App.jsx', !app.includes('path="price-tags"'))

  const nav = read('src/platform/platformNav.js')
  assert('products-group nav entry removed', !nav.includes("id: 'products-group'"))
  assert('price-tags nav entry removed', !nav.includes("id: 'price-tags'"))
  assert('ROUTE_KEYS.PRICE_TAGS no longer referenced in nav', !nav.includes('ROUTE_KEYS.PRICE_TAGS'))

  const webOnlyNav = read('src/platform/webOnlyNav.js')
  assert("'price-tags' removed from WEB_ONLY_NAV_IDS", !webOnlyNav.includes("'price-tags'"))

  const permissions = read('src/config/permissions.js')
  assert('ROUTE_KEYS.PRODUCTS_GROUP removed', !permissions.includes('PRODUCTS_GROUP'))
  assert('ROUTE_KEYS.PRICE_TAGS removed', !permissions.includes('PRICE_TAGS'))

  const catalog = read('src/config/permissionCatalog.js')
  assert('PRICE_TAGS_VIEW code removed', !catalog.includes('PRICE_TAGS_VIEW'))
  assert('PRICE_TAGS_MANAGE code removed', !catalog.includes('PRICE_TAGS_MANAGE'))
  assert("price_tags module label removed", !catalog.includes("price_tags: 'Ценники'"))
  assert("'price_tags' removed from RBAC_MATRIX_MODULES", !/'price_tags',\s*\n\s*'positions'/.test(catalog))

  const access = read('src/platform/platformAccess.js')
  assert('ACCESS.PRICE_TAGS removed', !access.includes('PRICE_TAGS'))

  console.log('')
}

function stageMigrationIsExact() {
  console.log('Stage 2: permission-cleanup migration is exact')

  const migrationPath = findMigration()
  const sql = read(migrationPath)

  assert('migration version sorts after previous head (20260830100000)', (() => {
    const version = path.basename(migrationPath).split('_')[0]
    return /^\d{14}$/.test(version) && version > '20260830100000'
  })())

  assert('targets permission code price_tags.view', sql.includes("'price_tags.view'"))
  assert('targets permission code price_tags.manage', sql.includes("'price_tags.manage'"))
  assert('sets a short lock_timeout', /set lock_timeout = '5s'/.test(sql))
  assert('sets a short statement_timeout', /set statement_timeout = '30s'/.test(sql))
  assert('acquires an advisory lock', /pg_advisory_xact_lock/.test(sql))
  assert('preflights the target permission count', /Preflight failed:.*target permission/i.test(sql))

  assert(
    'deletes role_permissions before permissions (child before parent)',
    sql.indexOf('delete from public.role_permissions') <
      sql.indexOf('delete from public.permissions\n  where code = any(v_target_permissions)')
  )

  assert('postcheck asserts the two permissions are gone', /Postcheck failed:.*target permission/i.test(sql))
  assert('does not drop any table', !/drop table/i.test(sql))
  assert('does not touch role_permissions/permissions outside the two target codes', (() => {
    const otherCodeMentions = sql.match(/'[a-z_]+\.[a-z_]+'/g) || []
    const unexpected = otherCodeMentions.filter(
      (c) => c !== "'price_tags.view'" && c !== "'price_tags.manage'"
    )
    return unexpected.length === 0
  })())

  console.log('')
}

function main() {
  try {
    stageRuntimeGone()
    stageMigrationIsExact()
    console.log(`=== All ${testsPassed}/${testsRun} checks passed ===`)
  } catch (err) {
    console.error(`\n✗ FAILED after ${testsPassed}/${testsRun} checks: ${err.message}`)
    process.exitCode = 1
  }
}

main()
