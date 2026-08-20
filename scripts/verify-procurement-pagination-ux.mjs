#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
let checks = 0

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function assert(label, condition) {
  checks += 1
  if (!condition) throw new Error(`FAIL: ${label}`)
  console.log(`  ✓ ${label}`)
}

const pagination = read('src/components/procurement/TablePagination.jsx')
const planner = read('src/components/procurement/ProcurementPlannerView.jsx')
const plannerCss = read('src/components/procurement/ProcurementPlannerView.css')
const orders = read('src/pages/platform/procurement/ProcurementPage.jsx')
const norms = read('src/components/procurement/ProcurementNormsView.jsx')

assert('page sizes are 25/50/100/500', pagination.includes('[25, 50, 100, 500]'))
assert('first page navigation exists', pagination.includes('aria-label="Первая страница"'))
assert('last page navigation exists', pagination.includes('aria-label="Последняя страница"'))
assert('compact range is displayed', pagination.includes('{from}–{to} / {totalCount}'))
assert('pagination accepts disabled prop', /disabled\s*=\s*false/.test(pagination) && pagination.includes('disabled = false'))
assert('pagination disables controls when disabled', pagination.includes('!disabled') && pagination.includes('disabled={disabled}'))

assert('planning defaults to 25 rows', planner.includes('const DEFAULT_PAGE_SIZE = 25'))
assert('planning fetch uses selected page size', planner.includes('pageSize,'))
assert('supplier is in the primary toolbar', planner.includes('className="proc-planner__supplier-quick"'))
assert('supplier was removed from advanced filter', !planner.includes('proc-planner__supplier-filter'))
assert('advanced reset preserves supplier', !/setFilters\(\{[\s\S]{0,180}platformSupplierId:\s*''/.test(planner))

assert('planner builds items scope key', planner.includes('function buildPlannerItemsScopeKey'))
assert('planner tracks request id against stale', planner.includes('itemsRequestIdRef') && planner.includes('requestId !== itemsRequestIdRef.current'))
assert('planner hard-clears items on scope change', /scopeKey !== lastItemsScopeKeyRef\.current[\s\S]{0,120}setItems\(\[\]\)/.test(planner))
assert('planner distinguishes initial vs soft loading', planner.includes('isInitialLoading') && planner.includes('isFetching'))
assert('planner keep-previous uses isInitialLoading for empty state', /isInitialLoading \? \(/.test(planner) && !/\{loading \? \(\s*<tr>/.test(planner))
assert('planner passes disabled to pagination while loading', (planner.match(/disabled=\{loading\}/g) || []).length >= 2)
assert('planner soft-fetch CSS class on desktop wrap', planner.includes('proc-planner__table-wrap--fetching'))
assert('planner soft-fetch CSS class on mobile', planner.includes('proc-planner__mobile--fetching'))
assert('planner CSS soft-fetch opacity', plannerCss.includes('proc-planner__table-wrap--fetching') && /opacity:\s*0\.6/.test(plannerCss))
assert('planner CSS soft-fetch top bar', plannerCss.includes('proc-planner-fetch-bar'))

assert('orders default to 25 rows', orders.includes('useState(25)'))
assert('orders are sliced by page', orders.includes('dayOrders.slice(start, start + ordersPageSize)'))
assert('orders use shared pagination', orders.includes('<TablePagination'))
assert('orders refresh/filter header removed', !orders.includes('procurement-page__header'))
assert('orders filter popover removed', !orders.includes('PurchaseFilterPopover'))

assert('norms use shared loading skeleton', norms.includes('<DelayedLoadingSkeleton variant="list" count={7} />'))

console.log(`\n${checks}/${checks} checks passed`)
