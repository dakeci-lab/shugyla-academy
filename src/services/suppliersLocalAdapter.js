import { normalizeSupplier, SUPPLIER_STATUS, PAYMENT_TYPE, RETURN_POLICY } from '../utils/supplierData'
import umagSeed from '../data/umagSuppliersSeed.json'

const STORAGE_KEY = 'shugyla_suppliers'
const UMAG_IMPORT_FLAG = 'shugyla_suppliers_umag_imported_v1'

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

function normalizeNameKey(name) {
  return String(name || '').trim().toLowerCase()
}

export function getLocalSuppliersBundle() {
  importUmagSuppliersOnce()
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

/** Однократный импорт Umag export (без дублей по name) */
export function importUmagSuppliersOnce() {
  if (localStorage.getItem(UMAG_IMPORT_FLAG) === '1') return

  const rows = loadRows()
  const seen = new Set(rows.map((r) => normalizeNameKey(r.name)))
  const now = new Date().toISOString()
  let added = 0

  for (const item of umagSeed) {
    const name = String(item.name || '').trim()
    if (!name) continue
    const key = normalizeNameKey(name)
    if (seen.has(key)) continue
    seen.add(key)
    added += 1

    rows.push({
      id: genId(),
      name,
      legal_name: item.legal_name || null,
      product_categories: item.product_categories || [],
      manager_name: item.manager_name || '',
      manager_phone: item.manager_phone || '',
      whatsapp: item.whatsapp || null,
      order_days: item.order_days || '',
      delivery_days: item.delivery_days || '',
      min_order_amount: item.min_order_amount ?? 0,
      payment_type: item.payment_type || PAYMENT_TYPE.CASH,
      deferral_days: item.deferral_days ?? 0,
      return_policy: item.return_policy || RETURN_POLICY.NO,
      return_comment: item.return_comment || null,
      responsible_employee_id: item.responsible_employee_id || null,
      responsible_employee_name: item.responsible_employee_name || null,
      status: item.status || SUPPLIER_STATUS.ACTIVE,
      comment: item.comment || null,
      created_at: now,
      updated_at: now,
    })
  }

  saveRows(rows)
  localStorage.setItem(UMAG_IMPORT_FLAG, '1')
  if (added > 0) {
    console.info(`[Suppliers] Imported ${added} suppliers from Umag seed`)
  }
}

/** Первичное наполнение, если хранилище пустое */
export function seedUmagSuppliersIfEmpty() {
  importUmagSuppliersOnce()
}

/** @deprecated используйте seedUmagSuppliersIfEmpty */
export function seedMockSuppliersIfEmpty() {
  seedUmagSuppliersIfEmpty()
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
  const nameKey = normalizeNameKey(data.name)
  if (rows.some((r) => normalizeNameKey(r.name) === nameKey)) {
    throw new Error('Поставщик с таким названием уже существует')
  }

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
