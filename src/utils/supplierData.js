import { isCloudMode } from '../lib/dataMode'
import { getCloudSuppliers } from '../lib/cloudStore'
import { getLocalSuppliersBundle } from '../services/suppliersLocalAdapter'

export const SUPPLIER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived',
}

export const SUPPLIER_STATUS_LABELS = {
  active: 'Активный',
  inactive: 'Деактивирован',
  archived: 'Архив',
}

export const SUPPLIER_STATUS_BADGE = {
  active: 'done',
  inactive: 'idle',
  archived: 'idle',
}

export const PAYMENT_TYPE = {
  CASH: 'cash',
  TRANSFER: 'transfer',
  DEFERRAL: 'deferral',
  MIXED: 'mixed',
}

export const PAYMENT_TYPE_LABELS = {
  cash: 'Наличными',
  transfer: 'Перевод',
  deferral: 'Отсрочка',
  mixed: 'Смешанная оплата',
}

export const RETURN_POLICY = {
  YES: 'yes',
  NO: 'no',
  PARTIAL: 'partial',
}

export const RETURN_POLICY_LABELS = {
  yes: 'Есть',
  no: 'Нет',
  partial: 'Частично',
}

export const SUPPLIER_STATUS_FILTER_OPTIONS = [
  { id: 'all', label: 'Все статусы' },
  { id: SUPPLIER_STATUS.ACTIVE, label: SUPPLIER_STATUS_LABELS.active },
  { id: SUPPLIER_STATUS.INACTIVE, label: SUPPLIER_STATUS_LABELS.inactive },
  { id: SUPPLIER_STATUS.ARCHIVED, label: SUPPLIER_STATUS_LABELS.archived },
]

/** Каталог списка поставщиков (UMAG-first) */
export const SUPPLIER_CATALOG_FILTER = {
  UMAG_ACTIVE: 'umag_active',
  LOCAL_ONLY: 'local_only',
  ARCHIVED: 'archived',
  ALL: 'all',
}

/** Значение фильтра списка поставщиков по умолчанию — действующие UMAG-linked */
export const SUPPLIER_LIST_DEFAULT_STATUS = SUPPLIER_CATALOG_FILTER.UMAG_ACTIVE

/** Варианты фильтра каталога на странице поставщиков */
export const SUPPLIER_LIST_STATUS_FILTER_OPTIONS = [
  { id: SUPPLIER_CATALOG_FILTER.UMAG_ACTIVE, label: 'UMAG' },
  { id: SUPPLIER_CATALOG_FILTER.LOCAL_ONLY, label: 'Не связаны с UMAG' },
  { id: SUPPLIER_CATALOG_FILTER.ARCHIVED, label: 'Архивные' },
  { id: SUPPLIER_CATALOG_FILTER.ALL, label: 'Все' },
]

/** Компактная подпись количества в фильтре поставщиков */
export function formatSupplierFilterCount(status, count) {
  const total = Number(count) || 0
  if (status === SUPPLIER_CATALOG_FILTER.UMAG_ACTIVE) {
    return `UMAG-поставщиков: ${total}`
  }
  if (status === SUPPLIER_CATALOG_FILTER.LOCAL_ONLY) {
    return `Не связаны с UMAG: ${total}`
  }
  if (status === SUPPLIER_CATALOG_FILTER.ARCHIVED) return `Архивных поставщиков: ${total}`
  if (status === SUPPLIER_CATALOG_FILTER.ALL || status === 'all') return `Найдено: ${total}`
  // legacy status filters
  if (status === SUPPLIER_STATUS.ACTIVE) return `Активных поставщиков: ${total}`
  if (status === SUPPLIER_STATUS.INACTIVE) return `Деактивированных поставщиков: ${total}`
  return `Найдено: ${total}`
}

export function matchesSupplierCatalogFilter(supplier, catalog = SUPPLIER_CATALOG_FILTER.ALL) {
  if (!supplier || supplier.isMerged) return false

  if (catalog === SUPPLIER_CATALOG_FILTER.UMAG_ACTIVE) {
    return (
      Boolean(supplier.linkedToUmag) &&
      supplier.isUmagActive !== false &&
      supplier.status !== SUPPLIER_STATUS.ARCHIVED
    )
  }

  if (catalog === SUPPLIER_CATALOG_FILTER.LOCAL_ONLY) {
    return !supplier.linkedToUmag && supplier.status !== SUPPLIER_STATUS.ARCHIVED
  }

  if (catalog === SUPPLIER_CATALOG_FILTER.ARCHIVED) {
    return supplier.status === SUPPLIER_STATUS.ARCHIVED
  }

  if (catalog === SUPPLIER_CATALOG_FILTER.ALL || catalog === 'all') {
    return true
  }

  // Backward-compatible status filter
  return supplier.status === catalog
}

/** Дни недели для расписания поставщика (ISO: пн → вс) */
export const SUPPLIER_WEEKDAYS = [
  { id: 'mon', label: 'Пн' },
  { id: 'tue', label: 'Вт' },
  { id: 'wed', label: 'Ср' },
  { id: 'thu', label: 'Чт' },
  { id: 'fri', label: 'Пт' },
  { id: 'sat', label: 'Сб' },
  { id: 'sun', label: 'Вс' },
]

const SUPPLIER_WEEKDAY_IDS = new Set(SUPPLIER_WEEKDAYS.map((day) => day.id))

const LEGACY_WEEKDAY_ALIASES = {
  пн: 'mon',
  пон: 'mon',
  mon: 'mon',
  monday: 'mon',
  вт: 'tue',
  tue: 'tue',
  tuesday: 'tue',
  ср: 'wed',
  wed: 'wed',
  wednesday: 'wed',
  чт: 'thu',
  thu: 'thu',
  thursday: 'thu',
  пт: 'fri',
  fri: 'fri',
  friday: 'fri',
  сб: 'sat',
  sat: 'sat',
  saturday: 'sat',
  вс: 'sun',
  sun: 'sun',
  sunday: 'sun',
}

function normalizeWeekdayToken(token) {
  const key = String(token || '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
  if (!key) return null
  if (SUPPLIER_WEEKDAY_IDS.has(key)) return key
  return LEGACY_WEEKDAY_ALIASES[key] || null
}

/** Парсинг дней недели из JSON-массива или legacy-строки «Пн, Чт» */
export function parseSupplierWeekdays(value) {
  if (Array.isArray(value)) {
    const result = []
    for (const item of value) {
      const id = normalizeWeekdayToken(item)
      if (id && !result.includes(id)) result.push(id)
    }
    return result
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []

    if (trimmed.startsWith('[')) {
      try {
        return parseSupplierWeekdays(JSON.parse(trimmed))
      } catch {
        return []
      }
    }

    const result = []
    for (const part of trimmed.split(/[,;]+/)) {
      const id = normalizeWeekdayToken(part)
      if (id && !result.includes(id)) result.push(id)
    }
    return result
  }

  return []
}

export function serializeSupplierWeekdays(weekdays) {
  const normalized = parseSupplierWeekdays(weekdays)
  if (!normalized.length) return ''
  return JSON.stringify(normalized)
}

export function formatSupplierWeekdays(weekdays) {
  const normalized = parseSupplierWeekdays(weekdays)
  if (!normalized.length) return '—'
  return normalized
    .map((id) => SUPPLIER_WEEKDAYS.find((day) => day.id === id)?.label || id)
    .join(', ')
}

export function dateToSupplierWeekdayId(date) {
  const jsDay = date.getDay()
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][jsDay]
}

function isGarbageCategory(value) {
  const text = String(value || '').trim()
  if (!text) return true
  if (text === '{}' || text === '{"{}"}' || text === '{""}') return true
  if (/^\{[\s\S]*\}$/.test(text) || /^\[[\s\S]*\]$/.test(text)) return true
  return false
}

function parseCategories(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter((v) => v && !isGarbageCategory(v))
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v && !isGarbageCategory(v))
  }
  return []
}

export function normalizeSupplier(raw) {
  if (!raw) return null

  const categories = parseCategories(raw.productCategories ?? raw.product_categories)
  const orderWeekdays = parseSupplierWeekdays(
    raw.orderWeekdays ?? raw.order_weekdays ?? raw.order_days ?? raw.orderDays
  )
  const deliveryWeekdays = parseSupplierWeekdays(
    raw.deliveryWeekdays ?? raw.delivery_weekdays ?? raw.delivery_days ?? raw.deliveryDays
  )

  const umagSupplierId =
    raw.umagSupplierId ?? raw.umag_supplier_id ?? null
  const linkedToUmag = umagSupplierId != null && umagSupplierId !== ''
  const isMerged = Boolean(raw.isMerged ?? raw.is_merged)

  return {
    id: raw.id,
    name: raw.name?.trim() || '',
    legalName: raw.legalName ?? raw.legal_name ?? '',
    bin: raw.bin ?? '',
    umagPhone: raw.umagPhone ?? raw.umag_phone ?? '',
    actualAddress: raw.actualAddress ?? raw.actual_address ?? '',
    legalAddress: raw.legalAddress ?? raw.legal_address ?? '',
    umagSupplierId: umagSupplierId == null ? null : Number(umagSupplierId),
    isUmagActive:
      raw.isUmagActive ??
      raw.is_umag_active ??
      (linkedToUmag ? true : null),
    umagLastSyncedAt: raw.umagLastSyncedAt ?? raw.umag_last_synced_at ?? null,
    isMerged,
    mergedIntoSupplierId: raw.mergedIntoSupplierId ?? raw.merged_into_supplier_id ?? null,
    linkedToUmag,
    productCategories: categories,
    managerName: raw.managerName ?? raw.manager_name ?? '',
    managerPhone: raw.managerPhone ?? raw.manager_phone ?? '',
    whatsapp: raw.whatsapp ?? '',
    orderWeekdays,
    deliveryWeekdays,
    orderDays: formatSupplierWeekdays(orderWeekdays),
    deliveryDays: formatSupplierWeekdays(deliveryWeekdays),
    minOrderAmount:
      raw.minOrderAmount != null
        ? Number(raw.minOrderAmount)
        : raw.min_order_amount != null
          ? Number(raw.min_order_amount)
          : null,
    paymentType: raw.paymentType ?? raw.payment_type ?? PAYMENT_TYPE.CASH,
    deferralDays:
      raw.deferralDays != null
        ? Number(raw.deferralDays)
        : raw.deferral_days != null
          ? Number(raw.deferral_days)
          : null,
    returnPolicy: raw.returnPolicy ?? raw.return_policy ?? RETURN_POLICY.NO,
    returnComment: raw.returnComment ?? raw.return_comment ?? '',
    responsibleEmployeeId:
      raw.responsibleEmployeeId ?? raw.responsible_employee_id ?? null,
    responsibleEmployeeName:
      raw.responsibleEmployeeName ?? raw.responsible_employee_name ?? '',
    status: raw.status ?? SUPPLIER_STATUS.ACTIVE,
    comment: raw.comment ?? '',
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
  }
}

function getSuppliersSource() {
  if (isCloudMode()) {
    const cloud = getCloudSuppliers()
    return cloud || []
  }
  return getLocalSuppliersBundle().suppliers
}

export function getAllSuppliersSync() {
  return getSuppliersSource()
    .map(normalizeSupplier)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export function getSupplierByIdSync(id) {
  return getAllSuppliersSync().find((s) => s.id === id) || null
}

export function getActiveSuppliersCount() {
  return getAllSuppliersSync().filter((s) => s.status === SUPPLIER_STATUS.ACTIVE).length
}

/** Склонение «N активных поставщиков» */
export function formatActiveSuppliersCount(count) {
  const n = Number(count) || 0
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} активный поставщик`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${n} активных поставщика`
  }
  return `${n} активных поставщиков`
}

export function formatSupplierCategories(categories) {
  if (!categories?.length) return '—'
  return categories.join(', ')
}

/** Текст условий оплаты для списков и карточек */
export function formatSupplierPaymentTerms(supplier) {
  if (!supplier?.paymentType) return '—'

  const baseLabel = PAYMENT_TYPE_LABELS[supplier.paymentType]
  if (!baseLabel) return '—'

  const deferralDays = Number(supplier.deferralDays)
  if (
    (supplier.paymentType === PAYMENT_TYPE.DEFERRAL ||
      supplier.paymentType === PAYMENT_TYPE.MIXED) &&
    Number.isFinite(deferralDays) &&
    deferralDays > 0
  ) {
    return `${baseLabel} ${deferralDays} дней`
  }

  return baseLabel
}

export function formatMinOrderAmount(amount) {
  if (amount == null || Number.isNaN(amount)) return '—'
  return `${Number(amount).toLocaleString('ru-RU')} ₸`
}

export function filterSuppliers(suppliers, { search = '', status = 'all' } = {}) {
  const q = search.trim().toLowerCase()

  return suppliers.filter((supplier) => {
    if (!matchesSupplierCatalogFilter(supplier, status)) return false

    if (!q) return true

    const haystack = [
      supplier.name,
      supplier.legalName,
      supplier.bin,
      supplier.managerName,
      supplier.managerPhone,
      supplier.whatsapp,
      supplier.responsibleEmployeeName,
      formatSupplierCategories(supplier.productCategories),
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(q)
  })
}

/** Priority for new procurement/receiving picker: UMAG-active → local-only → rest */
export function compareSuppliersForSelection(a, b) {
  const rank = (supplier) => {
    if (supplier?.linkedToUmag && supplier.isUmagActive !== false) return 0
    if (!supplier?.linkedToUmag) return 1
    return 2
  }
  const byRank = rank(a) - rank(b)
  if (byRank !== 0) return byRank
  return String(a?.name || '').localeCompare(String(b?.name || ''), 'ru')
}

export function categoriesToInputValue(categories) {
  return Array.isArray(categories) ? categories.join(', ') : ''
}

export function inputValueToCategories(value) {
  return parseCategories(value)
}
