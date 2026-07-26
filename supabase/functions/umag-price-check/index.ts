/**
 * umag-price-check — admin-only barcode → UMAG selling price lookup.
 *
 * Frontend → this Edge Function → api.umag.kz (server-side secrets only).
 * Never returns UMAG tokens, cookies, or raw upstream payloads to the client.
 *
 * HAR contract (web.umag.kz, findProductByBarcode):
 * - GET /rest/cabinet/nom/product/findProductByBarcode
 * - query: showServices, showPackages, showDeleted, barcode, create, storeId
 * - Auth via shared umagAuth (signin → sessionToken, one retry on 401/403)
 * - Authorization: raw sessionToken (NO "Bearer " prefix)
 */

import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'
import {
  adminErrorResponse,
  authorizeWorkforceRequest,
} from '../_shared/employeeAuthorization.ts'
import { umagFetchAuthed } from '../_shared/umagAuth.ts'
import { maskStoreId } from '../_shared/umagConfig.ts'

const PERMISSION_PRICE_CHECKER_VIEW = 'products.price_checker.view'
const ALLOWED_BODY_KEYS = new Set(['barcode'])
const MAX_BARCODE_LENGTH = 64
const MIN_BARCODE_LENGTH = 4
const UMAG_TIMEOUT_MS = 12_000

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
  const storeId = (Deno.env.get('UMAG_STORE_ID') || '').trim()

  console.log('UMAG request started', {
    path: '/rest/cabinet/nom/product/findProductByBarcode',
    barcodeLength: barcode.length,
    storeIdMasked: maskStoreId(storeId),
  })

  const result = await umagFetchAuthed(
    '/rest/cabinet/nom/product/findProductByBarcode',
    {
      showServices: true,
      showPackages: true,
      showDeleted: false,
      barcode,
      create: false,
      storeId,
    },
    { timeoutMs: UMAG_TIMEOUT_MS }
  )

  if ('error' in result) {
    if (result.error === 'UMAG_NOT_CONFIGURED') {
      console.error('UMAG not configured', { storeIdMasked: maskStoreId(storeId) })
      return jsonResponse(
        {
          success: false,
          code: 'UMAG_NOT_CONFIGURED',
          message: 'Подключение к UMAG ещё не настроено',
        },
        503
      )
    }
    if (result.error === 'UMAG_AUTH_FAILED' || result.error === 'UMAG_LOGIN_FAILED') {
      return jsonResponse(
        {
          success: false,
          code: 'UMAG_AUTH_FAILED',
          message:
            'Не удалось войти в UMAG. Проверьте логин и пароль или доступ учётной записи.',
        },
        502
      )
    }
    if (result.error === 'UMAG_TIMEOUT') {
      return jsonResponse(
        {
          success: false,
          code: 'UMAG_TIMEOUT',
          message: 'Не удалось получить данные из UMAG. Повторите попытку.',
        },
        502
      )
    }
    return jsonResponse(
      {
        success: false,
        code: 'UMAG_NETWORK_ERROR',
        message: 'Не удалось получить данные из UMAG. Повторите попытку.',
      },
      502
    )
  }

  console.log('UMAG response status:', result.status)
  console.log('UMAG response time:', `${result.elapsedMs}ms`)
  if (result.retriedAfterSignIn) {
    console.info('UMAG re-authenticated before successful product lookup')
  }

  if (result.status === 401 || result.status === 403) {
    return jsonResponse(
      {
        success: false,
        code: 'UMAG_AUTH_FAILED',
        message:
          'Не удалось войти в UMAG. Проверьте логин и пароль или доступ учётной записи.',
      },
      502
    )
  }

  if (result.status === 404 || result.status === 422) {
    // UMAG often returns 422 plain text for invalid/unknown barcodes.
    return notFoundResponse()
  }

  if (result.status === 429) {
    return jsonResponse(
      {
        success: false,
        code: 'RATE_LIMITED',
        message: 'Слишком много запросов. Подождите немного и повторите.',
      },
      429
    )
  }

  if (result.status >= 500) {
    console.error('UMAG upstream 5xx', { status: result.status, elapsedMs: result.elapsedMs })
    return jsonResponse(
      {
        success: false,
        code: 'UMAG_NETWORK_ERROR',
        message: 'Не удалось получить данные из UMAG. Повторите попытку.',
      },
      502
    )
  }

  if (result.status !== 200 || result.json == null || typeof result.json !== 'object') {
    console.error('UMAG upstream error', { status: result.status, elapsedMs: result.elapsedMs })
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
  return productResponse(result.json as UmagProductPayload, barcode)
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

  if (authz.permissions[PERMISSION_PRICE_CHECKER_VIEW] !== true) {
    return jsonResponse(
      { success: false, code: 'FORBIDDEN', message: 'Недостаточно прав для прайс-чекера' },
      403
    )
  }

  return fetchUmagProduct(barcode)
})
