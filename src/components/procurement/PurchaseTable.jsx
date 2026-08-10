import { useNavigate } from 'react-router-dom'
import {
  formatPurchaseAmount,
  formatPurchaseDate,
  formatPurchaseDateTime,
} from '../../utils/purchaseData'
import { PurchaseStatusBadge } from './PurchaseStatsCards'
import { CloseIcon, EyeIcon } from '../icons/PlatformIcons'
import './PurchaseTable.css'

/** Таблица активных закупов */
export default function PurchaseTable({
  orders,
  canEdit = false,
  onCancel,
  detailPathPrefix = '/platform/procurement',
}) {
  const navigate = useNavigate()

  if (!orders.length) {
    return (
      <div className="purchase-table__empty">
        Заказов на этот день нет.
      </div>
    )
  }

  return (
    <div className="purchase-table-wrap">
      <table className="purchase-table admin-table">
        <thead>
          <tr>
            <th>Создан</th>
            <th>Поставщик</th>
            <th>Товаров</th>
            <th>Сумма</th>
            <th>Статус</th>
            <th>Создал</th>
            <th>Ожидаемая доставка</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order.id}
              className="purchase-table__row"
              onClick={() => navigate(`${detailPathPrefix}/${order.id}`)}
            >
              <td>{formatPurchaseDateTime(order.createdAt || order.date)}</td>
              <td>{order.supplierName || '—'}</td>
              <td>{order.itemsCount ?? order.items?.length ?? 0}</td>
              <td>{formatPurchaseAmount(order.totalAmount)}</td>
              <td>
                <PurchaseStatusBadge status={order.status} />
              </td>
              <td>{order.createdByName || '—'}</td>
              <td>{formatPurchaseDate(order.expectedDeliveryDate)}</td>
              <td className="purchase-table__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm purchase-table__icon-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`${detailPathPrefix}/${order.id}`)
                  }}
                  aria-label="Открыть заказ"
                  title="Открыть заказ"
                >
                  <EyeIcon size={17} />
                </button>
                {canEdit && order.status !== 'cancelled' && order.status !== 'received' && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm purchase-table__icon-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      onCancel?.(order)
                    }}
                    aria-label="Отменить заказ"
                    title="Отменить заказ"
                  >
                    <CloseIcon size={17} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
