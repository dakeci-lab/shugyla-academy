import {
  formatPurchaseAmount,
  calcLineTotal,
} from '../../utils/purchaseData'
import './PurchaseItemsTable.css'

/** Таблица позиций закупа с редактируемым полем «Заказать» */
export default function PurchaseItemsTable({ items, canEdit, onItemChange }) {
  if (!items.length) {
    return (
      <div className="purchase-items__empty">
        Позиции закупа пока не добавлены. Импортируйте данные из Umag или добавьте товары вручную.
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
            <th>Остаток</th>
            <th>Продажи/день</th>
            <th>Рекомендация</th>
            <th>Заказать</th>
            <th>Закупочная цена</th>
            <th>Сумма</th>
            <th>Комментарий</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.productName}</td>
              <td className="purchase-items__barcode">{item.barcode || '—'}</td>
              <td>{item.stock}</td>
              <td>{item.salesPerDay}</td>
              <td className="purchase-items__rec">{item.recommendation}</td>
              <td>
                {canEdit ? (
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="purchase-items__qty-input"
                    value={item.orderQty}
                    onChange={(e) =>
                      onItemChange?.(item.id, {
                        orderQty: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                ) : (
                  item.orderQty
                )}
              </td>
              <td>{formatPurchaseAmount(item.purchasePrice)}</td>
              <td>{formatPurchaseAmount(calcLineTotal(item.orderQty, item.purchasePrice))}</td>
              <td>
                {canEdit ? (
                  <input
                    type="text"
                    className="purchase-items__comment-input"
                    value={item.comment || ''}
                    placeholder="—"
                    onChange={(e) => onItemChange?.(item.id, { comment: e.target.value })}
                  />
                ) : (
                  item.comment || '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
