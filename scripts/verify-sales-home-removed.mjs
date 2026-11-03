import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

let checks = 0
const ok = (m) => { checks += 1; console.log(`  ✓ ${m}`) }
const root = new URL('../', import.meta.url)
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8')
const exists = (p) => fs.existsSync(new URL(p, root))

for (const p of ['src/pages/platform/sales', 'src/components/sales', 'src/services/salesDataService.js',
  'src/utils/salesHeat.js', 'src/utils/salesExport.js', 'src/utils/salesAggregation.js', 'src/utils/salesFormat.js',
  'supabase/functions/umag-sales-sync']) {
  assert.equal(exists(p), false, `${p} must be gone`)
}
ok('the sales page, components, service, helpers and the umag-sales-sync function are deleted')

assert.doesNotMatch(read('supabase/config.toml'), /umag-sales-sync/)
ok('supabase/config.toml has no umag-sales-sync')

const nav = read('src/platform/platformNav.js')
assert.doesNotMatch(nav, /id: 'sales'|platform\/sales/)
const app = read('src/App.jsx')
assert.doesNotMatch(app, /SalesPage/)
assert.match(app, /path="sales" element=\{<Navigate to="\/platform" replace \/>\}/)
ok('no «Главная» in the menu; /platform/sales redirects to /platform')

const perms = read('src/config/permissions.js') + read('src/config/permissionCatalog.js')
assert.doesNotMatch(perms, /SALES_VIEW|SALES_SYNC|ROUTE_KEYS\.SALES|canViewSales|canSyncSales|'sales\./)
ok('no sales route key, permissions or helpers in RBAC')

let leftovers = ''
try {
  leftovers = execFileSync('git', ['grep', '-nE', "from\\('sales_|umag-sales-sync|salesDataService", '--', 'src', 'supabase/functions'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
} catch {
  /* git grep exits 1 when nothing matches — that is what we want */
}
assert.equal(leftovers, '')
ok('no code reads the sales_* tables or calls umag-sales-sync')

console.log(`\nverify:sales-home-removed — ${checks} checks passed`)
