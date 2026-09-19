import { useCallback, useEffect, useState } from 'react'
import {
  listPaymentAccounts,
  PAYMENT_ACCOUNTS_MIGRATION_MESSAGE,
} from '../../../services/paymentAccountsService'
import { fetchPaymentAccountPaidTotals } from '../../../services/supplierPaymentObligationsService'

export function usePaymentAccountsData() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paidTotals, setPaidTotals] = useState(null)
  const [paidTotalsLoading, setPaidTotalsLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await listPaymentAccounts()
      setAccounts(rows)
      return rows
    } catch (err) {
      setAccounts([])
      setError(err.message || 'Не удалось загрузить счета оплаты')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPaidTotals = useCallback(async () => {
    setPaidTotalsLoading(true)
    try {
      setPaidTotals(await fetchPaymentAccountPaidTotals())
    } catch {
      // Best-effort: «Выплачено поставщикам» — сама таблица счетов работает
      // и без этой цифры (например, в локальном/офлайн-режиме).
      setPaidTotals(null)
    } finally {
      setPaidTotalsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    void loadPaidTotals()
  }, [loadPaidTotals])

  return {
    accounts,
    loading,
    error,
    isMigrationError: error === PAYMENT_ACCOUNTS_MIGRATION_MESSAGE,
    reload: load,
    paidTotals,
    paidTotalsLoading,
  }
}
