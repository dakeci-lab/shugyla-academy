#!/usr/bin/env node
/**
 * Regression guard for the whole «Закупки» group on a phone.
 *
 * The group used to vanish below 901px. Every module in it already shipped a
 * narrow-screen layout — cards instead of tables, sticky mobile totals in
 * взаиморасчёты — but a `webOnly` flag in the nav and a `DesktopWebOnlyRoute`
 * wrapper in App.jsx hid the link and replaced the page with a «Раздел для
 * большого экрана» stub. The gate, not the layout, was the reason people could
 * not receive a delivery from the floor.
 *
 * The invariant this file protects, in both directions:
 *   every route of «Закупки»          → reachable on mobile, no gate, no hiding
 *   payroll and ценники               → untouched, still desktop-only
 *
 * Every subsection and every actual route is listed by name below, and the
 * route list is cross-checked against App.jsx, so a new route added to the
 * group without coverage fails here instead of silently going unguarded.
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
const NAV = 'src/platform/platformNav.js'
const SIDEBAR = 'src/components/platform/PlatformSidebar.jsx'
const GATE_COMPONENT = 'src/components/platform/DesktopWebOnlyRoute.jsx'
const PURCHASE_DETAIL = 'src/pages/platform/procurement/PurchaseDetailPage.jsx'
const RECEIVING_DETAIL = 'src/pages/platform/receiving/ReceivingDetailPage.jsx'

/**
 * The full map of the group: nav id → route keys, routes and live paths.
 * `routes` are the `path="…"` values in App.jsx, `paths` are what a person can
 * actually land on, including nested ids.
 */
const PROCUREMENT_GROUP = [
  {
    id: 'procurement',
    label: 'Закуп',
    navPath: '/platform/procurement',
    routeKey: 'ROUTE_KEYS.PROCUREMENT',
    routes: [
      'procurement',
      'procurement/analytics',
      'procurement/analytics/:id',
      'procurement/:id',
    ],
    paths: [
      '/platform/procurement',
      // Создание закупа живёт под тем же :id-маршрутом, отдельного нет.
      '/platform/procurement/new',
      '/platform/procurement/order-1',
      '/platform/procurement/analytics',
      '/platform/procurement/analytics/order-1',
    ],
  },
  {
    id: 'receiving',
    label: 'Приёмка',
    navPath: '/platform/receiving',
    routeKey: 'ROUTE_KEYS.RECEIVING',
    routes: ['receiving', 'receiving/:id'],
    paths: ['/platform/receiving', '/platform/receiving/doc-1'],
  },
  {
    id: 'suppliers',
    label: 'Поставщики',
    navPath: '/platform/suppliers',
    routeKey: 'ROUTE_KEYS.SUPPLIERS',
    routes: ['suppliers', 'suppliers/:id'],
    paths: ['/platform/suppliers', '/platform/suppliers/sup-1'],
  },
  {
    id: 'supplier-finance',
    label: 'Расчёты',
    navPath: '/platform/supplier-finance',
    routeKey: 'ROUTE_KEYS.SUPPLIER_FINANCE',
    routes: ['supplier-finance'],
    paths: ['/platform/supplier-finance'],
  },
]

/** Legacy rollback routes — still reachable on mobile, no longer in the drawer. */
const LEGACY_PROCUREMENT_ROUTES = [
  {
    id: 'settlements',
    label: 'Взаиморасчёты',
    navPath: '/platform/settlements',
    routeKey: 'ROUTE_KEYS.SETTLEMENTS',
    routes: ['settlements'],
    paths: ['/platform/settlements', '/platform/settlements/act-1'],
  },
  {
    id: 'supplier-payments',
    label: 'Оплаты поставщикам',
    navPath: '/platform/supplier-payments',
    routeKey: 'ROUTE_KEYS.SUPPLIER_PAYMENTS',
    routes: ['supplier-payments'],
    paths: ['/platform/supplier-payments', '/platform/supplier-payments/plan-1'],
  },
]

const ALL_PROCUREMENT_ROUTES = [...PROCUREMENT_GROUP, ...LEGACY_PROCUREMENT_ROUTES]

/** Control group: modules outside «Закупки» that must stay desktop-only. */
const STILL_DESKTOP_ONLY = [
  { id: 'employees-payroll', prefix: '/platform/employees/payroll' },
  { id: 'price-tags', prefix: '/platform/price-tags' },
]

/**
 * Each subsection must have a real narrow-screen layout, not just an open
 * route. A wide table with no mobile form would be access in name only.
 */
const MOBILE_LAYOUTS = [
  {
    id: 'procurement',
    file: 'src/components/procurement/ProcurementPlannerView.css',
    what: 'the planner swaps its table for cards below 901px',
    test: (css) =>
      /@media \(max-width: 900px\)[\s\S]*?\.proc-planner__desktop\s*\{\s*display:\s*none/.test(css) &&
      /@media \(max-width: 900px\)[\s\S]*?\.proc-planner__mobile\s*\{\s*display:\s*block/.test(css),
  },
  {
    id: 'receiving',
    file: 'src/components/receiving/UnifiedReceivingList.css',
    what: 'the receiving list is card-based and reflows on a phone',
    test: (css) =>
      /\.unified-receiving-card\s*\{[\s\S]*?display:\s*grid/.test(css) &&
      /@media \(max-width: 640px\)[\s\S]*?\.unified-receiving-card\s*\{/.test(css),
  },
  {
    id: 'suppliers',
    file: 'src/components/suppliers/SupplierTable.css',
    what: 'the supplier table becomes cards below 769px',
    test: (css) =>
      /@media \(max-width: 768px\)[\s\S]*?\.supplier-table-desktop\s*\{\s*display:\s*none/.test(css) &&
      /@media \(max-width: 768px\)[\s\S]*?\.supplier-cards\s*\{\s*display:\s*flex/.test(css),
  },
  {
    id: 'supplier-finance',
    file: 'src/components/suppliers/finance/SupplierFinancePanel.css',
    what: 'unified supplier finance shell adapts below 901px',
    test: (css) => /@media \(max-width: 900px\)/.test(css),
  },
  {
    id: 'settlements-legacy',
    file: 'src/components/suppliers/settlements/UmagSettlementsPanel.css',
    what: 'legacy settlements route still has mobile layout',
    test: (css) =>
      /@media \(max-width: 900px\)[\s\S]*?\.umag-settlements__table-wrap\s*\{\s*display:\s*none/.test(css) &&
      /@media \(max-width: 900px\)[\s\S]*?\.umag-settlements__cards\s*\{\s*display:\s*flex/.test(css),
  },
  {
    id: 'supplier-payments-legacy',
    file: 'src/components/suppliers/payments/SupplierPaymentsPanel.css',
    what: 'legacy supplier-payments route still has mobile layout',
    test: (css) =>
      /\.spo-panel__cards\s*\{[\s\S]*?display:\s*flex/.test(css) &&
      /@media \(max-width: 900px\)/.test(css),
  },
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
  const match = appSource.match(new RegExp(`path="${escaped}"[\\s\\S]*?\\n(\\s*)/>`, ''))
  if (!match) fail(`route path="${routePath}" not found in ${APP}`)
  return match[0]
}

async function stageNavModel() {
  console.log('Stage 1: nav model — the whole group is open on mobile')

  const { PLATFORM_NAV } = await load('src/platform/platformNav.js')
  const { WEB_ONLY_NAV_IDS, excludeWebOnlyNavItems, isWebOnlyNavEntry } = await load(
    'src/platform/webOnlyNav.js'
  )

  const group = PLATFORM_NAV.find((item) => item.id === 'procurement-group')
  assert('«Закупки» group exists', Boolean(group))
  assert(
    'the group as a whole is not web-only',
    !isWebOnlyNavEntry(group),
    'marking the group hid every module inside it'
  )

  for (const section of PROCUREMENT_GROUP) {
    const child = group.children.find((item) => item.id === section.id)
    assert(`«${section.label}» is a child of the group`, Boolean(child))
    assert(`«${section.label}» keeps its path`, child.path === section.navPath)
    assert(
      `«${section.label}» is not web-only`,
      !isWebOnlyNavEntry(child),
      'it already has a narrow-screen layout'
    )
    assert(
      `«${section.label}» id is absent from WEB_ONLY_NAV_IDS`,
      !WEB_ONLY_NAV_IDS.has(section.id)
    )
  }

  assert(
    'the group has no other children beyond the four known nav items',
    group.children.map((child) => child.id).join(',') ===
      PROCUREMENT_GROUP.map((section) => section.id).join(','),
    'a new module must be covered here before it ships'
  )
  assert(
    'the desktop-only list is now exactly payroll and ценники',
    [...WEB_ONLY_NAV_IDS].sort().join(',') ===
      STILL_DESKTOP_ONLY.map((item) => item.id).sort().join(',')
  )

  const navSource = read(NAV)
  const groupBlock = navSource.match(/id:\s*'procurement-group'[\s\S]*?\n  \},/)?.[0] || ''
  assert('the group block is found in the nav source', groupBlock.length > 0)
  assert(
    'no webOnly flag is left anywhere inside the group',
    !/webOnly:\s*true/.test(groupBlock),
    'a flag on any child hides that child from the drawer'
  )

  const mobileNav = excludeWebOnlyNavItems(PLATFORM_NAV)
  const mobileGroup = mobileNav.find((item) => item.id === 'procurement-group')
  assert('«Закупки» is present in the mobile drawer', Boolean(mobileGroup))
  assert(
    'the mobile drawer shows all four nav modules in order',
    mobileGroup.children.map((child) => child.id).join(',') ===
      PROCUREMENT_GROUP.map((section) => section.id).join(',')
  )

  console.log('')
}

async function stageRouteAccessibility() {
  console.log('Stage 2: every path of the group passes the viewport helpers')

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
    isDesktopWebOnlyBlocked(narrow) === true && isDesktopWebOnlyBlocked(wide) === false,
    'this fix opens modules, it does not redefine what a phone is'
  )
  assert(
    'no path of the group is a desktop-only prefix any more',
    ALL_PROCUREMENT_ROUTES.every((section) => !prefixes.includes(section.navPath))
  )

  for (const section of ALL_PROCUREMENT_ROUTES) {
    for (const pathname of section.paths) {
      assert(
        `${pathname} is not a desktop-only path`,
        isDesktopWebOnlyPath(pathname, prefixes) === false
      )
      assert(
        `${pathname} link survives on a narrow screen`,
        shouldHideDesktopWebOnlyLink(pathname, narrow, prefixes) === false
      )
    }
  }

  for (const control of STILL_DESKTOP_ONLY) {
    assert(
      `${control.prefix} stays desktop-only`,
      isDesktopWebOnlyPath(control.prefix, prefixes) === true
    )
    assert(
      `${control.prefix}/nested stays desktop-only`,
      isDesktopWebOnlyPath(`${control.prefix}/nested-id`, prefixes) === true
    )
    assert(
      `${control.prefix} link is still hidden on a narrow screen`,
      shouldHideDesktopWebOnlyLink(control.prefix, narrow, prefixes) === true
    )
    assert(
      `${control.prefix} link is still shown on a wide screen`,
      shouldHideDesktopWebOnlyLink(control.prefix, wide, prefixes) === false
    )
  }

  console.log('')
}

function stageRouteWiring() {
  console.log('Stage 3: App routes — no gate on any route of the group')

  const app = read(APP)
  const declared = ALL_PROCUREMENT_ROUTES.flatMap((section) => section.routes)

  for (const section of ALL_PROCUREMENT_ROUTES) {
    for (const route of section.routes) {
      const element = routeElement(app, route)
      assert(
        `${route} renders without DesktopWebOnlyRoute`,
        !element.includes('DesktopWebOnlyRoute'),
        'the gate is what replaced the page with a stub on a phone'
      )
      assert(
        `${route} keeps its permission guard`,
        element.includes('PlatformRoute') && element.includes(section.routeKey),
        'removing the viewport gate must not remove the RBAC gate'
      )
    }
  }

  // Anything the group gains later has to be declared above, or this fails.
  const groupPrefixes = ALL_PROCUREMENT_ROUTES.map((section) => section.routes[0])
  const foundInApp = [...app.matchAll(/path="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((route) => groupPrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`)))
  assert(
    'every route of the group in App.jsx is covered by this file',
    [...new Set(foundInApp)].sort().join(',') === [...new Set(declared)].sort().join(','),
    `App.jsx has ${foundInApp.join(', ')}`
  )

  assert(
    'no route anywhere in App.jsx is wrapped in the viewport gate',
    !app.includes('<DesktopWebOnlyRoute>')
  )
  assert(
    'the now-unused gate import is removed',
    !app.includes("import DesktopWebOnlyRoute"),
    'an unused import is the trace of a half-finished revert'
  )

  console.log('')
}

function stageMobileLayouts() {
  console.log('Stage 4: every subsection has a real narrow-screen layout')

  for (const layout of MOBILE_LAYOUTS) {
    assert(`«${layout.id}»: ${layout.what}`, layout.test(read(layout.file)))
  }

  // The two wide procurement tables are read by scrolling sideways, but the
  // scroll must stay inside its own box or the whole page drifts.
  for (const [name, file] of [
    ['orders', 'src/components/procurement/PurchaseTable.css'],
    ['purchase items', 'src/components/procurement/PurchaseItemsTable.css'],
  ]) {
    assert(
      `the ${name} table scrolls inside its own wrapper`,
      /-wrap\s*\{[^}]*overflow-x:\s*auto/.test(read(file))
    )
  }

  const sidebar = read(SIDEBAR)
  assert(
    'the drawer still filters web-only entries at 900px',
    sidebar.includes('excludeWebOnlyNavItems') && sidebar.includes("'(max-width: 900px)'"),
    'that filter is what now leaves the whole group alone'
  )

  console.log('')
}

function stageMobileBackNavigation() {
  console.log('Stage 5: back navigation on the detail screens')

  // On a phone the system Back is intercepted and only toggles the drawer, so
  // every detail screen that renders its own page needs a header Back button.
  const purchase = read(PURCHASE_DETAIL)
  assert(
    'the purchase card offers Back in the mobile header',
    purchase.includes('usePlatformPageTitle') && purchase.includes('showBack: true')
  )
  assert(
    'Back from a purchase card leads to the list it came from',
    purchase.includes("backFallback: pathname.startsWith('/platform/procurement/analytics/')") &&
      purchase.includes("'/platform/procurement'")
  )
  assert(
    'the purchase card title is still derived from the nav',
    purchase.includes('getPlatformSection(pathname).title')
  )
  assert('the purchase in-page back link stays', purchase.includes('purchase-detail__back-link'))

  const receiving = read(RECEIVING_DETAIL)
  assert(
    'the receiving card offers Back in the mobile header',
    receiving.includes('usePlatformPageTitle') && receiving.includes('showBack: true'),
    'without it a phone user cannot leave the receiving card'
  )
  assert(
    'Back from a receiving card leads to the receiving list',
    receiving.includes("backFallback: '/platform/receiving'")
  )
  assert(
    'the hook runs before the early returns',
    receiving.indexOf('usePlatformPageTitle(') <
      receiving.indexOf('return <PlatformAccessDenied'),
    'a hook after a conditional return breaks the rules of hooks'
  )
  assert(
    'the receiving in-page back link stays',
    receiving.includes('receiving-detail__back')
  )

  // The supplier card is a redirect into the list modal, so it has no header
  // of its own — but its route still has to be reachable.
  const suppliers = read('src/pages/platform/suppliers/SuppliersPage.jsx')
  assert(
    'the supplier detail route still redirects into the list',
    /export function SupplierDetailPage\(\)[\s\S]{0,320}navigate\('\/platform\/suppliers'/.test(
      suppliers
    )
  )

  console.log('')
}

function stageUntouchedNeighbours() {
  console.log('Stage 6: nothing outside «Закупки» moved')

  const app = read(APP)
  for (const section of ALL_PROCUREMENT_ROUTES) {
    assert(`${section.id} keeps its route key in App.jsx`, app.includes(section.routeKey))
  }
  assert(
    'the pages behind the routes are unchanged',
    app.includes('<ReceivingPage />') &&
      app.includes('<ReceivingDetailPage />') &&
      app.includes('<SuppliersPage />') &&
      app.includes('<SupplierDetailPage />') &&
      app.includes('<SettlementsPage />') &&
      app.includes('<SupplierPaymentsPage />') &&
      app.includes('<SupplierFinancePage />')
  )

  // The gate mechanism itself survives for the modules that still use it.
  const gate = read(GATE_COMPONENT)
  assert('the gate component is still available', gate.includes('DESKTOP_WEB_ONLY_MESSAGE'))
  assert('the gate still offers a way out', gate.includes('to="/platform"'))

  const purchase = read(PURCHASE_DETAIL)
  assert(
    'the purchase card still reads the linked receiving document',
    purchase.includes('loadReceivingDocumentById') && purchase.includes('isReceivingStarted'),
    'receiving behaviour must be untouched by a viewport fix'
  )
  assert(
    'purchase order export is untouched',
    purchase.includes('exportPurchaseOrderPdf') && purchase.includes('exportPurchaseOrderXlsx')
  )

  console.log('')
}

async function main() {
  console.log('=== «Закупки» on mobile: nav, routes, layout, back ===\n')
  await stageNavModel()
  await stageRouteAccessibility()
  stageRouteWiring()
  stageMobileLayouts()
  stageMobileBackNavigation()
  stageUntouchedNeighbours()
  console.log(`=== All ${checks} checks passed ===\n`)
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`)
  process.exit(1)
})
