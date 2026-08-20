#!/usr/bin/env node
/**
 * Verification for the repeat-orders planner UI:
 * compact header strip, action chips, «Заказ» column history, non-blocking
 * repeat orders, and the attempt-key lifecycle.
 *
 * Usage:
 *   npm run verify:procurement-repeat-orders-ui
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const UX_MODULE = 'src/utils/procurementPlannerUx.js'
const PLANNER_VIEW = 'src/components/procurement/ProcurementPlannerView.jsx'
const PLANNER_CSS = 'src/components/procurement/ProcurementPlannerView.css'
const PAGE_VIEW = 'src/pages/platform/procurement/ProcurementPage.jsx'
const PAGE_CSS = 'src/pages/platform/procurement/ProcurementPage.css'

let testsRun = 0
let testsPassed = 0

function assert(name, condition, detail = '') {
  testsRun += 1
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`)
  testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

async function loadUx() {
  return import(pathToFileURL(path.join(ROOT, UX_MODULE)).href)
}

async function loadFingerprint() {
  return import(
    pathToFileURL(path.join(ROOT, 'src/utils/procurementAttemptFingerprint.js')).href
  )
}

// ---------------------------------------------------------------------------
// Stage 1 — compact header: snapshot line + action chips
// ---------------------------------------------------------------------------

async function stageHeaderStrip() {
  console.log('Stage 1: Compact header (snapshot + chips)')
  const ux = await loadUx()

  const ready = ux.buildSnapshotHeadline({
    hasSnapshot: true,
    status: 'ready',
    syncedAtLabel: '13.08.2026, 11:04',
    itemCount: 9807,
    negativeStockCount: 1479,
  })
  assert(
    'snapshot collapses to one line: date · SKU',
    ready.text === '13.08.2026, 11:04 · 9807 SKU'
  )
  assert('negative stock stays a separate warn token', ready.warnText === '1479 отриц.')
  assert(
    'the full wording survives in the title',
    ready.title.startsWith('Снимок UMAG · Обновлён 13.08.2026, 11:04 · 9807 SKU') &&
      ready.title.includes('с отрицательным остатком')
  )
  assert(
    'a clean snapshot has no warn token',
    ux.buildSnapshotHeadline({
      hasSnapshot: true,
      status: 'ready',
      syncedAtLabel: '13.08.2026, 11:04',
      itemCount: 10,
      negativeStockCount: 0,
    }).warnText === null
  )
  assert(
    'syncing / failed / missing snapshots each get their own text',
    ux.buildSnapshotHeadline({ hasSnapshot: true, status: 'syncing' }).text ===
      'Синхронизация…' &&
      ux.buildSnapshotHeadline({ hasSnapshot: true, status: 'failed' }).text ===
        'Ошибка синхронизации' &&
      ux.buildSnapshotHeadline({ hasSnapshot: false }).text === 'Нет снимка'
  )

  assert(
    'a clean plan produces no chips at all',
    ux.getPlannerAlertChips({ unassignedOrderableCount: 0, suppliers: [] }).length === 0
  )

  const chips = ux.getPlannerAlertChips({
    unassignedOrderableCount: 112,
    suppliers: [
      { id: 's1', name: 'Холод', generatedOrderId: 'po-1', pendingPositions: 3 },
      { id: 's2', name: 'Агро', pendingPositions: 2 },
      { id: 's3', name: 'Опт', generatedOrderId: 'po-3', pendingPositions: 0 },
    ],
  })
  assert('both counters produce exactly two chips', chips.length === 2)
  assert(
    'unassigned chip carries its count',
    chips[0].id === 'unassigned' && chips[0].label === 'Без поставщика' && chips[0].count === 112
  )
  assert(
    'inconsistent chip knows which suppliers to jump to',
    chips[1].id === 'inconsistent' &&
      chips[1].count === 1 &&
      chips[1].supplierIds.join(',') === 's1'
  )
  assert(
    'every chip has a human-readable title',
    chips.every((chip) => typeof chip.title === 'string' && chip.title.length > 10)
  )
  assert(
    'the backend aggregate overrides the legacy discrepancy derivation',
    ux.getPlannerAlertChips({
      suppliers: [
        { id: 's1', name: 'Холод', generatedOrderId: 'po-1', pendingPositions: 3, inconsistentPositions: 0 },
      ],
    }).length === 0
  )

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 2 — «Заказ» column: history is informative, never blocking
// ---------------------------------------------------------------------------

async function stageOrderColumn() {
  console.log('Stage 2: «Заказ» column history + repeat orders')
  const ux = await loadUx()

  const untouched = { id: 'i1', platformSupplierId: 's1', finalOrderQty: 0 }
  assert(
    'a row without history renders nothing but a dash',
    ux.getItemOrderHistory(untouched).documents === 0 &&
      ux.formatOrderHistoryLabel(ux.getItemOrderHistory(untouched)) === null &&
      ux.formatOrderHistoryTitle(ux.getItemOrderHistory(untouched)) === null
  )

  const legacy = {
    id: 'i2',
    platformSupplierId: 's1',
    finalOrderQty: 5,
    generatedPurchaseOrderId: 'po-1',
  }
  const legacyHistory = ux.getItemOrderHistory(legacy)
  assert(
    'a single generated order id is never inflated into a richer history',
    legacyHistory.documents === 1 &&
      legacyHistory.qty === 0 &&
      legacyHistory.source === 'fallback'
  )
  assert(
    'the history line matches the agreed wording',
    ux.formatOrderHistoryLabel(legacyHistory) === 'Заказано · 1 документ'
  )
  assert(
    'pointer-only fallback never treats current final qty as historical ordered qty',
    ux.getItemOrderHistory({ ...legacy, finalOrderQty: 0 }).qty === 0 &&
      ux.getItemOrderHistory({ ...legacy, finalOrderQty: 8 }).qty === 0 &&
      ux.formatOrderHistoryTitle(legacyHistory) === 'Заказано · 1 документ'
  )

  const aggregated = ux.getItemOrderHistory({
    ...legacy,
    ordered_qty_total: 17,
    ordered_document_count: 2,
  })
  assert(
    'snake_case aggregates are used when present',
    aggregated.source === 'aggregate' && aggregated.qty === 17 && aggregated.documents === 2
  )
  const camel = ux.getItemOrderHistory({ orderedQtyTotal: 4, orderedDocumentCount: 1 })
  assert(
    'camelCase aggregates are accepted too',
    camel.source === 'aggregate' && camel.qty === 4 && camel.documents === 1
  )
  assert(
    'a zeroed aggregate wins over a stale order id',
    ux.getItemOrderHistory({ ...legacy, ordered_document_count: 0 }).documents === 0
  )
  assert(
    'documents default to one when only the qty aggregate arrives',
    ux.getItemOrderHistory({ ordered_qty_total: 9 }).documents === 1
  )

  assert(
    'plural forms are correct for 1 / 2 / 5 / 11',
    ux.formatOrderHistoryLabel({ documents: 1 }) === 'Заказано · 1 документ' &&
      ux.formatOrderHistoryLabel({ documents: 2 }) === 'Заказано · 2 документа' &&
      ux.formatOrderHistoryLabel({ documents: 5 }) === 'Заказано · 5 документов' &&
      ux.formatOrderHistoryLabel({ documents: 11 }) === 'Заказано · 11 документов'
  )

  assert(
    'a generated snapshot stays writable so the buyer can order again',
    ux.isSnapshotQuantityEditable('ready') &&
      ux.isSnapshotQuantityEditable('partially_generated') &&
      ux.isSnapshotQuantityEditable('generated') &&
      !ux.isSnapshotQuantityEditable('syncing') &&
      !ux.isSnapshotQuantityEditable('failed')
  )

  assert(
    'a generated row of the selected supplier stays editable',
    ux.canEditItemQuantity(legacy, { selectedSupplierId: 's1' }) === true
  )
  assert(
    'a row of another supplier is still not editable',
    ux.canEditItemQuantity(legacy, { selectedSupplierId: 's2' }) === false
  )
  assert(
    'no supplier selected is still not editable',
    ux.canEditItemQuantity(legacy, { selectedSupplierId: '' }) === false
  )

  const orderedSupplier = {
    id: 's1',
    orderablePositions: 2,
    pendingPositions: 0,
    generatedPositions: 2,
    generatedOrderId: 'po-1',
  }
  assert(
    'create is not blocked by an existing order',
    ux.getCreateOrderDisabledReason({
      canGenerate: true,
      snapshotEditable: true,
      supplierId: 's1',
      summary: orderedSupplier,
    }) == null
  )
  assert(
    'create is blocked only by real reasons',
    ux.getCreateOrderDisabledReason({
      canGenerate: false,
      snapshotEditable: true,
      supplierId: 's1',
      summary: orderedSupplier,
    }) === 'Недостаточно прав для создания заказа' &&
      ux.getCreateOrderDisabledReason({
        canGenerate: true,
        snapshotEditable: false,
        supplierId: 's1',
        summary: orderedSupplier,
      }) === 'Снимок недоступен для формирования заказа' &&
      ux.getCreateOrderDisabledReason({
        canGenerate: true,
        snapshotEditable: true,
        supplierId: 's1',
        summary: orderedSupplier,
        pendingSaveCount: 1,
      }) === 'Дождитесь сохранения количества' &&
      ux.getCreateOrderDisabledReason({
        canGenerate: true,
        snapshotEditable: true,
        supplierId: 's1',
        summary: orderedSupplier,
        hasSaveError: true,
      }) === 'Исправьте ошибку сохранения количества' &&
      ux.getCreateOrderDisabledReason({
        canGenerate: true,
        snapshotEditable: true,
        supplierId: 's1',
        summary: orderedSupplier,
        generating: true,
      }) === 'Создание заказа выполняется…'
  )
  assert(
    'the only qty-related blocker is the absence of a positive qty',
    ux.getCreateOrderDisabledReason({
      canGenerate: true,
      snapshotEditable: true,
      supplierId: 's1',
      summary: { ...orderedSupplier, orderablePositions: 0 },
    }) === 'Укажите количество больше 0 хотя бы для одной позиции'
  )
  assert(
    'next-order positions ignore whether rows are already tagged with an order',
    ux.getNextOrderPositions(orderedSupplier) === 2 && ux.getNextOrderPositions(null) === 0
  )
  assert(
    'the workflow strip counts only what is not ordered yet as a draft',
    ux.getDraftPositions(orderedSupplier) === 0 &&
      ux.getDraftPositions({ ...orderedSupplier, pendingPositions: 3, pendingQty: 12 }) === 3 &&
      ux.getDraftPositions({ orderablePositions: 4 }) === 4
  )
  assert(
    'a summary restored from an older cache prints no qty it cannot back up',
    ux.getDraftQty({ ...orderedSupplier, pendingPositions: 3 }) === null &&
      ux.getDraftQty({ ...orderedSupplier, pendingPositions: 3, pendingQty: 12 }) === 12 &&
      ux.getDraftQty({ orderablePositions: 2, totalQty: 7 }) === 7 &&
      !ux
        .getSupplierWorkflowStatus({
          supplierId: 's1',
          summary: { ...orderedSupplier, pendingPositions: 3 },
        })
        .label.includes('шт.')
  )

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 3 — attempt key: one per submission, reused only on a technical retry
// ---------------------------------------------------------------------------

async function stageAttemptKey() {
  console.log('Stage 3: attempt_key lifecycle')
  const ux = await loadUx()
  const fp = await loadFingerprint()

  assert(
    'JS fingerprint fixture is the published canonical string',
    fp.computeAttemptPayloadFingerprint(fp.ATTEMPT_FINGERPRINT_FIXTURE) ===
      fp.ATTEMPT_FINGERPRINT_FIXTURE.expected
  )

  const generated = ux.defaultGenerateAttemptKey()
  assert('generated attempt key is a v4 UUID', ux.isValidAttemptKey(generated))
  assert(
    'attempt keys are unique',
    new Set(Array.from({ length: 50 }, () => ux.defaultGenerateAttemptKey())).size === 50
  )
  assert(
    'malformed values are rejected',
    !ux.isValidAttemptKey('') &&
      !ux.isValidAttemptKey(null) &&
      !ux.isValidAttemptKey('not-a-uuid') &&
      !ux.isValidAttemptKey('00000000-0000-0000-0000-000000000000')
  )

  let issued = 0
  const tracker = ux.createOrderAttemptTracker(() => {
    issued += 1
    return `00000000-0000-4000-8000-00000000000${issued}`
  })
  const payload = {
    snapshotId: '11111111-1111-4111-8111-111111111111',
    supplierId: '22222222-2222-4222-8222-222222222222',
    expectedDeliveryDate: '2026-08-14',
    items: [{ barcode: '0001', qty: 4 }],
  }
  const mutated = { ...payload, items: [{ barcode: '0001', qty: 9 }] }

  const first = tracker.begin(payload)
  assert(
    'one key per submission',
    tracker.begin(mutated).key === first.key &&
      tracker.begin(mutated).fingerprint === first.fingerprint &&
      issued === 1
  )
  assert(
    'the fingerprint is retained with the key even if the next payload mutated',
    first.fingerprint.includes('0001=4') && !first.fingerprint.includes('0001=9')
  )

  tracker.settle(ux.ORDER_ATTEMPT_OUTCOME.RETRYABLE)
  assert(
    'a technical retry reuses the very same key',
    tracker.begin(mutated).key === first.key && issued === 1
  )

  tracker.settle(ux.ORDER_ATTEMPT_OUTCOME.SUCCESS)
  assert('a settled attempt is cleared', tracker.peek() === null)
  const second = tracker.begin(payload)
  assert('a new deliberate submit gets a new key', second.key !== first.key && issued === 2)

  tracker.settle(ux.ORDER_ATTEMPT_OUTCOME.REJECTED)
  assert('a definitive refusal also ends the attempt', tracker.peek() === null)

  const third = tracker.begin(payload)
  tracker.reset()
  assert('an abandoned submission drops its key', tracker.peek() === null)
  assert('the abandoned key is not reused', tracker.begin(payload).key !== third.key)

  assert(
    'a thrown error is retryable',
    ux.classifyGenerateOutcome({ error: new Error('network') }) ===
      ux.ORDER_ATTEMPT_OUTCOME.RETRYABLE
  )
  assert(
    'a missing result is retryable',
    ux.classifyGenerateOutcome({}) === ux.ORDER_ATTEMPT_OUTCOME.RETRYABLE
  )
  assert(
    'success settles the attempt',
    ux.classifyGenerateOutcome({ result: { success: true } }) ===
      ux.ORDER_ATTEMPT_OUTCOME.SUCCESS
  )
  assert(
    'ambiguous server failures stay retryable',
    ['UMAG_NETWORK_ERROR', 'UMAG_TIMEOUT', 'GENERATE_FAILED', 'UNKNOWN'].every(
      (code) =>
        ux.classifyGenerateOutcome({ result: { success: false, code } }) ===
        ux.ORDER_ATTEMPT_OUTCOME.RETRYABLE
    )
  )
  assert(
    'definitive refusals are not retried under the same key',
    ['VALIDATION_ERROR', 'FORBIDDEN', 'UNAUTHORIZED', 'SNAPSHOT_NOT_FOUND', 'ATTEMPT_CONFLICT'].every(
      (code) =>
        ux.classifyGenerateOutcome({ result: { success: false, code } }) ===
        ux.ORDER_ATTEMPT_OUTCOME.REJECTED
    )
  )

  const view = read(PLANNER_VIEW)
  assert(
    'the planner mints the key once per submission and passes it to generate',
    view.includes('orderAttemptRef.current.begin({') &&
      view.includes('attemptKey: attempt.key') &&
      view.includes('payloadFingerprint: attempt.fingerprint') &&
      view.includes('fetchSnapshotAttemptItems')
  )
  assert(
    'nothingToOrder is a warning without an order link',
    view.includes('result.nothingToOrder') &&
      view.includes('showWarning') &&
      /if \(result\.nothingToOrder\)[\s\S]{0,400}showWarning/.test(view)
  )
  assert(
    'idempotent replay is not toasted as a fresh create',
    view.includes('result.idempotentReplay || result.alreadyGenerated') &&
      !view.includes('itemsOrdered || selectedSupplierSummary')
  )
  assert(
    'the planner settles the attempt with the classified outcome',
    view.includes('classifyGenerateOutcome({ result, error: thrown })') &&
      view.includes('orderAttemptRef.current.settle(outcome)')
  )
  assert(
    'changing the payload voids a pending attempt',
    /orderAttemptRef\.current\.reset\(\)\n\s*\}, \[deliveryDate, filters\.platformSupplierId, snapshot\?\.id\]\)/.test(
      view
    )
  )
  assert(
    'cancelling the dialog abandons the attempt',
    view.includes('function cancelOrderAttempt()') && view.includes('onClick={() => cancelOrderAttempt()}')
  )

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 4 — layout invariants
// ---------------------------------------------------------------------------

function stageLayoutInvariants() {
  console.log('Stage 4: layout + accessibility invariants')
  const planner = read(PLANNER_VIEW)
  const plannerCss = read(PLANNER_CSS)
  const page = read(PAGE_VIEW)
  const pageCss = read(PAGE_CSS)
  const ux = read(UX_MODULE)

  assert(
    'the orders-progress block and its computation are gone',
    !planner.includes('Прогресс заказов') &&
      !planner.includes('ordersProgress') &&
      !ux.includes('export function formatOrdersProgress') &&
      !plannerCss.includes('.proc-planner__meta')
  )
  assert(
    'the redundant «1. Выберите поставщика» step is gone',
    !planner.includes('1. Выберите поставщика') &&
      !ux.includes('1. Выберите поставщика') &&
      !ux.includes('2. Укажите количество')
  )
  assert(
    'misleading lock hints are gone',
    !ux.includes('Уже в заказе') &&
      !ux.includes('Заказ поставщику создан') &&
      !ux.includes('export function isItemQuantityLocked') &&
      !ux.includes('export function getLockedQuantityHint') &&
      !planner.includes('isItemQuantityLocked') &&
      !planner.includes('getLockedQuantityHint')
  )

  assert(
    'the header strip is portalled into the tabs row',
    planner.includes("import { createPortal } from 'react-dom'") &&
      planner.includes('headerSlot ? createPortal(headerStrip, headerSlot) : headerStrip') &&
      page.includes('procurement-page__tabs-aside') &&
      page.includes('<ProcurementPlannerView headerSlot={tabsAsideEl} />')
  )
  assert(
    'the planner still renders standalone without a slot',
    /headerSlot = null/.test(planner)
  )
  assert(
    'the tabs row wraps instead of overflowing',
    /\.procurement-page__tabs-row \{[^}]*flex-wrap: wrap/s.test(pageCss) &&
      /@media \(max-width: 720px\) \{[\s\S]*?\.procurement-page__tabs-aside \{[^}]*flex-basis: 100%/.test(
        pageCss
      )
  )
  assert(
    'the empty slot takes no vertical space on other tabs',
    /\.procurement-page__tabs-aside:empty \{[^}]*display: none/s.test(pageCss)
  )
  assert(
    'the snapshot line truncates instead of pushing the row wider',
    /\.proc-planner__snapshot-text \{[^}]*min-width: 0/s.test(plannerCss) &&
      /\.proc-planner__snapshot-text \{[^}]*overflow: hidden/s.test(plannerCss) &&
      /\.proc-planner__snapshot-text \{[^}]*text-overflow: ellipsis/s.test(plannerCss) &&
      /\.proc-planner__topbar \{[^}]*flex-wrap: wrap/s.test(plannerCss)
  )

  assert(
    'chips are semantic buttons with an accessible name',
    /<button\b[\s\S]{0,320}className="proc-planner__chip"[\s\S]{0,320}aria-label=\{/.test(
      planner
    ) && /type="button"[\s\S]{0,120}className="proc-planner__chip"/.test(planner)
  )
  assert(
    'chips navigate to a filter instead of only reporting a number',
    planner.includes('function handleAlertChipClick(chip)') &&
      planner.includes('unassignedOnly: true') &&
      planner.includes('platformSupplierId: supplierId')
  )
  assert(
    'unassigned filter is reachable via alert chip (no advanced filter popover)',
    !planner.includes('Только без поставщика') &&
      !planner.includes('proc-planner__filter-pop') &&
      planner.includes("chip.id === 'unassigned'") &&
      planner.includes('unassignedOnly: true')
  )

  assert(
    'the «Заказ» column is left aligned in one stack',
    /\.proc-planner__final \{[^}]*flex-direction: column/s.test(plannerCss) &&
      /\.proc-planner__final \{[^}]*align-items: flex-start/s.test(plannerCss) &&
      /\.proc-planner__final \{[^}]*text-align: left/s.test(plannerCss)
  )
  assert(
    'no later rule re-centres the column (the old --locked ordering bug)',
    !/^\.proc-planner__final--locked\b/m.test(plannerCss) &&
      plannerCss.lastIndexOf('.proc-planner__final {') <
        plannerCss.indexOf('.proc-planner__final-input {')
  )
  const qtyCell =
    planner.match(/function renderQtyCell\(item, mobile = false\)[\s\S]*?\n  \}\n/)?.[0] || ''
  assert(
    'the planner treats generated snapshots as writable',
    planner.includes('isSnapshotQuantityEditable(snapshot?.status)')
  )
  assert(
    'value first, history second — a single renderer for both states',
    planner.includes('function renderQtyHistory(item)') &&
      qtyCell.length > 200 &&
      qtyCell.indexOf('proc-planner__qty-value') < qtyCell.indexOf('renderQtyHistory(item)') &&
      qtyCell.indexOf('proc-planner__final-input') < qtyCell.lastIndexOf('renderQtyHistory(item)') &&
      qtyCell.includes('item.finalOrderQty') &&
      qtyCell.includes(": '—'}") &&
      !qtyCell.includes('formatNum(history.qty')
  )
  assert(
    'the qty field is remounted after a successful order',
    planner.includes('setGenerationEpoch((epoch) => epoch + 1)') &&
      /key=\{`\$\{mobile \? 'm-' : ''\}final-[^`]*generationEpoch\}`\}/.test(planner)
  )

  console.log('')
}

async function main() {
  console.log('Verifying procurement repeat-orders UI\n')
  await stageHeaderStrip()
  await stageOrderColumn()
  await stageAttemptKey()
  stageLayoutInvariants()
  console.log(`PASSED ${testsPassed}/${testsRun}`)
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`)
  console.error(`FAILED after ${testsPassed}/${testsRun}`)
  process.exit(1)
})
