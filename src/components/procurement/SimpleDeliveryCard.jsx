import { formatPurchaseAmount } from '../../utils/purchaseData'
import {
  resolveSimpleDeliveryStatus,
  SIMPLE_DELIVERY_LABELS,
} from '../../utils/procurementWorkflow'
import './SimpleDeliveryCard.css'

/** Компактная строка чек-листа приёмки */
export default function SimpleDeliveryCard({
  order,
  document,
  isReceived,
  canAccept,
  onToggle,
  toggling,
}) {
  const deliveryStatus = isReceived ? 'received' : resolveSimpleDeliveryStatus(document)
  const amount = order?.totalAmount ?? document?.totalAmount ?? 0
  const supplierName = order?.supplierName || document?.supplierName || '—'
  const statusLabel = isReceived ? 'Поставка принята' : SIMPLE_DELIVERY_LABELS[deliveryStatus]
  const interactive = canAccept && Boolean(document?.id)

  function handleToggle(event) {
    event.preventDefault()
    if (toggling || !interactive) return
    onToggle?.()
  }

  return (
    <div
      className={`simple-delivery-row simple-delivery-row--${isReceived ? 'received' : deliveryStatus}`}
      role="listitem"
    >
      {interactive ? (
        <label className="simple-delivery-row__check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isReceived}
            disabled={toggling}
            onChange={handleToggle}
            aria-label={`${isReceived ? 'Снять отметку' : 'Принять поставку'}: ${supplierName}`}
          />
        </label>
      ) : (
        <span className="simple-delivery-row__check simple-delivery-row__check--readonly" aria-hidden="true">
          {isReceived ? '☑' : '☐'}
        </span>
      )}

      <button
        type="button"
        className="simple-delivery-row__body"
        onClick={handleToggle}
        disabled={!interactive || toggling}
      >
        <span className="simple-delivery-row__supplier">{supplierName}</span>
        <span className="simple-delivery-row__meta">
          <span className="simple-delivery-row__amount">{formatPurchaseAmount(amount)}</span>
          <span className="simple-delivery-row__status">{statusLabel}</span>
        </span>
      </button>
    </div>
  )
}

export function SimpleDeliveryStatusBadge({ document }) {
  const deliveryStatus = resolveSimpleDeliveryStatus(document)
  return (
    <span className={`simple-delivery-badge simple-delivery-badge--${deliveryStatus}`}>
      {SIMPLE_DELIVERY_LABELS[deliveryStatus]}
    </span>
  )
}

export function formatSimplePurchaseRowMeta(order) {
  return `${order.expectedDeliveryDate || '—'} · ${formatPurchaseAmount(order.totalAmount)}`
}
