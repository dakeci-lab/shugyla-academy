#!/usr/bin/env node
/**
 * Verification: «К оплате» compact schedule gets flexible columns (resize /
 * reorder / show-hide via a gear icon), the same interaction standard as
 * Procurement Planning — plus the new «Дата приёмки» column.
 *
 * Real imports (extensionlessResolver) exercise the pure column-settings
 * logic directly; source checks confirm the wiring in the React component.
 *
 * Usage:
 *   npm run verify:supplier-payments-column-settings
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
function ok(name) {
  checks += 1
  console.log(`  ✓ ${name}`)
}
function read(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) throw new Error(`file not found: ${relPath}`)
  return fs.readFileSync(full, 'utf8')
}

async function main() {
  console.log('=== Supplier payments column settings verification ===\n')

  const registry = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/paymentsColumnRegistry.js')).href
  )
  const merge = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/paymentsColumnSettingsMerge.js')).href
  )

  console.log('Stage 1: Registry — 5 columns, supplier/amount locked at the ends')

  const defaults = registry.getDefaultPaymentsColumnSettings()
  assert.deepEqual(
    defaults.columns.map((c) => c.columnName),
    ['supplier', 'receivedAt', 'status', 'dueDate', 'amount']
  )
  ok('default order: Поставщик → Дата приёмки → Статус → Срок → Сумма')

  assert.deepEqual(registry.getReorderablePaymentsColumnNames(), ['receivedAt', 'status', 'dueDate'])
  assert.equal(registry.isPaymentsColumnReorderable('supplier'), false)
  assert.equal(registry.isPaymentsColumnReorderable('amount'), false)
  ok('supplier/amount are not reorderable; the middle 3 are')

  console.log('\nStage 2: Merge — hide, reorder, resize, stale-column cleanup')

  const hidden = merge.normalizePaymentsColumnSettingsForSave({
    ...defaults,
    columns: defaults.columns.map((c) => (c.columnName === 'status' ? { ...c, visible: false } : c)),
  })
  assert.deepEqual(
    merge.getVisiblePaymentsColumns(hidden).map((c) => c.columnName),
    ['supplier', 'receivedAt', 'dueDate', 'amount']
  )
  ok('hiding a togglable column removes it from the visible list, keeps the rest')

  const lockedStillVisible = merge.normalizePaymentsColumnSettingsForSave({
    ...defaults,
    columns: defaults.columns.map((c) =>
      c.columnName === 'supplier' || c.columnName === 'amount' ? { ...c, visible: false } : c
    ),
  })
  assert.ok(lockedStillVisible.columns.find((c) => c.columnName === 'supplier').visible)
  assert.ok(lockedStillVisible.columns.find((c) => c.columnName === 'amount').visible)
  ok('locked columns (supplier, amount) cannot be hidden even if a caller tries')

  const reordered = merge.reorderTogglablePaymentsColumns(defaults, 'dueDate', 'receivedAt')
  assert.deepEqual(
    reordered.columns.sort((a, b) => a.columnOrdinalNumber - b.columnOrdinalNumber).map((c) => c.columnName),
    ['supplier', 'dueDate', 'receivedAt', 'status', 'amount']
  )
  ok('dragging «Срок» before «Дата приёмки» reorders the middle block')

  const tryMoveLocked = merge.reorderTogglablePaymentsColumns(defaults, 'supplier', 'amount')
  assert.deepEqual(
    tryMoveLocked.columns.sort((a, b) => a.columnOrdinalNumber - b.columnOrdinalNumber).map((c) => c.columnName),
    defaults.columns.map((c) => c.columnName)
  )
  ok('dragging a locked column onto another is a no-op — order unchanged')

  const resized = merge.normalizePaymentsColumnSettingsForSave({
    ...defaults,
    columns: defaults.columns.map((c) => (c.columnName === 'amount' ? { ...c, width: 999 } : c)),
  })
  assert.equal(resized.columns.find((c) => c.columnName === 'amount').width, 999)
  ok('resized width survives normalization')

  const belowMin = merge.normalizePaymentsColumnSettingsForSave({
    ...defaults,
    columns: defaults.columns.map((c) => (c.columnName === 'status' ? { ...c, width: 1 } : c)),
  })
  const statusMin = registry.getPaymentsColumnDef('status').minWidth
  assert.equal(belowMin.columns.find((c) => c.columnName === 'status').width, statusMin)
  ok('width below the registry minimum is clamped, not left as-is')

  const staleSaved = {
    tableName: registry.SUPPLIER_PAYMENTS_TABLE_NAME,
    columns: [
      { columnName: 'ghostColumn', columnOrdinalNumber: 0, visible: true, width: 50 },
      { columnName: 'supplier', columnOrdinalNumber: 1, visible: true, width: 300 },
    ],
  }
  const mergedStale = merge.mergePaymentsColumnSettings(staleSaved, defaults)
  assert.deepEqual(mergedStale.columns.map((c) => c.columnName).sort(), [...registry.getPaymentsRegistryColumnNames()].sort())
  assert.ok(!mergedStale.columns.some((c) => c.columnName === 'ghostColumn'))
  ok('unknown saved column names drop; missing registry columns are appended back')

  console.log('\nStage 3: Persistence reuses the generic user_table_settings service')

  const panelSrc = read('src/components/suppliers/payments/SupplierPaymentsPanel.jsx')
  assert.match(panelSrc, /import \{ getTableSettings, saveTableSettings \} from '..\/..\/..\/services\/tableSettingsService'/)
  assert.match(panelSrc, /getTableSettings\(SUPPLIER_PAYMENTS_TABLE_NAME\)/)
  assert.match(panelSrc, /await saveTableSettings\(normalized\)/)
  ok('column settings load/save through the same generic user_table_settings service Procurement uses — no new table')

  assert.doesNotMatch(panelSrc, /procurementPlannerColumnRegistry|plannerColumnSettingsMerge/)
  ok('does not import the Procurement-specific column registry/merge module — a separate, simpler implementation, same UX pattern')

  console.log('\nStage 4: «Дата приёмки» column — single receipt shows a date, several show a count')

  assert.match(panelSrc, /function formatReceivedAt\(group\)/)
  assert.match(panelSrc, /if \(group\.count > 1\) return formatReceptionCount\(group\.count\)/)
  ok('formatReceivedAt falls back to the existing «N приёмок» label when a row aggregates several receipts')

  console.log('\nStage 5: Header/row rendering is column-driven, not hardcoded')

  assert.match(panelSrc, /function renderPaymentsCell\(columnName, group, todayKey\)/)
  assert.match(panelSrc, /visibleColumns\.map\(\(col\) => \(/)
  assert.doesNotMatch(
    panelSrc,
    /<span role="columnheader">Поставщик<\/span>\s*<span role="columnheader">Срок<\/span>/
  )
  ok('CompactColumnsHead/CompactObligationRow iterate visibleColumns instead of four hardcoded spans')

  console.log('\nStage 6: Resize + drag-reorder handlers mirror the Procurement pattern')

  assert.match(panelSrc, /handleColumnResizePointerDown/)
  assert.match(panelSrc, /handleColumnResizePointerMove/)
  assert.match(panelSrc, /handleColumnDragStart/)
  assert.match(panelSrc, /handleColumnDrop/)
  assert.match(panelSrc, /reorderTogglablePaymentsColumns\(/)
  ok('pointer-resize and native-drag-reorder handlers wired, backed by the merge utility (not ad hoc state mutation)')

  console.log('\nStage 7: Gear icon — plain button, same position/size as the UMAG reference')

  assert.match(panelSrc, /function PaymentsColumnSettingsIcon/)
  assert.match(panelSrc, /fill="currentColor"/)
  assert.doesNotMatch(
    panelSrc.match(/function PaymentsColumnSettingsIcon[\s\S]*?\n\}/)[0],
    /stroke="currentColor"/
  )
  ok('the icon is a solid filled cog (fill-based), not the old sun-like stroke/spoke icon')

  assert.match(panelSrc, /className="spo-compact__column-settings-btn"/)
  assert.doesNotMatch(panelSrc, /PlatformToolbarIconButton/)
  ok('gear trigger is a plain unstyled button, not the 44px bordered PlatformToolbarIconButton')

  assert.match(panelSrc, /<div className="spo-compact__head-row">[\s\S]*?<CompactColumnsHead/)
  assert.match(panelSrc, /<CompactColumnsHead[\s\S]*?\/>\s*\{columnSettingsGear\}\s*<\/div>/)
  ok('gear renders as a sibling right after the column headers, inside the same header row')

  const cssSrc0 = read('src/components/suppliers/payments/SupplierPaymentsPanel.css')
  assert.match(cssSrc0, /\.spo-compact__column-settings-btn \{[^}]*width: 20px/)
  assert.doesNotMatch(cssSrc0, /\.spo-compact__column-settings-btn \{[^}]*border: 1px/)
  assert.doesNotMatch(cssSrc0, /\.spo-compact__column-settings-btn[^{]*\{[^}]*transition/)
  ok('button is small (20px) with no border box and no transition/animation — a plain icon, per the owner-supplied reference')

  console.log('\nStage 8: Mobile is unaffected — column settings are a desktop-only affordance')

  const cssSrc = read('src/components/suppliers/payments/SupplierPaymentsPanel.css')
  assert.match(cssSrc, /@media \(max-width: 640px\)[\s\S]*\.spo-compact__head-row[\s\S]*display: none/)
  assert.match(cssSrc, /grid-template-columns: minmax\(0, 1fr\) auto;/)
  assert.doesNotMatch(
    cssSrc.match(/@media \(max-width: 640px\)[\s\S]*/)[0],
    /var\(--spo-compact-cols/
  )
  ok('mobile media query overrides the grid literally, never references --spo-compact-cols — desktop resize/reorder cannot leak into the mobile card layout')

  console.log(`\nVerification completed (${checks}/${checks} tests, exit 0)\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
