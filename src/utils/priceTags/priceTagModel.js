/**
 * Price-tag list + row model — independent of product catalog source.
 * Manual list editor today; later map catalog rows via draftFromProductSource().
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

/** Extensible unit list for the row editor. */
export const PRICE_TAG_UNITS = [
  { id: 'pcs', label: 'шт.' },
  { id: 'kg', label: 'кг' },
  { id: 'g', label: 'гр' },
  { id: 'l', label: 'л' },
  { id: 'ml', label: 'мл' },
  { id: 'pack', label: 'уп.' },
  { id: 'box', label: 'пач.' },
  { id: 'bottle', label: 'бут.' },
  { id: 'roll', label: 'рул.' },
  { id: 'set', label: 'компл.' },
]

export const DEFAULT_PRICE_TAG_UNIT = 'pcs'

function newRowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `pt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
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

function parseQuantity(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(999, Math.floor(n))
}

export function getPriceTagUnitLabel(unitId) {
  const found = PRICE_TAG_UNITS.find((item) => item.id === unitId)
  return found?.label || PRICE_TAG_UNITS[0].label
}

export function normalizePriceTagUnit(unitId) {
  if (PRICE_TAG_UNITS.some((item) => item.id === unitId)) return unitId
  return DEFAULT_PRICE_TAG_UNIT
}

/** Empty row for the list editor. */
export function createEmptyPriceTagRow() {
  return {
    id: newRowId(),
    name: '',
    unit: DEFAULT_PRICE_TAG_UNIT,
    barcode: '',
    price: '',
    oldPrice: '',
    quantity: 1,
    showDescription: false,
    description: '',
  }
}

/**
 * Migrate legacy single-draft / older row shapes into the current row model.
 * Volume / sku / productCode / country are dropped (volume folded into name when present).
 */
export function normalizePriceTagRow(raw = {}) {
  const volume = trimText(raw.volume)
  let name = trimText(raw.name ?? raw.title)
  if (volume && name && !name.includes(volume)) {
    name = `${name} ${volume}`
  } else if (!name && volume) {
    name = volume
  }

  const showDescription =
    raw.showDescription === true ||
    (raw.showDescription == null && Boolean(trimText(raw.description)))

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newRowId(),
    name,
    unit: normalizePriceTagUnit(raw.unit ?? raw.unitId),
    barcode: trimText(raw.barcode ?? raw.ean),
    price: raw.price != null && raw.price !== '' ? String(raw.price) : '',
    oldPrice:
      raw.oldPrice != null && raw.oldPrice !== ''
        ? String(raw.oldPrice)
        : raw.old_price != null && raw.old_price !== ''
          ? String(raw.old_price)
          : '',
    quantity: parseQuantity(raw.quantity ?? raw.qty ?? 1),
    showDescription,
    description: trimText(raw.description ?? raw.note),
  }
}

/** Empty print list (session document). */
export function createEmptyPriceTagList(overrides = {}) {
  return {
    id: typeof overrides.id === 'string' && overrides.id ? overrides.id : newRowId(),
    title: trimText(overrides.title) || 'Список ценников',
    type: normalizePriceTagType(overrides.type),
    sizeId: overrides.sizeId || DEFAULT_PRICE_TAG_SIZE_ID,
    rows: Array.isArray(overrides.rows) && overrides.rows.length > 0
      ? overrides.rows.map(normalizePriceTagRow)
      : [createEmptyPriceTagRow()],
    updatedAt: overrides.updatedAt || new Date().toISOString(),
  }
}

/**
 * Normalize a persisted list document (v1 single draft or v2 list).
 */
export function normalizePriceTagList(raw) {
  if (!raw || typeof raw !== 'object') {
    return createEmptyPriceTagList()
  }

  // Legacy v1: single draft fields at root (name/price without rows[]).
  if (!Array.isArray(raw.rows) && (raw.name != null || raw.price != null)) {
    return createEmptyPriceTagList({
      id: raw.id,
      title: raw.title || 'Список ценников',
      type: raw.type,
      sizeId: raw.sizeId,
      rows: [normalizePriceTagRow(raw)],
      updatedAt: raw.updatedAt,
    })
  }

  return createEmptyPriceTagList({
    id: raw.id,
    title: raw.title,
    type: raw.type,
    sizeId: raw.sizeId,
    rows: raw.rows,
    updatedAt: raw.updatedAt,
  })
}

/** @deprecated Use createEmptyPriceTagRow / createEmptyPriceTagList */
export function createEmptyPriceTagDraft() {
  return createEmptyPriceTagRow()
}

/**
 * Future catalog adapter: map a product/source record into a row.
 * Keeps generator free of catalog schema — only this helper changes later.
 *
 * @param {Record<string, unknown>} source
 */
export function draftFromProductSource(source = {}) {
  return normalizePriceTagRow({
    name: source.name ?? source.title,
    volume: source.volume ?? source.volumeLabel ?? source.weight,
    unit: source.unit ?? source.unitId,
    price: source.price,
    oldPrice: source.oldPrice ?? source.old_price,
    description: source.description ?? source.note,
    barcode: source.barcode ?? source.ean,
    quantity: source.quantity ?? source.qty ?? 1,
    showDescription: Boolean(trimText(source.description ?? source.note)),
  })
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
 * Validate a single row for print. Returns { ok, errors }.
 */
export function validatePriceTagRow(row) {
  const errors = {}
  const name = trimText(row?.name)
  if (!name) errors.name = 'Укажите название товара'

  const price = parseMoneyInput(row?.price)
  if (price == null) errors.price = 'Укажите корректную цену'

  if (trimText(row?.oldPrice)) {
    const oldPrice = parseMoneyInput(row?.oldPrice)
    if (oldPrice == null) errors.oldPrice = 'Некорректная старая цена'
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

/** @deprecated Prefer validatePriceTagRow */
export function validatePriceTagDraft(draft) {
  return validatePriceTagRow(draft)
}

/**
 * Validate list before print — at least one valid filled row.
 * @returns {{ ok: boolean, errorsByRowId: Record<string, object>, firstErrorRowId: string|null, printableRows: object[] }}
 */
export function validatePriceTagList(list) {
  const rows = Array.isArray(list?.rows) ? list.rows : []
  const errorsByRowId = {}
  const printableRows = []
  let firstErrorRowId = null

  for (const row of rows) {
    const filled =
      trimText(row.name) ||
      trimText(row.price) ||
      trimText(row.barcode) ||
      trimText(row.oldPrice) ||
      (row.showDescription && trimText(row.description))

    if (!filled) continue

    const validation = validatePriceTagRow(row)
    if (!validation.ok) {
      errorsByRowId[row.id] = validation.errors
      if (!firstErrorRowId) firstErrorRowId = row.id
      continue
    }
    printableRows.push(normalizePriceTagRow(row))
  }

  if (printableRows.length === 0 && Object.keys(errorsByRowId).length === 0) {
    return {
      ok: false,
      errorsByRowId: {},
      firstErrorRowId: null,
      printableRows: [],
      empty: true,
    }
  }

  return {
    ok: Object.keys(errorsByRowId).length === 0 && printableRows.length > 0,
    errorsByRowId,
    firstErrorRowId,
    printableRows,
    empty: false,
  }
}

/**
 * Pure view-model for preview + print — no I/O, no React.
 */
export function buildPriceTagViewModel(row, { type = DEFAULT_PRICE_TAG_TYPE, sizeId = DEFAULT_PRICE_TAG_SIZE_ID } = {}) {
  const size = getPriceTagSize(sizeId)
  const tagType = normalizePriceTagType(type)
  const normalized = normalizePriceTagRow(row)
  const name = trimText(normalized.name) || 'Название товара'
  const unitLabel = getPriceTagUnitLabel(normalized.unit)
  const description =
    normalized.showDescription && trimText(normalized.description)
      ? trimText(normalized.description)
      : ''
  const barcode = trimText(normalized.barcode)
  const priceNumber = parseMoneyInput(normalized.price)
  const oldPriceNumber = parseMoneyInput(normalized.oldPrice)

  return {
    type: tagType,
    size,
    name,
    unit: normalized.unit,
    unitLabel,
    description,
    barcode,
    price: priceNumber,
    priceLabel: priceNumber != null ? formatPriceTagMoney(priceNumber) : '— ₸',
    oldPrice: oldPriceNumber,
    oldPriceLabel: oldPriceNumber != null ? formatPriceTagMoney(oldPriceNumber) : '',
    // Print old price whenever filled; promo chrome follows selected type.
    showOldPrice: oldPriceNumber != null,
    isPromo: tagType === PRICE_TAG_TYPES.PROMO,
    quantity: parseQuantity(normalized.quantity),
  }
}

/**
 * Expand list rows into print view-models (respects quantity copies).
 */
export function buildPrintViewModelsFromList(list) {
  const type = normalizePriceTagType(list?.type)
  const sizeId = list?.sizeId || DEFAULT_PRICE_TAG_SIZE_ID
  const validation = validatePriceTagList(list)
  if (!validation.ok) return { ok: false, validation, viewModels: [] }

  const viewModels = []
  for (const row of validation.printableRows) {
    const vm = buildPriceTagViewModel(row, { type, sizeId })
    const copies = Math.max(1, vm.quantity || 1)
    for (let i = 0; i < copies; i += 1) {
      viewModels.push(vm)
    }
  }

  return { ok: true, validation, viewModels }
}

export function movePriceTagRow(rows, fromIndex, toIndex) {
  if (!Array.isArray(rows)) return []
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= rows.length ||
    toIndex >= rows.length
  ) {
    return rows
  }
  const next = rows.slice()
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

export function insertPriceTagRowsAfter(rows, index, count = 1) {
  const next = Array.isArray(rows) ? rows.slice() : []
  const insertAt = Math.max(0, Math.min(index + 1, next.length))
  const fresh = Array.from({ length: Math.max(1, count) }, () => createEmptyPriceTagRow())
  next.splice(insertAt, 0, ...fresh)
  return next
}

export function countPrintableTags(list) {
  const built = buildPrintViewModelsFromList(list)
  return built.ok ? built.viewModels.length : 0
}
