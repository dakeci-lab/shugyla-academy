/**
 * umag-sync — stage-1 UMAG suppliers + supplies mirror for settlements.
 *
 * Frontend → this Edge Function → api.umag.kz → Supabase tables.
 * Never returns UMAG Authorization or raw credentials to the client.
 *
 * Primary endpoints:
 * - GET /rest/cabinet/org/agent/list (agentType=SUPPLIER)
 * - GET /rest/cabinet/opr/supplies/all
 *
 * Does NOT call supply product lines or N+1 detail endpoints.
 */

import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import {
  adminErrorResponse,
  authorizeWorkforceRequest,
} from '../_shared/employeeAuthorization.ts'
import {
  aqtobePeriodBoundsMs,
  maskStoreId,
  nearlyEqual,
  parseUmagEditTime,
  sumNumbers,
  UMAG_PAGE_SIZE,
} from '../_shared/umagConfig.ts'
import {
  acquireUmagSession,
  umagFetchAuthed,
  type UmagSession,
} from '../_shared/umagAuth.ts'

const PERMISSION_SYNC = 'umag.settlements.sync'
const ALLOWED_BODY_KEYS = new Set(['action', 'dateFrom', 'dateTo', 'syncSuppliers'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const AGGREGATE_EPSILON = 0.01

type SyncStatus = 'running' | 'success' | 'partial' | 'failed'

type UmagAgent = {
  id?: number | string
  name?: string | null
  legalName?: string | null
  bin?: string | null
  phone?: string | null
  actualAddress?: string | null
  legalAddress?: string | null
  isDeleted?: boolean | null
  editTime?: number | string | null
}

type UmagSupply = {
  id?: number | string
  type?: number | null
  docTime?: number | string | null
  editTime?: number | string | null
  paymentType?: number | null
  amount?: number | string | null
  comment?: string | null
  arrivalCost?: number | string | null
  sellingCost?: number | string | null
  paymentAmount?: number | string | null
  paymentRefundAmount?: number | string | null
  account?: string | null
  debt?: number | string | null
  supplierId?: number | string | null
  userId?: number | string | null
  userFirstName?: string | null
  supplierName?: string | null
  supplierLegalName?: string | null
}

type SuppliesPage = {
  fetchedCount?: number
  totalCount?: number
  amount?: number | string
  paymentAmount?: number | string
  paymentRefundAmount?: number | string
  debt?: number | string
  list?: UmagSupply[]
}

type AgentsPage = {
  agents?: UmagAgent[]
  count?: number
}

function umagErrorResponse(
  code: string,
  message: string,
  status = 502,
  extra: Record<string, unknown> = {}
) {
  return jsonResponse(
    {
      success: false,
      code,
      message,
      ...extra,
    },
    status
  )
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
    return umagErrorResponse(
      'UMAG_NOT_CONFIGURED',
      'Подключение к UMAG ещё не настроено. Установите UMAG_LOGIN (или UMAG_USERNAME), UMAG_PASSWORD и UMAG_STORE_ID.',
      503
    )
  }
  if (code === 'UMAG_AUTH_FAILED' || code === 'UMAG_LOGIN_FAILED') {
    return umagErrorResponse(
      'UMAG_AUTH_FAILED',
      'Не удалось войти в UMAG. Проверьте логин и пароль или доступ учётной записи.',
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

function mapUmagHttpError(status: number): Response {
  if (status === 401 || status === 403) {
    return mapUmagAuthError('UMAG_AUTH_FAILED')
  }
  if (status >= 500) {
    return umagErrorResponse(
      'UMAG_UPSTREAM_ERROR',
      'Сервис UMAG временно недоступен. Повторите попытку позже.',
      502
    )
  }
  return umagErrorResponse(
    'UMAG_REQUEST_FAILED',
    `UMAG вернул ошибку (HTTP ${status}).`,
    502
  )
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

function validateBody(body: unknown): {
  dateFrom: string
  dateTo: string
  syncSuppliers: boolean
} | Response {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return umagErrorResponse('VALIDATION_ERROR', 'Некорректное тело запроса.', 400)
  }
  const record = body as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!ALLOWED_BODY_KEYS.has(key)) {
      return umagErrorResponse('VALIDATION_ERROR', `Недопустимое поле: ${key}`, 400)
    }
  }

  const action = record.action == null ? 'sync' : String(record.action)
  if (action !== 'sync') {
    return umagErrorResponse('VALIDATION_ERROR', 'Поддерживается только action=sync.', 400)
  }

  const dateFrom = String(record.dateFrom || '')
  const dateTo = String(record.dateTo || '')
  if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'Укажите период dateFrom/dateTo в формате YYYY-MM-DD.',
      400
    )
  }
  if (dateFrom > dateTo) {
    return umagErrorResponse(
      'VALIDATION_ERROR',
      'Дата начала периода не может быть позже даты окончания.',
      400
    )
  }

  return {
    dateFrom,
    dateTo,
    syncSuppliers: record.syncSuppliers !== false,
  }
}

async function createSyncRun(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  fields: Record<string, unknown>
): Promise<string | null> {
  const { data, error } = await serviceClient
    .from('umag_sync_runs')
    .insert({
      entity: 'all',
      status: 'running',
      started_at: new Date().toISOString(),
      ...fields,
    })
    .select('id')
    .single()
  if (error || !data?.id) {
    console.error('umag_sync_run_create_failed', { message: error?.message })
    return null
  }
  return data.id
}

async function finishSyncRun(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  runId: string | null,
  patch: Record<string, unknown>
) {
  if (!runId) return
  const { error } = await serviceClient
    .from('umag_sync_runs')
    .update({
      finished_at: new Date().toISOString(),
      ...patch,
    })
    .eq('id', runId)
  if (error) {
    console.error('umag_sync_run_finish_failed', { message: error.message })
  }
}

async function fetchAllSuppliers(session: UmagSession): Promise<
  | { ok: true; agents: UmagAgent[]; pages: number }
  | { ok: false; response: Response }
> {
  const agents: UmagAgent[] = []
  let first = 0
  let pages = 0
  let reportedCount: number | null = null

  while (true) {
    pages += 1
    const result = await umagFetchAuthed('/rest/cabinet/org/agent/list', {
      agentType: 'SUPPLIER',
      first,
      pageSize: UMAG_PAGE_SIZE,
      deleted: false,
      searchString: '',
      storeId: session.storeId,
    })

    if ('error' in result) {
      return { ok: false, response: mapUmagAuthError(result.error) }
    }

    if (result.status !== 200) {
      return { ok: false, response: mapUmagHttpError(result.status) }
    }

    if (result.json == null || typeof result.json !== 'object') {
      return {
        ok: false,
        response: umagErrorResponse(
          'UMAG_INVALID_JSON',
          'UMAG вернул некорректный ответ при загрузке поставщиков.',
          502
        ),
      }
    }

    const page = result.json as AgentsPage
    const batch = Array.isArray(page.agents) ? page.agents : []
    if (typeof page.count === 'number') reportedCount = page.count
    agents.push(...batch)

    console.info('umag_sync_suppliers_page', {
      first,
      pageSize: UMAG_PAGE_SIZE,
      batch: batch.length,
      totalSoFar: agents.length,
      reportedCount,
      elapsedMs: result.elapsedMs,
      retriedAfterSignIn: result.retriedAfterSignIn,
      storeId: maskStoreId(session.storeId),
    })

    if (batch.length === 0) break
    if (reportedCount != null && agents.length >= reportedCount) break
    if (batch.length < UMAG_PAGE_SIZE) break
    first += UMAG_PAGE_SIZE
    if (pages > 200) {
      return {
        ok: false,
        response: umagErrorResponse(
          'UMAG_PAGINATION_FAILED',
          'Превышен лимит страниц при загрузке поставщиков UMAG.',
          502
        ),
      }
    }
  }

  return { ok: true, agents, pages }
}

async function fetchAllSupplies(
  session: UmagSession,
  fromTime: number,
  toTime: number
): Promise<
  | {
      ok: true
      supplies: UmagSupply[]
      pages: number
      source: {
        totalCount: number | null
        amount: number | null
        paymentAmount: number | null
        paymentRefundAmount: number | null
        debt: number | null
      }
    }
  | { ok: false; response: Response }
> {
  const supplies: UmagSupply[] = []
  let first = 0
  let pages = 0
  let source = {
    totalCount: null as number | null,
    amount: null as number | null,
    paymentAmount: null as number | null,
    paymentRefundAmount: null as number | null,
    debt: null as number | null,
  }

  while (true) {
    pages += 1
    const result = await umagFetchAuthed('/rest/cabinet/opr/supplies/all', {
      first,
      pageSize: UMAG_PAGE_SIZE,
      fromTime,
      toTime,
      storeId: session.storeId,
    })

    if ('error' in result) {
      return { ok: false, response: mapUmagAuthError(result.error) }
    }

    if (result.status !== 200) {
      return { ok: false, response: mapUmagHttpError(result.status) }
    }

    if (result.json == null || typeof result.json !== 'object') {
      return {
        ok: false,
        response: umagErrorResponse(
          'UMAG_INVALID_JSON',
          'UMAG вернул некорректный ответ при загрузке приёмок.',
          502
        ),
      }
    }

    const page = result.json as SuppliesPage
    if (pages === 1) {
      source = {
        totalCount: page.totalCount == null ? null : asNumber(page.totalCount, 0),
        amount: page.amount == null ? null : asNumber(page.amount),
        paymentAmount: page.paymentAmount == null ? null : asNumber(page.paymentAmount),
        paymentRefundAmount:
          page.paymentRefundAmount == null ? null : asNumber(page.paymentRefundAmount),
        debt: page.debt == null ? null : asNumber(page.debt),
      }
    }

    const batch = Array.isArray(page.list) ? page.list : []
    supplies.push(...batch)

    console.info('umag_sync_supplies_page', {
      first,
      pageSize: UMAG_PAGE_SIZE,
      batch: batch.length,
      totalSoFar: supplies.length,
      totalCount: source.totalCount,
      elapsedMs: result.elapsedMs,
      retriedAfterSignIn: result.retriedAfterSignIn,
      storeId: maskStoreId(session.storeId),
    })

    const totalCount = source.totalCount
    if (batch.length === 0) break
    if (totalCount != null && supplies.length >= totalCount) break
    if (batch.length < UMAG_PAGE_SIZE) break
    first += UMAG_PAGE_SIZE
    if (pages > 500) {
      return {
        ok: false,
        response: umagErrorResponse(
          'UMAG_PAGINATION_FAILED',
          'Превышен лимит страниц при загрузке приёмок UMAG.',
          502
        ),
      }
    }
  }

  return { ok: true, supplies, pages, source }
}

async function upsertSuppliers(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  agents: UmagAgent[]
): Promise<{ created: number; updated: number; map: Map<number, string> } | Response> {
  const map = new Map<number, string>()
  if (agents.length === 0) return { created: 0, updated: 0, map }

  const umagIds = agents
    .map((a) => asBigIntId(a.id))
    .filter((id): id is number => id != null)

  const { data: existingRows, error: existingError } = await serviceClient
    .from('umag_suppliers')
    .select('id, umag_supplier_id')
    .in('umag_supplier_id', umagIds)

  if (existingError) {
    console.error('umag_suppliers_select_failed', { message: existingError.message })
    return umagErrorResponse(
      'SUPABASE_UPSERT_FAILED',
      'Не удалось прочитать существующих поставщиков UMAG.',
      500
    )
  }

  const existingByUmag = new Map<number, string>()
  for (const row of existingRows || []) {
    existingByUmag.set(Number(row.umag_supplier_id), row.id)
  }

  const now = new Date().toISOString()
  const rows = []
  for (const agent of agents) {
    const umagId = asBigIntId(agent.id)
    if (umagId == null) continue
    const name = String(agent.name || '').trim() || `Поставщик ${umagId}`
    rows.push({
      umag_supplier_id: umagId,
      name,
      legal_name: agent.legalName ? String(agent.legalName) : null,
      bin: agent.bin ? String(agent.bin) : null,
      phone: agent.phone ? String(agent.phone) : null,
      actual_address: agent.actualAddress ? String(agent.actualAddress) : null,
      legal_address: agent.legalAddress ? String(agent.legalAddress) : null,
      is_deleted: Boolean(agent.isDeleted),
      umag_edit_time: parseUmagEditTime(agent.editTime),
      raw_payload: agent,
      last_synced_at: now,
    })
  }

  const { data: upserted, error } = await serviceClient
    .from('umag_suppliers')
    .upsert(rows, { onConflict: 'umag_supplier_id' })
    .select('id, umag_supplier_id')

  if (error) {
    console.error('umag_suppliers_upsert_failed', { message: error.message })
    return umagErrorResponse(
      'SUPABASE_UPSERT_FAILED',
      'Не удалось сохранить поставщиков UMAG.',
      500
    )
  }

  let created = 0
  let updated = 0
  for (const row of upserted || []) {
    const umagId = Number(row.umag_supplier_id)
    map.set(umagId, row.id)
    if (existingByUmag.has(umagId)) updated += 1
    else created += 1
  }

  // Ensure map includes previously-known ids even if upsert select is partial
  for (const [umagId, id] of existingByUmag) {
    if (!map.has(umagId)) map.set(umagId, id)
  }

  return { created, updated, map }
}

async function loadSupplierMap(
  // deno-lint-ignore no-explicit-any
  serviceClient: any
): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  const { data, error } = await serviceClient
    .from('umag_suppliers')
    .select('id, umag_supplier_id')
  if (error) {
    console.error('umag_suppliers_map_failed', { message: error.message })
    return map
  }
  for (const row of data || []) {
    map.set(Number(row.umag_supplier_id), row.id)
  }
  return map
}

async function upsertSupplies(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  supplies: UmagSupply[],
  supplierMap: Map<number, string>
): Promise<{ created: number; updated: number } | Response> {
  if (supplies.length === 0) return { created: 0, updated: 0 }

  const umagIds = supplies
    .map((s) => asBigIntId(s.id))
    .filter((id): id is number => id != null)

  const { data: existingRows, error: existingError } = await serviceClient
    .from('umag_supplies')
    .select('id, umag_supply_id')
    .in('umag_supply_id', umagIds)

  if (existingError) {
    console.error('umag_supplies_select_failed', { message: existingError.message })
    return umagErrorResponse(
      'SUPABASE_UPSERT_FAILED',
      'Не удалось прочитать существующие приёмки UMAG.',
      500
    )
  }

  const existing = new Set((existingRows || []).map((r: { umag_supply_id: number }) => Number(r.umag_supply_id)))
  const now = new Date().toISOString()
  const rows = []

  for (const supply of supplies) {
    const umagSupplyId = asBigIntId(supply.id)
    if (umagSupplyId == null) continue
    const umagSupplierId = asBigIntId(supply.supplierId)
    const docTime = parseUmagEditTime(supply.docTime)
    if (!docTime) continue

    rows.push({
      umag_supply_id: umagSupplyId,
      supplier_id: umagSupplierId != null ? supplierMap.get(umagSupplierId) ?? null : null,
      umag_supplier_id: umagSupplierId,
      supplier_name: String(supply.supplierName || '').trim() || 'Без названия',
      supplier_legal_name: supply.supplierLegalName ? String(supply.supplierLegalName) : null,
      doc_time: docTime,
      umag_edit_time: parseUmagEditTime(supply.editTime),
      type: supply.type == null ? null : asNumber(supply.type, 0),
      payment_type: supply.paymentType == null ? null : asNumber(supply.paymentType, 0),
      amount: asNumber(supply.amount),
      payment_amount: asNumber(supply.paymentAmount),
      payment_refund_amount: asNumber(supply.paymentRefundAmount),
      debt: asNumber(supply.debt),
      arrival_cost: supply.arrivalCost == null ? null : asNumber(supply.arrivalCost),
      selling_cost: supply.sellingCost == null ? null : asNumber(supply.sellingCost),
      account: supply.account != null ? String(supply.account) : null,
      comment: supply.comment != null ? String(supply.comment) : null,
      umag_user_id: asBigIntId(supply.userId),
      umag_user_name: supply.userFirstName != null ? String(supply.userFirstName) : null,
      raw_payload: supply,
      last_synced_at: now,
    })
  }

  // Upsert in chunks to avoid payload limits
  const chunkSize = 200
  let created = 0
  let updated = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await serviceClient
      .from('umag_supplies')
      .upsert(chunk, { onConflict: 'umag_supply_id' })
    if (error) {
      console.error('umag_supplies_upsert_failed', { message: error.message, offset: i })
      return umagErrorResponse(
        'SUPABASE_UPSERT_FAILED',
        'Не удалось сохранить приёмки UMAG.',
        500
      )
    }
    for (const row of chunk) {
      if (existing.has(Number(row.umag_supply_id))) updated += 1
      else created += 1
    }
  }

  return { created, updated }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  if (req.method !== 'POST') {
    return adminErrorResponse('method_not_allowed', 405)
  }

  const authz = await authorizeWorkforceRequest(req, [PERMISSION_SYNC])
  if (authz instanceof Response) return authz
  if (authz.permissions[PERMISSION_SYNC] !== true) {
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
  const { dateFrom, dateTo, syncSuppliers } = validated

  const bounds = aqtobePeriodBoundsMs(dateFrom, dateTo)
  if (!bounds) {
    return umagErrorResponse('VALIDATION_ERROR', 'Некорректный период синхронизации.', 400)
  }

  // Fresh signin when credentials exist (or warm cache). umagFetchAuthed retries once on 401/403.
  const session = await acquireUmagSession()
  if ('error' in session) {
    return mapUmagAuthError(session.error)
  }

  const runId = await createSyncRun(authz.serviceClient, {
    entity: 'all',
    date_from: dateFrom,
    date_to: dateTo,
  })

  try {
    let suppliersCreated = 0
    let suppliersUpdated = 0
    let supplierMap = await loadSupplierMap(authz.serviceClient)

    if (syncSuppliers) {
      const suppliersResult = await fetchAllSuppliers(session)
      if (!suppliersResult.ok) {
        await finishSyncRun(authz.serviceClient, runId, {
          status: 'failed' satisfies SyncStatus,
          error_message: 'Ошибка загрузки поставщиков UMAG',
        })
        return suppliersResult.response
      }

      const upsertResult = await upsertSuppliers(authz.serviceClient, suppliersResult.agents)
      if (upsertResult instanceof Response) {
        await finishSyncRun(authz.serviceClient, runId, {
          status: 'failed',
          error_message: 'Ошибка сохранения поставщиков',
          records_received: suppliersResult.agents.length,
        })
        return upsertResult
      }
      suppliersCreated = upsertResult.created
      suppliersUpdated = upsertResult.updated
      supplierMap = upsertResult.map.size > 0 ? upsertResult.map : supplierMap
      // Refresh full map so supplies can link even if some agents were already present
      supplierMap = await loadSupplierMap(authz.serviceClient)
    }

    const suppliesResult = await fetchAllSupplies(session, bounds.fromTime, bounds.toTime)
    if (!suppliesResult.ok) {
      await finishSyncRun(authz.serviceClient, runId, {
        status: 'failed',
        error_message: 'Ошибка загрузки приёмок UMAG',
        records_created: suppliersCreated,
        records_updated: suppliersUpdated,
      })
      return suppliesResult.response
    }

    const calculated = {
      amount: sumNumbers(suppliesResult.supplies.map((s) => s.amount)),
      paymentAmount: sumNumbers(suppliesResult.supplies.map((s) => s.paymentAmount)),
      paymentRefundAmount: sumNumbers(suppliesResult.supplies.map((s) => s.paymentRefundAmount)),
      debt: sumNumbers(suppliesResult.supplies.map((s) => s.debt)),
    }

    const source = suppliesResult.source
    const mismatches: string[] = []
    if (source.amount != null && !nearlyEqual(calculated.amount, source.amount, AGGREGATE_EPSILON)) {
      mismatches.push(
        `amount: rows=${calculated.amount} source=${source.amount}`
      )
    }
    if (
      source.paymentAmount != null &&
      !nearlyEqual(calculated.paymentAmount, source.paymentAmount, AGGREGATE_EPSILON)
    ) {
      mismatches.push(
        `paymentAmount: rows=${calculated.paymentAmount} source=${source.paymentAmount}`
      )
    }
    if (
      source.paymentRefundAmount != null &&
      !nearlyEqual(
        calculated.paymentRefundAmount,
        source.paymentRefundAmount,
        AGGREGATE_EPSILON
      )
    ) {
      mismatches.push(
        `paymentRefundAmount: rows=${calculated.paymentRefundAmount} source=${source.paymentRefundAmount}`
      )
    }
    if (source.debt != null && !nearlyEqual(calculated.debt, source.debt, AGGREGATE_EPSILON)) {
      mismatches.push(`debt: rows=${calculated.debt} source=${source.debt}`)
    }
    if (
      source.totalCount != null &&
      suppliesResult.supplies.length !== source.totalCount
    ) {
      mismatches.push(
        `totalCount: rows=${suppliesResult.supplies.length} source=${source.totalCount}`
      )
    }

    const aggregatesMatch = mismatches.length === 0
    const warningMessage = aggregatesMatch
      ? null
      : `Расхождение агрегатов UMAG: ${mismatches.join('; ')}`

    if (warningMessage) {
      console.warn('umag_sync_aggregate_mismatch', { mismatches, dateFrom, dateTo })
    }

    const suppliesUpsert = await upsertSupplies(
      authz.serviceClient,
      suppliesResult.supplies,
      supplierMap
    )
    if (suppliesUpsert instanceof Response) {
      await finishSyncRun(authz.serviceClient, runId, {
        status: 'failed',
        error_message: 'Ошибка сохранения приёмок',
        records_received: suppliesResult.supplies.length,
        source_total_count: source.totalCount,
        source_amount: source.amount,
        source_payment_amount: source.paymentAmount,
        source_payment_refund_amount: source.paymentRefundAmount,
        source_debt: source.debt,
        calculated_amount: calculated.amount,
        calculated_payment_amount: calculated.paymentAmount,
        calculated_payment_refund_amount: calculated.paymentRefundAmount,
        calculated_debt: calculated.debt,
        aggregates_match: aggregatesMatch,
        warning_message: warningMessage,
      })
      return suppliesUpsert
    }

    const status: SyncStatus = aggregatesMatch ? 'success' : 'partial'
    await finishSyncRun(authz.serviceClient, runId, {
      status,
      records_received: suppliesResult.supplies.length,
      records_created: suppliesUpsert.created + suppliersCreated,
      records_updated: suppliesUpsert.updated + suppliersUpdated,
      source_total_count: source.totalCount,
      source_amount: source.amount,
      source_payment_amount: source.paymentAmount,
      source_payment_refund_amount: source.paymentRefundAmount,
      source_debt: source.debt,
      calculated_amount: calculated.amount,
      calculated_payment_amount: calculated.paymentAmount,
      calculated_payment_refund_amount: calculated.paymentRefundAmount,
      calculated_debt: calculated.debt,
      aggregates_match: aggregatesMatch,
      warning_message: warningMessage,
      error_message: null,
    })

    return jsonResponse({
      success: true,
      status,
      warning: warningMessage,
      period: { dateFrom, dateTo, fromTime: bounds.fromTime, toTime: bounds.toTime },
      suppliers: {
        created: suppliersCreated,
        updated: suppliersUpdated,
        totalKnown: supplierMap.size,
      },
      supplies: {
        received: suppliesResult.supplies.length,
        created: suppliesUpsert.created,
        updated: suppliesUpsert.updated,
        pages: suppliesResult.pages,
      },
      aggregates: {
        match: aggregatesMatch,
        source,
        calculated,
      },
      syncRunId: runId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('umag_sync_unexpected', { message })
    await finishSyncRun(authz.serviceClient, runId, {
      status: 'failed',
      error_message: 'Внутренняя ошибка синхронизации UMAG',
    })
    return umagErrorResponse(
      'INTERNAL_ERROR',
      'Внутренняя ошибка синхронизации UMAG. Повторите попытку.',
      500
    )
  }
})
