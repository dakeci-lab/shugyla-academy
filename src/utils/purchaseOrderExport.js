/**
 * Real XLSX + PDF export for analytics purchase orders (Cyrillic-safe).
 */

import { mapPurchaseOrderForExport } from './procurementPlanningMath'

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
  return String(value || 'order')
    .replace(/[^\p{L}\p{N}\-_]+/gu, '_')
    .replace(/_+/g, '_')
    .slice(0, 60)
}

function formatMoney(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString('ru-KZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatQty(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString('ru-KZ', { maximumFractionDigits: 3 })
}

export async function exportPurchaseOrderXlsx(order) {
  const mapped = mapPurchaseOrderForExport(order)
  const XLSX = await import('xlsx')
  const sheetRows = [
    ['Поставщик', mapped.supplierName],
    ['Дата заказа', mapped.purchaseDate],
    ['Ожидаемая доставка', mapped.expectedDeliveryDate],
    ['Создал', mapped.createdByName],
    ['Комментарий', mapped.comment],
    [],
    ['Товар', 'Штрихкод', 'Кол-во', 'Цена закупки', 'Сумма'],
    ...mapped.items.map((item) => [
      item.productName,
      item.barcode,
      item.orderedQty,
      item.purchasePrice,
      item.lineTotal,
    ]),
    [],
    ['Итого позиций', mapped.itemsCount],
    ['Итого сумма', mapped.totalAmount],
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(sheetRows)
  ws['!cols'] = [{ wch: 40 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Заказ')
  const filename = `zakup_${safeFilenamePart(mapped.supplierName)}_${mapped.purchaseDate || 'export'}.xlsx`
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  downloadBlob(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename
  )
  return { filename, itemsCount: mapped.itemsCount, totalAmount: mapped.totalAmount }
}

export async function exportPurchaseOrderPdf(order) {
  const mapped = mapPurchaseOrderForExport(order)
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
    [
      { text: 'Товар', style: 'tableHeader' },
      { text: 'Штрихкод', style: 'tableHeader' },
      { text: 'Кол-во', style: 'tableHeader' },
      { text: 'Цена', style: 'tableHeader' },
      { text: 'Сумма', style: 'tableHeader' },
    ],
    ...mapped.items.map((item) => [
      item.productName || '—',
      item.barcode || '—',
      formatQty(item.orderedQty),
      formatMoney(item.purchasePrice),
      formatMoney(item.lineTotal),
    ]),
  ]

  const docDefinition = {
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    content: [
      { text: 'Заказ поставщику', style: 'title' },
      {
        text: [
          { text: 'Поставщик: ', bold: true },
          mapped.supplierName || '—',
        ],
        margin: [0, 8, 0, 2],
      },
      {
        text: [
          { text: 'Дата заказа: ', bold: true },
          mapped.purchaseDate || '—',
          '   ',
          { text: 'Поставка: ', bold: true },
          mapped.expectedDeliveryDate || '—',
        ],
        margin: [0, 0, 0, 2],
      },
      {
        text: [
          { text: 'Создал: ', bold: true },
          mapped.createdByName || '—',
        ],
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', 90, 50, 60, 60],
          body,
        },
        layout: 'lightHorizontalLines',
      },
      {
        text: `Итого: ${formatMoney(mapped.totalAmount)} ₸ · позиций: ${mapped.itemsCount}`,
        style: 'total',
        margin: [0, 12, 0, 0],
      },
    ],
    styles: {
      title: { fontSize: 16, bold: true },
      tableHeader: { bold: true, fillColor: '#f0f0f0' },
      total: { fontSize: 12, bold: true },
    },
  }

  const filename = `zakup_${safeFilenamePart(mapped.supplierName)}_${mapped.purchaseDate || 'export'}.pdf`

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

  return { filename, itemsCount: mapped.itemsCount, totalAmount: mapped.totalAmount }
}
