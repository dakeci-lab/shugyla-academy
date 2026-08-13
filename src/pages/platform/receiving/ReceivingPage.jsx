import { useEffect, useRef } from 'react'
import { useSession } from '../../../context/SessionContext'
import { usePlatformData } from '../../../context/PlatformDataContext'
import { canReceiveGoods, canViewReceivingDocuments } from '../../../config/permissions'
import {
  getReceivingDataError,
  getReceivingDocumentsSync,
  isReceivingDataLoading,
  isReceivingDataReady,
} from '../../../services/receivingDataService'
import { isCloudMode } from '../../../lib/dataMode'
import useStableWhenReady from '../../../hooks/useStableWhenReady'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import UnifiedReceivingList from '../../../components/receiving/UnifiedReceivingList'
import { DelayedLoadingSkeleton } from '../../../components/loading/LoadingSkeleton'
import { toUserErrorMessage } from '../../../utils/userErrorMessage'
import '../../../components/admin/admin-shared.css'
import './ReceivingPage.css'

/** Страница «Приёмка» — /platform/receiving */
export default function ReceivingPage() {
  const { user } = useSession()
  const { ensureModules, version: dataVersion } = usePlatformData()
  const canView = canViewReceivingDocuments(user)
  const canManage = canReceiveGoods(user)

  void dataVersion

  useEffect(() => {
    if (!isCloudMode() || !canView) return
    void ensureModules(['receiving'])
  }, [canView, ensureModules])

  const receivingReady = !isCloudMode() || isReceivingDataReady()
  const receivingLoading = isCloudMode() && isReceivingDataLoading()
  const receivingError = getReceivingDataError()
  const stableDocuments = useStableWhenReady(getReceivingDocumentsSync(), receivingReady)
  const hasLoadedOnce = useRef(false)
  if (receivingReady) hasLoadedOnce.current = true

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Приёмка»" />
  }

  return (
    <div className="receiving-page">
      {receivingError ? (
        <p className="receiving-page__error" role="alert">
          {toUserErrorMessage(receivingError, 'Не удалось загрузить поставки.')}
        </p>
      ) : receivingLoading && !hasLoadedOnce.current ? (
        <DelayedLoadingSkeleton variant="cards" count={5} />
      ) : (
        <UnifiedReceivingList documents={stableDocuments} canManage={canManage} />
      )}
    </div>
  )
}
