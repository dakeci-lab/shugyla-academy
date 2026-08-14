/**
 * Canonical attempt payload fingerprint (JS/SQL shared spec).
 *
 * Spec `shugyla.procurement.attempt.fp.v1`:
 *   shugyla.procurement.attempt.fp.v1
 *   snapshot=<uuid lowercase>
 *   supplier=<uuid lowercase>
 *   date=<YYYY-MM-DD>
 *   <barcode>=<canonicalQty>     // one line per item, barcodes UTF-8 ascending
 *
 * Qty: round to 3 decimal places, trim trailing zeros and a trailing dot.
 * Items with qty <= 0 are omitted. The fingerprint is the source text itself
 * (no hash) so Postgres and JS compare byte-for-byte.
 */

export const ATTEMPT_FINGERPRINT_SPEC = 'shugyla.procurement.attempt.fp.v1'

function finiteNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Round half-up to 3 dp, then trim like Postgres `round(numeric,3)` + trim 0/. */
export function canonicalizeAttemptQty(value) {
  const n = finiteNumber(value, 0)
  if (!(n > 0)) return '0'
  const scaled = Math.round(n * 1000)
  if (scaled % 1000 === 0) return String(scaled / 1000)
  let text = (scaled / 1000).toFixed(3)
  text = text.replace(/0+$/, '').replace(/\.$/, '')
  return text
}

function normalizeUuid(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeDate(value) {
  return String(value || '').trim().slice(0, 10)
}

function barcodeOf(item) {
  return String(item?.barcode ?? item?.Barcode ?? '').trim()
}

function qtyOf(item) {
  return finiteNumber(item?.qty ?? item?.ordered_qty ?? item?.finalOrderQty ?? item?.final_order_qty, 0)
}

function compareBarcodes(a, b) {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * Canonical source text. Empty/invalid identity yields ''.
 */
export function buildAttemptFingerprintSource({
  snapshotId = '',
  supplierId = '',
  expectedDeliveryDate = '',
  items = [],
} = {}) {
  const snapshot = normalizeUuid(snapshotId)
  const supplier = normalizeUuid(supplierId)
  const date = normalizeDate(expectedDeliveryDate)
  if (!snapshot || !supplier || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''

  const lines = (Array.isArray(items) ? items : [])
    .map((item) => ({ barcode: barcodeOf(item), qty: qtyOf(item) }))
    .filter((item) => item.barcode && item.qty > 0)
    .sort((a, b) => compareBarcodes(a.barcode, b.barcode))
    .map((item) => `${item.barcode}=${canonicalizeAttemptQty(item.qty)}`)

  return [ATTEMPT_FINGERPRINT_SPEC, `snapshot=${snapshot}`, `supplier=${supplier}`, `date=${date}`, ...lines].join(
    '\n'
  )
}

export function computeAttemptPayloadFingerprint(payload) {
  return buildAttemptFingerprintSource(payload)
}

export function isValidAttemptPayloadFingerprint(value) {
  return typeof value === 'string' && value.startsWith(`${ATTEMPT_FINGERPRINT_SPEC}\n`) && value.length < 100_000
}

/** Shared fixture: JS verify and SQL live tests must produce this exact string. */
export const ATTEMPT_FINGERPRINT_FIXTURE = Object.freeze({
  snapshotId: '11111111-1111-4111-8111-111111111111',
  supplierId: '22222222-2222-4222-8222-222222222222',
  expectedDeliveryDate: '2026-08-14',
  items: [
    { barcode: '0002', qty: 2.5 },
    { barcode: '0001', qty: 10 },
    { barcode: 'skip', qty: 0 },
  ],
  expected: [
    ATTEMPT_FINGERPRINT_SPEC,
    'snapshot=11111111-1111-4111-8111-111111111111',
    'supplier=22222222-2222-4222-8222-222222222222',
    'date=2026-08-14',
    '0001=10',
    '0002=2.5',
  ].join('\n'),
})
