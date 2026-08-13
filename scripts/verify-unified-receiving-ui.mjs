#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
let testsRun = 0
let testsPassed = 0

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function assert(name, condition) {
  testsRun += 1
  if (!condition) throw new Error(name)
  testsPassed += 1
  console.log(`  ✓ ${name}`)
}

async function main() {
  console.log('=== Unified receiving UI verification ===\n')

  const listUtils = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/receivingList.js')).href
  )
  const documents = [
    {
      id: 'full-b',
      supplierName: 'Бета',
      expectedDeliveryDate: '2026-08-10',
      status: 'awaiting_receiving',
      workflowMode: 'analytics',
    },
    {
      id: 'legacy-a',
      supplierName: 'Альфа',
      expectedDeliveryDate: '2026-08-10',
      status: 'received',
      workflowMode: 'simple',
    },
    {
      id: 'other-day',
      supplierName: 'Гамма',
      expectedDeliveryDate: '2026-08-11',
      status: 'awaiting_receiving',
    },
  ]

  const sameDay = listUtils.filterReceivingDocuments(documents, {
    dateKey: '2026-08-10',
  })
  assert('full and legacy documents share one date list', sameDay.length === 2)
  assert('documents are sorted by supplier', sameDay[0].id === 'legacy-a')
  assert(
    'open filter keeps only unfinished documents',
    listUtils.filterReceivingDocuments(documents, {
      dateKey: '2026-08-10',
      status: listUtils.RECEIVING_LIST_STATUS.OPEN,
    })[0]?.id === 'full-b'
  )
  assert(
    'supplier search is case-insensitive',
    listUtils.filterReceivingDocuments(documents, { supplierQuery: 'АЛЬ' })[0]?.id ===
      'legacy-a'
  )
  assert(
    'date counters include all document modes',
    listUtils.countReceivingDocumentsByDate(documents)['2026-08-10'] === 2
  )

  const page = read('src/pages/platform/receiving/ReceivingPage.jsx')
  const detail = read('src/pages/platform/receiving/ReceivingDetailPage.jsx')
  const list = read('src/components/receiving/UnifiedReceivingList.jsx')
  const calendar = read('src/components/receiving/ReceivingMonthCalendar.jsx')
  const service = read('src/services/receivingDataService.js')
  const items = read('src/components/receiving/ReceivingItemsTable.jsx')
  const itemsCss = read('src/components/receiving/ReceivingItemsTable.css')
  const detailCss = read('src/pages/platform/receiving/ReceivingDetailPage.css')
  const listCss = read('src/components/receiving/UnifiedReceivingList.css')
  const receivingData = read('src/utils/receivingData.js')

  assert('receiving page uses one unified list', page.includes('UnifiedReceivingList'))
  assert('old split label is not user-facing', !page.includes('Аналитическая приёмка'))
  assert('old checklist is not rendered', !page.includes('SimpleReceivingWeekView'))
  assert('supplier search is removed from receiving list', !list.includes('PlatformSearchToolbar'))
  assert('status select is removed from receiving list', !list.includes('RECEIVING_LIST_STATUS'))
  assert('legacy instant accept is removed', !list.includes('acceptSimpleDelivery'))
  assert('document icon is replaced by row numbering', list.includes('index + 1') && !list.includes('FileTextIcon'))
  assert('list exposes lifecycle actions', list.includes("return 'Принять'") && list.includes("return 'Продолжить'") && list.includes("return 'Открыть'"))
  assert('compact month calendar is connected', list.includes('ReceivingMonthCalendar'))
  assert('month calendar shows document counts', calendar.includes('countsByDate[dateKey]'))
  assert('month calendar selects a day and closes', calendar.includes('onSelectDate?.(dateKey)') && calendar.includes('onClose?.()'))
  assert('calendar exposes valid button selection semantics', calendar.includes('aria-pressed={isSelected}') && !calendar.includes('role="gridcell"'))
  assert('calendar dialog receives initial keyboard focus', !calendar.includes('autoFocusClose={false}'))
  assert('detail loads a document by id', detail.includes('loadReceivingDocumentById(id)'))
  assert('detail has explicit loading state', detail.includes('if (loading)'))
  assert('detail separates load error from not found', detail.includes('if (loadError)'))
  assert('service bypasses shared cache for by-id load', service.includes('cloud.fetchDocumentById(id)'))
  assert('detail saves and completes through receiving service', detail.includes('saveReceivingDocument(') && detail.includes('completeReceivingDocument('))
  assert('completion returns to receiving list', detail.includes("navigate('/platform/receiving'"))
  assert('completed receipt exposes UMAG actions', detail.includes('Скачать для UMAG') && detail.includes('Скопировать комментарий'))
  assert('completed receipt can be edited', detail.includes('setEditingCompleted(true)'))
  assert('completed edit is limited to receiving managers', detail.includes('completed && canManage'))
  assert('completed edit reopens through the save contract', detail.includes('reopenCompleted: completed'))
  assert('comment copy has an HTTP-safe fallback', detail.includes('copyTextToClipboard') && detail.includes("execCommand('copy')"))
  assert('start flow is guarded against duplicate effects', detail.includes('startRequestRef.current === requestKey'))
  assert('failed start can reload and retry', detail.includes('handleRetryStart') && detail.includes('Повторить начало приёмки'))
  assert('review shows exceptions only', detail.includes('<ReceivingItemsTable items={items} readOnly exceptionsOnly'))
  assert('items expose actual quantity and price inputs', items.includes('Фактическая цена') && items.includes('receivedQty'))
  assert('items expose discrepancy reason, comment and photos', items.includes('Причина расхождения') && items.includes('Комментарий') && items.includes('Добавить фото'))
  assert('discrepancy reasons persist stable backend codes', items.includes("code: 'damaged'") && items.includes("code: 'not_delivered'") && items.includes("code: 'price_changed'"))
  assert('persisted photos have previews and safe links', items.includes('<img src={url}') && items.includes('isViewablePhotoUrl'))
  assert('photo chooser is keyboard accessible', items.includes("event.key !== 'Enter'") && items.includes('inputRef.current?.click()'))
  assert('outside-order items can be removed', items.includes('flags.outsideOrder') && items.includes('onRemoveItem'))
  assert('mixed units never fall back to a false piece label', !detail.includes("|| 'шт.'") && !list.includes('totalOrderedQty) > 0') && !items.includes("item.unit || 'шт.'"))
  assert('receiving list respects manage permission for lifecycle actions', page.includes('canManage={canManage}') && list.includes("if (!canManage) return 'Открыть'"))
  assert('receiving statuses use supported badge tones', receivingData.includes("in_progress: 'draft'") && receivingData.includes("received: 'done'"))
  assert('desktop table switches to mobile cards', itemsCss.includes('@media (max-width: 900px)') && itemsCss.includes('display: none') && itemsCss.includes('display: grid'))
  assert('detail actions stack on narrow screens', detailCss.includes('@media (max-width: 640px)') && detailCss.includes('flex-wrap: wrap'))
  assert('list and calendar adapt on narrow screens', listCss.includes('@media (max-width: 640px)') && listCss.includes('.receiving-calendar__grid'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

main().catch((error) => {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
})
