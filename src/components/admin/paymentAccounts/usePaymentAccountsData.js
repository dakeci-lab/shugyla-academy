import { useCallback, useEffect, useState } from 'react'
import {
  listPaymentAccounts,
  PAYMENT_ACCOUNTS_MIGRATION_MESSAGE,
} from '../../../services/paymentAccountsService'

export function usePaymentAccountsData() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  useEffect(() => {
    load()
  }, [load])

  return {
    accounts,
    loading,
    error,
    isMigrationError: error === PAYMENT_ACCOUNTS_MIGRATION_MESSAGE,
    reload: load,
  }
}
