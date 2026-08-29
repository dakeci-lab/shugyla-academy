/** XLSX export for the «Продажи» category/subcategory table, modeled on procurementWarehouseExport.js. */

export const SALES_CATEGORIES_EXPORT_COLUMNS = Object.freeze([
  'Категория',
  'Подкатегория',
  'Выручка',
  'Себестоимость',
  'Маржа',
  'Наценка, %',
  'Δ к прошлому году, %',
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

function round2(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function markupPct(row) {
  return row.revenue > 0 ? round2((row.profit / row.revenue) * 100) : 0
}

/** Flattens category+subcategory YoY rows (from buildCategoryYoyRows) into export rows. */
export function mapSalesCategoriesForExport(rows) {
  const list = Array.isArray(rows) ? rows : []
  const flat = []
  for (const row of list) {
    flat.push({
      Категория: row.categoryName,
      Подкатегория: '',
      Выручка: round2(row.revenue),
      Себестоимость: round2(row.cogs),
      Маржа: round2(row.profit),
      'Наценка, %': markupPct(row),
      'Δ к прошлому году, %': row.deltaPct == null ? '' : round2(row.deltaPct),
    })
    for (const sub of row.subRows) {
      flat.push({
        Категория: row.categoryName,
        Подкатегория: sub.subcategoryName,
        Выручка: round2(sub.revenue),
        Себестоимость: round2(sub.cogs),
        Маржа: round2(sub.profit),
        'Наценка, %': markupPct(sub),
        'Δ к прошлому году, %': sub.deltaPct == null ? '' : round2(sub.deltaPct),
      })
    }
  }
  return flat
}

function rowsToAoa(rows) {
  return [
    [...SALES_CATEGORIES_EXPORT_COLUMNS],
    ...rows.map((row) => SALES_CATEGORIES_EXPORT_COLUMNS.map((key) => row[key])),
  ]
}

export async function exportSalesCategoriesXlsx(rows, { currentYear } = {}) {
  const exportRows = mapSalesCategoriesForExport(rows)
  const aoa = rowsToAoa(exportRows)
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  ws['!cols'] = [
    { wch: 26 },
    { wch: 26 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 16 },
  ]

  const lastRow = Math.max(1, exportRows.length + 1)
  ws['!autofilter'] = { ref: `A1:G${lastRow}` }
  ws['!views'] = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2', activeCell: 'A2' }]

  for (let c = 0; c < SALES_CATEGORIES_EXPORT_COLUMNS.length; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[addr]) continue
    ws[addr].s = { font: { bold: true } }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Продажи')
  const filename = `sales_categories_${currentYear || 'export'}.xlsx`
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true })
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename
  )
  return { filename, rowsCount: exportRows.length }
}
