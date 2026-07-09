import {
  calcDifferenceQty,
  normalizeReceivingItem,
} from '../../utils/receivingData'
import '../procurement/PurchaseItemsTable.css'
import './ReceivingItemsTable.css'

/** Таблица позиций приёмки с редактируемым полем «Пришло» */
export default function ReceivingItemsTable({ items, canEdit, onItemChange }) {
  if (!items.length) {
    return (
      <div className="purchase-items__empty">
        В документе приёмки пока нет позиций.
      </div>
    )
  }

  return (
    <div className="purchase-items-wrap">
      <table className="purchase-items admin-table">
        <thead>
          <tr>
            <th>Наименование товара</th>
            <th>Штрихкод</th>
            <th>Заказано</th>
            <th>Пришло</th>
            <th>Расхождение</th>
            <th>Комментарий</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const normalized = normalizeReceivingItem(item)
            const difference = calcDifferenceQty(normalized.receivedQty, normalized.orderedQty)

            return (
              <tr key={item.id}>
                <td>{normalized.productName}</td>
                <td className="purchase-items__barcode">{normalized.barcode || '—'}</td>
                <td>{normalized.orderedQty}</td>
                <td>
                  {canEdit ? (
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="purchase-items__qty-input"
                      value={normalized.receivedQty}
                      onChange={(e) =>
                        onItemChange?.(item.id, {
                          receivedQty: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                    />
                  ) : (
                    normalized.receivedQty
                  )}
                </td>
                <td className={difference !== 0 ? 'receiving-items__diff' : ''}>
                  {difference > 0 ? `+${difference}` : difference}
                </td>
                <td>{normalized.comment || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
