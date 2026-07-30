/**
 * UMAG document-payment sync + ledger event builders.
 * Endpoint: GET /rest/cabinet/fin/document-payment/list-all
 */
import { umagFetchAuthed, type UmagSession } from './umagAuth.ts'
import { parseUmagEditTime, UMAG_PAGE_SIZE } from './umagConfig.ts'

export type UmagDocumentPayment = {
  id?: number | string
  companyId?: number | string | null
  storeId?: number | string | null
  amount?: number | string | null
  accountId?: number | string | null
  externalAgentAccountId?: number | string | null
  type?: string | null
  userId?: number | string | null
  entityId?: number | string | null
  note?: string | null
  docTime?: number | string | null
  createTime?: number | string | null
  editTime?: number | string | null
  date?: number | string | null
  className?: string | null
  account?: { id?: number | string; name?: string | null } | null
  supplierName?: string | null
  userName?: string | null
}

export type PaymentsPage = {
  count?: number
  list?: UmagDocumentPayment[]
}

function asNumber(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asBigIntId(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  return n
}

function paymentTimeMs(row: UmagDocumentPayment): number | null {
  for (const field of [row.date, row.docTime, row.createTime, row.editTime]) {
    if (field == null || field === '') continue
    if (typeof field === 'number' && Number.isFinite(field)) return field
    const parsed = Date.parse(String(field))
    if (!Number.isNaN(parsed)) return parsed
  }
  return null
}

export function classifyUmagPaymentType(row: UmagDocumentPayment): {
  eventType: 'supplier_payment' | 'supplier_refund' | 'adjustment'
  linkedSupplyId: number | null
  linkedReturnId: number | null
  balanceDelta: number
} {
  const amount = asNumber(row.amount)
  const type = String(row.type || '').toUpperCase()
  const className = String(row.className || '')
  const entityId = asBigIntId(row.entityId)

  if (type === 'SUPPLY' || (amount > 0 && className === 'Supply')) {
    return {
      eventType: 'supplier_payment',
      linkedSupplyId: entityId,
      linkedReturnId: null,
      balanceDelta: -Math.abs(amount),
    }
  }

  if (type === 'SUPPLY_REFUND' || className === 'SupplyReturn' || amount < 0) {
    // Goods return already reduces AP; refund cash row is chronological only.
    return {
      eventType: 'supplier_refund',
      linkedSupplyId: null,
      linkedReturnId: entityId,
      balanceDelta: 0,
    }
  }

  return {
    eventType: 'adjustment',
    linkedSupplyId: null,
    linkedReturnId: null,
    balanceDelta: -amount,
  }
}

/**
 * Paginate payments newest-first until older than fromTime.
 * Keeps rows with fromTime <= date <= toTime.
 */
export async function fetchDocumentPaymentsForPeriod(
  session: UmagSession,
  fromTime: number,
  toTime: number
): Promise<
  | { ok: true; payments: UmagDocumentPayment[]; pages: number; totalCount: number | null }
  | { ok: false; response: Response }
> {
  const payments: UmagDocumentPayment[] = []
  let first = 0
  let pages = 0
  let totalCount: number | null = null
  const pageSize = UMAG_PAGE_SIZE
  const maxPages = 500

  while (pages < maxPages) {
    const result = await umagFetchAuthed('/rest/cabinet/fin/document-payment/list-all', {
      first,
      pageSize,
      filters: '[]',
      sortField: 'date',
      sortOrder: -1,
      storeId: session.storeId,
    })

    if ('error' in result) {
      return {
        ok: false,
        response: Response.json(
          { success: false, code: result.error, message: 'UMAG payments auth/network error' },
          { status: 502 }
        ),
      }
    }
    if (result.status < 200 || result.status >= 300) {
      return {
        ok: false,
        response: Response.json(
          {
            success: false,
            code: 'UMAG_UPSTREAM_ERROR',
            message: `UMAG payments HTTP ${result.status}`,
          },
          { status: 502 }
        ),
      }
    }

    const page = (result.json || {}) as PaymentsPage
    if (totalCount == null && page.count != null) totalCount = asNumber(page.count, 0)
    const list = Array.isArray(page.list) ? page.list : []
    pages += 1

    if (list.length === 0) break

    let reachedBeforePeriod = false
    for (const row of list) {
      const ms = paymentTimeMs(row)
      if (ms == null) continue
      if (ms > toTime) continue
      if (ms < fromTime) {
        reachedBeforePeriod = true
        continue
      }
      payments.push(row)
    }

    // Sorted date desc: if the oldest row on this page is before fromTime, stop.
    const oldestMs = paymentTimeMs(list[list.length - 1] || {})
    if (reachedBeforePeriod && oldestMs != null && oldestMs < fromTime) break
    if (list.length < pageSize) break
    first += pageSize
  }

  return { ok: true, payments, pages, totalCount }
}

type SupplierLink = {
  platformSupplierId: string | null
  umagSupplierId: number | null
  name: string | null
}

async function loadSupplierLinksByIds(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  table: 'umag_supplies' | 'umag_supply_returns',
  idColumn: 'umag_supply_id' | 'umag_return_id',
  ids: number[]
): Promise<Map<number, SupplierLink>> {
  const map = new Map<number, SupplierLink>()
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))]
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200)
    const { data, error } = await serviceClient
      .from(table)
      .select(`${idColumn}, platform_supplier_id, umag_supplier_id, supplier_name`)
      .in(idColumn, chunk)
    if (error) {
      console.error('umag_payment_supplier_links_failed', {
        table,
        message: error.message,
        offset: i,
      })
      continue
    }
    for (const row of data || []) {
      map.set(Number(row[idColumn]), {
        platformSupplierId: row.platform_supplier_id || null,
        umagSupplierId: row.umag_supplier_id == null ? null : Number(row.umag_supplier_id),
        name: row.supplier_name || null,
      })
    }
  }
  return map
}

/**
 * Build supply/return → supplier maps for the payment batch only.
 * Avoids PostgREST default 1000-row cap that orphaned payment mappings.
 */
export async function buildPaymentSupplierLinkMaps(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  payments: UmagDocumentPayment[]
): Promise<{
  supplyToSupplier: Map<number, SupplierLink>
  returnToSupplier: Map<number, SupplierLink>
}> {
  const supplyIds: number[] = []
  const returnIds: number[] = []
  for (const payment of payments) {
    const classified = classifyUmagPaymentType(payment)
    if (classified.linkedSupplyId != null) supplyIds.push(classified.linkedSupplyId)
    if (classified.linkedReturnId != null) returnIds.push(classified.linkedReturnId)
  }
  const [supplyToSupplier, returnToSupplier] = await Promise.all([
    loadSupplierLinksByIds(serviceClient, 'umag_supplies', 'umag_supply_id', supplyIds),
    loadSupplierLinksByIds(serviceClient, 'umag_supply_returns', 'umag_return_id', returnIds),
  ])
  return { supplyToSupplier, returnToSupplier }
}

export async function upsertDocumentPayments(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  payments: UmagDocumentPayment[],
  platformByUmagSupplierId: Map<number, string>,
  supplyToSupplier: Map<number, SupplierLink>,
  returnToSupplier: Map<number, SupplierLink>
): Promise<{ created: number; updated: number; reactivated: number } | Response> {
  if (payments.length === 0) return { created: 0, updated: 0, reactivated: 0 }

  const umagIds = payments.map((p) => asBigIntId(p.id)).filter((id): id is number => id != null)
  const existing = new Map<number, boolean>()
  for (let i = 0; i < umagIds.length; i += 200) {
    const chunk = umagIds.slice(i, i + 200)
    const { data: existingRows, error: existingError } = await serviceClient
      .from('umag_document_payments')
      .select('id, umag_payment_id, is_source_deleted')
      .in('umag_payment_id', chunk)
    if (existingError) {
      console.error('umag_document_payments_existing_failed', { message: existingError.message })
      return Response.json(
        { success: false, code: 'SUPABASE_UPSERT_FAILED', message: existingError.message },
        { status: 500 }
      )
    }
    for (const row of existingRows || []) {
      existing.set(Number(row.umag_payment_id), Boolean(row.is_source_deleted))
    }
  }

  const nowIso = new Date().toISOString()
  const rows = []
  let created = 0
  let updated = 0
  let reactivated = 0

  for (const payment of payments) {
    const umagPaymentId = asBigIntId(payment.id)
    if (umagPaymentId == null) continue
    const classified = classifyUmagPaymentType(payment)
    const ms = paymentTimeMs(payment)
    if (ms == null) continue

    let platformSupplierId: string | null = null
    let umagSupplierId: number | null = null
    let supplierName = payment.supplierName ? String(payment.supplierName) : null

    if (classified.linkedSupplyId != null) {
      const link = supplyToSupplier.get(classified.linkedSupplyId)
      if (link) {
        platformSupplierId = link.platformSupplierId
        umagSupplierId = link.umagSupplierId
        supplierName = supplierName || link.name
      }
    }
    if (classified.linkedReturnId != null) {
      const link = returnToSupplier.get(classified.linkedReturnId)
      if (link) {
        platformSupplierId = platformSupplierId || link.platformSupplierId
        umagSupplierId = umagSupplierId || link.umagSupplierId
        supplierName = supplierName || link.name
      }
    }
    if (umagSupplierId != null && !platformSupplierId) {
      platformSupplierId = platformByUmagSupplierId.get(umagSupplierId) || null
    }

    const wasDeleted = existing.get(umagPaymentId)
    if (wasDeleted === undefined) created += 1
    else {
      updated += 1
      if (wasDeleted) reactivated += 1
    }

    rows.push({
      umag_payment_id: umagPaymentId,
      platform_supplier_id: platformSupplierId,
      umag_supplier_id: umagSupplierId,
      store_id: asBigIntId(payment.storeId),
      amount: asNumber(payment.amount),
      payment_type: String(payment.type || classified.eventType),
      class_name: payment.className ? String(payment.className) : null,
      entity_id: asBigIntId(payment.entityId),
      linked_umag_supply_id: classified.linkedSupplyId,
      linked_umag_return_id: classified.linkedReturnId,
      account_id: asBigIntId(payment.accountId) ?? asBigIntId(payment.account?.id),
      account_name: payment.account?.name ? String(payment.account.name) : null,
      external_agent_account_id: asBigIntId(payment.externalAgentAccountId),
      umag_user_id: asBigIntId(payment.userId),
      user_name: payment.userName ? String(payment.userName) : null,
      supplier_name: supplierName,
      note: payment.note != null ? String(payment.note) : null,
      payment_time: new Date(ms).toISOString(),
      doc_time: parseUmagEditTime(payment.docTime),
      create_time: parseUmagEditTime(payment.createTime),
      umag_edit_time: parseUmagEditTime(payment.editTime),
      raw_payload: payment,
      is_source_deleted: false,
      source_deleted_at: null,
      last_seen_at: nowIso,
      last_synced_at: nowIso,
    })
  }

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const { error } = await serviceClient
      .from('umag_document_payments')
      .upsert(chunk, { onConflict: 'umag_payment_id' })
    if (error) {
      console.error('umag_document_payments_upsert_failed', { message: error.message, offset: i })
      return Response.json(
        { success: false, code: 'SUPABASE_UPSERT_FAILED', message: error.message },
        { status: 500 }
      )
    }
  }

  return { created, updated, reactivated }
}

export async function rebuildLedgerEventsForPeriod(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  dateFrom: string,
  dateTo: string
): Promise<{ upserted: number } | Response> {
  const fromIso = `${dateFrom}T00:00:00+05:00`
  const toIso = `${dateTo}T23:59:59.999+05:00`
  const nowIso = new Date().toISOString()

  async function fetchAll(
    table: string,
    columns: string,
    timeColumn: string
  ): Promise<{ data: any[] | null; error: { message: string } | null }> {
    const rows: any[] = []
    const pageSize = 1000
    for (let from = 0; from < 100_000; from += pageSize) {
      const { data, error } = await serviceClient
        .from(table)
        .select(columns)
        .eq('is_source_deleted', false)
        .gte(timeColumn, fromIso)
        .lte(timeColumn, toIso)
        .order(timeColumn, { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) return { data: null, error }
      rows.push(...(data || []))
      if (!data || data.length < pageSize) break
    }
    return { data: rows, error: null }
  }

  const [suppliesRes, returnsRes, paymentsRes] = await Promise.all([
    fetchAll(
      'umag_supplies',
      'umag_supply_id, platform_supplier_id, umag_supplier_id, supplier_name, doc_time, amount, debt, payment_amount, account, umag_user_name, is_source_deleted',
      'doc_time'
    ),
    fetchAll(
      'umag_supply_returns',
      'umag_return_id, platform_supplier_id, umag_supplier_id, supplier_name, document_time, amount, user_name, is_source_deleted',
      'document_time'
    ),
    fetchAll(
      'umag_document_payments',
      'umag_payment_id, platform_supplier_id, umag_supplier_id, supplier_name, payment_time, amount, payment_type, class_name, linked_umag_supply_id, linked_umag_return_id, account_name, user_name, note, is_source_deleted',
      'payment_time'
    ),
  ])

  if (suppliesRes.error || returnsRes.error || paymentsRes.error) {
    const message =
      suppliesRes.error?.message || returnsRes.error?.message || paymentsRes.error?.message
    console.error('ledger_rebuild_load_failed', { message })
    return Response.json(
      { success: false, code: 'SUPABASE_UPSERT_FAILED', message },
      { status: 500 }
    )
  }

  const events = []

  for (const supply of suppliesRes.data || []) {
    const amount = asNumber(supply.amount)
    events.push({
      platform_supplier_id: supply.platform_supplier_id,
      umag_supplier_id: supply.umag_supplier_id,
      supplier_name: supply.supplier_name,
      external_source: 'umag',
      external_id: String(supply.umag_supply_id),
      event_type: 'receiving',
      occurred_at: supply.doc_time,
      document_number: String(supply.umag_supply_id),
      amount,
      balance_delta: amount,
      currency: 'KZT',
      status: 'posted',
      linked_umag_supply_id: supply.umag_supply_id,
      linked_umag_return_id: null,
      linked_umag_payment_id: null,
      details: [supply.umag_user_name, supply.account].filter(Boolean).join(' · ') || null,
      metadata: {
        debt: supply.debt,
        payment_amount: supply.payment_amount,
      },
      synced_at: nowIso,
    })
  }

  for (const ret of returnsRes.data || []) {
    const amount = Math.abs(asNumber(ret.amount))
    events.push({
      platform_supplier_id: ret.platform_supplier_id,
      umag_supplier_id: ret.umag_supplier_id,
      supplier_name: ret.supplier_name,
      external_source: 'umag',
      external_id: String(ret.umag_return_id),
      event_type: 'supplier_return',
      occurred_at: ret.document_time,
      document_number: String(ret.umag_return_id),
      amount,
      balance_delta: -amount,
      currency: 'KZT',
      status: 'posted',
      linked_umag_supply_id: null,
      linked_umag_return_id: ret.umag_return_id,
      linked_umag_payment_id: null,
      details: ret.user_name || null,
      metadata: {},
      synced_at: nowIso,
    })
  }

  // Resolve orphan payment → supplier via linked supply/return (PostgREST map gaps).
  const orphanSupplyIds = (paymentsRes.data || [])
    .filter((p) => !p.platform_supplier_id && p.linked_umag_supply_id != null)
    .map((p) => Number(p.linked_umag_supply_id))
  const orphanReturnIds = (paymentsRes.data || [])
    .filter((p) => !p.platform_supplier_id && p.linked_umag_return_id != null)
    .map((p) => Number(p.linked_umag_return_id))
  const [orphanSupplyLinks, orphanReturnLinks] = await Promise.all([
    loadSupplierLinksByIds(serviceClient, 'umag_supplies', 'umag_supply_id', orphanSupplyIds),
    loadSupplierLinksByIds(serviceClient, 'umag_supply_returns', 'umag_return_id', orphanReturnIds),
  ])

  const paymentRemapRows: Array<{
    umag_payment_id: number
    platform_supplier_id: string | null
    umag_supplier_id: number | null
    supplier_name: string | null
  }> = []

  for (const payment of paymentsRes.data || []) {
    const amount = asNumber(payment.amount)
    const type = String(payment.payment_type || '').toUpperCase()
    const isRefund =
      type === 'SUPPLY_REFUND' || amount < 0 || String(payment.class_name || '') === 'SupplyReturn'
    const eventType = isRefund ? 'supplier_refund' : 'supplier_payment'
    const abs = Math.abs(amount)
    let platformSupplierId = payment.platform_supplier_id
    let umagSupplierId = payment.umag_supplier_id
    let supplierName = payment.supplier_name
    if (!platformSupplierId && payment.linked_umag_supply_id != null) {
      const link = orphanSupplyLinks.get(Number(payment.linked_umag_supply_id))
      if (link) {
        platformSupplierId = link.platformSupplierId
        umagSupplierId = umagSupplierId ?? link.umagSupplierId
        supplierName = supplierName || link.name
      }
    }
    if (!platformSupplierId && payment.linked_umag_return_id != null) {
      const link = orphanReturnLinks.get(Number(payment.linked_umag_return_id))
      if (link) {
        platformSupplierId = link.platformSupplierId
        umagSupplierId = umagSupplierId ?? link.umagSupplierId
        supplierName = supplierName || link.name
      }
    }
    if (
      platformSupplierId &&
      (!payment.platform_supplier_id ||
        payment.umag_supplier_id == null ||
        !payment.supplier_name)
    ) {
      paymentRemapRows.push({
        umag_payment_id: Number(payment.umag_payment_id),
        platform_supplier_id: platformSupplierId,
        umag_supplier_id: umagSupplierId,
        supplier_name: supplierName,
      })
    }
    events.push({
      platform_supplier_id: platformSupplierId,
      umag_supplier_id: umagSupplierId,
      supplier_name: supplierName,
      external_source: 'umag',
      external_id: String(payment.umag_payment_id),
      event_type: eventType,
      occurred_at: payment.payment_time,
      document_number: String(payment.umag_payment_id),
      amount: abs,
      balance_delta: isRefund ? 0 : -abs,
      currency: 'KZT',
      status: 'posted',
      linked_umag_supply_id: payment.linked_umag_supply_id,
      linked_umag_return_id: payment.linked_umag_return_id,
      linked_umag_payment_id: payment.umag_payment_id,
      details:
        [payment.user_name, payment.account_name, payment.note].filter(Boolean).join(' · ') ||
        null,
      metadata: {
        umag_payment_type: payment.payment_type,
        signed_amount: amount,
      },
      synced_at: nowIso,
    })
  }

  for (let i = 0; i < paymentRemapRows.length; i += 200) {
    const chunk = paymentRemapRows.slice(i, i + 200)
    for (const row of chunk) {
      const { error } = await serviceClient
        .from('umag_document_payments')
        .update({
          platform_supplier_id: row.platform_supplier_id,
          umag_supplier_id: row.umag_supplier_id,
          supplier_name: row.supplier_name,
          updated_at: nowIso,
        })
        .eq('umag_payment_id', row.umag_payment_id)
      if (error) {
        console.error('umag_payment_remap_failed', {
          message: error.message,
          umag_payment_id: row.umag_payment_id,
        })
      }
    }
  }

  for (let i = 0; i < events.length; i += 200) {
    const chunk = events.slice(i, i + 200)
    const { error } = await serviceClient.from('platform_supplier_ledger_events').upsert(chunk, {
      onConflict: 'external_source,event_type,external_id',
    })
    if (error) {
      console.error('ledger_events_upsert_failed', { message: error.message, offset: i })
      return Response.json(
        { success: false, code: 'SUPABASE_UPSERT_FAILED', message: error.message },
        { status: 500 }
      )
    }
  }

  return { upserted: events.length }
}
