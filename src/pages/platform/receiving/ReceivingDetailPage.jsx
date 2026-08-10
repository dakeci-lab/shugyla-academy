import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSession } from '../../../context/SessionContext'
import { canViewReceivingDocuments } from '../../../config/permissions'
import { loadReceivingDocumentById } from '../../../services/receivingDataService'
import { isSimpleWorkflow } from '../../../utils/procurementWorkflow'
import { formatReceivingDate } from '../../../utils/receivingData'
import { toUserErrorMessage } from '../../../utils/userErrorMessage'
import PlatformAccessDenied from '../../../components/platform/PlatformAccessDenied'
import IconActionButton from '../../../components/admin/IconActionButton'
import { RotateCcwIcon } from '../../../components/icons/PlatformIcons'
import { DelayedLoadingSkeleton } from '../../../components/loading/LoadingSkeleton'
import { ReceivingStatusBadge } from '../../../components/receiving/ReceivingStatsCards'
import ReceivingItemsTable from '../../../components/receiving/ReceivingItemsTable'
import '../../../components/admin/admin-shared.css'
import '../../../components/receiving/ReceivingItemsTable.css'
import '../procurement/PurchaseDetailPage.css'

/** Документ ожидаемой поставки — /platform/receiving/:id */
export default function ReceivingDetailPage() {
  const { id } = useParams()
  const { user } = useSession()
  const canView = canViewReceivingDocuments(user)
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const loadDocument = useCallback(async () => {
    if (!canView) return
    setLoading(true)
    setLoadError('')
    try {
      const nextDocument = await loadReceivingDocumentById(id)
      setDocument(nextDocument)
    } catch (error) {
      setDocument(null)
      setLoadError(
        toUserErrorMessage(error, 'Не удалось загрузить документ поставки.')
      )
    } finally {
      setLoading(false)
    }
  }, [canView, id])

  useEffect(() => {
    let active = true

    if (!canView) {
      setLoading(false)
      return () => {
        active = false
      }
    }

    setLoading(true)
    setLoadError('')
    loadReceivingDocumentById(id)
      .then((nextDocument) => {
        if (active) setDocument(nextDocument)
      })
      .catch((error) => {
        if (!active) return
        setDocument(null)
        setLoadError(
          toUserErrorMessage(error, 'Не удалось загрузить документ поставки.')
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [canView, id])

  if (!canView) {
    return <PlatformAccessDenied title="Нет доступа к разделу «Приёмка»" />
  }

  if (loading) {
    return (
      <div className="purchase-detail" aria-busy="true">
        <DelayedLoadingSkeleton variant="table" count={6} />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="purchase-detail receiving-detail__state">
        <p className="admin-form__error" role="alert">{loadError}</p>
        <IconActionButton label="Повторить загрузку" onClick={() => void loadDocument()}>
          <RotateCcwIcon size={18} />
        </IconActionButton>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="purchase-detail">
        <p className="purchase-detail__not-found">Документ не найден.</p>
        <Link to="/platform/receiving" className="btn btn--ghost">
          ← К приёмке
        </Link>
      </div>
    )
  }

  const isLegacy = isSimpleWorkflow(document)
  const displayItems = document.items ?? []

  return (
    <div className="purchase-detail">
      <div className="purchase-detail__back">
        <Link to="/platform/receiving" className="purchase-detail__back-link">
          ← К приёмке
        </Link>
      </div>

      <div className="purchase-detail__header">
        <div>
          <h2 className="purchase-detail__title">{document.supplierName || 'Поставка'}</h2>
          <ReceivingStatusBadge status={document.status} />
        </div>
      </div>

      <dl className="purchase-detail__meta">
        <div>
          <dt>Дата</dt>
          <dd>{formatReceivingDate(document.expectedDeliveryDate)}</dd>
        </div>
        <div>
          <dt>Позиций</dt>
          <dd>{displayItems.length}</dd>
        </div>
        <div>
          <dt>Заказано</dt>
          <dd>{Number(document.totalOrderedQty || 0)} шт.</dd>
        </div>
        {document.purchaseOrderId ? (
          <div>
            <dt>Заказ</dt>
            <dd>
              <Link
                to={`/platform/procurement/${document.purchaseOrderId}`}
                className="receiving-detail__purchase-link"
              >
                Открыть
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>

      {isLegacy ? (
        <p className="receiving-detail__legacy">Старый документ без состава.</p>
      ) : (
        <section className="purchase-detail__items">
          <div className="purchase-detail__items-header">
            <h3 className="purchase-detail__items-title">Товары</h3>
          </div>
          <ReceivingItemsTable items={displayItems} />
        </section>
      )}
    </div>
  )
}
