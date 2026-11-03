import assert from 'node:assert/strict'
import fs from 'node:fs'

let checks = 0
const ok = (m) => { checks += 1; console.log(`  ✓ ${m}`) }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const view = read('src/components/platform/PageRefreshIndicator.jsx')
const css = read('src/components/platform/PageRefreshIndicator.css')
const ptr = read('src/components/platform/PullToRefresh.jsx')

for (const label of ['Потяните', 'Отпустите', 'Обновляем…', 'Обновлено']) assert.ok(view.includes(label), label)
ok('the indicator has four stages: «Потяните» → «Отпустите» → «Обновляем…» → «Обновлено»')

assert.match(view, /stroke-?[Dd]asharray=\{`\$\{Math\.min\(1, pullProgress\) \* CIRCUMFERENCE\}/)
assert.match(css, /page-refresh-indicator__chip\s*\{[^}]*border-radius: 50%[^}]*box-shadow/)
ok('a white round chip whose ring fills with the pull')

assert.match(css, /page-refresh-indicator__arrow--up/)
assert.match(css, /page-refresh-indicator__check\s*\{[^}]*stroke-dashoffset/)
assert.match(css, /prefers-reduced-motion/)
ok('the arrow turns up at the threshold, a green check is drawn when done, reduced motion is respected')

assert.match(ptr, /const DONE_HOLD_MS = 650/)
assert.match(ptr, /if \(succeeded\) \{\s*setDone\(true\)[\s\S]*DONE_HOLD_MS/)
assert.match(ptr, /refreshing=\{refreshing && !done\}[\s\S]*done=\{done\}/)
ok('after a successful refresh the check stays for a moment, then everything slides up; after an error there is no «Обновлено»')

console.log(`\nverify:pull-refresh-indicator — ${checks} checks passed`)
