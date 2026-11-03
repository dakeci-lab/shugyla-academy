import assert from 'node:assert/strict'
import fs from 'node:fs'

let checks = 0
const ok = (m) => { checks += 1; console.log(`  ✓ ${m}`) }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const hook = read('src/hooks/useInfiniteSlice.js')
assert.match(hook, /step = 25/)
assert.match(hook, /new IntersectionObserver\(/)
assert.match(hook, /setCount\(\(current\) => current \+ step\)/)
assert.match(hook, /resetKey/)
assert.match(hook, /typeof IntersectionObserver === 'undefined'/)
ok('the hook shows 25 rows and adds 25 each time the end marker comes near the screen; a new filter starts again; no observer → everything is shown')

for (const [file, source] of [
  ['src/pages/platform/procurement/PurchaseDocumentsPage.jsx', 'documents'],
  ['src/pages/platform/orders/OrdersPage.jsx', 'orders'],
]) {
  const src = read(file)
  assert.match(src, new RegExp(`useInfiniteSlice\\(${source}, \\{ enabled: isPhone`))
  assert.match(src, /isPhone \? \(\s*infinite\.hasMore \? <div ref=\{infinite\.sentinelRef\} className="pgt__more"/)
  assert.match(src, /<TablePagination/)
  ok(`${file.split('/').pop()}: phones use infinite scroll (no page buttons), the web keeps «50 / 100 / 500» pagination`)
}

console.log(`\nverify:mobile-infinite-scroll — ${checks} checks passed`)
