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
  return adapter().createPaymentAccount(payload)
}

export async function updatePaymentAccount(id, payload) {
  return adapter().updatePaymentAccount(id, payload)
}

export async function setPaymentAccountActive(id, isActive) {
  return adapter().setPaymentAccountActive(id, isActive)
}
