import {
  formatPurchaseAmount,
  calcLineTotal,
} from '../../utils/purchaseData'
import './PurchaseItemsTable.css'

/**
 * Таблица позиций заказа. Для приёмщика — только то, что нужно при приёмке: товар, штрихкод,
 * сколько заказано, цена, сумма. Остаток / продажи в день / рекомендация — аналитика закупщика,
 * показывается лишь при редактировании черновика. Пустое значение — пустая ячейка, без «—»;
 * колонка «Комментарий» есть, только если хоть у одной позиции он заполнен.
 */
export default function PurchaseItemsTable({
  items,
  canEditItems = false,
  onEdit,
  onDelete,
  onAdd,
}) {
  if (!items.length) {
    return (
      <div className="purchase-items__empty">
        <p className="purchase-items__empty-text">
          Позиции закупа пока не добавлены. Добавьте товар вручную или импортируйте данные из Umag.
        </p>
        {canEditItems && onAdd && (
          <button type="button" className="btn btn--primary btn--sm" onClick={onAdd}>
            + Добавить товар
          </button>
        )}
      </div>
    )
  }

  const showAnalytics = canEditItems
  const showComment = items.some((item) => String(item.comment ?? '').trim() !== '')

  return (
    <div className="purchase-items-wrap">
      <table className={`purchase-items admin-table${showAnalytics ? '' : ' purchase-items--receiver'}`}>
        <thead>
          <tr>
            <th>Наименование товара</th>
            <th>Штрихкод</th>
            {showAnalytics && <th>Остаток</th>}
            {showAnalytics && <th>Продажи/день</th>}
            {showAnalytics && <th>Рекомендация</th>}
            <th>Заказать</th>
            <th>Закупочная цена</th>
            <th>Сумма</th>
            {showComment && <th>Комментарий</th>}
            {canEditItems && <th>Действия</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.productName}</td>
              <td className="purchase-items__barcode">{item.barcode}</td>
              {showAnalytics && <td>{item.stock}</td>}
              {showAnalytics && <td>{item.salesPerDay}</td>}
              {showAnalytics && <td className="purchase-items__rec">{item.recommendation}</td>}
              <td>{item.orderQty}</td>
              <td>{formatPurchaseAmount(item.purchasePrice)}</td>
              <td>{formatPurchaseAmount(calcLineTotal(item.orderQty, item.purchasePrice))}</td>
              {showComment && <td>{item.comment}</td>}
              {canEditItems && (
                <td className="purchase-items__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => onEdit?.(item)}
                  >
                    Редактировать
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => onDelete?.(item)}
                  >
                    Удалить
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
