import assert from 'node:assert/strict'
import fs from 'node:fs'

let checks = 0
const ok = (m) => { checks += 1; console.log(`  ✓ ${m}`) }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const ctx = read('src/context/PullToRefreshContext.jsx')
assert.match(ctx, /handlersRef = useRef\(new Set\(\)\)/)
assert.match(ctx, /handlersRef\.current\.add\(handler\)/)
assert.match(ctx, /handlers\.length === 0[\s\S]*await onGlobalRefresh\?\.\(\)[\s\S]*Promise\.allSettled\(handlers\.map/)
ok('a swipe runs the handlers of the open page (all of them together); without any it falls back to the route fallback, never to a full dump')

const layout = read('src/layouts/PlatformLayout.jsx')
assert.doesNotMatch(layout, /onGlobalRefresh=\{reload\}/)
assert.match(layout, /onGlobalRefresh=\{refreshRoute\}/)
assert.match(layout, /reloadModules\(getRouteCriticalModules\(pathname\)\)/)
ok('the layout fallback reloads only the modules of the current route')

const service = read('src/services/platformDataService.js')
assert.match(service, /export async function refreshModules\(/)
assert.match(read('src/context/PlatformDataContext.jsx'), /reloadModules,/)
ok('refreshModules / reloadModules exist (procurement, suppliers, employees one by one)')

const pages = {
  'src/pages/platform/procurement/PurchaseDocumentsPage.jsx': /usePlatformPageRefresh\(\(\) => reloadProcurement\(\)\)/,
  'src/pages/platform/orders/OrdersPage.jsx': /usePlatformPageRefresh\(\(\) => reloadProcurement\(\)\)/,
  'src/pages/platform/procurement/PurchaseDocumentPage.jsx': /usePlatformPageRefresh\(async \(\) => \{[\s\S]{0,200}reloadOrder\(\)/,
  'src/components/procurement/ProcurementWarehouseView.jsx': /usePlatformPageRefresh\(async \(\) => \{[\s\S]{0,200}loadHistory\(\)/,
  'src/components/admin/paymentAccounts/usePaymentAccountsData.js': /usePlatformPageRefresh\(async \(\) => \{[\s\S]{0,120}loadPaidTotals\(\)/,
  'src/components/admin/team/RolesWorkspace.jsx': /usePlatformPageRefresh\(async \(\) => \{\s*if \(isDirty\) return/,
  'src/components/admin/sections/EmployeesSection.jsx': /usePlatformPageRefresh\(loadCloudEmployees\)/,
}
for (const [file, re] of Object.entries(pages)) assert.match(read(file), re, file)
ok('every data page registers its own refresh: purchases, orders, one document, warehouse, payment accounts, roles (never over unsaved edits), users')

const settlements = read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx')
assert.equal((settlements.match(/usePlatformPageRefresh\(/g) || []).length, 2)
assert.match(settlements, /fetchNativeSupplierDebtSummary\(\{ includeUnassigned: true \}\)\.then\(setDebtSummary\)/)
assert.match(settlements, /const result = await fetchUmagSupplierOperationHistory\(\{[\s\S]{0,300}setDetail\(result\)/)
ok('«Расчёты»: the list refreshes balances, the open supplier card refreshes its operations')

console.log(`\nverify:page-scoped-refresh — ${checks} checks passed`)
