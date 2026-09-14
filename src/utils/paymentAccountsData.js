/** Pure helpers for payment accounts (справочник «Счета оплаты»). */

export function normalizePaymentAccount(raw) {
  if (!raw) return null
  return {
    id: raw.id,
    name: raw.name || '',
    description: raw.description || '',
    isActive: raw.isActive ?? raw.is_active ?? true,
    sortOrder: raw.sortOrder ?? raw.sort_order ?? 0,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
  }
}

export function sortPaymentAccounts(accounts) {
  return [...(accounts || [])].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name, 'ru')
  })
}

export function findPaymentAccountNameConflict(accounts, name, { exceptId = null } = {}) {
  const key = String(name || '').trim().toLowerCase()
  if (!key) return null
  return (
    accounts.find((account) => account.id !== exceptId && account.name.trim().toLowerCase() === key) ||
    null
  )
}
