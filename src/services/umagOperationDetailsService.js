/**
 * Lazy-loaded UMAG operation product lines (supply / supply return).
 * Cache lives in Supabase; Edge Function refreshes from UMAG on miss/stale.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import { formatUmagMoney, formatUmagDate, formatUmagDateTime, formatSignedUmagMoney } from './umagSettlementsService'

export const OPERATION_DETAIL_ERROR_CODES = {
  NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  SOURCE_DELETED: 'DOCUMENT_SOURCE_DELETED',
  LOAD_FAILED: 'LOAD_FAILED',
  EMPTY: 'EMPTY',
  FORBIDDEN: 'FORBIDDEN',
  NETWORK: 'NETWORK',
}

function assertCloudReady() {
  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) {
    throw new Error('Детали операции доступны только в облачном режиме')
  }
}

function toNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function isoEqual(a, b) {
  if (!a && !b) return true
  if (!a || !b) return false
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta === tb
  return a === b
}

export function normalizeOperationItem(row) {
  if (!row) return null
  return {
    id: row.id ?? null,
    umagLineId: row.umagLineId ?? row.umag_line_id ?? null,
    umagProductId: row.umagProductId ?? row.umag_product_id ?? null,
    productName: row.productName || row.product_name || 'Без названия',
    barcode: row.barcode || null,
    unit: row.unit || null,
    quantity: toNumber(row.quantity),
    purchasePrice:
      row.purchasePrice == null && row.purchase_price == null
        ? null
        : toNumber(row.purchasePrice ?? row.purchase_price, null),
    sellingPrice:
      row.sellingPrice == null && row.selling_price == null
        ? null
        : toNumber(row.sellingPrice ?? row.selling_price, null),
    lineAmount:
      row.lineAmount == null && row.line_amount == null
        ? null
        : toNumber(row.lineAmount ?? row.line_amount, null),
    isBonus: Boolean(row.isBonus ?? row.is_bonus),
    sortIndex: toNumber(row.sortIndex ?? row.sort_index),
  }
}

export function filterOperationItems(items, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase()
  if (!q) return items || []
  return (items || []).filter((item) => {
    const name = String(item.productName || '').toLowerCase()
    const barcode = String(item.barcode || '').toLowerCase()
    return name.includes(q) || barcode.includes(q)
  })
}

export function buildItemTotals(items, headerAmount) {
  const list = items || []
  const lineCount = list.length
  const quantitySum = list.reduce((sum, item) => sum + toNumber(item.quantity), 0)
  const lineAmountSum = list.reduce((sum, item) => sum + toNumber(item.lineAmount), 0)
  const header = Math.abs(toNumber(headerAmount))
  const difference = Number((lineAmountSum - header).toFixed(4))
  return {
    lineCount,
    quantitySum,
    lineAmountSum,
    headerAmount: header,
    difference,
    differenceNotable: Math.abs(difference) > 0.05,
  }
}

async function readSupplyCache(umagSupplyId) {
  const { data: doc, error: docError } = await supabase
    .from('umag_supplies')
    .select(
      'id, umag_supply_id, supplier_name, doc_time, umag_edit_time, amount, payment_amount, debt, comment, umag_user_name, account, is_source_deleted, items_synced_at, items_source_updated_at'
    )
    .eq('umag_supply_id', umagSupplyId)
    .maybeSingle()
  if (docError) throw new Error(docError.message || 'Не удалось прочитать приёмку')
  if (!doc || doc.is_source_deleted) {
    const err = new Error('Документ больше не найден в UMAG')
    err.code = OPERATION_DETAIL_ERROR_CODES.NOT_FOUND
    throw err
  }

  const fresh =
    Boolean(doc.items_synced_at) && isoEqual(doc.items_source_updated_at, doc.umag_edit_time)

  let items = []
  if (fresh) {
    const { data, error } = await supabase
      .from('umag_supply_items')
      .select(
        'id, umag_line_id, umag_product_id, product_name, barcode, unit, quantity, purchase_price, selling_price, line_amount, is_bonus, sort_index'
      )
      .eq('umag_supply_id', umagSupplyId)
      .eq('is_source_deleted', false)
      .order('sort_index', { ascending: true })
    if (error) throw new Error(error.message || 'Не удалось прочитать состав документа')
    items = (data || []).map(normalizeOperationItem)
  }

  return {
    fresh,
    document: {
      id: doc.id,
      umagSupplyId: doc.umag_supply_id,
      supplierName: doc.supplier_name,
      docTime: doc.doc_time,
      amount: toNumber(doc.amount),
      paymentAmount: toNumber(doc.payment_amount),
      debt: toNumber(doc.debt),
      comment: doc.comment,
      userName: doc.umag_user_name,
      account: doc.account,
    },
    items,
  }
}

async function readReturnCache(umagReturnId) {
  const { data: doc, error: docError } = await supabase
    .from('umag_supply_returns')
    .select(
      'id, umag_return_id, supplier_name, document_time, umag_update_time, amount, note, user_name, account_names, is_provided, is_source_deleted, items_synced_at, items_source_updated_at'
    )
    .eq('umag_return_id', umagReturnId)
    .maybeSingle()
  if (docError) throw new Error(docError.message || 'Не удалось прочитать возврат')
  if (!doc || doc.is_source_deleted) {
    const err = new Error('Документ больше не найден в UMAG')
    err.code = OPERATION_DETAIL_ERROR_CODES.NOT_FOUND
    throw err
  }

  const fresh =
    Boolean(doc.items_synced_at) && isoEqual(doc.items_source_updated_at, doc.umag_update_time)

  let items = []
  if (fresh) {
    const { data, error } = await supabase
      .from('umag_supply_return_items')
      .select(
        'id, umag_line_id, umag_product_id, product_name, barcode, unit, quantity, purchase_price, line_amount, is_bonus, sort_index'
      )
      .eq('umag_return_id', umagReturnId)
      .eq('is_source_deleted', false)
      .order('sort_index', { ascending: true })
    if (error) throw new Error(error.message || 'Не удалось прочитать состав документа')
    items = (data || []).map((row) => normalizeOperationItem({ ...row, selling_price: null }))
  }

  return {
    fresh,
    document: {
      id: doc.id,
      umagReturnId: doc.umag_return_id,
      supplierName: doc.supplier_name,
      documentTime: doc.document_time,
      amount: toNumber(doc.amount),
      note: doc.note,
      userName: doc.user_name,
      accountNames: doc.account_names,
      isProvided: doc.is_provided,
    },
    items,
  }
}

async function invokeDetails({ operationType, operationId, forceRefresh = false }) {
  const { data, error } = await supabase.functions.invoke('umag-operation-details', {
    body: {
      action: 'get_details',
      operationType,
      operationId,
      forceRefresh,
    },
  })

  if (error) {
    const err = new Error(error.message || 'Не удалось загрузить состав документа')
    err.code = OPERATION_DETAIL_ERROR_CODES.NETWORK
    throw err
  }

  if (data?.success === false) {
    const err = new Error(data.message || 'Не удалось загрузить состав документа')
    err.code = data.code || OPERATION_DETAIL_ERROR_CODES.LOAD_FAILED
    throw err
  }

  return {
    cache: data.cache || 'miss',
    document: data.document,
    items: (data.items || []).map(normalizeOperationItem),
    totals: data.totals || buildItemTotals(data.items || [], data.document?.amount),
    payloadFieldHints: data.payloadFieldHints || null,
  }
}

/**
 * Load operation details: local cache first, Edge/UMAG only on miss/stale/force.
 */
export async function fetchOperationDetails({
  operationType,
  operationId,
  forceRefresh = false,
}) {
  assertCloudReady()
  if (!operationId) {
    const err = new Error('Некорректный идентификатор операции')
    err.code = OPERATION_DETAIL_ERROR_CODES.LOAD_FAILED
    throw err
  }

  if (!forceRefresh) {
    const cached =
      operationType === 'supply'
        ? await readSupplyCache(operationId)
        : await readReturnCache(operationId)
    if (cached.fresh) {
      return {
        cache: 'hit',
        document: cached.document,
        items: cached.items,
        totals: buildItemTotals(cached.items, cached.document.amount),
        payloadFieldHints: null,
      }
    }
  }

  return invokeDetails({ operationType, operationId, forceRefresh })
}

export {
  formatUmagMoney,
  formatUmagDate,
  formatUmagDateTime,
  formatSignedUmagMoney,
}
