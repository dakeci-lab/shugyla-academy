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

  const order = { status: PURCHASE_STATUS.AWAITING_RECEIVING }
  assert(
    'return allowed while the warehouse has not started',
    canReturnPurchaseToDraft(order, { receivingStarted: false })
  )
  assert(
    'return blocked once the warehouse started',
    !canReturnPurchaseToDraft(order, { receivingStarted: true })
  )
  assert('missing order is never returnable', !canReturnPurchaseToDraft(null))

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
  assert(
    'cloud cancel also cancels the receiving document',
    /export async function cancelPurchaseOrderCloud[\s\S]{0,600}cancelReceivingByPurchaseIdCloud\(orderId\)/.test(cloud)
  )
  assert(
    'local cancel also cancels the receiving document',
    /export async function cancelPurchaseOrder\(orderId\)[\s\S]{0,300}cancelReceivingByPurchaseIdLocal\(orderId\)/.test(local)
  )

  assert(
    'return re-checks receiving state before writing',
    /returnPurchaseOrderToDraftCloud[\s\S]{0,1400}fetchReceivingLockStateByPurchaseIdCloud\(orderId\)/.test(cloud),
    'the warehouse may start receiving between render and click'
  )
  assert(
    'return clears the receiving link on the order',
    /returnPurchaseOrderToDraftCloud[\s\S]{0,1800}transferredToReceiving: false[\s\S]{0,200}receivingDocumentId: null/.test(cloud)
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

  // Export stays two one-click icons — merging them was rejected.
  assert('Excel export icon kept', src.includes('aria-label="Экспорт Excel"'))
  assert('PDF export icon kept', src.includes('aria-label="Экспорт PDF"'))
  assert(
    'no format-choice dropdown was introduced',
    !/Скачать[\s\S]{0,80}(выбор|формат)/i.test(src)
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
  stageDetailPage()
  stageListPage()
  console.log(`=== All ${checks} checks passed ===\n`)
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`)
  process.exit(1)
})
