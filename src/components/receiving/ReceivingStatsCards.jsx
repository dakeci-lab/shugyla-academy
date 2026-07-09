import StatusBadge from '../admin/StatusBadge'
import {
  RECEIVING_STATUS_LABELS,
  RECEIVING_STATUS_BADGE,
  countReceivingByStatus,
} from '../../utils/receivingData'
import '../procurement/PurchaseStatsCards.css'

/** Карточки-счётчики по статусам приёмки */
export default function ReceivingStatsCards({ documents }) {
  const stats = countReceivingByStatus(documents)

  const cards = [
    { label: 'Ожидают приёмки', value: stats.awaitingReceiving, hint: 'Документы без начала приёмки' },
    { label: 'На приёмке', value: stats.inProgress, hint: 'Приёмка в процессе' },
    { label: 'Частично приняты', value: stats.partiallyReceived, hint: 'Есть расхождения' },
    { label: 'Приняты', value: stats.received, hint: 'Приёмка завершена' },
  ]

  return (
    <div className="purchase-stats">
      {cards.map((card) => (
        <article key={card.label} className="purchase-stats__card">
          <span className="purchase-stats__value">{card.value}</span>
          <span className="purchase-stats__label">{card.label}</span>
          <span className="purchase-stats__hint">{card.hint}</span>
        </article>
      ))}
    </div>
  )
}

export function ReceivingStatusBadge({ status }) {
  return (
    <StatusBadge
      label={RECEIVING_STATUS_LABELS[status] || status}
      type={RECEIVING_STATUS_BADGE[status] || 'idle'}
    />
  )
}
