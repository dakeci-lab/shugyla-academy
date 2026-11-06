#!/usr/bin/env node
/**
 * Verification — one way to show money: whole amounts without decimals, amounts with tiyn with exactly two digits.
 *
 * Usage: npm run verify:money-format
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
const norm = (text) => text.replace(/ | /g, ' ')

const { formatTenge, formatTengeNumber } = await import(pathToFileURL(path.join(ROOT, 'src/utils/formatMoney.js')).href)

assert.equal(norm(formatTenge(150)), '150 ₸')
assert.equal(norm(formatTenge(17040)), '17 040 ₸')
assert.equal(norm(formatTenge(0)), '0 ₸')
ok('a whole amount has no decimals: «150 ₸», «17 040 ₸», «0 ₸»')

assert.equal(norm(formatTenge(246917.6)), '246 917,60 ₸')
assert.equal(norm(formatTenge(42.4)), '42,40 ₸')
assert.equal(norm(formatTenge(508.8)), '508,80 ₸')
assert.equal(norm(formatTenge(195333.27)), '195 333,27 ₸')
assert.equal(norm(formatTenge(3386.75)), '3 386,75 ₸')
assert.equal(norm(formatTenge('1102.5')), '1 102,50 ₸')
ok('an amount with tiyn always has two digits: «246 917,60 ₸», «42,40 ₸», «3 386,75 ₸» (never «246 917,6»)')

assert.equal(norm(formatTenge(1234.999)), '1 235 ₸')
assert.equal(norm(formatTenge(0.004)), '0 ₸')
assert.equal(norm(formatTenge(0.005)), '0,01 ₸')
assert.equal(norm(formatTenge(10.0000001)), '10 ₸')
assert.equal(norm(formatTengeNumber(-61729.4)).replace('−', '-'), '-61 729,40')
ok('rounded to tiyn first: 1234.999 → «1 235 ₸», 0.004 → «0 ₸», a float tail like 10.0000001 is a whole amount')

assert.equal(formatTenge(null), '—')
assert.equal(formatTenge(undefined), '—')
assert.equal(formatTenge(''), '—')
assert.equal(formatTenge(NaN), '—')
assert.equal(formatTenge(NaN, ''), '')
ok('no value stays «—»')

const data = await import(pathToFileURL(path.join(ROOT, 'src/utils/purchaseData.js')).href)
const settlements = read('src/services/umagSettlementsService.js')
const supplierData = read('src/utils/supplierData.js')
assert.equal(norm(data.formatPurchaseAmount(246917.6)), '246 917,60 ₸')
assert.match(settlements, /export function formatUmagMoney\(value\) \{[\s\S]*?return formatTenge\(n\)/)
assert.match(supplierData, /export function formatMinOrderAmount\(amount\) \{\s*return formatTenge\(amount\)/)
ok('documents, lists, «Поставщики» and the minimum order use the same formatter')

console.log(`\n${checks} checks passed`)
