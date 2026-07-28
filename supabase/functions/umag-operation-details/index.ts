/**
 * umag-operation-details — lazy fetch of supply / supply-return product lines.
 *
 * Frontend → this Edge Function → api.umag.kz → cache tables.
 * Never called from bulk umag-sync (avoids N+1).
 *
 * Confirmed endpoints:
 * - GET /rest/cabinet/opr/supplies/v2/{supplyId}/products
 * - GET /rest/cabinet/opr/supply-returns/get/{returnId}
 *
 * Auth: shared umagAuth (signin → sessionToken, one retry on 401/403).
 * Permission: umag.settlements.view
 */

import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import {
  adminErrorResponse,
  authorizeWorkforceRequest,
} from '../_shared/employeeAuthorization.ts'
import { maskStoreId, parseUmagEditTime } from '../_shared/umagConfig.ts'
import { umagFetchAuthed } from '../_shared/umagAuth.ts'

const PERMISSION_VIEW = 'umag.settlements.view'
const ALLOWED_BODY_KEYS = new Set([
  'action',
  'operationType',
  'operationId',
  'forceRefresh',
])
const AMOUNT_EPSILON = 0.05

const MEASURE_LABELS: Record<number, string> = {
  0: 'шт',
  1: 'кг',
  2: 'л',
  3: 'м',
  4: 'м²',
  5: 'м³',
  6: 'уп',
}

type OperationType = 'supply' | 'supply_return'

function umagErrorResponse(
  code: string,
  message: string,
  status = 502,
  extra: Record<string, unknown> = {}
) {
  return jsonResponse({ success: false, code, message, ...extra }, status)
}

function mapUmagAuthError(
  code:
    | 'UMAG_NOT_CONFIGURED'
    | 'UMAG_AUTH_FAILED'
    | 'UMAG_LOGIN_FAILED'
    | 'UMAG_TIMEOUT'
    | 'UMAG_NETWORK_ERROR'
): Response {
  if (code === 'UMAG_NOT_CONFIGURED') {
    return umagErrorResponse('UMAG_NOT_CONFIGURED', 'Подключение к UMAG ещё не настроено.', 503)
  }
  if (code === 'UMAG_AUTH_FAILED' || code === 'UMAG_LOGIN_FAILED') {
    return umagErrorResponse(
      'UMAG_AUTH_FAILED',
      'Не удалось войти в UMAG. Проверьте доступ учётной записи.',
      502
    )
  }
  if (code === 'UMAG_TIMEOUT') {
    return umagErrorResponse(
      'UMAG_TIMEOUT',
      'Превышено время ожидания ответа UMAG. Повторите попытку.',
      504
    )
  }
  return umagErrorResponse(
    'UMAG_NETWORK_ERROR',
    'Не удалось связаться с UMAG. Повторите попытку.',
    502
  )
}

function asNumber(value: unknown, fallback: number | null = null): number | null {
  if (value == null || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asBigIntId(value: unknown): number | null {
  const n = asNumber(value, null)
  if (n == null || !Number.isInteger(n) || n <= 0) return null
  return n
}

function asText(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s || null
}

function pick(obj: Record<string, unknown> | null | undefined, keys: string[]): unknown {
  if (!obj) return undefined
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key]
  }
  return undefined
}

function nestedProduct(row: Record<string, unknown>): Record<string, unknown> | null {
  for (const key of ['product', 'productDto', 'nomenclature']) {
    const value = row[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
  }
  return null
}

function resolveUnit(
  row: Record<string, unknown>,
  product: Record<string, unknown> | null
): string | null {
  const direct = asText(
    pick(row, ['unit', 'unitName', 'unitShortName', 'measureName', 'measureShortName'])
  )
  if (direct) return direct
  if (product) {
    const fromProduct = asText(
      pick(product, ['unit', 'unitName', 'unitShortName', 'measureName', 'shortName'])
    )
    if (fromProduct) return fromProduct
    const measure = asNumber(pick(product, ['measure', 'measureId']), null)
    if (measure != null && MEASURE_LABELS[measure]) return MEASURE_LABELS[measure]
  }
  const measure = asNumber(pick(row, ['measure', 'measureId']), null)
  if (measure != null && MEASURE_LABELS[measure]) return MEASURE_LABELS[measure]
  return null
}

function resolveProductName(
  row: Record<string, unknown>,
  product: Record<string, unknown> | null
): string {
  return (
    asText(
      pick(row, [
        'productName',
        'productFullName',
        'fullName',
        'name',
        'title',
        'nomenclatureName',
      ])
    ) ||
    asText(pick(product, ['fullName', 'name', 'productName', 'title'])) ||
    'Без названия'
  )
}

function resolveBarcode(
  row: Record<string, unknown>,
  product: Record<string, unknown> | null
): string | null {
  return (
    asText(pick(row, ['barcode', 'barCode', 'ean', 'marking'])) ||
    asText(pick(product, ['barcode', 'barCode', 'ean']))
  )
}

function resolveIsBonus(row: Record<string, unknown>): boolean {
  const flag = pick(row, ['free', 'isFree', 'bonus', 'isBonus', 'isGift'])
  if (typeof flag === 'boolean') return flag
  if (flag === 1 || flag === '1' || flag === 'true') return true
  const bonusQty = asNumber(pick(row, ['bonusQuantity', 'freeQuantity']), null)
  return bonusQty != null && bonusQty > 0
}

type MappedLine = {
  umag_line_id: number | null
  external_line_key: string
  umag_product_id: number | null
  product_name: string
  barcode: string | null
  unit: string | null
  quantity: number
  purchase_price: number | null
  selling_price: number | null
  line_amount: number | null
  is_bonus: boolean
  sort_index: number
  raw_payload: Record<string, unknown>
}

function mapProductLine(rowUnknown: unknown, index: number): MappedLine | null {
  if (!rowUnknown || typeof rowUnknown !== 'object' || Array.isArray(rowUnknown)) return null
  const row = rowUnknown as Record<string, unknown>
  const product = nestedProduct(row)

  const umagLineId = asBigIntId(
    pick(row, ['id', 'supplyProductId', 'supplyReturnProductId', 'lineId', 'itemId'])
  )
  const umagProductId =
    asBigIntId(pick(row, ['productId', 'nomenclatureId', 'nomId'])) ??
    asBigIntId(pick(product, ['id', 'productId']))

  const quantity =
    asNumber(pick(row, ['quantity', 'qty', 'count', 'amountCount', 'productQuantity']), 0) ?? 0
  const purchasePrice = asNumber(
    pick(row, [
      'purchasePrice',
      'arrivalPrice',
      'buyPrice',
      'costPrice',
      'price',
      'unitPrice',
      'purchaseCost',
    ]),
    null
  )
  const sellingPrice = asNumber(pick(row, ['sellingPrice', 'salePrice', 'retailPrice']), null)
  let lineAmount = asNumber(
    pick(row, ['amount', 'sum', 'lineAmount', 'total', 'totalAmount', 'purchaseAmount']),
    null
  )
  if (lineAmount == null && purchasePrice != null) {
    lineAmount = Number((purchasePrice * quantity).toFixed(4))
  }

  const productName = resolveProductName(row, product)
  const barcode = resolveBarcode(row, product)
  const unit = resolveUnit(row, product)
  const isBonus = resolveIsBonus(row)

  let externalLineKey: string
  if (umagLineId != null) externalLineKey = `line:${umagLineId}`
  else if (umagProductId != null)
    externalLineKey = `product:${umagProductId}:${barcode || ''}:${index}`
  else if (barcode) externalLineKey = `barcode:${barcode}:${index}`
  else externalLineKey = `idx:${index}:${productName.slice(0, 80)}`

  return {
    umag_line_id: umagLineId,
    external_line_key: externalLineKey,
    umag_product_id: umagProductId,
    product_name: productName,
    barcode,
    unit,
    quantity,
    purchase_price: purchasePrice,
    selling_price: sellingPrice,
    line_amount: lineAmount,
    is_bonus: isBonus,
    sort_index: index,
    raw_payload: row,
  }
}

function extractProductArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  const obj = payload as Record<string, unknown>
  for (const key of ['products', 'list', 'items', 'supplyProducts', 'supplyReturnProducts']) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[]
  }
  for (const key of ['data', 'result', 'payload']) {
    const nested = obj[key]
    if (Array.isArray(nested)) return nested
    if (nested && typeof nested === 'object') {
      const inner = extractProductArray(nested)
      if (inner.length) return inner
    }
  }
  return []
}

function isoEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta === tb
  return a === b
}

function validateBody(body: unknown):
  | { operationType: OperationType; operationId: number; forceRefresh: boolean }
  | Response {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return umagErrorResponse('VALIDATION_ERROR', 'Ожидается JSON-тело запроса.', 400)
  }
  const record = body as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!ALLOWED_BODY_KEYS.has(key)) {
      return umagErrorResponse('VALIDATION_ERROR', `Недопустимое поле: ${key}`, 400)
    }
  }
  const action = record.action == null ? 'get_details' : String(record.action)
  if (action !== 'get_details') {
    return umagErrorResponse('VALIDATION_ERROR', 'Поддерживается только action=get_details.', 400)
  }
  const operationTypeRaw = String(record.operationType || '')
  const operationType: OperationType | null =
    operationTypeRaw === 'supply' || operationTypeRaw === 'supply_return'
      ? operationTypeRaw
      : null
  if (!operationType) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'operationType должен быть supply или supply_return.',
      400
    )
  }
  const operationId = asBigIntId(record.operationId)
  if (operationId == null) {
    return umagErrorResponse('VALIDATION_ERROR', 'Некорректный operationId.', 400)
  }
  return {
    operationType,
    operationId,
    forceRefresh: Boolean(record.forceRefresh),
  }
}

function serializeItem(row: Record<string, unknown>) {
  return {
    id: row.id,
    umagLineId: row.umag_line_id,
    umagProductId: row.umag_product_id,
    productName: row.product_name,
    barcode: row.barcode,
    unit: row.unit,
    quantity: Number(row.quantity) || 0,
    purchasePrice: row.purchase_price == null ? null : Number(row.purchase_price),
    sellingPrice: row.selling_price == null ? null : Number(row.selling_price),
    lineAmount: row.line_amount == null ? null : Number(row.line_amount),
    isBonus: Boolean(row.is_bonus),
    sortIndex: Number(row.sort_index) || 0,
  }
}

function buildTotals(
  items: Array<{ quantity: number; lineAmount: number | null }>,
  headerAmount: number
) {
  const lineCount = items.length
  const quantitySum = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  const lineAmountSum = items.reduce((sum, item) => sum + (Number(item.lineAmount) || 0), 0)
  const difference = Number((lineAmountSum - Math.abs(headerAmount)).toFixed(4))
  return {
    lineCount,
    quantitySum,
    lineAmountSum,
    headerAmount: Math.abs(headerAmount),
    difference,
    differenceNotable: Math.abs(difference) > AMOUNT_EPSILON,
  }
}

async function softDeleteMissing(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  table: 'umag_supply_items' | 'umag_supply_return_items',
  parentColumn: 'umag_supply_id' | 'umag_return_id',
  parentId: number,
  keepKeys: string[]
): Promise<string | null> {
  const now = new Date().toISOString()
  if (keepKeys.length === 0) {
    const { error } = await serviceClient
      .from(table)
      .update({ is_source_deleted: true, source_deleted_at: now, last_synced_at: now })
      .eq(parentColumn, parentId)
      .eq('is_source_deleted', false)
    return error?.message ?? null
  }
  const { data: existing, error: existingError } = await serviceClient
    .from(table)
    .select('id, external_line_key')
    .eq(parentColumn, parentId)
    .eq('is_source_deleted', false)
  if (existingError) return existingError.message
  const keySet = new Set(keepKeys)
  const staleIds = (existing || [])
    .filter((row: { external_line_key: string }) => !keySet.has(row.external_line_key))
    .map((row: { id: string }) => row.id)
  if (staleIds.length === 0) return null
  const { error } = await serviceClient
    .from(table)
    .update({ is_source_deleted: true, source_deleted_at: now, last_synced_at: now })
    .in('id', staleIds)
  return error?.message ?? null
}

async function fetchUmagProducts(
  path: string,
  operationType: OperationType,
  operationId: number
): Promise<{ payload: unknown; firstKeys: string[] } | Response> {
  const storeId = (Deno.env.get('UMAG_STORE_ID') || '').trim()
  console.info('umag_operation_details_fetch', {
    operationType,
    operationId,
    path,
    storeIdMasked: maskStoreId(storeId),
  })

  const result = await umagFetchAuthed(path, storeId ? { storeId } : {})
  if ('error' in result) return mapUmagAuthError(result.error)

  if (result.status === 404) {
    return umagErrorResponse('DOCUMENT_NOT_FOUND', 'Документ больше не найден в UMAG', 404)
  }
  if (result.status === 401 || result.status === 403) {
    return mapUmagAuthError('UMAG_AUTH_FAILED')
  }
  if (result.status < 200 || result.status >= 300) {
    return umagErrorResponse(
      'UMAG_REQUEST_FAILED',
      `Не удалось загрузить состав документа (HTTP ${result.status}).`,
      502
    )
  }
  if (result.json == null) {
    return umagErrorResponse('UMAG_MALFORMED', 'Некорректный ответ UMAG.', 502)
  }

  const productRows = extractProductArray(result.json)
  const firstKeys =
    productRows[0] && typeof productRows[0] === 'object' && !Array.isArray(productRows[0])
      ? Object.keys(productRows[0] as Record<string, unknown>).slice(0, 40)
      : []
  console.info('umag_operation_details_payload_shape', {
    operationType,
    operationId,
    count: productRows.length,
    firstKeys,
    topType: Array.isArray(result.json) ? 'array' : typeof result.json,
    topKeys:
      result.json && typeof result.json === 'object' && !Array.isArray(result.json)
        ? Object.keys(result.json as Record<string, unknown>).slice(0, 20)
        : [],
  })

  return { payload: result.json, firstKeys }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  if (req.method !== 'POST') return adminErrorResponse('method_not_allowed', 405)

  const authz = await authorizeWorkforceRequest(req, [PERMISSION_VIEW])
  if (authz instanceof Response) return authz
  if (authz.permissions[PERMISSION_VIEW] !== true) {
    return adminErrorResponse('forbidden', 403)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return umagErrorResponse('VALIDATION_ERROR', 'Ожидается JSON-тело запроса.', 400)
  }

  const validated = validateBody(body)
  if (validated instanceof Response) return validated
  const { operationType, operationId, forceRefresh } = validated

  try {
    if (operationType === 'supply') {
      const { data: doc, error: docError } = await authz.serviceClient
        .from('umag_supplies')
        .select(
          'id, umag_supply_id, supplier_name, doc_time, umag_edit_time, amount, payment_amount, debt, comment, umag_user_name, account, is_source_deleted, items_synced_at, items_source_updated_at'
        )
        .eq('umag_supply_id', operationId)
        .maybeSingle()

      if (docError) {
        return umagErrorResponse('SUPABASE_SELECT_FAILED', 'Не удалось прочитать приёмку.', 500)
      }
      if (!doc || doc.is_source_deleted) {
        return umagErrorResponse('DOCUMENT_NOT_FOUND', 'Документ больше не найден в UMAG', 404)
      }

      const sourceUpdatedAt = doc.umag_edit_time || null
      const cacheFresh =
        !forceRefresh &&
        Boolean(doc.items_synced_at) &&
        isoEqual(doc.items_source_updated_at, sourceUpdatedAt)

      const document = {
        id: doc.id,
        umagSupplyId: doc.umag_supply_id,
        supplierName: doc.supplier_name,
        docTime: doc.doc_time,
        amount: Number(doc.amount) || 0,
        paymentAmount: Number(doc.payment_amount) || 0,
        debt: Number(doc.debt) || 0,
        comment: doc.comment,
        userName: doc.umag_user_name,
        account: doc.account,
      }

      if (cacheFresh) {
        const { data: cached, error: cacheError } = await authz.serviceClient
          .from('umag_supply_items')
          .select(
            'id, umag_line_id, umag_product_id, product_name, barcode, unit, quantity, purchase_price, selling_price, line_amount, is_bonus, sort_index'
          )
          .eq('umag_supply_id', operationId)
          .eq('is_source_deleted', false)
          .order('sort_index', { ascending: true })
        if (cacheError) {
          return umagErrorResponse(
            'SUPABASE_SELECT_FAILED',
            'Не удалось прочитать состав документа.',
            500
          )
        }
        const items = (cached || []).map(serializeItem)
        return jsonResponse({
          success: true,
          cache: 'hit',
          operationType,
          operationId,
          document,
          items,
          totals: buildTotals(items, document.amount),
          payloadFieldHints: null,
        })
      }

      const fetched = await fetchUmagProducts(
        `/rest/cabinet/opr/supplies/v2/${operationId}/products`,
        operationType,
        operationId
      )
      if (fetched instanceof Response) return fetched

      const productRows = extractProductArray(fetched.payload)
      const lines = productRows
        .map((row, index) => mapProductLine(row, index))
        .filter((row): row is MappedLine => Boolean(row))
      const now = new Date().toISOString()

      if (lines.length > 0) {
        const rows = lines.map((line) => ({
          umag_supply_id: operationId,
          umag_supply_row_id: doc.id,
          umag_line_id: line.umag_line_id,
          external_line_key: line.external_line_key,
          umag_product_id: line.umag_product_id,
          platform_product_id: null,
          product_name: line.product_name,
          barcode: line.barcode,
          unit: line.unit,
          quantity: line.quantity,
          purchase_price: line.purchase_price,
          selling_price: line.selling_price,
          line_amount: line.line_amount,
          is_bonus: line.is_bonus,
          sort_index: line.sort_index,
          raw_payload: line.raw_payload,
          source_document_updated_at: sourceUpdatedAt,
          is_source_deleted: false,
          source_deleted_at: null,
          last_seen_at: now,
          last_synced_at: now,
        }))
        const { error } = await authz.serviceClient
          .from('umag_supply_items')
          .upsert(rows, { onConflict: 'umag_supply_id,external_line_key' })
        if (error) {
          console.error('umag_supply_items_upsert_failed', { message: error.message })
          return umagErrorResponse(
            'SUPABASE_UPSERT_FAILED',
            'Не удалось сохранить состав документа.',
            500
          )
        }
      }

      const softError = await softDeleteMissing(
        authz.serviceClient,
        'umag_supply_items',
        'umag_supply_id',
        operationId,
        lines.map((line) => line.external_line_key)
      )
      if (softError) {
        return umagErrorResponse('SUPABASE_UPSERT_FAILED', 'Не удалось сохранить состав документа.', 500)
      }

      const { error: metaError } = await authz.serviceClient
        .from('umag_supplies')
        .update({ items_synced_at: now, items_source_updated_at: sourceUpdatedAt })
        .eq('id', doc.id)
      if (metaError) {
        return umagErrorResponse('SUPABASE_UPSERT_FAILED', 'Не удалось сохранить состав документа.', 500)
      }

      const items = lines.map((line, index) => ({
        id: null,
        umagLineId: line.umag_line_id,
        umagProductId: line.umag_product_id,
        productName: line.product_name,
        barcode: line.barcode,
        unit: line.unit,
        quantity: line.quantity,
        purchasePrice: line.purchase_price,
        sellingPrice: line.selling_price,
        lineAmount: line.line_amount,
        isBonus: line.is_bonus,
        sortIndex: index,
      }))

      return jsonResponse({
        success: true,
        cache: forceRefresh ? 'refreshed' : 'miss',
        operationType,
        operationId,
        document,
        items,
        totals: buildTotals(items, document.amount),
        payloadFieldHints: fetched.firstKeys,
      })
    }

    const { data: doc, error: docError } = await authz.serviceClient
      .from('umag_supply_returns')
      .select(
        'id, umag_return_id, supplier_name, document_time, umag_update_time, amount, note, user_name, account_names, is_provided, is_source_deleted, items_synced_at, items_source_updated_at'
      )
      .eq('umag_return_id', operationId)
      .maybeSingle()

    if (docError) {
      return umagErrorResponse('SUPABASE_SELECT_FAILED', 'Не удалось прочитать возврат.', 500)
    }
    if (!doc || doc.is_source_deleted) {
      return umagErrorResponse('DOCUMENT_NOT_FOUND', 'Документ больше не найден в UMAG', 404)
    }

    let sourceUpdatedAt = doc.umag_update_time || null
    const cacheFresh =
      !forceRefresh &&
      Boolean(doc.items_synced_at) &&
      isoEqual(doc.items_source_updated_at, sourceUpdatedAt)

    const document = {
      id: doc.id,
      umagReturnId: doc.umag_return_id,
      supplierName: doc.supplier_name,
      documentTime: doc.document_time,
      amount: Number(doc.amount) || 0,
      note: doc.note,
      userName: doc.user_name,
      accountNames: doc.account_names,
      isProvided: doc.is_provided,
    }

    if (cacheFresh) {
      const { data: cached, error: cacheError } = await authz.serviceClient
        .from('umag_supply_return_items')
        .select(
          'id, umag_line_id, umag_product_id, product_name, barcode, unit, quantity, purchase_price, line_amount, is_bonus, sort_index'
        )
        .eq('umag_return_id', operationId)
        .eq('is_source_deleted', false)
        .order('sort_index', { ascending: true })
      if (cacheError) {
        return umagErrorResponse(
          'SUPABASE_SELECT_FAILED',
          'Не удалось прочитать состав документа.',
          500
        )
      }
      const items = (cached || []).map((row: Record<string, unknown>) => ({
        ...serializeItem(row),
        sellingPrice: null,
      }))
      return jsonResponse({
        success: true,
        cache: 'hit',
        operationType,
        operationId,
        document,
        items,
        totals: buildTotals(items, document.amount),
        payloadFieldHints: null,
      })
    }

    const fetched = await fetchUmagProducts(
      `/rest/cabinet/opr/supply-returns/get/${operationId}`,
      operationType,
      operationId
    )
    if (fetched instanceof Response) return fetched

    if (fetched.payload && typeof fetched.payload === 'object' && !Array.isArray(fetched.payload)) {
      const root = fetched.payload as Record<string, unknown>
      const supplyReturn =
        root.supplyReturn && typeof root.supplyReturn === 'object'
          ? (root.supplyReturn as Record<string, unknown>)
          : null
      const parsed = parseUmagEditTime(supplyReturn?.updateTime ?? root.updateTime)
      if (parsed) sourceUpdatedAt = parsed
    }

    const productRows = extractProductArray(fetched.payload)
    const lines = productRows
      .map((row, index) => mapProductLine(row, index))
      .filter((row): row is MappedLine => Boolean(row))
    const now = new Date().toISOString()

    if (lines.length > 0) {
      const rows = lines.map((line) => ({
        umag_return_id: operationId,
        umag_return_row_id: doc.id,
        umag_line_id: line.umag_line_id,
        external_line_key: line.external_line_key,
        umag_product_id: line.umag_product_id,
        platform_product_id: null,
        product_name: line.product_name,
        barcode: line.barcode,
        unit: line.unit,
        quantity: line.quantity,
        purchase_price: line.purchase_price,
        line_amount: line.line_amount,
        is_bonus: line.is_bonus,
        sort_index: line.sort_index,
        raw_payload: line.raw_payload,
        source_document_updated_at: sourceUpdatedAt,
        is_source_deleted: false,
        source_deleted_at: null,
        last_seen_at: now,
        last_synced_at: now,
      }))
      const { error } = await authz.serviceClient
        .from('umag_supply_return_items')
        .upsert(rows, { onConflict: 'umag_return_id,external_line_key' })
      if (error) {
        console.error('umag_supply_return_items_upsert_failed', { message: error.message })
        return umagErrorResponse(
          'SUPABASE_UPSERT_FAILED',
          'Не удалось сохранить состав документа.',
          500
        )
      }
    }

    const softError = await softDeleteMissing(
      authz.serviceClient,
      'umag_supply_return_items',
      'umag_return_id',
      operationId,
      lines.map((line) => line.external_line_key)
    )
    if (softError) {
      return umagErrorResponse('SUPABASE_UPSERT_FAILED', 'Не удалось сохранить состав документа.', 500)
    }

    const { error: metaError } = await authz.serviceClient
      .from('umag_supply_returns')
      .update({ items_synced_at: now, items_source_updated_at: sourceUpdatedAt })
      .eq('id', doc.id)
    if (metaError) {
      return umagErrorResponse('SUPABASE_UPSERT_FAILED', 'Не удалось сохранить состав документа.', 500)
    }

    const items = lines.map((line, index) => ({
      id: null,
      umagLineId: line.umag_line_id,
      umagProductId: line.umag_product_id,
      productName: line.product_name,
      barcode: line.barcode,
      unit: line.unit,
      quantity: line.quantity,
      purchasePrice: line.purchase_price,
      sellingPrice: null,
      lineAmount: line.line_amount,
      isBonus: line.is_bonus,
      sortIndex: index,
    }))

    return jsonResponse({
      success: true,
      cache: forceRefresh ? 'refreshed' : 'miss',
      operationType,
      operationId,
      document,
      items,
      totals: buildTotals(items, document.amount),
      payloadFieldHints: fetched.firstKeys,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('umag_operation_details_unexpected', { message })
    return umagErrorResponse('INTERNAL_ERROR', 'Не удалось загрузить состав документа', 500)
  }
})
