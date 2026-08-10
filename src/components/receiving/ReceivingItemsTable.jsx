import { normalizeReceivingItem } from '../../utils/receivingData'
import '../procurement/PurchaseItemsTable.css'
import './ReceivingItemsTable.css'

/** Состав ожидаемой поставки. Фактическая приёмка будет добавлена отдельным этапом. */
export default function ReceivingItemsTable({ items }) {
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
            <th>№</th>
            <th>Товар</th>
            <th>Штрихкод</th>
            <th>Заказано</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const normalized = normalizeReceivingItem(item)

            return (
              <tr key={item.id}>
                <td className="receiving-items__number">{index + 1}</td>
                <td>{normalized.productName}</td>
                <td className="purchase-items__barcode">{normalized.barcode || '—'}</td>
                <td className="receiving-items__ordered">{normalized.orderedQty}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
