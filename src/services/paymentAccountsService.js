import { isCloudMode } from '../lib/dataMode'
import { sortPaymentAccounts } from '../utils/paymentAccountsData'
import * as localAdapter from './paymentAccountsLocalAdapter'
import * as supabaseAdapter from './paymentAccountsSupabaseAdapter'

export { PAYMENT_ACCOUNTS_MIGRATION_MESSAGE } from './paymentAccountsSupabaseAdapter'

function adapter() {
  return isCloudMode() ? supabaseAdapter : localAdapter
}

export async function listPaymentAccounts({ includeInactive = true } = {}) {
  const accounts = sortPaymentAccounts(await adapter().listPaymentAccounts())
  return includeInactive ? accounts : accounts.filter((account) => account.isActive)
}

export async function createPaymentAccount(payload) {
  const account = await adapter().createPaymentAccount(payload)
  invalidatePaymentAccountsCache()
  return account
}

export async function updatePaymentAccount(id, payload) {
  const account = await adapter().updatePaymentAccount(id, payload)
  invalidatePaymentAccountsCache()
  return account
}

export async function setPaymentAccountActive(id, isActive) {
  const account = await adapter().setPaymentAccountActive(id, isActive)
  invalidatePaymentAccountsCache()
  return account
}

/**
 * Active accounts, plus the supplier's currently-assigned one even if it was
 * since deactivated — same "still show what's already selected" rule as
 * rbacService.getRolesForEmployeeForm for a deactivated role.
 */
export async function getPaymentAccountsForAssignment(currentAccountId = null) {
  const active = await listPaymentAccounts({ includeInactive: false })
  if (!currentAccountId || active.some((account) => account.id === currentAccountId)) {
    return active
  }
  const all = await listPaymentAccounts({ includeInactive: true })
  const current = all.find((account) => account.id === currentAccountId)
  return current ? sortPaymentAccounts([...active, current]) : active
}

/**
 * Small synchronous cache for reading an account's name from places that
 * cannot await (pure formatters like formatSupplierPaymentTerms). Mirrors
 * rbacService's getRbacCache/ensureRbacLoaded, but self-warms on first use
 * instead of hooking into the auth bootstrap — payment accounts are a small,
 * low-churn reference list, not worth adding latency to login for
 * (see docs/performance/ — Home load time is an active concern).
 */
let cachedAccounts = null
let loadPromise = null

export function getPaymentAccountsCacheSync() {
  return cachedAccounts || []
}

export async function ensurePaymentAccountsLoaded(force = false) {
  if (force) loadPromise = null
  if (!loadPromise) {
    loadPromise = listPaymentAccounts()
      .then((accounts) => {
        cachedAccounts = accounts
        return accounts
      })
      .catch((err) => {
        loadPromise = null
        throw err
      })
  }
  return loadPromise
}

export function invalidatePaymentAccountsCache() {
  cachedAccounts = null
  loadPromise = null
}

/** Sync lookup; returns null (not a placeholder) until the cache is warm. */
export function getPaymentAccountName(accountId) {
  if (!accountId) return null
  const found = getPaymentAccountsCacheSync().find((account) => account.id === accountId)
  if (!found && !cachedAccounts) {
    // Fire-and-forget warm-up so the next render has the name.
    void ensurePaymentAccountsLoaded()
  }
  return found?.name || null
}
