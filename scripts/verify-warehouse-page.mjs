#!/usr/bin/env node
/**
 * Verification — stage 2 of «Закуп как документы»: «Склад» is its own page and menu item
 * (after «Расчёты»), no tab switcher inside «Закуп».
 *
 * Usage: npm run verify:warehouse-page
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let checks = 0
const ok = (name) => {
  checks += 1
  console.log(`  ✓ ${name}`)
}

const nav = read('src/platform/platformNav.js')
const perms = read('src/config/permissions.js')
const app = read('src/App.jsx')
const page = read('src/pages/platform/procurement/ProcurementPage.jsx')
const wh = read('src/pages/platform/procurement/WarehousePage.jsx')

assert.match(nav, /id: 'warehouse',\s*path: '\/platform\/warehouse'[\s\S]*?routeKey: ROUTE_KEYS\.WAREHOUSE/)
ok('menu has «Склад» → /platform/warehouse')
assert.ok(nav.indexOf("id: 'supplier-finance'") < nav.indexOf("id: 'warehouse'"))
ok('«Склад» goes after «Расчёты»')
assert.match(perms, /WAREHOUSE: 'warehouse'/)
assert.match(perms, /\[ROUTE_KEYS\.WAREHOUSE\]: \[ROLE_IDS\.ADMIN, ROLE_IDS\.BUYER\]/)
assert.match(perms, /\[ROUTE_KEYS\.WAREHOUSE\]: \[P\.PROCUREMENT_VIEW\]/)
ok('route key, role fallback and permission mapping')
assert.match(app, /path="warehouse"[\s\S]*?ROUTE_KEYS\.WAREHOUSE[\s\S]*?<WarehousePage \/>/)
ok('route /platform/warehouse is registered behind its route key')
assert.match(wh, /ProcurementWarehouseView/)
assert.doesNotMatch(page, /ProcurementWarehouseView|setMainTab|role="tablist"/)
ok('«Закуп» has no warehouse tab or tab switcher')
console.log(`\n${checks} checks passed`)
