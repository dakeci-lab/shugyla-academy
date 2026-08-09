import { Link } from 'react-router-dom'
import {
  formatReceivingDate,
  RECEIVING_STATUS_LABELS,
} from '../../utils/receivingData'
import { isSimpleWorkflow } from '../../utils/procurementWorkflow'
import './AnalyticsReceivingList.css'

/** Список аналитических документов приёмки (сформированных из планирования). */
export default function AnalyticsReceivingList({ documents = [] }) {
  const analyticsDocs = (documents || [])
    .filter((doc) => !isSimpleWorkflow(doc))
    .slice()
    .sort((a, b) => {
      const dateCmp = String(b.expectedDeliveryDate || '').localeCompare(
        String(a.expectedDeliveryDate || '')
      )
      if (dateCmp !== 0) return dateCmp
      return String(a.supplierName || '').localeCompare(String(b.supplierName || ''), 'ru')
    })

  if (analyticsDocs.length === 0) {
    return (
      <p className="analytics-receiving-list__empty">
        Аналитических приёмок пока нет. Они появятся после формирования заказов в планировании.
      </p>
    )
  }

  return (
    <ul className="analytics-receiving-list" role="list">
      {analyticsDocs.map((doc) => {
        const statusLabel =
          RECEIVING_STATUS_LABELS?.[doc.status] || doc.status || '—'
        const itemsCount = doc.items?.length ?? 0
        return (
          <li key={doc.id}>
            <Link to={`/platform/receiving/${doc.id}`} className="analytics-receiving-card">
              <div className="analytics-receiving-card__main">
                <strong>{doc.supplierName || 'Поставщик'}</strong>
                <span>{formatReceivingDate(doc.expectedDeliveryDate) || 'Без даты'}</span>
              </div>
              <div className="analytics-receiving-card__meta">
                <span>{statusLabel}</span>
                <span>{itemsCount} поз.</span>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
