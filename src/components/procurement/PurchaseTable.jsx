import { useNavigate } from 'react-router-dom'
import {
  formatPurchaseAmount,
  formatPurchaseDate,
  formatPurchaseDateTime,
} from '../../utils/purchaseData'
import { ORDER_LABELS } from '../../config/documentLabels'
import { PgtHead, PgtRow, PgtTable } from '../platform/PlatformGridTable'

/**
 * Список заказов — общая таблица платформы (как «К оплате» и «Приёмка»).
 * Список приёмщика: только сохранённые заказы, «Сверено» — обычный зелёный текст, без плашек статусов.
 */
export default function PurchaseTable({ orders, detailPathPrefix = '/platform/orders' }) {
  const navigate = useNavigate()
  const showChecked = orders.some((order) => order.checkedAt)

  // Приёмщику важны «когда привезут» и «от кого»: доставка и поставщик — слева, служебное (кто и когда создал) — справа.
  const columns = [
    { key: 'delivery', label: ORDER_LABELS.deliveryShort, width: 110, mobile: 'hide' },
    { key: 'supplier', label: ORDER_LABELS.supplier, width: 200, flex: true, mobile: 'title' },
    { key: 'items', label: 'Товаров', width: 80, align: 'end', mobile: 'hide' },
    { key: 'amount', label: 'Сумма', width: 130, align: 'end', mobile: 'end' },
    ...(showChecked ? [{ key: 'checked', label: 'Сверено', width: 150, mobile: 'hide' }] : []),
    { key: 'number', label: ORDER_LABELS.orderNum, width: 90, mobile: 'hide' },
    { key: 'created', label: 'Создан', width: 150, mobile: 'hide' },
    { key: 'creator', label: 'Создал', width: 170, mobile: 'hide' },
  ]

  return (
    <PgtTable columns={columns}>
      <PgtHead columns={columns} />
      {orders.length === 0 ? <p className="pgt__empty">Заказов за этот период нет.</p> : null}
      {orders.map((order) => {
        const path = `${detailPathPrefix}/${order.id}`
        return (
          <PgtRow
            key={order.id}
            columns={columns}
            onClick={() => navigate(path)}
            cells={{
              created: <span>{formatPurchaseDateTime(order.createdAt || order.date)}</span>,
              supplier: <span className="pgt__title">{order.supplierName || '—'}</span>,
              number: <span className="num">{order.number ?? ''}</span>,
              items: <span>{order.itemsCount ?? order.items?.length ?? 0}</span>,
              amount: <span className="pgt__money">{formatPurchaseAmount(order.totalAmount)}</span>,
              checked: order.checkedAt ? (
                <span className="pgt__checked" title={order.checkedByName || undefined}>
                  ✓ {formatPurchaseDateTime(order.checkedAt)}
                </span>
              ) : null,
              creator: <span>{order.createdByName || '—'}</span>,
              delivery: <span>{formatPurchaseDate(order.expectedDeliveryDate)}</span>,
            }}
            mobileMeta={
              <>
                {order.checkedAt ? <span className="pgt__pill pgt__pill--ok">✓ сверено</span> : null}
                {[
                  order.number ? `№${order.number}` : '',
                  `${order.itemsCount ?? order.items?.length ?? 0} тов.`,
                  formatPurchaseDate(order.expectedDeliveryDate),
                  order.createdByName,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </>
            }
          />
        )
      })}
    </PgtTable>
  )
}
