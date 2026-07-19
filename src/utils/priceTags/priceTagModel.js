/**
 * Price-tag draft + view-model — independent of product catalog source.
 * Manual form today; later map catalog rows via draftFromProductSource().
 */

export const PRICE_TAG_TYPES = {
  REGULAR: 'regular',
  PROMO: 'promo',
}

export const PRICE_TAG_TYPE_OPTIONS = [
  { id: PRICE_TAG_TYPES.REGULAR, label: 'Обычный' },
  { id: PRICE_TAG_TYPES.PROMO, label: 'Акционный' },
]

/** Physical sizes — independent of tag type. */
export const PRICE_TAG_SIZES = [
  { id: '58x40', label: '58×40 мм', widthMm: 58, heightMm: 40 },
  { id: '58x60', label: '58×60 мм', widthMm: 58, heightMm: 60 },
  { id: '70x49', label: '70×49 мм', widthMm: 70, heightMm: 49 },
  { id: 'a6', label: 'A6', widthMm: 105, heightMm: 148 },
  { id: 'a5', label: 'A5', widthMm: 148, heightMm: 210 },
  { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297 },
]

export const DEFAULT_PRICE_TAG_SIZE_ID = '58x40'
export const DEFAULT_PRICE_TAG_TYPE = PRICE_TAG_TYPES.REGULAR

/** Empty manual draft — same shape as future catalog mapping. */
export function createEmptyPriceTagDraft() {
  return {
    name: '',
    volume: '',
    price: '',
    oldPrice: '',
    description: '',
    barcode: '',
    sku: '',
  }
}

/**
 * Future catalog adapter: map a product/source record into a draft.
 * Keeps generator free of catalog schema — only this helper changes later.
 *
 * @param {Record<string, unknown>} source
 * @returns {ReturnType<typeof createEmptyPriceTagDraft>}
 */
export function draftFromProductSource(source = {}) {
  return {
    name: String(source.name ?? source.title ?? '').trim(),
    volume: String(source.volume ?? source.volumeLabel ?? source.weight ?? '').trim(),
    price: source.price != null ? String(source.price) : '',
    oldPrice: source.oldPrice != null ? String(source.oldPrice) : source.old_price != null ? String(source.old_price) : '',
    description: String(source.description ?? source.note ?? '').trim(),
    barcode: String(source.barcode ?? source.ean ?? '').trim(),
    sku: String(source.sku ?? source.article ?? source.articule ?? '').trim(),
  }
}

export function getPriceTagSize(sizeId) {
  return (
    PRICE_TAG_SIZES.find((item) => item.id === sizeId) ||
    PRICE_TAG_SIZES.find((item) => item.id === DEFAULT_PRICE_TAG_SIZE_ID)
  )
}

export function normalizePriceTagType(type) {
  return type === PRICE_TAG_TYPES.PROMO ? PRICE_TAG_TYPES.PROMO : PRICE_TAG_TYPES.REGULAR
}

function trimText(value) {
  return String(value ?? '').trim()
}

function parseMoneyInput(value) {
  const raw = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

export function formatPriceTagMoney(value) {
  if (value == null || value === '') return ''
  const n = typeof value === 'number' ? value : parseMoneyInput(value)
  if (n == null) return ''
  return `${n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ₸`
}

/**
 * Validate draft for print. Returns { ok, errors }.
 */
export function validatePriceTagDraft(draft) {
  const errors = {}
  const name = trimText(draft?.name)
  if (!name) errors.name = 'Укажите название товара'

  const price = parseMoneyInput(draft?.price)
  if (price == null) errors.price = 'Укажите корректную цену'

  const type = normalizePriceTagType(draft?.type)
  if (type === PRICE_TAG_TYPES.PROMO) {
    const oldPrice = parseMoneyInput(draft?.oldPrice)
    if (oldPrice == null && trimText(draft?.oldPrice)) {
      errors.oldPrice = 'Некорректная старая цена'
    }
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

/**
 * Pure view-model for preview + print — no I/O, no React.
 */
export function buildPriceTagViewModel(draft, { type = DEFAULT_PRICE_TAG_TYPE, sizeId = DEFAULT_PRICE_TAG_SIZE_ID } = {}) {
  const size = getPriceTagSize(sizeId)
  const tagType = normalizePriceTagType(type)
  const name = trimText(draft?.name) || 'Название товара'
  const volume = trimText(draft?.volume)
  const description = trimText(draft?.description)
  const barcode = trimText(draft?.barcode)
  const sku = trimText(draft?.sku)
  const priceNumber = parseMoneyInput(draft?.price)
  const oldPriceNumber = parseMoneyInput(draft?.oldPrice)

  return {
    type: tagType,
    size,
    name,
    volume,
    description,
    barcode,
    sku,
    price: priceNumber,
    priceLabel: priceNumber != null ? formatPriceTagMoney(priceNumber) : '— ₸',
    oldPrice: oldPriceNumber,
    oldPriceLabel: oldPriceNumber != null ? formatPriceTagMoney(oldPriceNumber) : '',
    showOldPrice: tagType === PRICE_TAG_TYPES.PROMO && oldPriceNumber != null,
    isPromo: tagType === PRICE_TAG_TYPES.PROMO,
  }
}
