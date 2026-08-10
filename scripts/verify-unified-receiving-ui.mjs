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
  const service = read('src/services/receivingDataService.js')
  const items = read('src/components/receiving/ReceivingItemsTable.jsx')
  const iconButton = read('src/components/admin/IconActionButton.jsx')

  assert('receiving page uses one unified list', page.includes('UnifiedReceivingList'))
  assert('old split label is not user-facing', !page.includes('Аналитическая приёмка'))
  assert('old checklist is not rendered', !page.includes('SimpleReceivingWeekView'))
  assert('legacy rows use action buttons instead of checkboxes', !list.includes('type="checkbox"'))
  assert('icon actions expose title and aria label', iconButton.includes('title={label}') && iconButton.includes('aria-label={label}'))
  assert('legacy accept action remains available', list.includes('acceptSimpleDelivery'))
  assert('legacy return action remains available', list.includes('unacceptSimpleDelivery'))
  assert('detail loads a document by id', detail.includes('loadReceivingDocumentById(id)'))
  assert('detail has explicit loading state', detail.includes('if (loading)'))
  assert('detail separates load error from not found', detail.includes('if (loadError)'))
  assert('service bypasses shared cache for by-id load', service.includes('cloud.fetchDocumentById(id)'))
  assert('items show ordered quantity', items.includes('<th>Заказано</th>'))
  assert('discrepancy fields are absent', !items.includes('Расхождение') && !items.includes('Пришло'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

main().catch((error) => {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
})
