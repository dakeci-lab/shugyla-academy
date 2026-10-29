/**
 * Real XLSX + PDF export for analytics purchase orders (Cyrillic-safe).
 */

import { mapPurchaseOrderForExport } from './procurementPlanningMath'
import { ORDER_LABELS as L, formatOrderTitle } from '../config/documentLabels'

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

/** dd.mm.yyyy in both formats (the app shows dates this way); empty stays empty. */
function formatDocDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('ru-RU')
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
  // Column A holds the row number; the order header and totals sit in B/C so the narrow number column does not clip their labels.
  const sheetRows = [
    ...(mapped.number ? [['', L.docNumber, mapped.number]] : []),
    ['', L.supplier, mapped.supplierName],
    ['', L.orderDate, formatDocDate(mapped.purchaseDate)],
    ['', L.delivery, formatDocDate(mapped.expectedDeliveryDate)],
    ['', L.createdBy, mapped.createdByName],
    ['', L.comment, mapped.comment],
    [],
    [L.number, L.product, L.barcode, L.qty, L.price, L.amount],
    ...mapped.items.map((item, index) => [
      index + 1,
      item.productName,
      item.barcode,
      item.orderedQty,
      item.purchasePrice,
      item.lineTotal,
    ]),
    [],
    ['', L.totalItems, mapped.itemsCount],
    ['', L.totalAmount, mapped.totalAmount],
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(sheetRows)
  ws['!cols'] = [{ wch: 5 }, { wch: 40 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Заказ')
  const filename = `zakup_${mapped.number ? `${mapped.number}_` : ''}${safeFilenamePart(mapped.supplierName)}_${mapped.purchaseDate || 'export'}.xlsx`
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
      { text: L.number, style: 'tableHeader' },
      { text: L.product, style: 'tableHeader' },
      { text: L.barcode, style: 'tableHeader' },
      { text: L.qty, style: 'tableHeader' },
      { text: L.price, style: 'tableHeader' },
      { text: L.amount, style: 'tableHeader' },
    ],
    ...mapped.items.map((item, index) => [
      String(index + 1),
      item.productName || '',
      item.barcode || '',
      formatQty(item.orderedQty),
      formatMoney(item.purchasePrice),
      formatMoney(item.lineTotal),
    ]),
  ]

  const docDefinition = {
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    content: [
      { text: formatOrderTitle(mapped.number), style: 'title' },
      {
        text: [{ text: `${L.supplier}: `, bold: true }, mapped.supplierName || ''],
        margin: [0, 8, 0, 2],
      },
      {
        text: [
          { text: `${L.orderDate}: `, bold: true },
          formatDocDate(mapped.purchaseDate),
          '   ',
          { text: `${L.delivery}: `, bold: true },
          formatDocDate(mapped.expectedDeliveryDate),
        ],
        margin: [0, 0, 0, 2],
      },
      {
        text: [{ text: `${L.createdBy}: `, bold: true }, mapped.createdByName || ''],
        margin: [0, 0, 0, mapped.comment ? 2 : 8],
      },
      ...(mapped.comment
        ? [{ text: [{ text: `${L.comment}: `, bold: true }, mapped.comment], margin: [0, 0, 0, 8] }]
        : []),
      {
        table: {
          headerRows: 1,
          widths: [24, '*', 90, 50, 60, 60],
          body,
        },
        layout: 'lightHorizontalLines',
      },
      {
        text: `${L.totalItems}: ${mapped.itemsCount} · ${L.totalAmount}: ${formatMoney(mapped.totalAmount)}`,
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

  const filename = `zakup_${mapped.number ? `${mapped.number}_` : ''}${safeFilenamePart(mapped.supplierName)}_${mapped.purchaseDate || 'export'}.pdf`

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
