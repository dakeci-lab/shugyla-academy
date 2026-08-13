/**
 * UMAG receiving import contract.
 *
 * Pure validation/mapping helpers intentionally live separately from the
 * browser download function so the exact workbook can be verified in Node.
 */

export const RECEIVING_UMAG_COLUMNS = Object.freeze([
  'Штрихкод',
  'Количество',
  'Название',
  'Ед. изм.',
  'Цена',
])

export const RECEIVING_UMAG_SHEET_NAME = 'Приёмка'

const UNIT_ALIASES = new Map([
  ['шт', 'шт.'],
  ['шт.', 'шт.'],
  ['штука', 'шт.'],
  ['штуки', 'шт.'],
  ['штук', 'шт.'],
  ['pc', 'шт.'],
  ['pcs', 'шт.'],
  ['piece', 'шт.'],
  ['kg', 'кг'],
  ['кг', 'кг'],
  ['l', 'л'],
  ['л', 'л'],
  ['л.', 'л'],
  ['литр', 'л'],
  ['литра', 'л'],
  ['литров', 'л'],
])

const QUANTITY_KEYS = [
  'actualQty',
  'actual_qty',
  'receivedQty',
  'received_qty',
]
const PRICE_KEYS = [
  'actualPurchasePrice',
  'actual_purchase_price',
  'actualPrice',
  'actual_price',
]
const PRODUCT_NAME_KEYS = ['productName', 'product_name', 'name']
const UNIT_KEYS = [
  'unit',
  'measure',
  'measureUnit',
  'measure_unit',
  'measurementUnit',
  'measurement_unit',
]

function firstDefinedValue(source, keys) {
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key]
    }
  }
  return undefined
}

function firstNonBlankText(source, keys) {
  for (const key of keys) {
    const value = source?.[key]
    if (value == null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

function parseLocalizedNumber(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const normalized = String(value).trim().replace(',', '.')
  if (!normalized) return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function hasAtMostDecimalPlaces(value, decimalPlaces) {
  const factor = 10 ** decimalPlaces
  const scaled = value * factor
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 16
  return Math.abs(scaled - Math.round(scaled)) <= tolerance
}

function validationError(index, field, code, message) {
  return { index, field, code, message }
}

export class ReceivingUmagExportValidationError extends Error {
  constructor(errors) {
    super(errors?.[0]?.message || 'Не удалось подготовить файл для UMAG.')
    this.name = 'ReceivingUmagExportValidationError'
    this.errors = Array.isArray(errors) ? errors : []
  }
}

/** Normalize supported UMAG receiving units to the file representation. */
export function normalizeReceivingUmagUnit(value) {
  const normalized = String(value ?? '').trim().toLocaleLowerCase('ru')
  return UNIT_ALIASES.get(normalized) || null
}

/**
 * Validate and map one receiving item.
 * A valid zero-quantity row is deliberately skipped from the UMAG file.
 */
export function validateReceivingUmagItem(item, index = 0) {
  const errors = []
  const rawQuantity = firstDefinedValue(item, QUANTITY_KEYS)
  const quantity = parseLocalizedNumber(rawQuantity)

  if (rawQuantity == null || rawQuantity === '') {
    errors.push(
      validationError(index, 'quantity', 'quantity_required', `Позиция ${index + 1}: укажите фактическое количество.`)
    )
    return { valid: false, skip: false, row: null, errors }
  }
  if (quantity == null) {
    errors.push(
      validationError(index, 'quantity', 'quantity_invalid', `Позиция ${index + 1}: количество должно быть числом.`)
    )
    return { valid: false, skip: false, row: null, errors }
  }
  if (quantity < 0) {
    errors.push(
      validationError(index, 'quantity', 'quantity_negative', `Позиция ${index + 1}: количество не может быть отрицательным.`)
    )
    return { valid: false, skip: false, row: null, errors }
  }
  if (quantity === 0) {
    return { valid: true, skip: true, row: null, errors: [] }
  }

  const barcode = String(item?.barcode ?? '').trim()
  const productName = firstNonBlankText(item, PRODUCT_NAME_KEYS)
  const rawUnit = firstNonBlankText(item, UNIT_KEYS)
  const unit = normalizeReceivingUmagUnit(rawUnit)
  const rawPrice = firstDefinedValue(item, PRICE_KEYS)
  const price = parseLocalizedNumber(rawPrice)

  if (!barcode) {
    errors.push(
      validationError(index, 'barcode', 'barcode_required', `Позиция ${index + 1}: не указан штрихкод.`)
    )
  }
  if (!productName) {
    errors.push(
      validationError(index, 'productName', 'product_name_required', `Позиция ${index + 1}: не указано название товара.`)
    )
  }
  if (!rawUnit) {
    errors.push(
      validationError(index, 'unit', 'unit_required', `Позиция ${index + 1}: не указана единица измерения.`)
    )
  } else if (!unit) {
    errors.push(
      validationError(index, 'unit', 'unit_unsupported', `Позиция ${index + 1}: единица «${rawUnit}» не поддерживается.`)
    )
  }

  if (unit === 'шт.' && !Number.isInteger(quantity)) {
    errors.push(
      validationError(index, 'quantity', 'quantity_integer_required', `Позиция ${index + 1}: количество в штуках должно быть целым.`)
    )
  } else if ((unit === 'кг' || unit === 'л') && !hasAtMostDecimalPlaces(quantity, 3)) {
    errors.push(
      validationError(index, 'quantity', 'quantity_precision', `Позиция ${index + 1}: для кг и л допустимо не более 3 знаков после запятой.`)
    )
  }

  if (rawPrice == null || rawPrice === '') {
    errors.push(
      validationError(index, 'price', 'price_required', `Позиция ${index + 1}: укажите фактическую закупочную цену.`)
    )
  } else if (price == null) {
    errors.push(
      validationError(index, 'price', 'price_invalid', `Позиция ${index + 1}: закупочная цена должна быть числом.`)
    )
  } else if (price < 0) {
    errors.push(
      validationError(index, 'price', 'price_negative', `Позиция ${index + 1}: закупочная цена не может быть отрицательной.`)
    )
  } else if (!hasAtMostDecimalPlaces(price, 2)) {
    errors.push(
      validationError(index, 'price', 'price_precision', `Позиция ${index + 1}: цена должна иметь не более 2 знаков после запятой.`)
    )
  }

  return {
    valid: errors.length === 0,
    skip: false,
    row:
      errors.length === 0
        ? {
            Штрихкод: barcode,
            Количество: quantity,
            Название: productName,
            'Ед. изм.': unit,
            Цена: price,
          }
        : null,
    errors,
  }
}

/** Validate a full receipt and enforce one exported row per barcode. */
export function validateReceivingUmagItems(items) {
  if (!Array.isArray(items)) {
    return {
      valid: false,
      rows: [],
      errors: [
        validationError(-1, 'items', 'items_invalid', 'Позиции приёмки не переданы.'),
      ],
    }
  }

  const rows = []
  const errors = []
  const firstIndexByBarcode = new Map()

  items.forEach((item, index) => {
    const result = validateReceivingUmagItem(item, index)
    errors.push(...result.errors)
    if (!result.valid || result.skip || !result.row) return

    const barcode = result.row.Штрихкод
    if (firstIndexByBarcode.has(barcode)) {
      const firstIndex = firstIndexByBarcode.get(barcode)
      errors.push(
        validationError(
          index,
          'barcode',
          'barcode_duplicate',
          `Позиция ${index + 1}: штрихкод ${barcode} уже использован в позиции ${firstIndex + 1}.`
        )
      )
      return
    }

    firstIndexByBarcode.set(barcode, index)
    rows.push(result.row)
  })

  if (rows.length === 0 && errors.length === 0) {
    errors.push(
      validationError(-1, 'items', 'items_empty', 'Нет принятых позиций для выгрузки в UMAG.')
    )
  }

  return { valid: errors.length === 0, rows, errors }
}

export function mapReceivingItemsToUmagRows(items) {
  const result = validateReceivingUmagItems(items)
  if (!result.valid) throw new ReceivingUmagExportValidationError(result.errors)
  return result.rows
}

export function receivingUmagRowsToAoa(rows) {
  const list = Array.isArray(rows) ? rows : []
  return [
    [...RECEIVING_UMAG_COLUMNS],
    ...list.map((row) => RECEIVING_UMAG_COLUMNS.map((column) => row[column])),
  ]
}

export function sanitizeReceivingUmagFilenamePart(value, fallback = 'UNKNOWN') {
  const safe = String(value ?? '')
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]+/gu, '_')
    .replace(/[-_]{2,}/g, '_')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 60)
  return safe || fallback
}

function stripDocumentPrefix(value, prefix) {
  return String(value ?? '')
    .trim()
    .replace(new RegExp(`^${prefix}[-_\\s]*`, 'i'), '')
}

export function normalizeReceivingInvoiceNumbers(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[,;\n]+/)
  return source.map((part) => String(part ?? '').trim()).filter(Boolean)
}

/** Build the human-readable comment that the user copies into UMAG. */
export function buildReceivingUmagComment(options = {}) {
  const orderNumber = stripDocumentPrefix(
    options.purchaseOrderNumber ?? options.orderNumber ?? options.purchaseOrderId,
    'PO'
  )
  const invoiceNumbers = normalizeReceivingInvoiceNumbers(
    options.invoiceNumbers ?? options.supplierInvoiceNumbers ?? options.invoiceNumber
  )
  const parts = []

  if (orderNumber) parts.push(`Заказ Shugyla №${orderNumber}`)
  if (invoiceNumbers.length === 1) {
    parts.push(`Накладная поставщика №${invoiceNumbers[0]}`)
  } else if (invoiceNumbers.length > 1) {
    parts.push(`Накладные поставщика ${invoiceNumbers.map((number) => `№${number}`).join(', ')}`)
  }

  return parts.join('; ') || 'Приёмка Shugyla'
}

/** Build a path-safe, versioned filename for the UMAG import file. */
export function buildReceivingUmagFilename(options = {}) {
  const rawOrderNumber =
    options.purchaseOrderNumber ?? options.orderNumber ?? options.purchaseOrderId
  const orderNumber = sanitizeReceivingUmagFilenamePart(
    stripDocumentPrefix(rawOrderNumber, 'PO'),
    'UNKNOWN'
  )
  const invoiceNumbers = normalizeReceivingInvoiceNumbers(
    options.invoiceNumbers ?? options.supplierInvoiceNumbers ?? options.invoiceNumber
  )
  const invoicePart = sanitizeReceivingUmagFilenamePart(
    invoiceNumbers.map((number) => stripDocumentPrefix(number, 'INV')).join('-'),
    'NO-INVOICE'
  )
  const rawVersion = options.version ?? options.exportVersion ?? options.revision ?? 1
  const parsedVersion = Number(rawVersion)
  const version = Number.isInteger(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1

  return `UMAG_PO-${orderNumber}_INV-${invoicePart}_v${version}.xlsx`
}

/**
 * Create the exact binary XLSX that will later be downloaded in the browser.
 * Does not touch the DOM or the filesystem.
 */
export async function createReceivingUmagXlsx(items) {
  const rows = mapReceivingItemsToUmagRows(items)
  const aoa = receivingUmagRowsToAoa(rows)
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet(aoa)

  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 12 },
    { wch: 44 },
    { wch: 12 },
    { wch: 14 },
  ]
  worksheet['!autofilter'] = { ref: `A1:E${rows.length + 1}` }
  worksheet['!views'] = [
    { state: 'frozen', ySplit: 1, topLeftCell: 'A2', activeCell: 'A2' },
  ]

  for (let column = 0; column < RECEIVING_UMAG_COLUMNS.length; column += 1) {
    const address = XLSX.utils.encode_cell({ r: 0, c: column })
    worksheet[address].s = { font: { bold: true } }
  }
  for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
    const barcodeCell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })]
    barcodeCell.t = 's'
    barcodeCell.v = String(barcodeCell.v ?? '')
    barcodeCell.z = '@'

    const quantityCell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 1 })]
    quantityCell.t = 'n'
    quantityCell.z = '0.###'

    const priceCell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 4 })]
    priceCell.t = 'n'
    priceCell.z = '0.00'
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, RECEIVING_UMAG_SHEET_NAME)
  const output = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    cellStyles: true,
  })

  return {
    bytes: new Uint8Array(output),
    rows,
    rowsCount: rows.length,
  }
}

function downloadBlob(blob, filename) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('Скачивание файла доступно только в браузере.')
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Download already validated workbook bytes without rebuilding the file. */
export async function downloadReceivingUmagXlsxBytes(bytes, filename) {
  const safeFilename = String(filename || '').trim()
  if (!safeFilename) throw new Error('Не указано имя файла выгрузки UMAG.')
  const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  if (payload.length === 0) throw new Error('Файл выгрузки UMAG пуст.')
  downloadBlob(
    new Blob([payload], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    safeFilename
  )
}

/** Validate, create and download a versioned UMAG XLSX in the browser. */
export async function downloadReceivingUmagXlsx(items, options = {}) {
  const { bytes, rows, rowsCount } = await createReceivingUmagXlsx(items)
  const filename = buildReceivingUmagFilename(options)
  const comment = buildReceivingUmagComment(options)
  await downloadReceivingUmagXlsxBytes(bytes, filename)
  return { filename, comment, rows, rowsCount }
}
