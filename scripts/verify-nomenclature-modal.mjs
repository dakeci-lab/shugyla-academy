#!/usr/bin/env node
/**
 * Verification — stage 6 of «Закуп как документы»: window «Добавить из номенклатуры».
 *
 * Usage: npm run verify:nomenclature-modal
 */
import fs from 'fs'
import path from 'path'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}

const { buildNomenclatureTree, catalogGroupKey } = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/purchaseCatalog.js')).href
)
const pairs = [
  { categoryName: 'Бакалея', subcategoryName: 'Чай', itemCount: 10 },
  { categoryName: 'Бакалея', subcategoryName: 'Кофе', itemCount: 5 },
  { categoryName: '', subcategoryName: '', itemCount: 2 },
]
const loaded = {
  [catalogGroupKey('Бакалея', 'Кофе')]: [
    { productName: 'Б', recommendedQty: 3 },
    { productName: 'А', recommendedQty: 0 },
  ],
}
const tree = buildNomenclatureTree(pairs, loaded)
assert.deepEqual(tree.map((c) => c.name), ['Бакалея', 'Без категории'])
assert.equal(tree[0].count, 15)
assert.deepEqual(tree[0].subcategories.map((s) => s.name), ['Кофе', 'Чай'])
assert.deepEqual(tree[0].subcategories[0].items.map((i) => i.productName), ['А', 'Б'])
assert.equal(tree[0].toOrder, 1)
assert.equal(tree[0].subcategories[1].items.length, 0)
ok('whole-nomenclature tree from group counts; rows only for opened groups')

const modal = read('src/components/procurement/document/NomenclatureModal.jsx')
assert.match(modal, /fetchSnapshotFilterOptions/)
assert.match(modal, /categoryName: sub\.categoryName/)
assert.match(modal, /q\.length >= 2/)
ok('groups load their rows when opened; search (2+ symbols) goes to the server')
assert.match(modal, /Товар другого поставщика/)
assert.match(modal, /lockedSupplierId/)
ok('other suppliers\' products disabled; the first pick fixes the supplier')
assert.doesNotMatch(modal, /below-norm|above-norm|ShelfBar/)
ok('no norm colours')

const page = read('src/pages/platform/procurement/PurchaseDocumentPage.jsx')
assert.match(page, /Добавить из номенклатуры/)
assert.match(page, /async function addNomenclatureItems[\s\S]*Выберите товары одного поставщика[\s\S]*updatePurchaseOrder\(order\.id, \{ supplierId/)
ok('one «Добавить из номенклатуры» button; an empty document takes the supplier from the picked products')
assert.doesNotMatch(page, />\s*Добавить\s*<\/button>/)
ok('no second «Добавить» button in the add-row (barcode adds on Enter)')

console.log(`\n${checks} checks passed`)
