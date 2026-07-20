/**
 * umag-price-check — admin-only barcode → UMAG selling price lookup.
 *
 * Frontend → this Edge Function → api.umag.kz (server-side secrets only).
 * Never returns UMAG tokens, cookies, or raw upstream payloads to the client.
 *
 * HAR contract (web.umag.kz, findProductByBarcode):
 * - GET /rest/cabinet/nom/product/findProductByBarcode
 * - query: showServices, showPackages, showDeleted, barcode, create, storeId
 * - Authorization: raw token (NO "Bearer " prefix)
 * - Browser also sent Cookie / Origin / Referer / api-ver / client-ver;
 *   Edge uses Authorization + Accept + fixed api-ver/client-ver only (no cookies).
 */

import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import {
  adminErrorResponse,
  authorizeWorkforceRequest,
} from '../_shared/employeeAuthorization.ts'

const PERMISSION_PRICE_CHECKER_VIEW = 'products.price_checker.view'
const ALLOWED_BODY_KEYS = new Set(['barcode'])
const MAX_BARCODE_LENGTH = 64
const MIN_BARCODE_LENGTH = 4
const UMAG_TIMEOUT_MS = 12_000
const DEFAULT_UMAG_BASE = 'https://api.umag.kz'

/** Non-secret version headers observed in UMAG cabinet HAR. */
const UMAG_API_VER = '1.4'
const UMAG_CLIENT_VER = 'angular_cabinet_20.0.11'

/** UMAG measure codes observed in cabinet — extend carefully. */
const MEASURE_LABELS: Record<number, string> = {
  0: 'шт',
  1: 'кг',
  2: 'л',
  3: 'м',
  4: 'м²',
  5: 'м³',
  6: 'уп',
}

type UmagProductPayload = {
  productStorePrice?: {
    sellingPrice?: number | null
    barcode?: number | string | null
    productId?: number | string | null
  } | null
  product?: {
    id?: number | string | null
    barcode?: number | string | null
    name?: string | null
    fullName?: string | null
    measure?: number | null
  } | null
  categories?: Array<{ id?: number; name?: string | null }> | null
  productUnitList?: Array<{ name?: string | null; shortName?: string | null }> | null
}

/**
 * TEMP fallback until RBAC migration is confirmed on remote.
 * Remove after products.price_checker.view is granted to admin in production.
 */
function isAdminCaller(role: string | null | undefined): boolean {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
  return normalized === 'admin' || normalized === 'administrator'
}

function normalizeBarcode(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const barcode = String(value)
    .replace(/\s+/g, '')
    .replace(/[^\dA-Za-z\-_.]/g, '')
  if (barcode.length < MIN_BARCODE_LENGTH || barcode.length > MAX_BARCODE_LENGTH) {
    return null
  }
  return barcode
}

function maskStoreId(value: string | undefined | null): string {
  if (!value) return '(empty)'
  if (value.length <= 2) return '**'
  return `${value.slice(0, 1)}…${value.slice(-1)} (len=${value.length})`
}

function safeDisplayName(name: string, barcode: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'Без названия'
  const prefix = `${barcode} `
  if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length).trim() || trimmed
  if (trimmed === barcode) return trimmed
  return trimmed
}

function resolveUnitName(payload: UmagProductPayload): string | null {
  const fromList = payload.productUnitList?.find((item) => item?.name || item?.shortName)
  if (fromList?.shortName) return String(fromList.shortName)
  if (fromList?.name) return String(fromList.name)
  const measure = payload.product?.measure
  if (typeof measure === 'number' && MEASURE_LABELS[measure]) {
    return MEASURE_LABELS[measure]
  }
  return null
}

function resolveCategoryName(payload: UmagProductPayload): string | null {
  const categories = Array.isArray(payload.categories) ? payload.categories : []
  const leaf = categories.find((item) => item?.name)
  return leaf?.name ? String(leaf.name) : null
}

function notFoundResponse() {
  return jsonResponse(
    {
      success: false,
      code: 'PRODUCT_NOT_FOUND',
      message: 'Товар не найден',
    },
    404
  )
}

function productResponse(payload: UmagProductPayload, barcode: string) {
  const product = payload.product
  if (!product || product.id == null) {
    return notFoundResponse()
  }

  const sellingPrice = payload.productStorePrice?.sellingPrice
  if (sellingPrice == null || !Number.isFinite(Number(sellingPrice))) {
    return notFoundResponse()
  }

  const rawName = String(product.fullName || product.name || '').trim()
  const productBarcode = String(product.barcode ?? barcode)

  return jsonResponse({
    success: true,
    product: {
      id: product.id,
      barcode: productBarcode,
      name: safeDisplayName(rawName, productBarcode),
      sellingPrice: Number(sellingPrice),
      categoryName: resolveCategoryName(payload),
      unitName: resolveUnitName(payload),
    },
    fetchedAt: new Date().toISOString(),
  })
}

async function fetchUmagProduct(barcode: string): Promise<Response> {
  const baseUrl = (Deno.env.get('UMAG_API_BASE_URL') || DEFAULT_UMAG_BASE).replace(/\/+$/, '')
  const authToken = Deno.env.get('UMAG_AUTH_TOKEN')?.trim()
  const storeId = Deno.env.get('UMAG_STORE_ID')?.trim()

  if (!authToken || !storeId) {
    console.error('UMAG not configured', {
      hasToken: Boolean(authToken),
      hasStoreId: Boolean(storeId),
      storeIdMasked: maskStoreId(storeId),
    })
    return jsonResponse(
      {
        success: false,
        code: 'UMAG_NOT_CONFIGURED',
        message: 'Подключение к UMAG ещё не настроено',
      },
      503
    )
  }

  // Fixed path + fixed query keys from HAR — barcode is the only user-controlled value.
  const url = new URL(`${baseUrl}/rest/cabinet/nom/product/findProductByBarcode`)
  url.searchParams.set('showServices', 'true')
  url.searchParams.set('showPackages', 'true')
  url.searchParams.set('showDeleted', 'false')
  url.searchParams.set('barcode', barcode)
  url.searchParams.set('create', 'false')
  url.searchParams.set('storeId', storeId)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UMAG_TIMEOUT_MS)
  const started = performance.now()

  console.log('UMAG request started', {
    path: '/rest/cabinet/nom/product/findProductByBarcode',
    barcodeLength: barcode.length,
    storeIdMasked: maskStoreId(storeId),
    hasAuthToken: true,
  })

  try {
    // Authorization value is the raw token from HAR — do NOT prefix with "Bearer ".
    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        Authorization: authToken,
        'api-ver': UMAG_API_VER,
        'client-ver': UMAG_CLIENT_VER,
      },
      signal: controller.signal,
    })

    const elapsedMs = Math.round(performance.now() - started)
    console.log('UMAG response status:', upstream.status)
    console.log('UMAG response time:', `${elapsedMs}ms`)

    if (upstream.status === 401 || upstream.status === 403) {
      console.error('UMAG auth failed', { status: upstream.status, elapsedMs })
      return jsonResponse(
        {
          success: false,
          code: 'UMAG_AUTH_FAILED',
          message: 'Не удалось авторизоваться в UMAG. Требуется обновление подключения.',
        },
        502
      )
    }

    if (upstream.status === 404) {
      return notFoundResponse()
    }

    if (upstream.status === 429) {
      return jsonResponse(
        {
          success: false,
          code: 'RATE_LIMITED',
          message: 'Слишком много запросов. Подождите немного и повторите.',
        },
        429
      )
    }

    if (upstream.status >= 500) {
      console.error('UMAG upstream 5xx', { status: upstream.status, elapsedMs })
      return jsonResponse(
        {
          success: false,
          code: 'UMAG_NETWORK_ERROR',
          message: 'Не удалось получить данные из UMAG. Повторите попытку.',
        },
        502
      )
    }

    if (!upstream.ok) {
      console.error('UMAG upstream error', { status: upstream.status, elapsedMs })
      return jsonResponse(
        {
          success: false,
          code: 'UMAG_NETWORK_ERROR',
          message: 'Не удалось получить данные из UMAG. Повторите попытку.',
        },
        502
      )
    }

    let payload: UmagProductPayload
    try {
      payload = (await upstream.json()) as UmagProductPayload
    } catch {
      console.error('UMAG invalid JSON', { elapsedMs })
      return jsonResponse(
        {
          success: false,
          code: 'UMAG_NETWORK_ERROR',
          message: 'Не удалось получить данные из UMAG. Повторите попытку.',
        },
        502
      )
    }

    // Never forward raw payload — only mapped safe fields.
    return productResponse(payload, barcode)
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError'
    const elapsedMs = Math.round(performance.now() - started)
    console.error(aborted ? 'UMAG timeout' : 'UMAG fetch failed', {
      aborted,
      elapsedMs,
    })
    return jsonResponse(
      {
        success: false,
        code: aborted ? 'UMAG_TIMEOUT' : 'UMAG_NETWORK_ERROR',
        message: 'Не удалось получить данные из UMAG. Повторите попытку.',
      },
      502
    )
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  if (req.method !== 'POST') {
    return adminErrorResponse('method_not_allowed', 405)
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return jsonResponse(
      { success: false, code: 'VALIDATION_ERROR', message: 'Некорректный запрос' },
      422
    )
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse(
      { success: false, code: 'VALIDATION_ERROR', message: 'Некорректный запрос' },
      422
    )
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(key)) {
      return adminErrorResponse('forbidden_field', 403)
    }
  }

  const barcode = normalizeBarcode(body.barcode)
  if (!barcode) {
    return jsonResponse(
      { success: false, code: 'VALIDATION_ERROR', message: 'Введите корректный штрих-код' },
      422
    )
  }

  const authz = await authorizeWorkforceRequest(req, [PERMISSION_PRICE_CHECKER_VIEW])
  if (authz instanceof Response) {
    try {
      const clone = authz.clone()
      const parsed = (await clone.json()) as { ok?: boolean; code?: string }
      if (parsed?.code === 'unauthorized') {
        return jsonResponse(
          { success: false, code: 'UNAUTHORIZED', message: 'Сессия истекла. Войдите снова.' },
          401
        )
      }
      if (parsed?.code === 'forbidden' || parsed?.code === 'inactive_caller') {
        return jsonResponse(
          { success: false, code: 'FORBIDDEN', message: 'Недостаточно прав для прайс-чекера' },
          403
        )
      }
    } catch {
      // fall through
    }
    return authz
  }

  const hasPermission = authz.permissions[PERMISSION_PRICE_CHECKER_VIEW] === true
  // TEMP: role===admin fallback — remove after remote RBAC migration is confirmed.
  if (!hasPermission && !isAdminCaller(authz.caller.role)) {
    return jsonResponse(
      { success: false, code: 'FORBIDDEN', message: 'Недостаточно прав для прайс-чекера' },
      403
    )
  }

  return fetchUmagProduct(barcode)
})
