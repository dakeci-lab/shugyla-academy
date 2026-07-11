import { useNavigate } from 'react-router-dom'
import { formatReceivingDate } from '../../utils/receivingData'
import { ReceivingStatusBadge } from './ReceivingStatsCards'
import '../procurement/PurchaseTable.css'

/** Таблица документов приёмки */
export default function ReceivingTable({ documents }) {
  const navigate = useNavigate()

  if (!documents.length) {
    return (
      <div className="purchase-table__empty">
        Нет документов приёмки. Передайте закуп в приёмку из раздела «Закуп».
      </div>
    )
  }

  return (
    <div className="purchase-table-wrap">
      <table className="purchase-table admin-table">
        <thead>
          <tr>
            <th>Ожидаемая дата доставки</th>
            <th>Поставщик</th>
            <th>Товаров</th>
            <th>Статус</th>
            <th>Принял</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr
              key={doc.id}
              className="purchase-table__row"
              onClick={() => navigate(`/platform/receiving/${doc.id}`)}
            >
              <td>{formatReceivingDate(doc.expectedDeliveryDate)}</td>
              <td>{doc.supplierName || '—'}</td>
              <td>{doc.itemsCount ?? doc.items?.length ?? 0}</td>
              <td>
                <ReceivingStatusBadge status={doc.status} />
              </td>
              <td>{doc.receivedByName || '—'}</td>
              <td className="purchase-table__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/platform/receiving/${doc.id}`)
                  }}
                >
                  Открыть
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
