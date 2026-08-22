#!/usr/bin/env node
/**
 * Procurement planner: separate «Штрихкод» column after «Товар».
 *
 * Usage:
 *   npm run verify:procurement-planner-barcode-column
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

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

assert(
  'TABLE_COL_SPAN = 6 + PLANNER_WEEK_COLUMN_COUNT + 7',
  /TABLE_COL_SPAN\s*=\s*6\s*\+\s*PLANNER_WEEK_COLUMN_COUNT\s*\+\s*7/.test(planner)
)

assert(
  'thead: Товар → Штрихкод with sticky classes',
  /<th className="proc-planner__col-product proc-planner__sticky-product">Товар<\/th>[\s\S]*?<th className="proc-planner__col-barcode proc-planner__sticky-barcode">Штрихкод<\/th>/.test(
    planner
  )
)

assert(
  'SKU row: barcode not inside proc-planner__product',
  !/proc-planner__product[\s\S]{0,180}<span title=\{item\.barcode\}/.test(planner)
)

assert(
  'SKU row: dedicated barcode td with title',
  /proc-planner__col-barcode proc-planner__sticky-barcode[\s\S]*?title=\{item\.barcode/.test(
    planner
  )
)

assert(
  'SKU barcode cell does not use em-dash fallback',
  !/proc-planner__col-barcode[\s\S]{0,120}\|\|\s*'—'/.test(planner) &&
    !/proc-planner__col-barcode[\s\S]{0,120}\|\|\s*"—"/.test(planner)
)

assert(
  'tree group row: 3 leading cells + tail colspan',
  planner.includes('colSpan={TABLE_COL_SPAN - 3}') &&
    planner.includes('className="proc-planner__tree-group-tail"') &&
    /proc-planner__tree-group[\s\S]{0,800}proc-planner__sticky-barcode[\s\S]{0,400}TABLE_COL_SPAN - 3/.test(
      planner
    )
)

assert(
  'loading/empty rows use TABLE_COL_SPAN only',
  planner.includes('colSpan={TABLE_COL_SPAN}') && !planner.includes('colSpan={21}')
)

assert(
  'sticky barcode left 13.75rem',
  plannerCss.includes('.proc-planner__sticky-barcode') &&
    /\.proc-planner__sticky-barcode\s*\{[^}]*left:\s*13\.75rem/.test(plannerCss)
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
