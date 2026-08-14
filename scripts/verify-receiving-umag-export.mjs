#!/usr/bin/env node
/**
 * Pure contract + real binary XLSX verification for the UMAG receiving export.
 * No browser, network, database or repository temp files are used.
 *
 * Usage:
 *   npm run verify:receiving-umag-export
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import {
  RECEIVING_UMAG_COLUMNS,
  RECEIVING_UMAG_SHEET_NAME,
  ReceivingUmagExportValidationError,
  buildReceivingUmagComment,
  buildReceivingUmagFilename,
  createReceivingUmagXlsx,
  downloadReceivingUmagXlsxBytes,
  formatReceivingUmagFilenameAmount,
  mapReceivingItemsToUmagRows,
  normalizeReceivingUmagFilenameDate,
  normalizeReceivingUmagUnit,
  receivingUmagRowsToAoa,
  sanitizeReceivingUmagFilenamePart,
  summarizeReceivingUmagRows,
  validateReceivingUmagItem,
  validateReceivingUmagItems,
} from '../src/utils/receivingUmagExport.js'

let testsRun = 0
let testsPassed = 0

function check(name, condition) {
  testsRun += 1
  assert.ok(condition, name)
  testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function hasError(result, code) {
  return result.errors.some((error) => error.code === code)
}

function validItem(overrides = {}) {
  return {
    barcode: '0123456789012',
    productName: 'Молоко 3,2%',
    receivedQty: 2,
    unit: 'шт.',
    actualPurchasePrice: 425.5,
    ...overrides,
  }
}

function stagePureContract() {
  console.log('Stage 1: Pure UMAG contract')

  check(
    'column order is exact',
    JSON.stringify(RECEIVING_UMAG_COLUMNS) ===
      JSON.stringify(['Штрихкод', 'Количество', 'Название', 'Ед. изм.', 'Цена'])
  )
  check('piece unit normalized', normalizeReceivingUmagUnit('ШТ') === 'шт.')
  check('kilogram unit normalized', normalizeReceivingUmagUnit('kg') === 'кг')
  check('liter unit normalized', normalizeReceivingUmagUnit('литр') === 'л')
  check('unsupported unit rejected', normalizeReceivingUmagUnit('коробка') == null)

  const source = [
    validItem({
      orderedQty: 12,
      receivedQty: 3,
      purchasePrice: 400,
      actualPurchasePrice: 425.5,
    }),
    {
      barcode: '2760682',
      product_name: 'Творог весовой',
      received_qty: '33,7',
      measure: 'кг',
      actual_purchase_price: '1100,25',
    },
    {
      barcode: '4600000000007',
      name: 'Молоко топлёное',
      actualQty: 1.125,
      measureUnit: 'л.',
      actualPrice: 350,
    },
    // Completely rejected/damaged line: zero quantity must not reach UMAG and
    // does not need product metadata to be omitted safely.
    { receivedQty: 0 },
  ]
  const snapshot = JSON.stringify(source)
  const rows = mapReceivingItemsToUmagRows(source)

  check('zero quantity excluded', rows.length === 3)
  check('source items are not mutated', JSON.stringify(source) === snapshot)
  check('actual quantity used instead of ordered', rows[0].Количество === 3)
  check('actual price used instead of ordered', rows[0].Цена === 425.5)
  check('leading-zero barcode remains text', rows[0].Штрихкод === '0123456789012')
  check('localized decimal quantity parsed', rows[1].Количество === 33.7)
  check('localized decimal price parsed', rows[1].Цена === 1100.25)
  check('unit written canonically', rows[2]['Ед. изм.'] === 'л')
  check(
    'row keys follow exact column order',
    JSON.stringify(Object.keys(rows[0])) === JSON.stringify(RECEIVING_UMAG_COLUMNS)
  )

  const aoa = receivingUmagRowsToAoa(rows)
  check('AOA header exact', JSON.stringify(aoa[0]) === JSON.stringify(RECEIVING_UMAG_COLUMNS))
  check('AOA contains only header plus exported rows', aoa.length === 4)
  check('AOA keeps numeric quantity and price', typeof aoa[1][1] === 'number' && typeof aoa[1][4] === 'number')
  console.log('')
}

function stageValidation() {
  console.log('Stage 2: Validation guards')

  check(
    'missing actual quantity blocked',
    hasError(validateReceivingUmagItem(validItem({ receivedQty: undefined })), 'quantity_required')
  )
  check(
    'non-numeric quantity blocked',
    hasError(validateReceivingUmagItem(validItem({ receivedQty: 'abc' })), 'quantity_invalid')
  )
  check(
    'negative quantity blocked',
    hasError(validateReceivingUmagItem(validItem({ receivedQty: -1 })), 'quantity_negative')
  )
  check(
    'fractional pieces blocked',
    hasError(validateReceivingUmagItem(validItem({ receivedQty: 1.5 })), 'quantity_integer_required')
  )
  check(
    'kg precision above 3 decimals blocked',
    hasError(
      validateReceivingUmagItem(validItem({ receivedQty: 1.2345, unit: 'кг' })),
      'quantity_precision'
    )
  )
  check(
    'liter precision up to 3 decimals allowed',
    validateReceivingUmagItem(validItem({ receivedQty: 0.001, unit: 'л' })).valid
  )
  check(
    'missing barcode blocked',
    hasError(validateReceivingUmagItem(validItem({ barcode: ' ' })), 'barcode_required')
  )
  check(
    'missing product name blocked',
    hasError(validateReceivingUmagItem(validItem({ productName: ' ' })), 'product_name_required')
  )
  check(
    'missing unit blocked',
    hasError(validateReceivingUmagItem(validItem({ unit: ' ' })), 'unit_required')
  )
  check(
    'unsupported unit blocked',
    hasError(validateReceivingUmagItem(validItem({ unit: 'уп.' })), 'unit_unsupported')
  )
  check(
    'missing actual price blocked',
    hasError(
      validateReceivingUmagItem({
        barcode: '123',
        productName: 'Товар',
        receivedQty: 1,
        unit: 'шт.',
      }),
      'price_required'
    )
  )
  check(
    'ordered price is never used as actual-price fallback',
    hasError(
      validateReceivingUmagItem(
        validItem({ actualPurchasePrice: undefined, purchasePrice: 999 })
      ),
      'price_required'
    )
  )
  check(
    'generic quantity is never used as received-quantity fallback',
    hasError(
      validateReceivingUmagItem(validItem({ receivedQty: undefined, quantity: 9 })),
      'quantity_required'
    )
  )
  check(
    'negative price blocked',
    hasError(validateReceivingUmagItem(validItem({ actualPurchasePrice: -0.01 })), 'price_negative')
  )
  check(
    'price precision above 2 decimals blocked',
    hasError(validateReceivingUmagItem(validItem({ actualPurchasePrice: 10.001 })), 'price_precision')
  )
  check('zero price allowed', validateReceivingUmagItem(validItem({ actualPurchasePrice: 0 })).valid)

  const duplicate = validateReceivingUmagItems([
    validItem(),
    validItem({ productName: 'Дубль', receivedQty: 1 }),
  ])
  check('duplicate barcode blocked', !duplicate.valid && hasError(duplicate, 'barcode_duplicate'))
  check('non-array input blocked', hasError(validateReceivingUmagItems(null), 'items_invalid'))
  check('empty receipt blocked', hasError(validateReceivingUmagItems([]), 'items_empty'))
  check(
    'all-zero receipt blocked after exclusions',
    hasError(validateReceivingUmagItems([{ receivedQty: 0 }]), 'items_empty')
  )

  let thrown = null
  try {
    mapReceivingItemsToUmagRows([validItem({ barcode: '' })])
  } catch (error) {
    thrown = error
  }
  check('mapping throws typed validation error', thrown instanceof ReceivingUmagExportValidationError)
  check('typed error carries row errors', thrown?.errors?.[0]?.code === 'barcode_required')
  console.log('')
}

function stageFilename() {
  console.log('Stage 3: Readable filename')

  // The one the warehouse actually sees in the downloads list.
  check(
    'documented example is produced exactly',
    buildReceivingUmagFilename({
      expectedDeliveryDate: '2026-08-14',
      supplierName: 'Албини',
      exportTotalAmount: 387500,
      version: 1,
    }) === 'UMAG_2026-08-14_Албини_387500тг_v1.xlsx'
  )
  check(
    'the date is the delivery date, not today',
    buildReceivingUmagFilename({
      expectedDeliveryDate: '2026-08-14',
      supplierName: 'Албини',
      exportTotalAmount: 387500,
      version: 1,
    }).includes(`_${new Date().toISOString().slice(0, 10)}_`) ===
      ('2026-08-14' === new Date().toISOString().slice(0, 10))
  )
  check(
    'a timestamp is truncated, never shifted by a timezone',
    normalizeReceivingUmagFilenameDate('2026-08-14T23:45:00+06:00') === '2026-08-14' &&
      normalizeReceivingUmagFilenameDate('2026-08-14T00:15:00Z') === '2026-08-14'
  )
  check(
    'a Date object is accepted too',
    normalizeReceivingUmagFilenameDate(new Date('2026-08-14T10:00:00Z')) === '2026-08-14'
  )
  check(
    'nonsense dates are refused instead of guessed',
    normalizeReceivingUmagFilenameDate('14.08.2026') == null &&
      normalizeReceivingUmagFilenameDate('2026-13-01') == null &&
      normalizeReceivingUmagFilenameDate('2026-08-32') == null &&
      normalizeReceivingUmagFilenameDate('') == null &&
      normalizeReceivingUmagFilenameDate(new Date('nope')) == null
  )
  check(
    'a blank primary date falls through to the receiving date',
    buildReceivingUmagFilename({
      expectedDeliveryDate: '',
      receivingDate: '2026-08-14',
      supplierName: 'Албини',
      version: 1,
    }) === 'UMAG_2026-08-14_Албини_v1.xlsx'
  )

  const unsafeSupplier = buildReceivingUmagFilename({
    expectedDeliveryDate: '2026-08-14',
    supplierName: 'ТОО «Албини»/../Юг: 100%',
    exportTotalAmount: 1000,
    version: 1,
  })
  check(
    'supplier name is sanitized in place',
    unsafeSupplier === 'UMAG_2026-08-14_ТОО_Албини_Юг_100_1000тг_v1.xlsx'
  )
  check(
    'no path separators survive anywhere in the name',
    !unsafeSupplier.includes('/') &&
      !unsafeSupplier.includes('\\') &&
      !unsafeSupplier.includes(':')
  )
  check(
    'a supplier name of pure punctuation is omitted, not stubbed',
    buildReceivingUmagFilename({
      expectedDeliveryDate: '2026-08-14',
      supplierName: '«»...',
      exportTotalAmount: 500,
      version: 1,
    }) === 'UMAG_2026-08-14_500тг_v1.xlsx'
  )

  check(
    'the amount is rounded to whole tenge',
    formatReceivingUmagFilenameAmount(387499.62) === '387500тг' &&
      formatReceivingUmagFilenameAmount('1100,25') === '1100тг'
  )
  check(
    'a zero receipt still shows its amount',
    formatReceivingUmagFilenameAmount(0) === '0тг'
  )
  check(
    'an unusable amount is dropped rather than printed',
    formatReceivingUmagFilenameAmount(null) == null &&
      formatReceivingUmagFilenameAmount('') == null &&
      formatReceivingUmagFilenameAmount('abc') == null &&
      formatReceivingUmagFilenameAmount(-5) == null &&
      formatReceivingUmagFilenameAmount(Number.NaN) == null
  )
  check(
    'the ordered total can never reach the filename',
    buildReceivingUmagFilename({
      expectedDeliveryDate: '2026-08-14',
      supplierName: 'Албини',
      totalAmount: 999999,
      totalReceivedAmount: 387500,
      version: 1,
    }) === 'UMAG_2026-08-14_Албини_387500тг_v1.xlsx'
  )
  check(
    'an explicit export total wins over the stored received total',
    buildReceivingUmagFilename({
      expectedDeliveryDate: '2026-08-14',
      supplierName: 'Албини',
      totalReceivedAmount: 111,
      exportTotalAmount: 222,
      version: 1,
    }) === 'UMAG_2026-08-14_Албини_222тг_v1.xlsx'
  )

  check(
    'every missing segment is simply left out',
    buildReceivingUmagFilename({ version: 3 }) === 'UMAG_v3.xlsx'
  )
  check(
    'a missing date drops only the date',
    buildReceivingUmagFilename({ supplierName: 'Албини', exportTotalAmount: 100 }) ===
      'UMAG_Албини_100тг_v1.xlsx'
  )
  check(
    'a missing supplier drops only the supplier',
    buildReceivingUmagFilename({
      expectedDeliveryDate: '2026-08-14',
      exportTotalAmount: 100,
    }) === 'UMAG_2026-08-14_100тг_v1.xlsx'
  )

  // A technical id in a filename is exactly what this format replaced.
  const withIds = buildReceivingUmagFilename({
    id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    purchaseOrderId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    purchaseOrderNumber: 'PO-1842',
    invoiceNumbers: ['INV-18275'],
    expectedDeliveryDate: '2026-08-14',
    supplierName: 'Албини',
    exportTotalAmount: 387500,
    version: 1,
  })
  check('no uuid leaks into the name', !/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(withIds))
  check(
    'order and invoice refs stay out of the name',
    !withIds.includes('1842') && !withIds.includes('18275')
  )
  const withoutDate = withIds.replace('2026-08-14', '')
  check(
    'exactly one date and no clock time',
    (withIds.match(/\d{4}-\d{2}-\d{2}/g) || []).length === 1 &&
      !/T\d{2}/.test(withIds) &&
      !/\d{2}[-:.]\d{2}/.test(withoutDate)
  )
  check(
    'the whole name follows the documented grammar',
    /^UMAG_\d{4}-\d{2}-\d{2}_[\p{L}\p{N}\-_]+_\d+тг_v\d+\.xlsx$/u.test(withIds)
  )
  check('the documented shape is stable', withIds === 'UMAG_2026-08-14_Албини_387500тг_v1.xlsx')

  check(
    'the version suffix is what separates repeated downloads',
    buildReceivingUmagFilename({ supplierName: 'Албини', version: 1 }) !==
      buildReceivingUmagFilename({ supplierName: 'Албини', version: 2 }) &&
      buildReceivingUmagFilename({ supplierName: 'Албини', version: 2 }).endsWith('_v2.xlsx')
  )
  check(
    'exportVersion is accepted as the version source',
    buildReceivingUmagFilename({ supplierName: 'Албини', exportVersion: 4 }).endsWith('_v4.xlsx')
  )
  check(
    'an invalid version falls back to v1',
    buildReceivingUmagFilename({ version: -3 }) === 'UMAG_v1.xlsx' &&
      buildReceivingUmagFilename({ version: 1.5 }) === 'UMAG_v1.xlsx' &&
      buildReceivingUmagFilename({ version: 'abc' }) === 'UMAG_v1.xlsx'
  )
  check('every name is still an .xlsx', buildReceivingUmagFilename({}).endsWith('.xlsx'))
  check(
    'filename sanitizer keeps its explicit fallback for other callers',
    sanitizeReceivingUmagFilenamePart('...') === 'UNKNOWN'
  )
  console.log('')
}

function stageComment() {
  console.log('Stage 3b: UMAG comment keeps the internal refs')

  check(
    'single invoice comment exact',
    buildReceivingUmagComment({ orderNumber: 'PO-1842', invoiceNumber: '18275' }) ===
      'Заказ Shugyla №1842; Накладная поставщика №18275'
  )
  check(
    'multiple invoice comment exact',
    buildReceivingUmagComment({ orderNumber: '1842', invoiceNumbers: ['18275', '18276'] }) ===
      'Заказ Shugyla №1842; Накладные поставщика №18275, №18276'
  )
  check(
    'order-only comment remains useful',
    buildReceivingUmagComment({ orderNumber: '1842' }) === 'Заказ Shugyla №1842'
  )
  check(
    'the refs the filename dropped are still traceable via the comment',
    buildReceivingUmagComment({
      purchaseOrderNumber: 'PO-1842',
      supplierInvoiceNumbers: ['18275'],
    }).includes('1842')
  )
  console.log('')
}

function stageTotals() {
  console.log('Stage 3c: Totals behind the filename amount')

  const totals = summarizeReceivingUmagRows([
    { Количество: 24, Цена: 485 },
    { Количество: 33.7, Цена: 3120.5 },
  ])
  check('quantity summed', totals.totalQuantity === 57.7)
  check('amount summed', totals.totalAmount === 24 * 485 + 33.7 * 3120.5)
  check(
    'float drift is rounded away',
    summarizeReceivingUmagRows([
      { Количество: 3, Цена: 0.1 },
      { Количество: 3, Цена: 0.2 },
    ]).totalAmount === 0.9
  )
  check(
    'an empty receipt totals zero rather than NaN',
    summarizeReceivingUmagRows([]).totalAmount === 0 &&
      summarizeReceivingUmagRows(null).totalQuantity === 0
  )
  console.log('')
}

async function stageBinaryWorkbook() {
  console.log('Stage 4: Real binary XLSX round-trip')

  const { bytes, rowsCount } = await createReceivingUmagXlsx([
    validItem({
      barcode: '0012345678905',
      productName: 'Молоко Казахстан 3,2%',
      receivedQty: 24,
      actualPurchasePrice: 485,
    }),
    validItem({
      barcode: '2760682',
      productName: 'Сыр весовой',
      receivedQty: 33.7,
      unit: 'кг',
      actualPurchasePrice: 3120.5,
    }),
    validItem({ barcode: '999', receivedQty: 0 }),
  ])

  check('binary starts with ZIP signature', bytes[0] === 0x50 && bytes[1] === 0x4b)
  check('binary row count excludes zero quantity', rowsCount === 2)

  const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true })
  check(
    'workbook has exactly one named sheet',
    workbook.SheetNames.length === 1 && workbook.SheetNames[0] === RECEIVING_UMAG_SHEET_NAME
  )

  const worksheet = workbook.Sheets[RECEIVING_UMAG_SHEET_NAME]
  const values = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true })
  check('round-trip header exact', JSON.stringify(values[0]) === JSON.stringify(RECEIVING_UMAG_COLUMNS))
  check('round-trip has no metadata or total rows', values.length === 3)
  check('round-trip preserves Cyrillic product name', values[1][2] === 'Молоко Казахстан 3,2%')
  check('round-trip preserves leading zeros', values[1][0] === '0012345678905')
  check('round-trip preserves short scale barcode', values[2][0] === '2760682')
  check('barcode cell is typed as text', worksheet.A2.t === 's' && worksheet.A3.t === 's')
  check('quantity cells are numeric', worksheet.B2.t === 'n' && worksheet.B3.t === 'n')
  check('price cells are numeric', worksheet.E2.t === 'n' && worksheet.E3.t === 'n')
  check('fractional kg survives round-trip', values[2][1] === 33.7)
  check('decimal price survives round-trip', values[2][4] === 3120.5)
  check('worksheet range is exactly five columns', worksheet['!ref'] === 'A1:E3')
  check(
    'browser download remains a separate async operation',
    downloadReceivingUmagXlsxBytes.constructor.name === 'AsyncFunction'
  )

  // The amount in the name has to be the amount in the file.
  const { totals } = await createReceivingUmagXlsx([
    validItem({ barcode: '111', receivedQty: 2, actualPurchasePrice: 1000 }),
    validItem({ barcode: '222', receivedQty: 5, actualPurchasePrice: 500 }),
    validItem({ barcode: '333', receivedQty: 0, actualPurchasePrice: 999999 }),
  ])
  check('workbook reports the accepted total', totals.totalAmount === 4500)
  check(
    'the rejected line is absent from the amount as well as the rows',
    buildReceivingUmagFilename({
      expectedDeliveryDate: '2026-08-14',
      supplierName: 'Албини',
      exportTotalAmount: totals.totalAmount,
      version: 1,
    }) === 'UMAG_2026-08-14_Албини_4500тг_v1.xlsx'
  )
  console.log('')
}

function stageUiWiring() {
  console.log('Stage 5: Receiving screen passes the accepted total')

  const page = readFileSync(
    new URL('../src/pages/platform/receiving/ReceivingDetailPage.jsx', import.meta.url),
    'utf8'
  )

  check(
    'the screen reads totals from the built workbook',
    page.includes('exported.totals') &&
      !/const totalAmount = exported\.rows\.reduce/.test(page)
  )
  check(
    'the accepted total is handed to the filename explicitly',
    page.includes('exportTotalAmount: totalAmount')
  )
  check(
    'the workbook is built before the name that describes it',
    page.indexOf('createReceivingUmagXlsx(') < page.indexOf('buildReceivingUmagFilename(')
  )
  check(
    'the stored export record still gets both totals',
    page.includes('totalQuantity,') && page.includes('totalAmount,')
  )
  check(
    'the version handed over is the incremented export version',
    page.includes('const exportVersion = Number(document.exportVersion || 0) + 1') &&
      page.includes('version: exportVersion')
  )
  console.log('')
}

async function main() {
  console.log('=== Receiving UMAG export verification ===\n')
  stagePureContract()
  stageValidation()
  stageFilename()
  stageComment()
  stageTotals()
  await stageBinaryWorkbook()
  stageUiWiring()
  console.log(`Verification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

main().catch((error) => {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
})
