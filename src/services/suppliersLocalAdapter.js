import { normalizeSupplier, SUPPLIER_STATUS, PAYMENT_TYPE, RETURN_POLICY } from '../utils/supplierData'

const STORAGE_KEY = 'shugyla_suppliers'

function readJson(fallback) {
  const data = localStorage.getItem(STORAGE_KEY)
  return data ? JSON.parse(data) : fallback
}

function writeJson(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

function genId() {
  return crypto.randomUUID()
}

function loadRows() {
  return readJson([])
}

function saveRows(rows) {
  writeJson(rows)
}

export function getLocalSuppliersBundle() {
  seedMockSuppliersIfEmpty()
  const suppliers = loadRows().map((row) =>
    normalizeSupplier({
      id: row.id,
      name: row.name,
      legal_name: row.legal_name,
      product_categories: row.product_categories,
      manager_name: row.manager_name,
      manager_phone: row.manager_phone,
      whatsapp: row.whatsapp,
      order_days: row.order_days,
      delivery_days: row.delivery_days,
      min_order_amount: row.min_order_amount,
      payment_type: row.payment_type,
      deferral_days: row.deferral_days,
      return_policy: row.return_policy,
      return_comment: row.return_comment,
      responsible_employee_id: row.responsible_employee_id,
      responsible_employee_name: row.responsible_employee_name,
      status: row.status,
      comment: row.comment,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })
  )
  return { suppliers }
}

export function seedMockSuppliersIfEmpty() {
  if (loadRows().length > 0) return

  const now = new Date().toISOString()
  saveRows([
    {
      id: genId(),
      name: 'ТОО «МолКом»',
      legal_name: 'Товарищество с ограниченной ответственностью «МолКом»',
      product_categories: ['Молочная продукция', 'Йогурты'],
      manager_name: 'Айгуль Смагулова',
      manager_phone: '+7 777 123 45 67',
      whatsapp: '',
      order_days: 'Пн, Ср, Пт',
      delivery_days: 'Вт, Чт, Сб',
      min_order_amount: 50000,
      payment_type: PAYMENT_TYPE.TRANSFER,
      deferral_days: null,
      return_policy: RETURN_POLICY.PARTIAL,
      return_comment: 'Возврат просрочки в течение 3 дней',
      responsible_employee_id: null,
      responsible_employee_name: 'Закупщик',
      status: SUPPLIER_STATUS.ACTIVE,
      comment: 'Основной поставщик молочки',
      created_at: now,
      updated_at: now,
    },
    {
      id: genId(),
      name: 'ИП «Bakaleya Plus»',
      legal_name: '',
      product_categories: ['Бакалея', 'Консервы'],
      manager_name: 'Ерлан Касымов',
      manager_phone: '+7 701 987 65 43',
      whatsapp: '+7 701 987 65 43',
      order_days: 'Пн–Пт',
      delivery_days: 'Ср, Сб',
      min_order_amount: 30000,
      payment_type: PAYMENT_TYPE.MIXED,
      deferral_days: 7,
      return_policy: RETURN_POLICY.YES,
      return_comment: '',
      responsible_employee_id: null,
      responsible_employee_name: '',
      status: SUPPLIER_STATUS.ACTIVE,
      comment: '',
      created_at: now,
      updated_at: now,
    },
  ])
}

function rowFromSupplier(supplier) {
  return {
    id: supplier.id,
    name: supplier.name,
    legal_name: supplier.legalName || null,
    product_categories: supplier.productCategories || [],
    manager_name: supplier.managerName || '',
    manager_phone: supplier.managerPhone || '',
    whatsapp: supplier.whatsapp || null,
    order_days: supplier.orderDays || '',
    delivery_days: supplier.deliveryDays || '',
    min_order_amount: supplier.minOrderAmount,
    payment_type: supplier.paymentType || PAYMENT_TYPE.CASH,
    deferral_days: supplier.deferralDays,
    return_policy: supplier.returnPolicy || RETURN_POLICY.NO,
    return_comment: supplier.returnComment || null,
    responsible_employee_id: supplier.responsibleEmployeeId,
    responsible_employee_name: supplier.responsibleEmployeeName || null,
    status: supplier.status || SUPPLIER_STATUS.ACTIVE,
    comment: supplier.comment || null,
    created_at: supplier.createdAt,
    updated_at: supplier.updatedAt,
  }
}

export async function fetchSuppliersData() {
  return getLocalSuppliersBundle()
}

export async function createSupplier(data) {
  const rows = loadRows()
  const now = new Date().toISOString()
  const supplier = normalizeSupplier({
    id: genId(),
    ...data,
    created_at: now,
    updated_at: now,
  })
  rows.push(rowFromSupplier(supplier))
  saveRows(rows)
  return supplier.id
}

export async function updateSupplier(supplierId, updates) {
  const rows = loadRows()
  const idx = rows.findIndex((r) => r.id === supplierId)
  if (idx < 0) throw new Error('Поставщик не найден')

  const current = normalizeSupplier(rows[idx])
  const next = normalizeSupplier({
    ...current,
    ...updates,
    updated_at: new Date().toISOString(),
  })
  rows[idx] = rowFromSupplier(next)
  saveRows(rows)
}

export async function deleteSupplier(supplierId) {
  const rows = loadRows()
  saveRows(rows.filter((r) => r.id !== supplierId))
}

export async function archiveSupplier(supplierId) {
  await updateSupplier(supplierId, { status: SUPPLIER_STATUS.ARCHIVED })
}
