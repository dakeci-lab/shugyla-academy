import { useNavigate } from 'react-router-dom'
import {
  formatPurchaseAmount,
  formatPurchaseDate,
  formatPurchaseDateTime,
} from '../../utils/purchaseData'
import { PurchaseStatusBadge, isPurchaseStatusShown } from './PurchaseStatsCards'
import { CloseIcon } from '../icons/PlatformIcons'
import { PgtHead, PgtRow, PgtTable } from '../platform/PlatformGridTable'

/**
 * Список заказов — общая таблица платформы (как «К оплате» и «Приёмка»).
 * Колонка «Статус» появляется, только если у каких-то заказов есть что
 * сообщить (черновик, отмена): «Ожидает приёмки» — обычное состояние и не показывается.
 */
export default function PurchaseTable({
  orders,
  canEdit = false,
  onCancel,
  detailPathPrefix = '/platform/orders',
}) {
  const navigate = useNavigate()
  const showStatus = orders.some((order) => isPurchaseStatusShown(order.status))
  const canCancel = (order) => canEdit && order.status !== 'cancelled' && order.status !== 'received'
  const showActions = canEdit && orders.some(canCancel)

  const columns = [
    { key: 'created', label: 'Создан', width: 150, mobile: 'hide' },
    { key: 'supplier', label: 'Поставщик', width: 200, flex: true, mobile: 'title' },
    { key: 'items', label: 'Товаров', width: 80, align: 'end', mobile: 'hide' },
    { key: 'amount', label: 'Сумма', width: 130, align: 'end', mobile: 'end' },
    ...(showStatus ? [{ key: 'status', label: 'Статус', width: 130, mobile: 'hide' }] : []),
    { key: 'creator', label: 'Создал', width: 170, mobile: 'hide' },
    { key: 'delivery', label: 'Доставка', width: 110, mobile: 'hide' },
    ...(showActions ? [{ key: 'actions', label: '', width: 44, align: 'end', mobile: 'hide' }] : []),
  ]

  return (
    <PgtTable columns={columns}>
      <PgtHead columns={columns} />
      {orders.length === 0 ? <p className="pgt__empty">Заказов за этот период нет.</p> : null}
      {orders.map((order) => {
        const path = `${detailPathPrefix}/${order.id}`
        const cancellable = showActions && canCancel(order)
        return (
          <PgtRow
            key={order.id}
            columns={columns}
            // A row that holds its own «Отменить» button cannot itself be a button.
            onClick={showActions ? undefined : () => navigate(path)}
            cells={{
              created: <span>{formatPurchaseDateTime(order.createdAt || order.date)}</span>,
              supplier: showActions ? (
                <button type="button" className="pgt__link" onClick={() => navigate(path)}>
                  {order.supplierName || '—'}
                </button>
              ) : (
                <span className="pgt__title">{order.supplierName || '—'}</span>
              ),
              items: <span>{order.itemsCount ?? order.items?.length ?? 0}</span>,
              amount: <span className="pgt__money">{formatPurchaseAmount(order.totalAmount)}</span>,
              status: <PurchaseStatusBadge status={order.status} />,
              creator: <span>{order.createdByName || '—'}</span>,
              delivery: <span>{formatPurchaseDate(order.expectedDeliveryDate)}</span>,
              actions: cancellable ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => onCancel?.(order)}
                  aria-label="Отменить заказ"
                  title="Отменить заказ"
                >
                  <CloseIcon size={17} />
                </button>
              ) : null,
            }}
            mobileMeta={[
              `${order.itemsCount ?? order.items?.length ?? 0} тов.`,
              formatPurchaseDate(order.expectedDeliveryDate),
              order.createdByName,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        )
      })}
    </PgtTable>
  )
}
