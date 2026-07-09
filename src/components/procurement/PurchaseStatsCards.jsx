import StatusBadge from '../admin/StatusBadge'
import {
  PURCHASE_STATUS_LABELS,
  PURCHASE_STATUS_BADGE,
  formatPurchaseAmount,
  formatPurchaseDate,
  countPurchasesByStatus,
} from '../../utils/purchaseData'
import './PurchaseStatsCards.css'

/** Карточки-счётчики по статусам закупов */
export default function PurchaseStatsCards({ orders }) {
  const stats = countPurchasesByStatus(orders)

  const cards = [
    { label: 'Черновики', value: stats.drafts, hint: 'Закупы в работе' },
    { label: 'Ожидают отправки', value: stats.pendingSend, hint: 'Сформированы, не отправлены' },
    { label: 'Ожидают приёмки', value: stats.pendingReceiving, hint: 'Переданы или в пути' },
    { label: 'Завершённые закупы', value: stats.completed, hint: 'Полностью приняты' },
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

export function PurchaseStatusBadge({ status }) {
  return (
    <StatusBadge
      label={PURCHASE_STATUS_LABELS[status] || status}
      type={PURCHASE_STATUS_BADGE[status] || 'idle'}
    />
  )
}

export { formatPurchaseAmount, formatPurchaseDate }
