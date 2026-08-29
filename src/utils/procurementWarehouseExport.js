/**
 * Full per-SKU XLSX dump of a procurement snapshot for «Склад» — every item,
 * not just orderable ones (contrast with procurementPlanExport.js, which is
 * scoped to the planning table's 5-column order-sheet contract).
 *
 * "Дополнительный штрихкод" is deliberately not a column here yet — the
 * UMAG integration doesn't fetch a second barcode anywhere in the codebase,
 * so there is nothing real to put in that column. Add it once that's wired.
 */

export const WAREHOUSE_EXPORT_COLUMNS = Object.freeze([
  '№',
  'Товар',
  'Штрихкод',
  'Категория',
  'Подкатегория',
  'Остаток',
  'Ед. изм.',
  'Закупочная цена',
  'Продажная цена',
  'Сумма закупки',
  'Сумма продажи',
])

const BARCODE_COL_INDEX = 2

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

function round2(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/** Map full snapshot items (any source: page, or the full export scan) to export rows. */
export function mapWarehouseItemsForExport(items) {
  const list = Array.isArray(items) ? items : []
  return list.map((item, index) => {
    const stock = Number(item.rawStock) || 0
    const purchasePrice = Number(item.purchasePrice) || 0
    const sellingPrice = Number(item.sellingPrice) || 0
    return {
      '№': index + 1,
      Товар: item.productName || '',
      Штрихкод: item.barcode || '',
      Категория: item.categoryName || '',
      Подкатегория: item.subcategoryName || '',
      Остаток: stock,
      'Ед. изм.': item.measure || '',
      'Закупочная цена': purchasePrice,
      'Продажная цена': sellingPrice,
      'Сумма закупки': round2(stock * purchasePrice),
      'Сумма продажи': round2(stock * sellingPrice),
    }
  })
}

function rowsToAoa(rows) {
  return [
    [...WAREHOUSE_EXPORT_COLUMNS],
    ...rows.map((row) =>
      WAREHOUSE_EXPORT_COLUMNS.map((key) => (key === 'Штрихкод' ? String(row[key] ?? '') : row[key]))
    ),
  ]
}

/** Net sum across every row — negative-stock rows already carry a negative "Сумма ...", so this nets automatically. */
function buildTotalsRow(rows) {
  let totalPurchase = 0
  let totalSelling = 0
  for (const row of rows) {
    totalPurchase += Number(row['Сумма закупки']) || 0
    totalSelling += Number(row['Сумма продажи']) || 0
  }
  const arr = new Array(WAREHOUSE_EXPORT_COLUMNS.length).fill('')
  arr[WAREHOUSE_EXPORT_COLUMNS.indexOf('Товар')] = 'Итого:'
  arr[WAREHOUSE_EXPORT_COLUMNS.indexOf('Сумма закупки')] = round2(totalPurchase)
  arr[WAREHOUSE_EXPORT_COLUMNS.indexOf('Сумма продажи')] = round2(totalSelling)
  return arr
}

function buildFilename(syncedAt) {
  const key = syncedAt ? new Date(syncedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-') : 'export'
  return `sklad_${safeFilenamePart(key)}.xlsx`
}

/**
 * @param {Array<object>} items — full snapshot items (from exportSnapshotItemsCsv, no filters)
 * @param {{ syncedAt?: string }} [options]
 */
export async function exportWarehouseSnapshotXlsx(items, options = {}) {
  const rows = mapWarehouseItemsForExport(items)
  const aoa = rowsToAoa(rows)
  if (rows.length > 0) aoa.push(buildTotalsRow(rows))
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  ws['!cols'] = [
    { wch: 6 },
    { wch: 42 },
    { wch: 16 },
    { wch: 22 },
    { wch: 22 },
    { wch: 10 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ]

  const lastRow = Math.max(1, rows.length + 1)
  ws['!autofilter'] = { ref: `A1:K${lastRow}` }
  ws['!views'] = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2', activeCell: 'A2' }]

  for (let c = 0; c < WAREHOUSE_EXPORT_COLUMNS.length; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[addr]) continue
    ws[addr].s = { font: { bold: true } }
  }

  if (rows.length > 0) {
    const totalsRowIndex = rows.length + 1
    for (let c = 0; c < WAREHOUSE_EXPORT_COLUMNS.length; c += 1) {
      const addr = XLSX.utils.encode_cell({ r: totalsRowIndex, c })
      if (!ws[addr]) continue
      ws[addr].s = { font: { bold: true }, border: { top: { style: 'thin' } } }
    }
  }

  // Keep long numeric barcodes as text — otherwise Excel renders them in
  // scientific notation and the leading digits get silently lost.
  for (let r = 1; r <= rows.length; r += 1) {
    const addr = XLSX.utils.encode_cell({ r, c: BARCODE_COL_INDEX })
    const cell = ws[addr]
    if (!cell) continue
    cell.t = 's'
    cell.v = String(cell.v ?? '')
    cell.z = '@'
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Склад')
  const filename = buildFilename(options.syncedAt)
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true })
  downloadBlob(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename
  )
  return { filename, rowsCount: rows.length }
}
