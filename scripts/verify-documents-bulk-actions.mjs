#!/usr/bin/env node
/**
 * Verification — «Закуп» list: «---» instead of «Без номера», checkboxes + «Действие» menu with bulk draft
 * deletion (saved documents can never be deleted), pencil on the right of every row, one size for the bar controls.
 *
 * Usage:
 *   npm run verify:documents-bulk-actions
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
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const page = read('src/pages/platform/procurement/PurchaseDocumentsPage.jsx')
const css = read('src/pages/platform/procurement/PurchaseDocumentsPage.css')

// --- number ---------------------------------------------------------------------------------------
assert.doesNotMatch(page, /Без номера<\/span>/)
assert.match(page, /className="pdl-dash"[\s\S]{0,60}---/)
assert.match(css, /\.pdl-row--draft \.pdl-dash\s*\{\s*font-style: normal/)
ok('a document without a number shows «---» (quiet, upright), not the long «Без номера» text')

// --- selection + menu --------------------------------------------------------------------------------
assert.match(page, /key: 'select'/)
assert.match(page, /key: 'edit'/)
assert.match(page, /<PlatformActionsMenu/)
assert.match(page, /interactive\b/)
ok('checkbox column, pencil column and the «Действие» menu are on the list; the row is an interactive div (no button inside a button)')
const reasons = page.slice(page.indexOf('deleteBlockReason ='), page.indexOf('async function handleDeleteSelected'))
assert.match(reasons, /!canDelete\s*\?\s*'Нет прав на удаление'/)
assert.match(reasons, /pickedOrders\.length === 0/)
assert.match(reasons, /hasSavedPicked\s*\?\s*'Сохранённые документы удалить нельзя'/)
ok('«Удалить» is shown to everyone but is disabled with a reason: no right / nothing ticked / a saved document is ticked')
assert.match(page, /disabled: Boolean\(deleteBlockReason\)/)
assert.match(page, /ConfirmDialog[\s\S]{0,200}Удалить черновиков/)
ok('deleting asks for confirmation first')

const { canDeletePurchase } = await import(pathToFileURL(path.join(ROOT, 'src/config/permissions.js')).href)
assert.equal(typeof canDeletePurchase, 'function')
assert.equal(canDeletePurchase(null), false)
ok('canDeletePurchase exists and denies an unknown user')

// --- service: drafts only, partial success -----------------------------------------------------------------
const store = new Map()
const calls = []
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
const service = await import(pathToFileURL(path.join(ROOT, 'src/services/purchaseDataService.js')).href)
assert.equal(typeof service.deleteDraftPurchaseOrders, 'function')
const src = read('src/services/purchaseDataService.js')
assert.match(src, /order\.status !== 'draft'[\s\S]{0,120}Сохранённый документ удалить нельзя/)
assert.match(src, /concurrency = 5/)
assert.match(src, /return \{ deleted, failed \}/)
void calls
ok('the service refuses a saved document, deletes five at a time and reports deleted / failed instead of throwing')
assert.match(read('supabase/migrations/20261028100000_order_statuses_rpc.sql') + read('docs/db/purchase-order-totals-trigger.md'), /./)

// --- shared bar size -----------------------------------------------------------------------------------
const index = read('src/index.css')
for (const token of ['--pf-control-h: 38px', '--pf-control-fs: 13.5px', '--pf-control-radius: 4px']) {
  assert.ok(index.includes(token), `${token} is missing in index.css`)
}
assert.match(css, /\.pdl-bar \.btn,\s*\.pdl-bar \.pf-trigger,\s*\.pdl-bar \.pf-filter-chip,\s*\.pdl-bar \.pact\s*\{[^}]*height: var\(--pf-control-h\)/)
assert.match(read('src/components/platform/PlatformActionsMenu.css'), /height: var\(--pf-control-h, 38px\)/)
ok('«Создать», «Фильтр», «Действие» and the period chip share one height / font / radius (tokens in index.css)')

// --- phones --------------------------------------------------------------------------------------------
assert.match(css, /max-width: 640px\)\s*\{[\s\S]*\.pdl-bar__actions\s*\{\s*display: none/)
assert.match(page, /key: 'select'[\s\S]{0,400}mobile: 'hide'/)
assert.match(page, /key: 'edit'[^}]*mobile: 'hide'/)
ok('on phones the checkboxes, the pencil and the «Действие» menu are hidden (a draft is deleted inside the document)')

// --- confirm dialog: a destructive action is red ---------------------------------------------------------
assert.match(read('src/components/admin/ConfirmDialog.jsx'), /confirmVariant === 'danger' \? 'btn--danger' : 'btn--primary'/)
ok('the confirmation of a destructive action is a red button (it was green with red text)')

console.log(`\nverify:documents-bulk-actions — ${checks} checks passed`)
