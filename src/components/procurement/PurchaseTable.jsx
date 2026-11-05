import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDocumentGroupLabel } from '../../utils/purchaseDocumentsList'
import {
  formatPurchaseAmount,
  formatPurchaseDate,
} from '../../utils/purchaseData'
import { ORDER_LABELS } from '../../config/documentLabels'
import { PgtHead, PgtRow, PgtTable } from '../platform/PlatformGridTable'
import IconActionButton from '../admin/IconActionButton'
import { PencilIcon } from '../icons/PlatformIcons'

/**
 * Список приёмки — общая таблица платформы, колонки как в «Закупе» (первой доставка). Только сохранённые заказы;
 * «Не сверено» — вид черновика, «Сверено» — вид сохранённого документа. На телефоне свой компактный вид.
 */
export default function PurchaseTable({ orders, detailPathPrefix = '/platform/orders' }) {
  const navigate = useNavigate()

  // Like the web table of «Закуп», with the delivery first (the receiver's main date): number (green, opens the order),
  // delivery, supplier, created, items, sum, who accepted (blank until the order is saved as checked), comment. A not yet checked order looks like a draft (muted italic),
  // a checked one like a saved document (green number, green line under the sum). No «Сверено» column: the look says it.
  const columns = [
    { key: 'number', label: 'Номер', width: 90, mobile: 'hide' },
    { key: 'delivery', label: ORDER_LABELS.deliveryShort, width: 100, mobile: 'hide' },
    { key: 'supplier', label: ORDER_LABELS.supplier, width: 160, flex: true, mobile: 'title' },
    { key: 'created', label: 'Создан', width: 100, mobile: 'hide' },
    { key: 'items', label: 'Позиций', width: 64, align: 'end', mobile: 'hide' },
    { key: 'amount', label: 'Сумма', width: 120, align: 'end', mobile: 'end' },
    { key: 'creator', label: 'Принял', width: 140, mobile: 'hide' },
    { key: 'comment', label: 'Комментарий', width: 140, mobile: 'hide' },
    { key: 'edit', label: '', width: 44, align: 'end', mobile: 'hide' },
  ]

  return (
    <PgtTable columns={columns}>
      <PgtHead columns={columns} />
      {orders.length === 0 ? <p className="pgt__empty">Заказов за этот период нет.</p> : null}
      {orders.map((order, index) => {
        const path = `${detailPathPrefix}/${order.id}`
        // Phone: the list is grouped by delivery day («Ср, 4 Ноября»), so the row itself does not repeat the date.
        const day = order.expectedDeliveryDate || ''
        const startsDay = index === 0 || (orders[index - 1].expectedDeliveryDate || '') !== day
        return (
          <Fragment key={order.id}>
            {startsDay ? (
              <div className="pgt__day" role="presentation">
                {day ? formatDocumentGroupLabel(day) : 'Без даты доставки'}
              </div>
            ) : null}
          <PgtRow
            columns={columns}
            className={order.checkedAt ? 'ord-row ord-row--checked' : 'ord-row ord-row--unchecked'}
            interactive
            onClick={() => navigate(path)}
            cells={{
              edit: (
                <IconActionButton
                  variant="edit"
                  label="Открыть"
                  onClick={(event) => {
                    event.stopPropagation()
                    navigate(path)
                  }}
                >
                  <PencilIcon size={16} />
                </IconActionButton>
              ),
              number: <span className="num ord-number">{order.number ?? ''}</span>,
              created: <span className="num">{formatPurchaseDate(order.createdAt || order.date)}</span>,
              supplier: <span className="pgt__title">{order.supplierName || '—'}</span>,
              items: <span className="num">{order.itemsCount ?? order.items?.length ?? 0}</span>,
              amount: (
                <span className={`pgt__money ord-sum ${order.checkedAt ? 'ord-sum--checked' : 'ord-sum--unchecked'}`}>
                  {formatPurchaseAmount(order.totalAmount)}
                </span>
              ),
              creator: <span>{order.checkedAt ? order.checkedByName || '—' : ''}</span>,
              comment: <span className="ord-comment">{order.comment || ''}</span>,
              delivery: <span className="num">{order.expectedDeliveryDate ? formatPurchaseDate(order.expectedDeliveryDate) : '—'}</span>,
            }}
            mobileMeta={
              // Phone row = supplier, sum and the status of the document (the day is the group header).
              <span className={`pgt__pill ${order.checkedAt ? 'pgt__pill--ok' : 'pgt__pill--wait'}`}>
                {order.checkedAt ? 'Сверено' : 'Не сверено'}
              </span>
            }
          />
          </Fragment>
        )
      })}
    </PgtTable>
  )
}
