/**
 * Frontend client for umag-price-check Edge Function.
 * No UMAG secrets — only barcode in, safe product fields out.
 */

import { supabase } from '../lib/supabaseClient'
import { extractFunctionErrorBody, isGenericInvokeErrorMessage } from '../utils/edgeFunctionErrors'

export const PRICE_CHECKER_ERROR_CODES = {
  VALIDATION: 'VALIDATION_ERROR',
  NOT_FOUND: 'PRODUCT_NOT_FOUND',
  UMAG_AUTH: 'UMAG_AUTH_FAILED',
  UMAG_NETWORK: 'UMAG_NETWORK_ERROR',
  UMAG_NOT_CONFIGURED: 'UMAG_NOT_CONFIGURED',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMIT: 'RATE_LIMITED',
  UNKNOWN: 'UNKNOWN',
}

const USER_MESSAGES = {
  [PRICE_CHECKER_ERROR_CODES.VALIDATION]: 'Введите корректный штрих-код',
  [PRICE_CHECKER_ERROR_CODES.NOT_FOUND]: 'Товар с таким штрих-кодом не найден',
  [PRICE_CHECKER_ERROR_CODES.UMAG_AUTH]:
    'Не удалось авторизоваться в UMAG. Требуется обновление подключения.',
  [PRICE_CHECKER_ERROR_CODES.UMAG_NETWORK]:
    'Не удалось получить данные из UMAG. Повторите попытку.',
  [PRICE_CHECKER_ERROR_CODES.UMAG_NOT_CONFIGURED]: 'Подключение к UMAG ещё не настроено',
  [PRICE_CHECKER_ERROR_CODES.FORBIDDEN]: 'Недостаточно прав для прайс-чекера',
  [PRICE_CHECKER_ERROR_CODES.UNAUTHORIZED]: 'Сессия истекла. Войдите снова.',
  [PRICE_CHECKER_ERROR_CODES.RATE_LIMIT]:
    'Слишком много запросов. Подождите немного и повторите.',
  [PRICE_CHECKER_ERROR_CODES.UNKNOWN]:
    'Не удалось получить данные из UMAG. Повторите попытку.',
}

/** Keep in sync with Edge Function barcode rules. */
export function normalizeBarcodeInput(value) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .replace(/[^\dA-Za-z\-_.]/g, '')
    .slice(0, 64)
}

export function isValidBarcode(value) {
  const barcode = normalizeBarcodeInput(value)
  return barcode.length >= 4 && barcode.length <= 64 && /^[\dA-Za-z\-_.]+$/.test(barcode)
}

export function formatPriceCheckerMoney(value) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ₸`
}

function mapErrorCode(code) {
  const normalized = String(code || '').toUpperCase()
  if (normalized === 'PRODUCT_NOT_FOUND' || normalized === 'NOT_FOUND') {
    return PRICE_CHECKER_ERROR_CODES.NOT_FOUND
  }
  if (
    normalized === 'UMAG_AUTH_FAILED' ||
    normalized === 'UMAG_UNAUTHORIZED' ||
    normalized === 'UNAUTHORIZED_UMAG'
  ) {
    return PRICE_CHECKER_ERROR_CODES.UMAG_AUTH
  }
  if (normalized === 'UMAG_NOT_CONFIGURED') {
    return PRICE_CHECKER_ERROR_CODES.UMAG_NOT_CONFIGURED
  }
  if (normalized === 'VALIDATION_ERROR' || normalized === 'VALIDATION') {
    return PRICE_CHECKER_ERROR_CODES.VALIDATION
  }
  if (normalized === 'FORBIDDEN' || normalized === 'FORBIDDEN_FIELD') {
    return PRICE_CHECKER_ERROR_CODES.FORBIDDEN
  }
  if (normalized === 'UNAUTHORIZED') {
    return PRICE_CHECKER_ERROR_CODES.UNAUTHORIZED
  }
  if (normalized === 'RATE_LIMITED' || normalized === 'TOO_MANY_REQUESTS') {
    return PRICE_CHECKER_ERROR_CODES.RATE_LIMIT
  }
  if (
    normalized === 'UMAG_NETWORK_ERROR' ||
    normalized === 'UMAG_ERROR' ||
    normalized === 'INTERNAL_ERROR' ||
    normalized === 'UMAG_TIMEOUT'
  ) {
    return PRICE_CHECKER_ERROR_CODES.UMAG_NETWORK
  }
  return PRICE_CHECKER_ERROR_CODES.UNKNOWN
}

function fail(code, message) {
  return {
    success: false,
    code,
    message: message || USER_MESSAGES[code] || USER_MESSAGES[PRICE_CHECKER_ERROR_CODES.UNKNOWN],
  }
}

/**
 * @param {string} barcode
 * @returns {Promise<{
 *   success: true,
 *   product: {
 *     id: string|number,
 *     barcode: string,
 *     name: string,
 *     sellingPrice: number,
 *     categoryName?: string|null,
 *     unitName?: string|null,
 *   },
 *   fetchedAt: string
 * } | {
 *   success: false,
 *   code: string,
 *   message: string
 * }>}
 */
export async function checkPriceByBarcode(barcode) {
  const normalized = normalizeBarcodeInput(barcode)
  if (!isValidBarcode(normalized)) {
    return fail(PRICE_CHECKER_ERROR_CODES.VALIDATION)
  }

  try {
    const { data, error } = await supabase.functions.invoke('umag-price-check', {
      body: { barcode: normalized },
    })

    if (error) {
      const body = await extractFunctionErrorBody(error)
      if (body && typeof body === 'object') {
        if (body.success === false || body.ok === false) {
          const code = mapErrorCode(body.code)
          return fail(code, USER_MESSAGES[code])
        }
      }
      const msg = error.message || ''
      if (!isGenericInvokeErrorMessage(msg) && /unauthorized|jwt|session/i.test(msg)) {
        return fail(PRICE_CHECKER_ERROR_CODES.UNAUTHORIZED)
      }
      return fail(PRICE_CHECKER_ERROR_CODES.UMAG_NETWORK)
    }

    if (data?.success === true && data.product) {
      return {
        success: true,
        product: {
          id: data.product.id,
          barcode: String(data.product.barcode ?? normalized),
          name: String(data.product.name || 'Без названия'),
          sellingPrice: Number(data.product.sellingPrice),
          categoryName: data.product.categoryName ?? null,
          unitName: data.product.unitName ?? null,
        },
        fetchedAt: data.fetchedAt || new Date().toISOString(),
      }
    }

    if (data?.success === false || data?.ok === false) {
      const code = mapErrorCode(data.code)
      return fail(code, USER_MESSAGES[code])
    }

    return fail(PRICE_CHECKER_ERROR_CODES.UMAG_NETWORK)
  } catch {
    return fail(PRICE_CHECKER_ERROR_CODES.UMAG_NETWORK)
  }
}
