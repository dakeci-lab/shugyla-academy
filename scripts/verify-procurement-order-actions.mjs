#!/usr/bin/env node
/**
 * Verification for purchase order actions: return to draft, honest cancel,
 * cancelled-orders filter.
 *
 * Covers PR 2 of docs/procurement/order-actions-ux.md.
 * Pure-logic checks run the real helpers; UI checks assert on source.
 *
 * Usage:
 *   npm run verify:procurement-order-actions
 */

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// App sources are written for Vite: extensionless imports, JSON imports and
// import.meta.env. Empty env keeps the app in local mode — no Supabase, no network.
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

const DETAIL_PAGE = 'src/pages/platform/procurement/PurchaseDetailPage.jsx'
const LIST_PAGE = 'src/pages/platform/procurement/ProcurementPage.jsx'
const PURCHASE_CLOUD = 'src/services/purchaseSupabaseAdapter.js'
const PURCHASE_LOCAL = 'src/services/purchaseLocalAdapter.js'
const PURCHASE_SERVICE = 'src/services/purchaseDataService.js'
const RECEIVING_CLOUD = 'src/services/receivingSupabaseAdapter.js'
const RECEIVING_LOCAL = 'src/services/receivingLocalAdapter.js'
const PLANNER_VIEW = 'src/components/procurement/ProcurementPlannerView.jsx'
const RPC_MIGRATION = 'supabase/migrations/20260812041000_procurement_order_state_rpc.sql'

let checks = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  if (!condition) fail(`${name}${detail ? ` — ${detail}` : ''}`)
  checks += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) fail(`file not found: ${relPath}`)
  return fs.readFileSync(full, 'utf8')
}

async function load(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href)
}

// ---------------------------------------------------------------------------
// Stage 1 — the rule itself
// ---------------------------------------------------------------------------

async function stageRules() {
  console.log('Stage 1: Editing boundary')

  const purchase = await load('src/utils/purchaseData.js')
  const receiving = await load('src/utils/receivingData.js')
  const { PURCHASE_STATUS, canReturnPurchaseToDraft, isPurchaseStatusReturnableToDraft } = purchase
  const { RECEIVING_STATUS, isReceivingStarted } = receiving

  assert(
    'awaiting_receiving can be returned to draft',
    isPurchaseStatusReturnableToDraft(PURCHASE_STATUS.AWAITING_RECEIVING)
  )
  assert(
    'partially received cannot be returned to draft',
    !isPurchaseStatusReturnableToDraft(PURCHASE_STATUS.PARTIALLY_RECEIVED)
  )
  assert(
    'received cannot be returned to draft',
    !isPurchaseStatusReturnableToDraft(PURCHASE_STATUS.RECEIVED)
  )
  assert(
    'cancelled cannot be returned to draft',
    !isPurchaseStatusReturnableToDraft(PURCHASE_STATUS.CANCELLED)
  )
  assert(
    'a draft is not offered the return action',
    !isPurchaseStatusReturnableToDraft(PURCHASE_STATUS.DRAFT)
  )

  const order = { status: PURCHASE_STATUS.AWAITING_RECEIVING, workflowMode: 'simple' }
  assert(
    'return allowed while the warehouse has not started',
    canReturnPurchaseToDraft(order, { receivingStarted: false })
  )
  assert(
    'return blocked once the warehouse started',
    !canReturnPurchaseToDraft(order, { receivingStarted: true })
  )
  assert('missing order is never returnable', !canReturnPurchaseToDraft(null))
  assert(
    'analytics orders cannot be returned to draft',
    !canReturnPurchaseToDraft(
      { status: PURCHASE_STATUS.AWAITING_RECEIVING, workflowMode: 'analytics' },
      { receivingStarted: false }
    )
  )

  // isReceivingStarted is the single definition shared by UI and adapters.
  assert(
    'awaiting receiving with nothing received is not started',
    !isReceivingStarted({ status: RECEIVING_STATUS.AWAITING_RECEIVING, totalReceivedQty: 0 })
  )
  assert(
    'a partial receipt counts as started',
    isReceivingStarted({ status: RECEIVING_STATUS.AWAITING_RECEIVING, totalReceivedQty: 3 })
  )
  assert(
    'in_progress counts as started',
    isReceivingStarted({ status: RECEIVING_STATUS.IN_PROGRESS, totalReceivedQty: 0 })
  )
  assert(
    'snake_case rows from the database are understood',
    isReceivingStarted({ status: RECEIVING_STATUS.AWAITING_RECEIVING, total_received_qty: 5 })
  )
  assert(
    'a cancelled document never blocks editing',
    !isReceivingStarted({ status: RECEIVING_STATUS.CANCELLED, totalReceivedQty: 99 })
  )
  assert('no document means nothing started', !isReceivingStarted(null))

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 2 — service layer wiring
// ---------------------------------------------------------------------------

function stageServices() {
  console.log('Stage 2: Service layer')

  const cloud = read(PURCHASE_CLOUD)
  const local = read(PURCHASE_LOCAL)
  const service = read(PURCHASE_SERVICE)
  const receivingCloud = read(RECEIVING_CLOUD)
  const receivingLocal = read(RECEIVING_LOCAL)

  assert(
    'cloud exposes returnPurchaseOrderToDraftCloud',
    cloud.includes('export async function returnPurchaseOrderToDraftCloud')
  )
  assert(
    'local exposes returnPurchaseOrderToDraft',
    local.includes('export async function returnPurchaseOrderToDraft')
  )
  assert(
    'orchestrator routes both modes',
    /returnPurchaseOrderToDraftCloud\(orderId\)/.test(service) &&
      /local\.returnPurchaseOrderToDraft\(orderId\)/.test(service)
  )
  assert(
    'orchestrator refreshes caches after the return',
    /export async function returnPurchaseOrderToDraft[\s\S]{0,400}afterPurchaseMutation\(\)/.test(service)
  )

  // The defect found alongside: cancelling an order left the warehouse waiting.
  // In cloud mode that guarantee now lives in the RPC (see stage 2b).
  assert(
    'local cancel also cancels the receiving document',
    /export async function cancelPurchaseOrder\(orderId\)[\s\S]{0,300}cancelReceivingByPurchaseIdLocal\(orderId\)/.test(local)
  )

  // Atomicity: the cloud path must not write two tables from the client.
  assert(
    'cloud transitions go through a single RPC call',
    /supabase\.rpc\(fnName, \{ p_order_id: orderId \}\)/.test(cloud)
  )
  assert(
    'cancel calls procurement_cancel_order',
    /cancelPurchaseOrderCloud[\s\S]{0,400}'procurement_cancel_order'/.test(cloud)
  )
  assert(
    'return to draft calls procurement_return_order_to_draft',
    /returnPurchaseOrderToDraftCloud[\s\S]{0,400}'procurement_return_order_to_draft'/.test(cloud)
  )
  assert(
    'the client no longer stitches receiving and order writes together',
    !/cancelReceivingByPurchaseIdCloud\(orderId\)/.test(cloud),
    'that sequence could half-apply'
  )

  // Soft, not destructive: no delete on the cancel path.
  assert(
    'receiving documents are cancelled, not deleted',
    /export async function cancelReceivingByPurchaseIdCloud[\s\S]{0,900}status: RECEIVING_STATUS\.CANCELLED/.test(receivingCloud) &&
      !/export async function cancelReceivingByPurchaseIdCloud[\s\S]{0,900}\.delete\(\)/.test(receivingCloud)
  )
  assert(
    'local cancel keeps the documents in storage',
    /export function cancelReceivingByPurchaseIdLocal[\s\S]{0,700}RECEIVING_STATUS\.CANCELLED/.test(receivingLocal)
  )
  assert(
    'both adapters use the shared isReceivingStarted definition',
    receivingCloud.includes('isReceivingStarted') && receivingLocal.includes('isReceivingStarted'),
    'no duplicated ad-hoc status arithmetic'
  )

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 2b — the RPC migration
// ---------------------------------------------------------------------------

function stageRpcMigration() {
  console.log('Stage 2b: Transactional RPC migration')

  const sql = read(RPC_MIGRATION)

  for (const fn of ['procurement_return_order_to_draft', 'procurement_cancel_order']) {
    const body = sql.slice(
      sql.indexOf(`create or replace function public.${fn}(`),
      sql.indexOf(`comment on function public.${fn}(`)
    )
    assert(`${fn} is defined`, body.length > 0)
    assert(`${fn} is security definer`, /security definer/.test(body))
    assert(`${fn} pins search_path`, /set search_path = ''/.test(body))
    assert(`${fn} locks the order row`, /from public\.purchase_orders[\s\S]{0,120}for update/.test(body))
    assert(
      `${fn} locks live receiving documents`,
      /from public\.receiving_documents as d[\s\S]{0,200}for update/.test(body)
    )
    const receivingLockAt = body.search(/from public\.receiving_documents as d[\s\S]{0,200}for update/)
    assert(
      `${fn} re-checks receiving state only after locking`,
      receivingLockAt >= 0 && receivingLockAt < body.indexOf('into v_receiving_started'),
      'reading the guard before the lock leaves a race'
    )
    assert(
      `${fn} never touches procurement_snapshots`,
      !/procurement_snapshot/.test(body)
    )
    assert(
      `${fn} cancels the receiving documents of the order`,
      /update public\.receiving_documents[\s\S]{0,200}set status = 'cancelled'/.test(body),
      'otherwise the warehouse keeps waiting'
    )
    assert(
      `${fn} writes the order row too`,
      /update public\.purchase_orders[\s\S]{0,300}where id = p_order_id/.test(body),
      'both writes must live in the same transaction'
    )
    assert(
      `${fn} requires procurement.edit`,
      /perform auth_private\.require_procurement_edit\(\)/.test(body)
    )
    assert(
      `${fn} speaks Russian to the user`,
      /raise exception '[А-Яа-яЁё]/.test(body),
      'raw English must never reach the buyer'
    )
    assert(
      `${fn} owner is reset to postgres`,
      new RegExp(`alter function public\\.${fn}\\(uuid\\) owner to postgres`).test(sql)
    )
    assert(
      `${fn} execute is revoked from public and anon`,
      new RegExp(`revoke all on function public\\.${fn}\\(uuid\\) from public`).test(sql) &&
        new RegExp(`revoke all on function public\\.${fn}\\(uuid\\) from anon`).test(sql)
    )
    assert(
      `${fn} execute is granted only to authenticated and service_role`,
      new RegExp(`grant execute on function public\\.${fn}\\(uuid\\) to authenticated`).test(sql) &&
        new RegExp(`grant execute on function public\\.${fn}\\(uuid\\) to service_role`).test(sql)
    )
  }

  assert(
    'the permission guard checks an authenticated user',
    /require_procurement_edit[\s\S]{0,500}auth\.uid\(\) is null/.test(sql)
  )
  assert(
    'the permission guard checks procurement.edit',
    /current_user_has_permission\('procurement\.edit'\)/.test(sql)
  )
  // Comments legitimately mention the table; only real statements matter.
  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  assert(
    'the migration grants no new privilege on procurement_snapshots',
    !/grant[^;]*procurement_snapshots/i.test(statements)
  )
  assert(
    'the migration touches no snapshot table at all',
    !/procurement_snapshot/i.test(statements)
  )

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 3 — order card
// ---------------------------------------------------------------------------

function stageDetailPage() {
  console.log('Stage 3: Order card')

  const src = read(DETAIL_PAGE)

  assert('card calls returnPurchaseOrderToDraft', src.includes('returnPurchaseOrderToDraft'))
  assert(
    'edit button is gated by canReturnToDraft',
    /canReturnToDraft && \(/.test(src)
  )
  assert(
    'edit availability comes from the shared helper',
    /canReturnPurchaseToDraft\(order, \{ receivingStarted \}\)/.test(src)
  )
  assert(
    'a hint replaces the button once receiving started',
    src.includes('editingBlockedByReceiving') && src.includes('RECEIVING_STARTED_MESSAGE')
  )

  // The original complaint: the page ran away and the order looked deleted.
  assert('cancel no longer navigates away', !/navigate\(/.test(src))
  assert('useNavigate is no longer imported', !src.includes('useNavigate'))
  assert(
    'cancel refreshes the card in place',
    /async function handleCancel[\s\S]{0,900}await refresh\(\)/.test(src)
  )
  assert('cancel wording is explicit', src.includes('Отменить заказ'))
  assert('draft removal is a separate label', src.includes('Удалить черновик'))
  assert(
    'cancel and draft removal never show together',
    src.includes('canCancelOrder') &&
      src.includes('canDiscardDraft') &&
      /canCancelOrder =[\s\S]{0,400}status !== PURCHASE_STATUS\.DRAFT/.test(src)
  )

  // One download button with a compact menu — owner's requirement.
  assert('single download button', src.includes('aria-label="Скачать заказ"'))
  assert(
    'the two separate export icons are gone',
    !src.includes('aria-label="Экспорт Excel"') && !src.includes('aria-label="Экспорт PDF"')
  )
  assert('download button opens a menu', /aria-haspopup="menu"/.test(src))
  assert(
    'menu offers Excel and PDF',
    /role="menuitem"[\s\S]{0,200}Excel/.test(src) && /role="menuitem"[\s\S]{0,200}PDF/.test(src)
  )
  assert(
    'menu closes on outside click and Escape',
    /mousedown/.test(src) && /event\.key === 'Escape'/.test(src)
  )
  assert('menu closes once an export starts', /setExportMenuOpen\(false\)/.test(src))

  // No raw error text reaches the buyer.
  assert(
    'errors are mapped to Russian',
    !/err\.message \|\|/.test(src) && src.includes('toProcurementUserMessage')
  )

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 3b — planner: quantity needs a selected supplier
// ---------------------------------------------------------------------------

async function stagePlanner() {
  console.log('Stage 3b: Planning quantity gate')

  const ux = await load('src/utils/procurementPlannerUx.js')
  const { canEditItemQuantity, QUANTITY_REQUIRES_SUPPLIER_HINT } = ux

  const supplierA = 'aaaaaaaa-0000-4000-8000-000000000001'
  const supplierB = 'bbbbbbbb-0000-4000-8000-000000000002'
  const item = { id: 'i1', platform_supplier_id: supplierA }
  const filterOptions = { suppliers: [{ id: supplierA }, { id: supplierB }] }

  assert(
    'no supplier selected → quantity is not editable',
    !canEditItemQuantity(item, { filterOptions, selectedSupplierId: '' })
  )
  assert(
    'supplier selected → its own rows are editable',
    canEditItemQuantity(item, { filterOptions, selectedSupplierId: supplierA })
  )
  assert(
    'rows of another supplier stay locked',
    !canEditItemQuantity(item, { filterOptions, selectedSupplierId: supplierB })
  )
  // Повторный заказ тому же поставщику разрешён: прошлый заказ больше не блокирует ввод.
  assert(
    'a row already in a generated order stays editable for the next order',
    canEditItemQuantity(
      { ...item, generated_purchase_order_id: 'po-1' },
      { filterOptions, selectedSupplierId: supplierA }
    )
  )
  assert(
    'a supplier whose order is created can be ordered again',
    canEditItemQuantity(item, {
      filterOptions: { suppliers: [{ id: supplierA, generatedOrderId: 'po-1' }] },
      selectedSupplierId: supplierA,
    })
  )
  assert('missing item is never editable', !canEditItemQuantity(null, { selectedSupplierId: supplierA }))
  assert('hint text is Russian', /[А-Яа-яЁё]/.test(QUANTITY_REQUIRES_SUPPLIER_HINT))

  const view = read(PLANNER_VIEW)
  assert(
    'the input is replaced by a dash when not editable',
    /!canEditQuantity\(item\)/.test(view) && /proc-planner__qty-value is-empty/.test(view)
  )
  // Раньше проверялось имя handleFinalChange — обработчик давно называется
  // commitQuantity, из-за чего проверка была «красной» ещё до этой задачи.
  assert(
    'the save handler guards against a stale blur event',
    /async function commitQuantity[\s\S]{0,600}if \(!canEditQuantity\(item\)\)[\s\S]{0,400}return \{ ok: false/.test(
      view
    )
  )
  assert(
    'reset is guarded too',
    /async function handleReset[\s\S]{0,120}if \(!canEditQuantity\(item\)\) return/.test(view)
  )
  assert(
    'the gate consults the selected supplier filter',
    /selectedSupplierId: filters\.platformSupplierId/.test(view)
  )
  assert(
    'planner errors are mapped to Russian',
    !/err\.message \|\|/.test(view) && view.includes('toProcurementUserMessage')
  )

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 4 — list filter
// ---------------------------------------------------------------------------

function stageListPage() {
  console.log('Stage 4: Cancelled filter')

  const src = read(LIST_PAGE)

  assert('list keeps a cancelled-orders collection', src.includes('cancelledOrders'))
  assert('filter state exists', /const \[showCancelled, setShowCancelled\] = useState\(false\)/.test(src))
  assert(
    'day list switches source by the filter',
    /const source = showCancelled \? cancelledOrders : activeOrders/.test(src)
  )
  assert('filter control is labelled', src.includes('Отменённые'))
  assert(
    'filter buttons report their state to assistive tech',
    /aria-pressed=\{!showCancelled\}/.test(src) && /aria-pressed=\{showCancelled\}/.test(src)
  )
  assert(
    'switching the filter resets pagination',
    /setOrdersPage\(1\)[\s\S]{0,120}\[selectedDateKey, ordersPageSize, showCancelled\]/.test(src)
  )
  assert(
    'calendar counters still ignore cancelled orders',
    /for \(const order of activeOrders\)/.test(src),
    'cancelled orders must not inflate day counts'
  )

  console.log('')
}

async function main() {
  console.log('=== Purchase order actions verification ===\n')
  await stageRules()
  stageServices()
  stageRpcMigration()
  stageDetailPage()
  await stagePlanner()
  stageListPage()
  console.log(`=== All ${checks} checks passed ===\n`)
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`)
  process.exit(1)
})
