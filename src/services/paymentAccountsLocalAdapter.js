import { normalizePaymentAccount } from '../utils/paymentAccountsData'

const STORAGE_KEY = 'shugyla_payment_accounts_v1'

/** Stable id of the seeded «Наличные» account — the default for new local suppliers. */
export const DEFAULT_CASH_ACCOUNT_ID = 'pa-cash'

const DEFAULT_ACCOUNTS = [
  { id: DEFAULT_CASH_ACCOUNT_ID, name: 'Наличные', description: '', isActive: true, sortOrder: 10 },
  { id: 'pa-transfer', name: 'Перевод', description: '', isActive: true, sortOrder: 20 },
]

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeAll(accounts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
}

function ensureSeeded() {
  const existing = readAll()
  if (existing?.length) return existing
  const seeded = DEFAULT_ACCOUNTS.map((account) => ({
    ...account,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))
  writeAll(seeded)
  return seeded
}

export async function listPaymentAccounts() {
  return ensureSeeded().map(normalizePaymentAccount)
}

export async function createPaymentAccount({ name, description = '' }) {
  const accounts = ensureSeeded()
  const id = `pa-${Date.now()}`
  const now = new Date().toISOString()
  const account = {
    id,
    name: name.trim(),
    description: description.trim(),
    isActive: true,
    sortOrder: (accounts.at(-1)?.sortOrder ?? 0) + 10,
    createdAt: now,
    updatedAt: now,
  }
  writeAll([...accounts, account])
  return normalizePaymentAccount(account)
}

export async function updatePaymentAccount(id, { name, description }) {
  const accounts = ensureSeeded()
  const now = new Date().toISOString()
  let updated = null
  const next = accounts.map((account) => {
    if (account.id !== id) return account
    updated = {
      ...account,
      ...(name != null ? { name: name.trim() } : {}),
      ...(description != null ? { description: description.trim() } : {}),
      updatedAt: now,
    }
    return updated
  })
  if (!updated) throw new Error('Счёт не найден')
  writeAll(next)
  return normalizePaymentAccount(updated)
}

export async function setPaymentAccountActive(id, isActive) {
  return updatePaymentAccountRaw(id, { isActive })
}

async function updatePaymentAccountRaw(id, patch) {
  const accounts = ensureSeeded()
  const now = new Date().toISOString()
  let updated = null
  const next = accounts.map((account) => {
    if (account.id !== id) return account
    updated = { ...account, ...patch, updatedAt: now }
    return updated
  })
  if (!updated) throw new Error('Счёт не найден')
  writeAll(next)
  return normalizePaymentAccount(updated)
}

export function resetPaymentAccountsLocalSnapshot() {
  localStorage.removeItem(STORAGE_KEY)
}
