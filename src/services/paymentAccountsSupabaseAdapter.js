import { supabase } from '../lib/supabaseClient'
import { normalizePaymentAccount } from '../utils/paymentAccountsData'

const TABLE = 'payment_accounts'

export const PAYMENT_ACCOUNTS_MIGRATION_MESSAGE =
  'Справочник счетов оплаты ещё не подключён к базе данных. Необходимо применить миграцию.'

function isMissingTableError(error) {
  if (!error) return false
  const msg = String(error.message || '')
  return (
    error.code === 'PGRST205' ||
    msg.includes('public.payment_accounts') ||
    msg.includes('schema cache') ||
    msg.includes('Could not find the table')
  )
}

function isNameConflictError(error) {
  return error?.code === '23505'
}

function toUserError(error, fallback) {
  if (isMissingTableError(error)) return new Error(PAYMENT_ACCOUNTS_MIGRATION_MESSAGE)
  if (isNameConflictError(error)) return new Error('Счёт с таким названием уже существует')
  return new Error(error.message || fallback)
}

async function throwIfError(result, message) {
  if (result.error) throw toUserError(result.error, message)
  return result.data
}

export async function listPaymentAccounts() {
  const result = await supabase.from(TABLE).select('*').order('sort_order').order('name')
  const rows = await throwIfError(result, 'Загрузка счетов оплаты')
  return (rows || []).map(normalizePaymentAccount)
}

export async function createPaymentAccount({ name, description = '' }) {
  const result = await supabase
    .from(TABLE)
    .insert({ name: name.trim(), description: description.trim() })
    .select()
    .single()
  return normalizePaymentAccount(await throwIfError(result, 'Создание счёта'))
}

export async function updatePaymentAccount(id, { name, description }) {
  const patch = {}
  if (name != null) patch.name = name.trim()
  if (description != null) patch.description = description.trim()
  const result = await supabase.from(TABLE).update(patch).eq('id', id).select().single()
  return normalizePaymentAccount(await throwIfError(result, 'Обновление счёта'))
}

export async function setPaymentAccountActive(id, isActive) {
  const result = await supabase
    .from(TABLE)
    .update({ is_active: isActive })
    .eq('id', id)
    .select()
    .single()
  return normalizePaymentAccount(await throwIfError(result, 'Изменение статуса счёта'))
}
