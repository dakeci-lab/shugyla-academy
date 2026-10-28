import StatusBadge from '../admin/StatusBadge'
import { PURCHASE_STATUS, PURCHASE_STATUS_LABELS, PURCHASE_STATUS_BADGE } from '../../utils/purchaseData'

/**
 * «Сохранён» — обычное состояние заказа, его отдельно не показываем (иначе колонка из одинаковых плашек);
 * значим «Черновик».
 */
export function isPurchaseStatusShown(status) {
  return status !== PURCHASE_STATUS.SAVED
}

export function PurchaseStatusBadge({ status, always = false }) {
  if (!always && !isPurchaseStatusShown(status)) return null
  return (
    <StatusBadge label={PURCHASE_STATUS_LABELS[status] || status} type={PURCHASE_STATUS_BADGE[status] || 'idle'} />
  )
}
