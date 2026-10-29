#!/usr/bin/env node
/**
 * Verification — «Минимальная сумма заказа» field in the supplier card.
 *
 * Usage:
 *   npm run verify:supplier-min-order-amount
 */

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}

const { parseMinOrderAmount, formatMinOrderAmountInput } = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/supplierData.js')).href
)

assert.equal(formatMinOrderAmountInput(150000), '150000')
assert.equal(formatMinOrderAmountInput(0), '')
assert.equal(formatMinOrderAmountInput(null), '')
ok('the input shows the stored minimum (empty when not set or zero)')

assert.equal(parseMinOrderAmount('150000'), 150000)
assert.equal(parseMinOrderAmount('150 000'), 150000)
assert.equal(parseMinOrderAmount('1500,5'), 1500.5)
for (const bad of ['', '0', '-5', 'abc', null, undefined]) assert.equal(parseMinOrderAmount(bad), null)
ok('a positive number is saved, anything else clears the minimum')

const src = fs.readFileSync(path.join(ROOT, 'src/components/suppliers/SupplierForm.jsx'), 'utf8')
assert.match(src, /Минимальная сумма заказа/)
assert.match(src, /setField\('minOrderAmount'/)
assert.match(src, /minOrderAmount: parseMinOrderAmount\(form\.minOrderAmount\)/)
ok('the supplier card has the «Минимальная сумма заказа» input')

console.log(`\nverify:supplier-min-order-amount — ${checks} checks passed`)
