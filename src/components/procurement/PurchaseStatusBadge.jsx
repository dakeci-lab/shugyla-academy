import StatusBadge from '../admin/StatusBadge'
import {
  ORDER_VIEW_STATUS,
  PURCHASE_STATUS_LABELS,
  PURCHASE_STATUS_BADGE,
  orderViewStatus,
} from '../../utils/purchaseData'

/**
 * «Сохранён» — обычное состояние заказа, его отдельно не показываем (иначе колонка из одинаковых плашек);
 * значимы «Черновик» и остаток старых «Отменён».
 */
export function isPurchaseStatusShown(status) {
  return orderViewStatus(status) !== ORDER_VIEW_STATUS.SAVED
}

export function PurchaseStatusBadge({ status, always = false }) {
  if (!always && !isPurchaseStatusShown(status)) return null
  const view = orderViewStatus(status)
  return (
    <StatusBadge label={PURCHASE_STATUS_LABELS[view] || view} type={PURCHASE_STATUS_BADGE[view] || 'idle'} />
  )
}
