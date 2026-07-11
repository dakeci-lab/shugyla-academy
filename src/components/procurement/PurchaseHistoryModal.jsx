import AdminModal from '../admin/AdminModal'
import {
  formatPurchaseDate,
  formatPurchaseAmount,
  PURCHASE_STATUS_LABELS,
} from '../../utils/purchaseData'
import './PurchaseHistoryModal.css'

/** Модальное окно истории закупов (завершённые и отменённые) */
export default function PurchaseHistoryModal({ orders, onClose }) {
  const history = orders.filter((o) => o.status === 'received' || o.status === 'cancelled')

  return (
    <AdminModal
      title="История закупов"
      onClose={onClose}
      xwide
      footer={
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Закрыть
        </button>
      }
    >
      {history.length === 0 ? (
        <p className="purchase-history__empty">Завершённых и отменённых закупов пока нет.</p>
      ) : (
        <div className="purchase-history-wrap">
          <table className="purchase-history admin-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Поставщик</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Создал</th>
              </tr>
            </thead>
            <tbody>
              {history.map((order) => (
                <tr key={order.id}>
                  <td>{formatPurchaseDate(order.date)}</td>
                  <td>{order.supplierName || '—'}</td>
                  <td>{formatPurchaseAmount(order.totalAmount)}</td>
                  <td>{PURCHASE_STATUS_LABELS[order.status]}</td>
                  <td>{order.createdByName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminModal>
  )
}
