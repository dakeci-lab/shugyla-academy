import { supabase } from '../lib/supabaseClient'
import {
  normalizeSupplier,
  getAllSuppliersSync,
  SUPPLIER_STATUS,
  PAYMENT_TYPE,
  RETURN_POLICY,
} from '../utils/supplierData'

async function throwIfError(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`)
  return result.data
}

function rowToSupplier(row) {
  return normalizeSupplier({
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
}

function supplierToRow(data) {
  return {
    name: data.name?.trim(),
    legal_name: data.legalName?.trim() || null,
    product_categories: data.productCategories || [],
    manager_name: data.managerName?.trim() || '',
    manager_phone: data.managerPhone?.trim() || '',
    whatsapp: data.whatsapp?.trim() || null,
    order_days: data.orderDays?.trim() || '',
    delivery_days: data.deliveryDays?.trim() || '',
    min_order_amount: data.minOrderAmount ?? null,
    payment_type: data.paymentType || PAYMENT_TYPE.CASH,
    deferral_days: data.deferralDays ?? null,
    return_policy: data.returnPolicy || RETURN_POLICY.NO,
    return_comment: data.returnComment?.trim() || null,
    responsible_employee_id: data.responsibleEmployeeId ?? null,
    responsible_employee_name: data.responsibleEmployeeName?.trim() || null,
    status: data.status || SUPPLIER_STATUS.ACTIVE,
    comment: data.comment?.trim() || null,
  }
}

export async function fetchSuppliersData() {
  const result = await supabase
    .from('platform_suppliers')
    .select('*')
    .order('name')

  const suppliers = (await throwIfError(result, 'Загрузка поставщиков')).map(rowToSupplier)
  return { suppliers }
}

export async function createSupplier(data) {
  const row = {
    id: data.id || crypto.randomUUID(),
    ...supplierToRow(data),
  }
  await throwIfError(await supabase.from('platform_suppliers').insert(row), 'Создание поставщика')
  return row.id
}

export async function updateSupplier(supplierId, updates) {
  const current = getAllSuppliersSync().find((s) => s.id === supplierId)
  if (!current) throw new Error('Поставщик не найден')

  const merged = normalizeSupplier({ ...current, ...updates })
  const patch = supplierToRow(merged)

  await throwIfError(
    await supabase.from('platform_suppliers').update(patch).eq('id', supplierId),
    'Обновление поставщика'
  )
}

export async function deleteSupplier(supplierId) {
  await throwIfError(
    await supabase.from('platform_suppliers').delete().eq('id', supplierId),
    'Удаление поставщика'
  )
}

export async function archiveSupplier(supplierId) {
  await updateSupplier(supplierId, { status: SUPPLIER_STATUS.ARCHIVED })
}
