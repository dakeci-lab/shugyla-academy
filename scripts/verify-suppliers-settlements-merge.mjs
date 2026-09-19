#!/usr/bin/env node
/**
 * «Поставщики» = the old standalone suppliers directory merged into the
 * former «Взаиморасчёты» tab (owner decision, 2026-09-19).
 *
 *   - The list (ex-«Взаиморасчёты») is now THE supplier list: every active
 *     supplier from platform_suppliers, no date range at the list level at
 *     all. Columns: name + lifetime «Текущий долг» (fetchNativeSupplierDebts,
 *     unified with «К оплате» — unaffected by this merge).
 *   - Each supplier's card owns its OWN period (defaults to the current
 *     calendar month), used only for that supplier's financial summary tiles
 *     and operation history — never the list.
 *   - The card also carries the directory's identity fields (manager/phone/
 *     order+delivery days) and the "Редактировать" entry point that used to
 *     live only on the standalone directory page.
 *   - The old umag_settlements_supplier_totals() RPC/list-perf pipeline
 *     (2026-09-18) is fully retired from the client — no period-scoped
 *     company-wide aggregate is needed any more since the list itself has no
 *     period.
 *   - Buyer/Финансист role grants (see the 20260919120000 migration) make
 *     the merged screen show the same information those roles could already
 *     reach via the two separate screens, plus what the owner asked to open
 *     up (buyer sees settlement history; финансист can view/edit the
 *     directory).
 *
 * Usage:
 *   npm run verify:suppliers-settlements-merge
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

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

const PANEL = 'src/components/suppliers/settlements/UmagSettlementsPanel.jsx'
const SERVICE = 'src/services/umagSettlementsService.js'
const SHELL = 'src/components/suppliers/finance/SupplierFinancePanel.jsx'
const NAV = 'src/platform/platformNav.js'
const APP = 'src/App.jsx'
const DEBT_SERVICE = 'src/services/supplierDebtService.js'
const GRANT_MIGRATION =
  'supabase/migrations/20260919120000_grant_supplier_finance_permissions_buyer_finansist.sql'

function main() {
  console.log('=== «Поставщики»: suppliers directory merged into settlements (2026-09-19) ===\n')

  const panel = read(PANEL)
  const service = read(SERVICE)
  const shell = read(SHELL)
  const nav = read(NAV)
  const app = read(APP)
  const debtService = read(DEBT_SERVICE)

  // --- The list has no period at all ----------------------------------------
  assert.match(panel, /const allSuppliers = suppliersReady \? getSuppliers\(\) : \[\]/)
  assert.match(
    panel,
    /const filteredUnsorted = useMemo\(\(\) => \{\s*\n\s*const base = filterSuppliers\(allSuppliers, \{ search: '', showArchived: appliedShowArchived \}\)/
  )
  assert.match(panel, /\(debtByPlatformId\.get\(b\.id\) \|\| 0\) - \(debtByPlatformId\.get\(a\.id\) \|\| 0\)/)
  assert.match(panel, /<PgtFoot/)
  assert.match(panel, /import \{ PgtFoot, PgtHead, PgtRow, PgtTable \} from '..\/..\/platform\/PlatformGridTable'/)
  assert.match(panel, /import FilterComboField from '..\/..\/platform\/FilterComboField'/)
  assert.doesNotMatch(panel, /PlatformSearchToolbar/)
  ok('the search box is gone — supplier search lives inside the shared «Фильтр» popover (FilterComboField, same as «К оплате»); the list is built from getSuppliers()+filterSuppliers(), sorted by balance descending with a pinned total row — the full directory, not a date-scoped aggregate')

  assert.doesNotMatch(panel, /fetchUmagSettlementsSupplierTotals/)
  assert.doesNotMatch(service, /export async function fetchUmagSettlementsSupplierTotals/)
  assert.doesNotMatch(service, /export function resolveRowCanonicalDebt/)
  assert.doesNotMatch(service, /export function computeSettlementsListTotals/)
  assert.doesNotMatch(service, /function ensureSettlementRow/)
  assert.doesNotMatch(service, /function supplierSettlementKey/)
  assert.doesNotMatch(debtService, /export async function resolvePlatformSupplierIdsByUmagIds/)
  ok('the old company-wide period-scoped aggregate (umag_settlements_supplier_totals RPC + its JS wrapper) is fully retired, not left as dead code')

  assert.match(
    panel,
    /const loadDebts = useCallback\(\(\) => \{[\s\S]{0,400}fetchNativeSupplierDebts\(\{ platformSupplierIds: allSuppliers\.map\(\(s\) => s\.id\) \}\)/
  )
  ok('«Текущий долг» comes from fetchNativeSupplierDebts (same lifetime formula «К оплате» uses) — unaffected by the merge')

  assert.match(panel, /label: 'Поставщик'[\s\S]{0,400}canViewFinance[\s\S]{0,120}label: 'Баланс'/)
  ok('the list has exactly two possible columns — supplier name, and «Баланс» (renamed from «Текущий долг») gated by canViewFinance — no leftover period columns (Приёмок/Сумма/Возвраты/Оплачено)')

  // --- Each card owns its own period -----------------------------------------
  const detailFn = panel.slice(
    panel.indexOf('function UmagSupplierDetail('),
    panel.indexOf('export default function UmagSettlementsPanel(')
  )
  assert.match(detailFn, /const defaultPeriod = useMemo\(\(\) => getSettlementsPeriodDefaults\(\), \[\]\)/)
  assert.match(detailFn, /const \[dateFrom, setDateFrom\] = useState\(defaultPeriod\.dateFrom\)/)
  assert.match(detailFn, /const \[dateTo, setDateTo\] = useState\(defaultPeriod\.dateTo\)/)
  ok('UmagSupplierDetail owns its own dateFrom/dateTo state, defaulting to the current calendar month (getSettlementsPeriodDefaults)')

  const listFn = panel.slice(
    panel.indexOf('export default function UmagSettlementsPanel('),
    panel.indexOf('function toggleFilter()')
  )
  assert.doesNotMatch(listFn, /useState\(.*dateFrom/i)
  ok('the top-level list component itself holds no dateFrom/dateTo state — period lives only inside the card')

  assert.match(
    detailFn,
    /fetchUmagSupplierOperationHistory\(\{\s*\n\s*platformSupplierId: supplier\.id,\s*\n\s*umagSupplierId: supplier\.umagSupplierId,\s*\n\s*dateFrom,\s*\n\s*dateTo,/
  )
  ok('the card fetches its own scoped history for its own period — never the list-wide dateFrom/dateTo')

  // 2026-09-19b: the owner found the 5-tile summary block (Сумма приёмок/
  // Возвраты/Оплачено/Текущий долг/Количество приёмок) redundant with the
  // operation history rows right below it — removed. The history fetch no
  // longer computes those period aggregates at all (nothing renders them).
  assert.doesNotMatch(service, /supplyCount: supplies\.length/)
  assert.doesNotMatch(service, /returnAmount: returns\.reduce/)
  assert.match(
    service,
    /return \{\s*\n\s*operations: history\.operations,\s*\n\s*openingBalance,\s*\n\s*closingBalance: history\.closingBalance,\s*\n\s*error: null,\s*\n\s*\}/
  )
  ok('fetchUmagSupplierOperationHistory no longer computes/returns period aggregates — the 5-tile summary block that consumed them was removed entirely')

  assert.doesNotMatch(panel, /function SummaryCard\(/)
  assert.doesNotMatch(panel, /umag-settlements__totals/)
  ok('the SummaryCard component and its wrapping grid are gone, not left as dead code')

  // --- Identity card: directory fields + «Баланс» (ex-«Текущий долг») -------
  assert.match(
    panel,
    /function SupplierIdentityCard\(\{ supplier, canEdit, canViewFinance, debtLoading, onEdit \}\)/
  )
  assert.match(panel, /<dt>Юр\. название<\/dt>/)
  assert.match(panel, /<dt>БИН<\/dt>/)
  assert.match(panel, /<dt>Менеджер<\/dt>/)
  assert.match(panel, /<dt>Дни заказа<\/dt>/)
  assert.match(panel, /<dt>Дни доставки<\/dt>/)
  assert.match(panel, /<dt>Способ оплаты<\/dt>/)
  assert.match(panel, /<dt>Срок оплаты<\/dt>/)
  assert.match(
    panel,
    /\{canEdit \? \(\s*\n\s*<IconActionButton label="Редактировать" variant="primary" onClick=\{onEdit\}>/
  )
  ok('SupplierIdentityCard now also shows legal name/BIN/payment method/payment term alongside manager/phone/order+delivery days and the edit action — one denser card, no address field (owner: «адреса нам не нужна»)')
  assert.doesNotMatch(panel, /<dt>.*[Аа]дрес.*<\/dt>/)
  ok('no address field was added to the identity card, per the owner\'s explicit exclusion')

  assert.match(
    panel,
    /<SupplierIdentityCard\s*\n\s*supplier=\{supplier\}\s*\n\s*canEdit=\{canEditSupplier\}\s*\n\s*canViewFinance=\{canViewFinance\}\s*\n\s*debtLoading=\{debtLoading\}\s*\n\s*onEdit=\{onEdit\}\s*\n\s*\/>/
  )
  ok('the identity card is always rendered (independent of canViewFinance) but is itself given canViewFinance so only its own «Баланс» line is gated')

  // --- «Баланс» (ex-«Текущий долг») lives inside the identity card, gated ---
  assert.match(
    panel,
    /\{canViewFinance \? \(\s*\n\s*<div>\s*\n\s*<dt>Баланс<\/dt>\s*\n\s*<dd className=\{supplier\.debt > 0 \? 'umag-settlements__debt' : undefined\}>/
  )
  ok('«Текущий долг» was renamed to «Баланс» everywhere (list header, mobile card, identity card) and stays gated by canViewFinance inside the identity card')

  // --- Nav: one destination, not two ------------------------------------------
  assert.doesNotMatch(nav, /id: 'suppliers',\s*\n\s*path: '\/platform\/suppliers',/)
  assert.match(nav, /id: 'supplier-finance',\s*\n\s*path: '\/platform\/supplier-finance',\s*\n\s*label: 'Расчёты',/)
  ok('platformNav.js no longer has a separate «Поставщики» nav item — «Расчёты» is the one destination')

  assert.match(shell, /\{ id: 'settlements', label: 'Поставщики' \}/)
  ok('the settlements tab inside «Расчёты» is relabeled «Поставщики»')

  // --- Old directory routes redirect, preserving state for the payment-terms deep link ---
  assert.match(app, /function SupplierDirectoryRedirect\(\)/)
  assert.match(
    app,
    /return <Navigate to="\/platform\/supplier-finance\?tab=settlements" replace state=\{state\} \/>/
  )
  assert.doesNotMatch(app, /<SuppliersPage \/>/)
  assert.doesNotMatch(app, /<SupplierDetailPage \/>/)
  ok('/platform/suppliers and /platform/suppliers/:id redirect into the merged screen, forwarding location.state (openEditId/focusSection/returnTo)')

  // 2026-09-19 cleanup: the now-fully-unreachable standalone directory page
  // and its table were deleted outright rather than left as dead code.
  assert.equal(fs.existsSync(path.join(ROOT, 'src/pages/platform/suppliers')), false)
  assert.equal(fs.existsSync(path.join(ROOT, 'src/components/suppliers/SupplierTable.jsx')), false)
  assert.equal(fs.existsSync(path.join(ROOT, 'src/components/suppliers/SupplierTable.css')), false)
  ok('the retired standalone directory page/table (SuppliersPage.jsx, SupplierTable.jsx/css) are deleted, not left unreachable in the tree')

  assert.match(
    panel,
    /const openEditId = location\.state\?\.openEditId\s*\n\s*if \(!openEditId \|\| !canEdit\) return/
  )
  ok('the merged screen itself still honors the legacy openEditId deep link (opens the edit modal directly, same as the old directory)')

  // --- Role grants behind the merge --------------------------------------------
  const grant = read(GRANT_MIGRATION)
  assert.match(grant, /r\.code = 'buyer'\s*\n\s*and p\.code = 'umag\.settlements\.view'/)
  assert.match(grant, /r\.code = 'finansist_2'\s*\n\s*and p\.code in \('suppliers\.view', 'suppliers\.edit'\)/)
  ok('the 2026-09-19 grant migration gives Закупщик settlement visibility and Финансист full directory access — otherwise merging would have silently taken away suppliers.view-only access for Закупщик')

  console.log(`\n${checks} checks passed`)
}

main()
