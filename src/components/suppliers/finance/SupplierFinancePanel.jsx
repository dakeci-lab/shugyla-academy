/**
 * Расчёты — оболочка вокруг списка поставщиков (UmagSettlementsPanel).
 *
 * Вкладки «К оплате» / «Поставщики» объединены: оплата накладных и получение
 * возвратов делаются прямо в истории операций карточки поставщика, поэтому
 * отдельный список обязательств не нужен. Оболочка владеет только строкой
 * статуса синка UMAG и единственной кнопкой ↻ (пайплайн syncUmagSettlements()).
 */

import { useCallback, useEffect, useState } from 'react'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import { canSyncUmagSettlements, canViewUmagSettlements } from '../../../config/permissions'
import {
  UMAG_SETTLEMENTS_ERROR_CODES,
  fetchLastUmagSyncRun,
  syncUmagSettlements,
} from '../../../services/umagSettlementsService'
import { toAqtobeDateKey } from '../../../utils/supplierPaymentObligations'
import { getMonthRangeKeys } from '../../../utils/settlementsPeriod'
import { describeSyncStatus } from '../../../utils/supplierFinancePagePresentation'
import PlatformSyncButton from '../../platform/PlatformSyncButton'
import UmagSettlementsPanel from '../settlements/UmagSettlementsPanel'
import './SupplierFinancePanel.css'

export default function SupplierFinancePanel() {
  const { user } = useSession()
  const toast = useToast()
  const showSuccess = toast.success
  const showError = toast.error
  const showWarning = typeof toast.warning === 'function' ? toast.warning : showError

  const canView = canViewUmagSettlements(user)
  const canSync = canSyncUmagSettlements(user)

  const [lastSync, setLastSync] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [filterSlot, setFilterSlot] = useState(null)

  const loadLastSync = useCallback(async () => {
    setLastSync(await fetchLastUmagSyncRun())
  }, [])

  useEffect(() => {
    if (!canView) return
    void loadLastSync()
  }, [canView, loadLastSync])

  async function handleSync() {
    if (!canSync || syncing) return
    setSyncing(true)
    try {
      // A neutral current-month range, never a supplier-card view period.
      // The backend independently widens this to the real effective sync scope.
      const todayKey = toAqtobeDateKey()
      const [year, month] = todayKey.split('-').map(Number)
      const { dateFrom } = getMonthRangeKeys(year, month)

      const result = await syncUmagSettlements({ dateFrom, dateTo: todayKey, syncSuppliers: true })

      if (!result.success) {
        if (result.code === UMAG_SETTLEMENTS_ERROR_CODES.SYNC_ALREADY_RUNNING) {
          showWarning(result.message)
          await loadLastSync()
        } else {
          showError(result.message)
        }
        return
      }

      if (result.status === 'partial' || result.warning) {
        showWarning(result.warning || result.message)
      } else {
        showSuccess(result.message)
      }

      await loadLastSync()
      setRefreshToken((token) => token + 1)
    } catch (err) {
      showError(err?.message || 'Не удалось синхронизировать')
    } finally {
      setSyncing(false)
    }
  }

  if (!canView) {
    return null
  }

  const syncStatus = describeSyncStatus(lastSync)

  return (
    <div className="sfp-panel">
      <div className="sfp-panel__bar">
        <div className="sfp-panel__sync">
          <span
            className={`sfp-panel__sync-status sfp-panel__sync-status--${syncStatus.tone}`}
            title={syncStatus.title || undefined}
          >
            {syncStatus.text}
          </span>
          <div className="sfp-panel__filter-slot" ref={setFilterSlot} />
          {canSync ? (
            <PlatformSyncButton
              onClick={() => void handleSync()}
              syncing={syncing}
              disabled={!canSync || syncing}
              title="Синхронизация UMAG"
              aria-label="Синхронизация UMAG"
            />
          ) : null}
        </div>
      </div>

      <UmagSettlementsPanel embedded refreshToken={refreshToken} filterSlot={filterSlot} />
    </div>
  )
}
