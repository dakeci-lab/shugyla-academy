#!/usr/bin/env node
/**
 * Verifies the complete removal of two features: Price Checker (Products) and
 * the Standards knowledge base — runtime files, routes, nav, RBAC catalog
 * entries, Edge Function source/config, and the cleanup migration — while
 * confirming Price Tags and the recruitment slugify utility still work.
 *
 * Usage:
 *   npm run verify:price-checker-and-standards-removal
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

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

async function load(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href)
}

function findMigration() {
  const dir = path.join(ROOT, 'supabase/migrations')
  const match = fs
    .readdirSync(dir)
    .find((name) => name.includes('remove_price_checker_and_standards'))
  if (!match) fail('cleanup migration file not found in supabase/migrations')
  return `supabase/migrations/${match}`
}

function stagePriceCheckerRuntimeGone() {
  console.log('Stage 1: Price Checker runtime removed')

  assert('page removed', !exists('src/pages/platform/products/PriceCheckerPage.jsx'))
  assert('page css removed', !exists('src/pages/platform/products/PriceCheckerPage.css'))
  assert('products page dir removed', !exists('src/pages/platform/products'))
  assert('components dir removed', !exists('src/components/products/price-checker'))
  assert('service removed', !exists('src/services/umagPriceCheckerService.js'))
  assert('legacy grant script removed', !exists('scripts/apply-price-checker-permission.sql'))

  const app = read('src/App.jsx')
  assert('no PriceCheckerPage import in App', !app.includes('PriceCheckerPage'))
  assert('no products/price-checker route', !app.includes('products/price-checker'))
  assert('no ROUTE_KEYS.PRICE_CHECKER in App', !app.includes('ROUTE_KEYS.PRICE_CHECKER'))

  const permissions = read('src/config/permissions.js')
  assert('no ROUTE_KEYS.PRICE_CHECKER definition', !permissions.includes("PRICE_CHECKER: 'price_checker'"))
  assert('no canViewPriceChecker helper', !permissions.includes('canViewPriceChecker'))

  const catalog = read('src/config/permissionCatalog.js')
  assert('no PRICE_CHECKER_VIEW code', !catalog.includes('PRICE_CHECKER_VIEW'))
  assert('no products.price_checker.view code', !catalog.includes('products.price_checker.view'))
  assert('no orphaned products module label', !/\bproducts:\s*'Товары'/.test(catalog))

  const nav = read('src/platform/platformNav.js')
  assert('no price-checker nav entry', !nav.includes('price-checker'))

  const webOnlyNav = read('src/platform/webOnlyNav.js')
  assert('no price-checker in web-only nav ids', !webOnlyNav.includes("'price-checker'"))

  const platformAccess = read('src/platform/platformAccess.js')
  assert('no PRICE_CHECKER reference in platformAccess compat shim', !platformAccess.includes('PRICE_CHECKER'))

  console.log('')
}

function stageStandardsRuntimeGone() {
  console.log('Stage 2: Standards runtime removed')

  const removedFiles = [
    'src/pages/Standards.jsx',
    'src/pages/Standards.css',
    'src/pages/platform/PlatformStandardsManage.jsx',
    'src/components/StandardsDashboardBlock.jsx',
    'src/components/admin/sections/StandardsSection.jsx',
    'src/services/standardsLocalAdapter.js',
    'src/services/standardsSupabaseAdapter.js',
    'src/utils/standardsData.js',
    'src/platform/standardsNav.js',
  ]
  for (const rel of removedFiles) {
    assert(`${rel} removed`, !exists(rel))
  }

  const app = read('src/App.jsx')
  assert('no Standards imports in App', !app.includes("from './pages/Standards'"))
  assert('no PlatformStandardsManage import in App', !app.includes('PlatformStandardsManage'))
  assert('no /platform/standards route', !app.includes('path="standards"'))
  assert('no /platform/standards/manage route', !app.includes('path="standards/manage"'))
  assert('no /platform/standards/:slug route', !app.includes('path="standards/:slug"'))
  assert('no legacy /admin/standards redirect', !app.includes('/admin/standards'))
  assert('no legacy /standards redirect', !app.includes('path="/standards"'))
  assert('no LegacyStandardRedirect helper', !app.includes('LegacyStandardRedirect'))

  const permissions = read('src/config/permissions.js')
  assert('no ROUTE_KEYS.STANDARDS_GROUP definition', !permissions.includes('STANDARDS_GROUP:'))
  assert('no ROUTE_KEYS.STANDARDS definition', !/STANDARDS:\s*'standards'/.test(permissions))
  assert('no ROUTE_KEYS.STANDARDS_MANAGE definition', !permissions.includes('STANDARDS_MANAGE:'))
  assert('no canManageStandards helper', !permissions.includes('canManageStandards'))
  assert(
    'MINIMAL_SAFE_PERMISSIONS no longer includes standards',
    !/MINIMAL_SAFE_PERMISSIONS[\s\S]{0,120}STANDARDS_VIEW/.test(permissions),
  )

  const catalog = read('src/config/permissionCatalog.js')
  assert('no STANDARDS_VIEW code', !catalog.includes('STANDARDS_VIEW'))
  assert('no STANDARDS_MANAGE code', !catalog.includes('STANDARDS_MANAGE'))
  assert('no standards module label', !/standards:\s*'База стандартов'/.test(catalog))
  assert('no standards module in RBAC matrix', !/RBAC_MATRIX_MODULES = \[[^\]]*'standards'/.test(catalog))
  assert(
    'no role default-permission seed references standards',
    !/RBAC_DEFAULT_ROLE_PERMISSIONS = \{[\s\S]*\}\n/.test(catalog) ||
      !catalog.slice(catalog.indexOf('RBAC_DEFAULT_ROLE_PERMISSIONS')).includes('STANDARDS_VIEW'),
  )

  const nav = read('src/platform/platformNav.js')
  assert('no standards-group nav entry', !nav.includes('standards-group'))
  assert('no standardsReadActive flag', !nav.includes('standardsReadActive'))
  assert('no getStandardsSection import', !nav.includes('getStandardsSection'))

  const cloudStore = read('src/lib/cloudStore.js')
  assert('no standards cloud module', !cloudStore.includes("'standards'"))
  assert('no standardCategories field', !cloudStore.includes('standardCategories'))
  assert('no standardArticles field', !cloudStore.includes('standardArticles'))
  assert('no standardArticleReads field', !cloudStore.includes('standardArticleReads'))

  const platformDataService = read('src/services/platformDataService.js')
  assert('no standards adapter wiring', !platformDataService.includes('StandardsAdapter'))
  assert('no Standard* exports', !/export (async )?function \w*Standard/.test(platformDataService))

  const supabaseDataAdapter = read('src/services/supabaseDataAdapter.js')
  assert('no fetchStandardsModuleData', !supabaseDataAdapter.includes('fetchStandardsModuleData'))

  const localDataAdapter = read('src/services/localDataAdapter.js')
  assert('no local standards bundle wiring', !localDataAdapter.includes('standardsLocalAdapter'))

  const admin = read('src/pages/Admin.jsx')
  assert('Admin.jsx no longer renders StandardsSection', !admin.includes('StandardsSection'))

  const adminLayout = read('src/layouts/AdminLayout.jsx')
  assert('AdminLayout has no standards section metadata', !adminLayout.includes('standards:'))

  const sidebar = read('src/components/Sidebar.jsx')
  assert('Sidebar has no standards menu item', !sidebar.includes("id: 'standards'"))

  console.log('')
}

function stageEdgeFunctionGone() {
  console.log('Stage 3: umag-price-check Edge Function source and config removed')

  assert('function directory removed', !exists('supabase/functions/umag-price-check'))

  const configToml = read('supabase/config.toml')
  assert('no [functions.umag-price-check] section', !configToml.includes('[functions.umag-price-check]'))

  console.log('')
}

function stageMigrationExact() {
  console.log('Stage 4: cleanup migration is exact')

  const migrationPath = findMigration()
  const sql = read(migrationPath)

  assert('migration version sorts after production HEAD (20260812085722)', (() => {
    const version = path.basename(migrationPath).split('_')[0]
    return /^\d{14}$/.test(version) && version > '20260812085722'
  })())

  for (const code of ['products.price_checker.view', 'standards.view', 'standards.manage']) {
    assert(`targets permission code ${code}`, sql.includes(`'${code}'`))
  }
  for (const table of [
    'academy_standard_article_reads',
    'academy_standard_articles',
    'academy_standard_categories',
  ]) {
    assert(`targets table ${table}`, sql.includes(table))
  }

  assert('sets a short lock_timeout', /set lock_timeout = '\d+s'/.test(sql))
  assert('sets a short statement_timeout', /set statement_timeout = '\d+s'/.test(sql))
  assert('acquires an advisory lock', /pg_advisory_xact_lock\(\d+\)/.test(sql))

  assert('preflights the target permission count', /Preflight failed:.*permission code/i.test(sql))
  assert('preflights the target tables exist', /Preflight failed: missing target table/i.test(sql))
  assert(
    'preflights for unexpected inbound foreign keys',
    /unexpected inbound foreign key/i.test(sql) && sql.includes('pg_constraint'),
  )

  assert(
    'drops reads before articles (child before parent)',
    sql.indexOf('drop table if exists public.academy_standard_article_reads') <
      sql.indexOf('drop table if exists public.academy_standard_articles'),
  )
  assert(
    'drops articles before categories (child before parent)',
    sql.indexOf('drop table if exists public.academy_standard_articles') <
      sql.indexOf('drop table if exists public.academy_standard_categories'),
  )
  assert('no CASCADE on any drop table statement', !/drop table if exists[^;]*cascade/i.test(sql))
  assert(
    'deletes role_permissions before permissions (explicit, not relying on ON DELETE CASCADE)',
    sql.indexOf('delete from public.role_permissions') <
      sql.indexOf('delete from public.permissions'),
  )

  assert('postcheck asserts the three permissions are gone', /Postcheck failed:.*permission/i.test(sql))
  assert('postcheck asserts the three tables are gone', /Postcheck failed:.*table/i.test(sql))
  assert(
    'postcheck asserts the shared trigger function survives',
    sql.includes('academy_set_updated_at') && /Postcheck failed:.*academy_set_updated_at/.test(sql),
  )

  assert(
    'does not modify academy_users',
    !/(update|delete\s+from|insert\s+into|alter\s+table|drop\s+table)\s+(if exists\s+)?public\.academy_users\b/i.test(
      sql,
    ),
  )
  assert('does not drop the shared trigger function', !/drop function.*academy_set_updated_at/i.test(sql))
  assert(
    'no fabricated rollback / restore of deleted rows',
    !/insert into public\.academy_standard_(articles|categories|article_reads)/i.test(sql),
  )

  console.log('')
}

function stagePreserved() {
  console.log('Stage 5: Price Tags and recruitment slugify preserved')

  assert('PriceTagsPage still exists', exists('src/pages/platform/price-tags/PriceTagsPage.jsx'))
  const app = read('src/App.jsx')
  assert('price-tags route still wired', app.includes('path="price-tags"'))
  const catalog = read('src/config/permissionCatalog.js')
  assert('price_tags.view still in catalog', catalog.includes('price_tags.view'))
  assert('price_tags.manage still in catalog', catalog.includes('price_tags.manage'))

  assert('shared slugify utility exists', exists('src/utils/slugify.js'))
  const recruitmentData = read('src/utils/recruitmentData.js')
  assert(
    'recruitmentData imports slugify from the shared utility, not standardsData',
    recruitmentData.includes("from './slugify'") && !recruitmentData.includes("from './standardsData'"),
  )

  console.log('')
}

async function stageSlugifyBehavior() {
  console.log('Stage 6: slugify behavior unchanged')

  const { slugify } = await load('src/utils/slugify.js')
  assert('transliterates Cyrillic', slugify('Как встречать клиента') === 'kak-vstrechat-klienta')
  assert('collapses non-alphanumerics to hyphens', slugify('Hello, World!!') === 'hello-world')
  assert('empty input falls back to "article"', slugify('') === 'article')
  assert('truncates to 80 chars', slugify('a'.repeat(200)).length === 80)

  console.log('')
}

async function main() {
  console.log('=== Price Checker & Standards removal verification ===\n')
  stagePriceCheckerRuntimeGone()
  stageStandardsRuntimeGone()
  stageEdgeFunctionGone()
  stageMigrationExact()
  stagePreserved()
  await stageSlugifyBehavior()
  console.log(`=== All ${testsPassed}/${testsRun} checks passed ===\n`)
}

main().catch((error) => {
  console.error(`\n✗ Verification failed (${testsPassed}/${testsRun}): ${error.message}\n`)
  process.exit(1)
})
