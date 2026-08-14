#!/usr/bin/env node
/**
 * Regression guard for «Закуп» on a phone.
 *
 * The section used to disappear below 901px: the whole «Закупки» nav group was
 * marked webOnly, so the drawer dropped it, the dashboard tile was filtered out
 * and every /platform/procurement route rendered the «Раздел для большого
 * экрана» stub instead of the page. «Закуп» has a card layout for narrow
 * screens, so only its desktop-only siblings — приёмка, поставщики,
 * взаиморасчёты, оплаты — still need the gate.
 *
 * The invariant this file protects, in both directions:
 *   /platform/procurement*  → reachable on mobile, no DesktopWebOnlyRoute
 *   the four siblings       → unchanged, still gated
 *
 * Usage:
 *   npm run verify:procurement-mobile-access
 */

import fs from 'node:fs'
import path from 'node:path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

const APP = 'src/App.jsx'
const SIDEBAR = 'src/components/platform/PlatformSidebar.jsx'
const DETAIL_PAGE = 'src/pages/platform/procurement/PurchaseDetailPage.jsx'
const PLANNER_CSS = 'src/components/procurement/ProcurementPlannerView.css'
const PLANNER = 'src/components/procurement/ProcurementPlannerView.jsx'
const NORMS_CSS = 'src/components/procurement/ProcurementNormsView.css'
const ORDERS_TABLE_CSS = 'src/components/procurement/PurchaseTable.css'
const ITEMS_TABLE_CSS = 'src/components/procurement/PurchaseItemsTable.css'

/** Everything under «Закупки» that stays desktop-only. */
const DESKTOP_ONLY_SIBLINGS = [
  { id: 'receiving', prefix: '/platform/receiving', routes: ['receiving', 'receiving/:id'] },
  { id: 'suppliers', prefix: '/platform/suppliers', routes: ['suppliers', 'suppliers/:id'] },
  { id: 'settlements', prefix: '/platform/settlements', routes: ['settlements'] },
  {
    id: 'supplier-payments',
    prefix: '/platform/supplier-payments',
    routes: ['supplier-payments'],
  },
]

/** Every procurement route that must render on a phone. */
const PROCUREMENT_ROUTES = [
  'procurement',
  'procurement/analytics',
  'procurement/analytics/:id',
  'procurement/:id',
]

const PROCUREMENT_PATHS = [
  '/platform/procurement',
  /** Создание закупа живёт под тем же :id-маршрутом. */
  '/platform/procurement/new',
  '/platform/procurement/order-1',
  '/platform/procurement/analytics',
  '/platform/procurement/analytics/order-1',
]

let checks = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  if (!condition) fail(`${name}${detail ? ` — ${detail}` : ''}`)
  checks += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) fail(`file not found: ${relPath}`)
  return fs.readFileSync(full, 'utf8')
}

async function load(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href)
}

/** The <Route> element for `path="…"`, up to the next sibling <Route>. */
function routeElement(appSource, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = appSource.match(
    new RegExp(`path="${escaped}"[\\s\\S]*?\\n(\\s*)/>`, '')
  )
  if (!match) fail(`route path="${routePath}" not found in ${APP}`)
  return match[0]
}

async function stageNavModel() {
  console.log('Stage 1: nav model — «Закуп» is not desktop-only')

  const { PLATFORM_NAV } = await load('src/platform/platformNav.js')
  const { WEB_ONLY_NAV_IDS, excludeWebOnlyNavItems, isWebOnlyNavEntry } = await load(
    'src/platform/webOnlyNav.js'
  )

  const group = PLATFORM_NAV.find((item) => item.id === 'procurement-group')
  assert('«Закупки» group exists', Boolean(group))
  assert(
    'the group as a whole is no longer web-only',
    !isWebOnlyNavEntry(group),
    'marking the group hid «Закуп» together with its siblings'
  )

  const procurement = group.children.find((child) => child.id === 'procurement')
  assert('«Закуп» leaf exists', Boolean(procurement))
  assert('«Закуп» leaf is not web-only', !isWebOnlyNavEntry(procurement))
  assert('«Закуп» keeps its path', procurement.path === '/platform/procurement')

  for (const sibling of DESKTOP_ONLY_SIBLINGS) {
    const child = group.children.find((item) => item.id === sibling.id)
    assert(`${sibling.id} still exists in the group`, Boolean(child))
    assert(
      `${sibling.id} is still desktop-only`,
      isWebOnlyNavEntry(child),
      'its tables do not fit a narrow screen'
    )
    assert(`${sibling.id} id is listed in WEB_ONLY_NAV_IDS`, WEB_ONLY_NAV_IDS.has(sibling.id))
  }

  const mobileNav = excludeWebOnlyNavItems(PLATFORM_NAV)
  const mobileGroup = mobileNav.find((item) => item.id === 'procurement-group')
  assert('«Закупки» is present in the mobile drawer', Boolean(mobileGroup))
  assert(
    'the mobile drawer shows «Закуп» and nothing else from the group',
    mobileGroup.children.map((child) => child.id).join(',') === 'procurement'
  )

  console.log('')
}

async function stageRouteAccessibility() {
  console.log('Stage 2: route accessibility on a narrow viewport')

  const { PLATFORM_NAV } = await load('src/platform/platformNav.js')
  const {
    getDesktopWebOnlyPathPrefixes,
    isDesktopWebOnlyPath,
    isDesktopWebOnlyBlocked,
    shouldHideDesktopWebOnlyLink,
  } = await load('src/platform/desktopWebOnly.js')

  const prefixes = getDesktopWebOnlyPathPrefixes(PLATFORM_NAV)
  const narrow = { isDesktopViewport: false }
  const wide = { isDesktopViewport: true }

  assert(
    'the width rule itself is unchanged',
    isDesktopWebOnlyBlocked(narrow) === true && isDesktopWebOnlyBlocked(wide) === false
  )

  for (const pathname of PROCUREMENT_PATHS) {
    assert(`${pathname} is not a desktop-only path`, !isDesktopWebOnlyPath(pathname, prefixes))
    assert(
      `${pathname} link survives on a narrow screen`,
      shouldHideDesktopWebOnlyLink(pathname, narrow, prefixes) === false
    )
  }

  for (const sibling of DESKTOP_ONLY_SIBLINGS) {
    const nested = `${sibling.prefix}/nested-id`
    assert(`${sibling.prefix} stays desktop-only`, isDesktopWebOnlyPath(sibling.prefix, prefixes))
    assert(`${nested} stays desktop-only`, isDesktopWebOnlyPath(nested, prefixes))
    assert(
      `${sibling.prefix} link is still hidden on a narrow screen`,
      shouldHideDesktopWebOnlyLink(sibling.prefix, narrow, prefixes) === true
    )
    assert(
      `${sibling.prefix} link is still shown on a wide screen`,
      shouldHideDesktopWebOnlyLink(sibling.prefix, wide, prefixes) === false
    )
  }

  assert(
    'payroll and price tags keep their own gate',
    isDesktopWebOnlyPath('/platform/employees/payroll', prefixes) &&
      isDesktopWebOnlyPath('/platform/price-tags', prefixes)
  )

  console.log('')
}

function stageRouteWiring() {
  console.log('Stage 3: App routes')

  const app = read(APP)

  for (const route of PROCUREMENT_ROUTES) {
    const element = routeElement(app, route)
    assert(
      `${route} renders without DesktopWebOnlyRoute`,
      !element.includes('DesktopWebOnlyRoute'),
      'the gate is what replaced the page with a stub on a phone'
    )
    assert(
      `${route} keeps its permission guard`,
      element.includes('PlatformRoute') && element.includes('ROUTE_KEYS.PROCUREMENT'),
      'removing the viewport gate must not remove the RBAC gate'
    )
  }

  for (const sibling of DESKTOP_ONLY_SIBLINGS) {
    for (const route of sibling.routes) {
      const element = routeElement(app, route)
      assert(`${route} still wrapped in DesktopWebOnlyRoute`, element.includes('DesktopWebOnlyRoute'))
    }
  }

  assert(
    'DesktopWebOnlyRoute is still imported and used',
    app.includes("import DesktopWebOnlyRoute from './components/platform/DesktopWebOnlyRoute'") &&
      app.includes('<DesktopWebOnlyRoute>')
  )

  console.log('')
}

function stageMobileLayout() {
  console.log('Stage 4: mobile layout and navigation')

  const sidebar = read(SIDEBAR)
  assert(
    'the drawer keeps filtering web-only entries',
    sidebar.includes('excludeWebOnlyNavItems') && sidebar.includes("'(max-width: 900px)'"),
    'that filter is what now leaves «Закуп» alone'
  )

  const plannerCss = read(PLANNER_CSS)
  const planner = read(PLANNER)
  assert(
    'the planner has a card layout for narrow screens',
    planner.includes('proc-planner__mobile') && planner.includes('proc-planner__cards')
  )
  assert(
    'the wide planner table is swapped for cards below 901px',
    /@media \(max-width: 900px\)[\s\S]*?\.proc-planner__desktop\s*\{\s*display:\s*none/.test(
      plannerCss
    ) &&
      /@media \(max-width: 900px\)[\s\S]*?\.proc-planner__mobile\s*\{\s*display:\s*block/.test(
        plannerCss
      )
  )
  assert(
    'planner cards stay hidden on desktop',
    /\.proc-planner__mobile\s*\{\s*display:\s*none;\s*\}/.test(plannerCss)
  )

  const normsCss = read(NORMS_CSS)
  assert(
    'the norms list narrows instead of overflowing',
    normsCss.includes('@media (max-width: 640px)') && normsCss.includes('minmax(0, 1fr)')
  )

  // The two remaining wide tables are readable only by scrolling sideways, but
  // the scroll must stay inside its own box — otherwise the whole page drifts.
  for (const [name, css, table] of [
    ['orders', read(ORDERS_TABLE_CSS), '.purchase-table'],
    ['purchase items', read(ITEMS_TABLE_CSS), '.purchase-items'],
  ]) {
    assert(
      `the ${name} table scrolls inside its own wrapper`,
      /-wrap\s*\{[^}]*overflow-x:\s*auto/.test(css),
      `${table} sets a min-width that a phone cannot fit`
    )
  }

  const detail = read(DETAIL_PAGE)
  assert(
    'the purchase card offers a Back button in the mobile header',
    detail.includes('usePlatformPageTitle') && detail.includes('showBack: true'),
    'on a phone the system Back is intercepted and only toggles the drawer'
  )
  assert(
    'Back from a purchase card leads to the list it came from',
    detail.includes("backFallback: pathname.startsWith('/platform/procurement/analytics/')") &&
      detail.includes("'/platform/procurement'")
  )
  assert(
    'the mobile header title is still derived from the nav, not hardcoded',
    detail.includes('getPlatformSection(pathname).title'),
    'hardcoding it would rename the analytics card'
  )
  assert(
    'the in-page back link stays as well',
    detail.includes('purchase-detail__back-link')
  )

  console.log('')
}

function stageUntouchedNeighbours() {
  console.log('Stage 5: nothing outside «Закуп» moved')

  const app = read(APP)
  assert(
    'receiving routes still point at the receiving pages',
    app.includes('<ReceivingPage />') && app.includes('<ReceivingDetailPage />')
  )
  assert(
    'receiving keeps its own route key',
    app.includes('ROUTE_KEYS.RECEIVING')
  )

  const detail = read(DETAIL_PAGE)
  assert(
    'the purchase card still reads the linked receiving document',
    detail.includes('loadReceivingDocumentById') && detail.includes('isReceivingStarted'),
    'receiving behaviour must be untouched by a viewport fix'
  )
  assert(
    'purchase order export is untouched',
    detail.includes('exportPurchaseOrderPdf') && detail.includes('exportPurchaseOrderXlsx')
  )

  console.log('')
}

async function main() {
  console.log('=== «Закуп» on mobile: route access, nav, layout ===\n')
  await stageNavModel()
  await stageRouteAccessibility()
  stageRouteWiring()
  stageMobileLayout()
  stageUntouchedNeighbours()
  console.log(`=== All ${checks} checks passed ===\n`)
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`)
  process.exit(1)
})
