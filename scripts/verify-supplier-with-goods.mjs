import assert from 'node:assert/strict'
import fs from 'node:fs'

let checks = 0
const ok = (m) => { checks += 1; console.log(`  ✓ ${m}`) }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// Real module (the project's loader resolves extensionless imports the way Vite does).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(new URL('./lib/extensionlessResolver.mjs', import.meta.url).pathname))
const { bringsGoodsToday, suppliersWithGoodsFirst, suppliersOrderedToday } = await import('../src/utils/purchaseDocument.js')

const s = (id, order, delivery) => ({ id, name: id, orderWeekdays: order, deliveryWeekdays: delivery })
const mon = s('mon-same', ['mon'], ['mon'])
const monThu = s('mon-thu', ['mon', 'thu'], ['mon', 'thu'])
const partial = s('partial', ['mon', 'wed'], ['mon'])
const later = s('later', ['mon'], ['tue'])
const noDelivery = s('no-delivery', ['mon'], [])

assert.equal(bringsGoodsToday(mon, 'mon'), true)
assert.equal(bringsGoodsToday(monThu, 'thu'), true)
assert.equal(bringsGoodsToday(partial, 'mon'), true)
assert.equal(bringsGoodsToday(partial, 'wed'), false)
assert.equal(bringsGoodsToday(later, 'mon'), false)
assert.equal(bringsGoodsToday(noDelivery, 'mon'), false)
ok('«с собой» is decided by the day: order day and delivery day both include today')

const today = suppliersOrderedToday([later, mon, noDelivery, monThu, partial], 'mon')
assert.deepEqual(suppliersWithGoodsFirst(today, 'mon').map((x) => x.id), ['mon-same', 'mon-thu', 'partial', 'later', 'no-delivery'])
ok('today\'s suppliers with goods come first, the order inside each group is kept')

const picker = read('src/components/procurement/document/DocumentSupplierPicker.jsx')
assert.match(picker, /suppliersWithGoodsFirst\(suppliersOrderedToday/)
assert.match(picker, /is-with-goods/)
assert.match(picker, /docsup__tag">с собой</)
assert.match(read('src/components/procurement/document/DocumentSupplierPicker.css'), /\.docsup__option\.is-with-goods/)
ok('the supplier picker of a document shows them first, with a soft tint and the mark «с собой»')

console.log(`\nverify:supplier-with-goods — ${checks} checks passed`)
