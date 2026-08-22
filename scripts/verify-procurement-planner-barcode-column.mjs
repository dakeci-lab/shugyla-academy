#!/usr/bin/env node
/**
 * Procurement planner: separate «Штрихкод» column after «Товар».
 *
 * Usage:
 *   npm run verify:procurement-planner-barcode-column
 */

import fs from 'node:fs'
import path from 'node:path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))
globalThis.__VITE_ENV__ = {}

let checks = 0

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function assert(label, condition) {
  checks += 1
  if (!condition) throw new Error(`FAIL: ${label}`)
  console.log(`  ✓ ${label}`)
}

const planner = read('src/components/procurement/ProcurementPlannerView.jsx')
const plannerCss = read('src/components/procurement/ProcurementPlannerView.css')
const planExport = read('src/utils/procurementPlanExport.js')

const registry = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/procurementPlannerColumnRegistry.js')).href
)
const layout = await import(pathToFileURL(path.join(ROOT, 'src/utils/plannerColumnLayout.js')).href)

const defaults = registry.getDefaultPlannerColumnSettings()
const visible = layout.getVisibleColumns(defaults)

assert('default visible column count 21', visible.length === 21)

assert(
  'dynamic thead via renderPlannerColumnHeader',
  planner.includes('renderPlannerColumnHeader') &&
    planner.includes('visibleColumns.map((col) => renderPlannerColumnHeader(col))')
)

assert(
  'product before barcode in default registry order',
  visible.findIndex((col) => col.columnName === 'product') <
    visible.findIndex((col) => col.columnName === 'barcode')
)

assert(
  'SKU row: barcode not inside proc-planner__product',
  !/proc-planner__product[\s\S]{0,180}<span title=\{item\.barcode\}/.test(planner)
)

assert(
  'SKU row: barcode cell with title in renderPlannerSkuCell',
  /case 'barcode':[\s\S]{0,400}title=\{item\.barcode/.test(planner)
)

assert(
  'SKU barcode cell does not use em-dash fallback',
  !/case 'barcode':[\s\S]{0,200}\|\|\s*'—'/.test(planner)
)

assert(
  'tree group row: locked-left cells + plannerTreeTailColSpan',
  planner.includes('getVisibleLockedLeftColumns(visibleColumns)') &&
    planner.includes('colSpan={plannerTreeTailColSpan(visibleColumns)}') &&
    planner.includes('className="proc-planner__tree-group-tail"')
)

assert(
  'loading/empty rows use visibleColumnCount',
  planner.includes('colSpan={visibleColumnCount}') && !planner.includes('TABLE_COL_SPAN')
)

assert(
  'default barcode sticky left 220px via computeStickyLeft',
  layout.computeStickyLeft('barcode', visible) === 220
)

assert(
  'CSS no hardcoded sticky-barcode left (inline runtime)',
  plannerCss.includes('.proc-planner__sticky-barcode') &&
    !/\.proc-planner__sticky-barcode\s*\{[^}]*left:\s*13\.75rem/.test(plannerCss)
)

assert(
  'product column ~11rem, barcode ~8.5rem',
  /\.proc-planner__col-product\s*\{[^}]*width:\s*11rem/.test(plannerCss) &&
    /\.proc-planner__col-barcode\s*\{[^}]*width:\s*8\.5rem/.test(plannerCss)
)

assert(
  'barcode column tabular-nums + ellipsis',
  /\.proc-planner__col-barcode[\s\S]{0,200}font-variant-numeric:\s*tabular-nums/.test(plannerCss) &&
    /\.proc-planner__col-barcode[\s\S]{0,260}text-overflow:\s*ellipsis/.test(plannerCss)
)

assert(
  'SKU sticky hover includes barcode',
  plannerCss.includes('proc-planner__sku-row:hover > td.proc-planner__sticky-barcode')
)

assert(
  'mobile: labeled Штрихкод in card-grid',
  planner.includes('Штрихкод') &&
    planner.includes('proc-planner__card-barcode') &&
    !/proc-planner__card-top[\s\S]{0,200}<span>\{item\.barcode\}<\/span>/.test(planner)
)

assert(
  'search placeholder unchanged',
  planner.includes('placeholder="Товар или штрихкод…"')
)

assert(
  'PLAN_EXPORT_COLUMNS unchanged (5 cols)',
  /PLAN_EXPORT_COLUMNS = Object\.freeze\(\[\s*'№',\s*'Товар',\s*'Штрихкод',\s*'Поставщик',\s*'Заказ',?\s*\]\)/.test(
    planExport
  )
)

console.log(`\n${checks}/${checks} checks passed`)
