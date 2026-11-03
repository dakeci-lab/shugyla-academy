import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

let checks = 0
const ok = (m) => { checks += 1; console.log(`  ✓ ${m}`) }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const exists = (p) => fs.existsSync(new URL(`../${p}`, import.meta.url))

assert.equal(exists('src/services/umagOperationDetailsService.js'), false)
assert.equal(exists('supabase/functions/umag-operation-details'), false)
assert.doesNotMatch(read('supabase/config.toml'), /umag-operation-details/)
ok('the operation-items service and Edge Function are gone')

const sheet = read('src/components/suppliers/settlements/OperationDetailSheet.jsx')
assert.doesNotMatch(sheet, /fetchOperationDetails|umagOperationDetailsService|Обновить детали|Товары|Поиск по товарам|DelayedLoadingSkeleton/)
ok('the operation window is only for paying: no product list, no loading, no sums-mismatch warning')

const code = execSync("grep -rIl \"umag_supply_items\\|umag_supply_return_items\\|umag-operation-details\" src supabase/functions || true", { cwd: new URL('..', import.meta.url) }).toString().trim()
assert.equal(code, '')
ok('no frontend or Edge Function code touches the item tables (safe to drop them)')

assert.ok(exists('docs/db/stage-26-remove-operation-items/README.md'))
ok('stage 26 document (preflight / apply / rollback for the owner) exists')

console.log(`\nverify:operation-items-removed — ${checks} checks passed`)
