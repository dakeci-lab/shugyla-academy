/**
 * Автотест логики чек-листа приёмки (изолированно, без Vite/Supabase).
 * Запуск: node scripts/test-receiving-checklist.mjs
 */

const SYNC_STATUS = { PENDING: 'pending', SYNCED: 'synced', ERROR: 'error' }
const SYNC_STATUS_LABELS = { pending: '⏳ Сохранение…', error: '⚠ Не синхронизировано' }
const RECEIVING_STATUS = { AWAITING_RECEIVING: 'awaiting_receiving', RECEIVED: 'received' }
const PURCHASE_STATUS = { AWAITING_RECEIVING: 'awaiting_receiving', RECEIVED: 'received' }

function isSyncPending(status) {
  return status === SYNC_STATUS.PENDING
}

function isSyncError(status) {
  return status === SYNC_STATUS.ERROR
}

function isVirtualReceivingDocument(order, documents) {
  if (!order?.receivingDocumentId) return false
  const list = documents || []
  return !list.some(
    (doc) => doc.id === order.receivingDocumentId || doc.purchaseOrderId === order.id
  )
}

function getReceivingChecklistToggleState(order, documents, cloudMode = false) {
  if (!order?.id || !order.receivingDocumentId) {
    return { canToggle: false, reason: 'missing', statusLabel: null }
  }
  if (!cloudMode) {
    return { canToggle: true, reason: 'ready', statusLabel: null }
  }
  if (isSyncPending(order.syncStatus)) {
    return {
      canToggle: false,
      reason: 'syncing',
      statusLabel: SYNC_STATUS_LABELS[SYNC_STATUS.PENDING],
    }
  }
  if (isSyncError(order.syncStatus)) {
    return {
      canToggle: false,
      reason: 'error',
      statusLabel: SYNC_STATUS_LABELS[SYNC_STATUS.ERROR],
    }
  }
  if (isVirtualReceivingDocument(order, documents)) {
    return { canToggle: true, reason: 'virtual', statusLabel: null }
  }
  return { canToggle: true, reason: 'ready', statusLabel: null }
}

function isSimpleReceivingEntryDone(entry) {
  return (
    entry?.document?.status === RECEIVING_STATUS.RECEIVED ||
    entry?.order?.status === PURCHASE_STATUS.RECEIVED
  )
}

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    passed += 1
    console.log(`  ✔ ${label}`)
  } else {
    failed += 1
    console.error(`  ✘ ${label}`)
  }
}

const baseOrder = {
  id: 'order-1',
  supplierName: 'Test Supplier',
  expectedDeliveryDate: '2026-07-10',
  totalAmount: 1000,
  workflowMode: 'simple',
  receivingDocumentId: 'doc-1',
  status: PURCHASE_STATUS.AWAITING_RECEIVING,
}

const baseDocument = {
  id: 'doc-1',
  purchaseOrderId: 'order-1',
  supplierName: 'Test Supplier',
  status: RECEIVING_STATUS.AWAITING_RECEIVING,
  workflowMode: 'simple',
}

console.log('✔ новый закуп (pending sync)')
{
  const order = { ...baseOrder, syncStatus: SYNC_STATUS.PENDING }
  const state = getReceivingChecklistToggleState(order, [], true)
  assert(state.canToggle === false, 'чекбокс заблокирован при pending')
  assert(state.reason === 'syncing', 'причина — syncing')
}

console.log('✔ синхронизированный закуп + документ')
{
  const order = { ...baseOrder, syncStatus: SYNC_STATUS.SYNCED }
  const state = getReceivingChecklistToggleState(order, [baseDocument], true)
  assert(state.canToggle === true, 'чекбокс доступен после sync')
}

console.log('✔ виртуальный документ (persist создаст в облаке)')
{
  const order = { ...baseOrder, syncStatus: null }
  assert(isVirtualReceivingDocument(order, []), 'документ виртуальный')
  const state = getReceivingChecklistToggleState(order, [], true)
  assert(state.canToggle === true, 'чекбокс доступен для virtual doc')
}

console.log('✔ установка / снятие галочки (done state)')
{
  const pending = { order: baseOrder, document: baseDocument }
  assert(!isSimpleReceivingEntryDone(pending), 'до галочки — не принято')
  const received = {
    order: { ...baseOrder, status: PURCHASE_STATUS.RECEIVED },
    document: { ...baseDocument, status: RECEIVING_STATUS.RECEIVED },
  }
  assert(isSimpleReceivingEntryDone(received), 'после галочки — принято')
  const unaccepted = {
    order: { ...baseOrder, status: PURCHASE_STATUS.AWAITING_RECEIVING },
    document: { ...baseDocument, status: RECEIVING_STATUS.AWAITING_RECEIVING },
  }
  assert(!isSimpleReceivingEntryDone(unaccepted), 'после снятия — не принято')
}

console.log('✔ ошибка синхронизации закупа')
{
  const order = { ...baseOrder, syncStatus: SYNC_STATUS.ERROR }
  const state = getReceivingChecklistToggleState(order, [baseDocument], true)
  assert(state.canToggle === false, 'чекбокс заблокирован при sync error')
}

console.log('✔ local mode (без облака)')
{
  const order = { ...baseOrder, syncStatus: SYNC_STATUS.PENDING }
  const state = getReceivingChecklistToggleState(order, [], false)
  assert(state.canToggle === true, 'local mode игнорирует pending')
}

console.log('')
if (failed === 0) {
  console.log(`Все сценарии пройдены: ${passed}/${passed}`)
  process.exit(0)
}

console.error(`Провалено: ${failed}, пройдено: ${passed}`)
process.exit(1)
