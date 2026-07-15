import { formatPurchaseAmount } from '../../utils/purchaseData'
import { formatSupplierPaymentTerms } from '../../utils/supplierData'
import {
  RECEIVING_ENTRY_SOURCE,
  resolveSimpleDeliveryStatus,
  SIMPLE_DELIVERY_LABELS,
} from '../../utils/procurementWorkflow'
import './SimpleDeliveryCard.css'

/** Компактная строка чек-листа приёмки */
export default function SimpleDeliveryCard({
  order,
  document,
  supplier,
  entrySource = RECEIVING_ENTRY_SOURCE.PURCHASE,
  isReceived,
  canAccept,
  onToggle,
  toggling,
  syncStatusLabel,
  syncPending,
  canCreatePurchase = false,
  onCreatePurchase,
}) {
  const isScheduleOnly = entrySource === RECEIVING_ENTRY_SOURCE.EXPECTED
  const isCreatedPurchase = !isScheduleOnly
  const deliveryStatus = isReceived ? 'received' : resolveSimpleDeliveryStatus(document)
  const amount = order?.totalAmount ?? document?.totalAmount ?? 0
  const supplierName = supplier?.name || order?.supplierName || document?.supplierName || '—'
  const paymentTermsLabel = formatSupplierPaymentTerms(supplier)
  const interactive = isCreatedPurchase && canAccept && Boolean(document?.id) && !syncStatusLabel

  function handleToggle(event) {
    event.preventDefault()
    if (toggling || !interactive) return
    onToggle?.()
  }

  function handleCreateClick(event) {
    event.preventDefault()
    event.stopPropagation()
    onCreatePurchase?.()
  }

  const rowClass = isScheduleOnly
    ? 'simple-delivery-row--expected'
    : isReceived
      ? 'received'
      : deliveryStatus

  return (
    <div
      className={`simple-delivery-row simple-delivery-row--${rowClass}`}
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
          {isReceived ? '☑' : isScheduleOnly ? '◌' : '☐'}
        </span>
      )}

      <div className="simple-delivery-row__body simple-delivery-row__body--static">
        <div className="simple-delivery-row__main">
          <span className="simple-delivery-row__supplier">{supplierName}</span>
        </div>
        {isCreatedPurchase && (
          <span className="simple-delivery-row__meta">
            <span className="simple-delivery-row__amount">
              {formatPurchaseAmount(amount)}
            </span>
            {syncStatusLabel ? (
              <span className="purchase-sync-status purchase-sync-status--pending">
                {syncPending && (
                  <span className="purchase-sync-status__spinner" aria-hidden="true" />
                )}
                {syncStatusLabel}
              </span>
            ) : (
              <span className="simple-delivery-row__payment-terms" title={paymentTermsLabel}>
                {paymentTermsLabel}
              </span>
            )}
          </span>
        )}
      </div>

      {isScheduleOnly && canCreatePurchase && (
        <button
          type="button"
          className="btn btn--primary btn--sm simple-delivery-row__create-btn"
          onClick={handleCreateClick}
        >
          Оформить закуп
        </button>
      )}
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
