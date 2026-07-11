import {
  formatPurchaseAmount,
  formatPurchaseDate,
  PURCHASE_STATUS,
} from '../../utils/purchaseData'
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
import './SimpleDeliveryCard.css'
import './SimplePurchaseCardList.css'

function formatPurchaseDateLong(value) {
  if (!value) return '—'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return formatPurchaseDate(value)
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Мобильный список закупок — карточки вместо таблицы */
export default function SimplePurchaseCardList({
  orders,
  documentsByPurchaseId,
  showActions,
  canEditOrder,
  onOpenEditor,
  onDelete,
  onRetry,
  totals,
  emptyMessage = 'Закупы не созданы',
  compact = false,
  hideDate = false,
}) {
  if (!orders.length) {
    return (
      <div className="procurement-page__empty procurement-page__empty--mobile">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={`simple-purchase-cards${compact ? ' simple-purchase-cards--compact' : ''}`}>
      {totals && (
        <div className="simple-purchase-cards__summary">
          <span>{totals.count} закупок</span>
          <span>{formatPurchaseAmount(totals.totalAmount)}</span>
        </div>
      )}

      <ul className="simple-purchase-cards__list">
        {orders.map((order) => {
          const doc = documentsByPurchaseId.get(order.id)
          const editable = canEditOrder?.(order)
          const pending = isSyncPending(order.syncStatus)
          const syncError = isSyncError(order.syncStatus)

          return (
            <li
              key={order.id}
              className={`simple-purchase-card${syncError ? ' simple-purchase-card--sync-error' : ''}${compact ? ' simple-purchase-card--compact' : ''}`}
            >
              <div className="simple-purchase-card__main">
                {editable ? (
                  <button
                    type="button"
                    className="simple-purchase-card__supplier"
                    onClick={() => onOpenEditor?.(order.id)}
                    disabled={pending}
                  >
                    {order.supplierName || '—'}
                  </button>
                ) : (
                  <span className="simple-purchase-card__supplier simple-purchase-card__supplier--static">
                    {order.supplierName || '—'}
                  </span>
                )}

                {!hideDate && (
                  <span className="simple-purchase-card__date">
                    {formatPurchaseDateLong(order.expectedDeliveryDate)}
                  </span>
                )}

                {(pending || syncError) && (
                  <div className="simple-purchase-card__sync">
                    {pending && (
                      <span className="purchase-sync-status purchase-sync-status--pending">
                        <span className="purchase-sync-status__spinner" aria-hidden="true" />
                        {SYNC_STATUS_LABELS.pending}
                      </span>
                    )}
                    {syncError && (
                      <div className="purchase-sync-status purchase-sync-status--error">
                        <span>{SYNC_STATUS_LABELS.error}</span>
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
                )}

                <dl className="simple-purchase-card__facts">
                  <div className="simple-purchase-card__fact">
                    <dt>Сумма</dt>
                    <dd>{formatPurchaseAmount(order.totalAmount)}</dd>
                  </div>
                  <div className="simple-purchase-card__fact">
                    <dt>Статус</dt>
                    <dd>
                      {doc ? (
                        <SimpleDeliveryStatusBadge document={doc} />
                      ) : pending ? (
                        <span className="admin-form__hint">—</span>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                </dl>
              </div>

              {showActions && (
                <div className="simple-purchase-card__actions">
                  {editable ? (
                    <>
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
                    </>
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
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
