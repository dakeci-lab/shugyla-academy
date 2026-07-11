import { formatPurchaseAmount, formatPurchaseDate, PURCHASE_STATUS } from '../../utils/purchaseData'
import {
  SYNC_STATUS_LABELS,
  isSyncPending,
  isSyncError,
} from '../../utils/syncStatus'
import IconActionButton from '../admin/IconActionButton'
import { PencilIcon, TrashIcon } from '../icons/PlatformIcons'
import { SimpleDeliveryStatusBadge } from './SimpleDeliveryCard'
import '../admin/IconActionButton.css'
import '../admin/admin-shared.css'
import '../procurement/PurchaseTable.css'
import './SimpleDeliveryCard.css'
import './SimplePurchaseTable.css'

/** Таблица простых закупок */
export default function SimplePurchaseTable({
  orders,
  documentsByPurchaseId,
  showActions,
  canEditOrder,
  onOpenEditor,
  onDelete,
  onRetry,
  rowIndexOffset = 0,
  totals,
  emptyMessage = 'Закупы не созданы',
}) {
  if (!orders.length) {
    return (
      <div className="procurement-page__empty">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="procurement-table-panel">
      <div className="admin-table-wrap procurement-table-panel__table">
        <table className="admin-table purchase-table purchase-table--simple">
          <thead>
            <tr>
              <th>№</th>
              <th>Дата</th>
              <th>Поставщик</th>
              <th>Сумма</th>
              <th>Комментарий</th>
              <th>Статус</th>
              {showActions && <th>Действия</th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((order, index) => {
              const doc = documentsByPurchaseId.get(order.id)
              const editable = canEditOrder?.(order)
              const pending = isSyncPending(order.syncStatus)
              const syncError = isSyncError(order.syncStatus)

              return (
                <tr key={order.id} className={syncError ? 'purchase-table__row--sync-error' : ''}>
                  <td className="purchase-table__index">{rowIndexOffset + index + 1}</td>
                  <td>{formatPurchaseDate(order.expectedDeliveryDate)}</td>
                  <td>
                    <div className="simple-purchase-table__supplier">
                      {editable ? (
                        <button
                          type="button"
                          className="simple-purchase-supplier-link"
                          onClick={() => onOpenEditor?.(order.id)}
                          disabled={pending}
                        >
                          {order.supplierName || '—'}
                        </button>
                      ) : (
                        <span>{order.supplierName || '—'}</span>
                      )}
                      {pending && (
                        <span className="purchase-sync-status purchase-sync-status--pending">
                          <span className="purchase-sync-status__spinner" aria-hidden="true" />
                          {SYNC_STATUS_LABELS.pending}
                        </span>
                      )}
                      {syncError && (
                        <div className="purchase-sync-status purchase-sync-status--error">
                          <span>{SYNC_STATUS_LABELS.error}</span>
                          {order.syncError && (
                            <span className="purchase-sync-status__hint">{order.syncError}</span>
                          )}
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => onRetry?.(order)}
                          >
                            Повторить
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="purchase-table__amount">{formatPurchaseAmount(order.totalAmount)}</td>
                  <td className="purchase-table__comment">{order.comment || '—'}</td>
                  <td>
                    {doc ? (
                      <SimpleDeliveryStatusBadge document={doc} />
                    ) : pending ? (
                      <span className="admin-form__hint">—</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  {showActions && (
                    <td>
                      {editable ? (
                        <div className="admin-table__actions">
                          <IconActionButton
                            label="Редактировать закупку"
                            variant="primary"
                            disabled={pending}
                            onClick={() => onOpenEditor?.(order.id)}
                          >
                            <PencilIcon />
                          </IconActionButton>
                          <IconActionButton
                            label="Удалить закупку"
                            variant="danger"
                            disabled={pending}
                            onClick={() => onDelete?.(order.id)}
                          >
                            <TrashIcon />
                          </IconActionButton>
                        </div>
                      ) : order.status === PURCHASE_STATUS.RECEIVED ? (
                        <span className="admin-form__hint">Принято</span>
                      ) : syncError ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => onRetry?.(order)}
                        >
                          Повторить
                        </button>
                      ) : null}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
          {totals && (
            <tfoot>
              <tr className="purchase-table__totals-row">
                <td colSpan={showActions ? 7 : 6}>
                  <div className="purchase-table__totals">
                    <span className="purchase-table__totals-label">Итого:</span>
                    <span className="purchase-table__totals-item">
                      Количество закупок: <strong>{totals.count}</strong>
                    </span>
                    <span className="purchase-table__totals-item">
                      Общая сумма: <strong>{formatPurchaseAmount(totals.totalAmount)}</strong>
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
