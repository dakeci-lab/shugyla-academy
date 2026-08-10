/**
 * Pure mapping + XLSX/PDF export for the procurement planning table.
 * Contract: exactly 5 columns — №, Товар, Штрихкод, Поставщик, Заказ.
 */

export const PLAN_EXPORT_COLUMNS = Object.freeze([
  '№',
  'Товар',
  'Штрихкод',
  'Поставщик',
  'Заказ',
])

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeFilenamePart(value) {
  return String(value || 'export')
    .replace(/[^\p{L}\p{N}\-_]+/gu, '_')
    .replace(/_+/g, '_')
    .slice(0, 60)
}

function productNameOf(item) {
  return String(item?.productName ?? item?.product_name ?? '')
}

function barcodeOf(item) {
  const raw = item?.barcode
  if (raw == null) return ''
  return String(raw)
}

function supplierNameOf(item) {
  return item?.umagSupplierName || item?.umag_supplier_name || '—'
}

function finalOrderQtyOf(item) {
  const n = Number(item?.finalOrderQty ?? item?.final_order_qty ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Map snapshot items (any page / full filter set) to the export row contract.
 * @param {Array<object>} items
 * @returns {Array<{ '№': number, 'Товар': string, 'Штрихкод': string, 'Поставщик': string, 'Заказ': number }>}
 */
export function mapPlanItemsForExport(items) {
  const list = Array.isArray(items) ? items : []
  return list.map((item, index) => ({
    '№': index + 1,
    Товар: productNameOf(item),
    Штрихкод: barcodeOf(item),
    Поставщик: supplierNameOf(item),
    Заказ: finalOrderQtyOf(item),
  }))
}

/** Convert mapped rows to AOA with the fixed header order. */
export function planExportRowsToAoa(rows) {
  const list = Array.isArray(rows) ? rows : []
  return [
    [...PLAN_EXPORT_COLUMNS],
    ...list.map((row) =>
      PLAN_EXPORT_COLUMNS.map((key) => (key === 'Штрихкод' ? String(row[key] ?? '') : row[key]))
    ),
  ]
}

function buildFilename(extension, periodTo) {
  return `plan_zakupok_${safeFilenamePart(periodTo || 'export')}.${extension}`
}

function applyBarcodeTextCells(XLSX, ws, dataRowCount) {
  for (let r = 1; r <= dataRowCount; r += 1) {
    const addr = XLSX.utils.encode_cell({ r, c: 2 })
    const cell = ws[addr]
    if (!cell) continue
    cell.t = 's'
    cell.v = String(cell.v ?? '')
    cell.z = '@'
  }
}

/**
 * @param {Array<object>} items — full filtered set from exportSnapshotItemsCsv
 * @param {{ periodTo?: string }} [options]
 */
export async function exportProcurementPlanXlsx(items, options = {}) {
  const mapped = mapPlanItemsForExport(items)
  const aoa = planExportRowsToAoa(mapped)
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  ws['!cols'] = [
    { wch: 6 },
    { wch: 42 },
    { wch: 18 },
    { wch: 28 },
    { wch: 10 },
  ]

  const lastRow = Math.max(1, mapped.length + 1)
  ws['!autofilter'] = { ref: `A1:E${lastRow}` }
  ws['!views'] = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2', activeCell: 'A2' }]

  // Bold header
  for (let c = 0; c < PLAN_EXPORT_COLUMNS.length; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[addr]) continue
    ws[addr].s = { font: { bold: true } }
  }

  applyBarcodeTextCells(XLSX, ws, mapped.length)

  XLSX.utils.book_append_sheet(wb, ws, 'План')
  const filename = buildFilename('xlsx', options.periodTo)
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true })
  downloadBlob(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename
  )
  return { filename, rowsCount: mapped.length }
}

/**
 * @param {Array<object>} items
 * @param {{ periodFrom?: string, periodTo?: string }} [options]
 */
export async function exportProcurementPlanPdf(items, options = {}) {
  const mapped = mapPlanItemsForExport(items)
  const pdfMakeModule = await import('pdfmake/build/pdfmake')
  const pdfFontsModule = await import('pdfmake/build/vfs_fonts')
  const pdfMake = pdfMakeModule.default || pdfMakeModule
  const vfs =
    pdfFontsModule.default?.pdfMake?.vfs ||
    pdfFontsModule.pdfMake?.vfs ||
    pdfFontsModule.default?.vfs ||
    pdfFontsModule.vfs
  if (vfs) pdfMake.vfs = vfs

  const body = [
    PLAN_EXPORT_COLUMNS.map((label) => ({ text: label, style: 'tableHeader' })),
    ...mapped.map((row) => [
      String(row['№']),
      row.Товар || '—',
      String(row.Штрихкод || ''),
      row.Поставщик || '—',
      String(row.Заказ ?? 0),
    ]),
  ]

  const periodLabel = [options.periodFrom, options.periodTo].filter(Boolean).join(' — ')

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 28, 28, 28],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    content: [
      { text: 'План закупок', style: 'title' },
      periodLabel
        ? {
            text: [{ text: 'Период: ', bold: true }, periodLabel],
            margin: [0, 4, 0, 10],
          }
        : { text: '', margin: [0, 0, 0, 8] },
      {
        table: {
          headerRows: 1,
          widths: [36, '*', 110, 160, 50],
          body,
        },
        layout: 'lightHorizontalLines',
      },
      {
        text: `Позиций: ${mapped.length}`,
        margin: [0, 10, 0, 0],
        style: 'footer',
      },
    ],
    styles: {
      title: { fontSize: 14, bold: true },
      tableHeader: { bold: true, fillColor: '#f0f0f0' },
      footer: { fontSize: 9, color: '#555555' },
    },
  }

  const filename = buildFilename('pdf', options.periodTo)

  await new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(docDefinition).getBlob((blob) => {
        downloadBlob(blob, filename)
        resolve()
      })
    } catch (err) {
      reject(err)
    }
  })

  return { filename, rowsCount: mapped.length }
}
