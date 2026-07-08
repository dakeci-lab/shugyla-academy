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
  inactive: 'Неактивный',
  archived: 'Архив',
}

export const SUPPLIER_STATUS_BADGE = {
  active: 'done',
  inactive: 'warning',
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

function parseCategories(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  }
  return []
}

export function normalizeSupplier(raw) {
  if (!raw) return null

  const categories = parseCategories(raw.productCategories ?? raw.product_categories)

  return {
    id: raw.id,
    name: raw.name?.trim() || '',
    legalName: raw.legalName ?? raw.legal_name ?? '',
    productCategories: categories,
    managerName: raw.managerName ?? raw.manager_name ?? '',
    managerPhone: raw.managerPhone ?? raw.manager_phone ?? '',
    whatsapp: raw.whatsapp ?? '',
    orderDays: raw.orderDays ?? raw.order_days ?? '',
    deliveryDays: raw.deliveryDays ?? raw.delivery_days ?? '',
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
    if (cloud) return cloud
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

export function formatSupplierCategories(categories) {
  if (!categories?.length) return '—'
  return categories.join(', ')
}

export function formatMinOrderAmount(amount) {
  if (amount == null || Number.isNaN(amount)) return '—'
  return `${Number(amount).toLocaleString('ru-RU')} ₸`
}

export function filterSuppliers(suppliers, { search = '', status = 'all' } = {}) {
  const q = search.trim().toLowerCase()

  return suppliers.filter((supplier) => {
    if (status !== 'all' && supplier.status !== status) return false

    if (!q) return true

    const haystack = [
      supplier.name,
      supplier.legalName,
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

export function categoriesToInputValue(categories) {
  return Array.isArray(categories) ? categories.join(', ') : ''
}

export function inputValueToCategories(value) {
  return parseCategories(value)
}
