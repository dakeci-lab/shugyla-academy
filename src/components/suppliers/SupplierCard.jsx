import { Link } from 'react-router-dom'
import StatusBadge from '../admin/StatusBadge'
import {
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_STATUS_BADGE,
  PAYMENT_TYPE_LABELS,
  formatSupplierCategories,
  formatMinOrderAmount,
} from '../../utils/supplierData'
import './SupplierCard.css'

/** Карточка поставщика в списке */
export default function SupplierCard({ supplier, onEdit, onArchive }) {
  const statusType = SUPPLIER_STATUS_BADGE[supplier.status] || 'idle'

  return (
    <article className="supplier-card">
      <div className="supplier-card__head">
        <h3 className="supplier-card__title">{supplier.name}</h3>
        <StatusBadge label={SUPPLIER_STATUS_LABELS[supplier.status]} type={statusType} />
      </div>

      <dl className="supplier-card__meta">
        <div>
          <dt>Категории</dt>
          <dd>{formatSupplierCategories(supplier.productCategories)}</dd>
        </div>
        <div>
          <dt>Менеджер</dt>
          <dd>{supplier.managerName || '—'}</dd>
        </div>
        <div>
          <dt>Телефон</dt>
          <dd>{supplier.managerPhone || '—'}</dd>
        </div>
        <div>
          <dt>Заказ</dt>
          <dd>{supplier.orderDays || '—'}</dd>
        </div>
        <div>
          <dt>Доставка</dt>
          <dd>{supplier.deliveryDays || '—'}</dd>
        </div>
        <div>
          <dt>Оплата</dt>
          <dd>{PAYMENT_TYPE_LABELS[supplier.paymentType] || '—'}</dd>
        </div>
        <div>
          <dt>Мин. заказ</dt>
          <dd>{formatMinOrderAmount(supplier.minOrderAmount)}</dd>
        </div>
      </dl>

      <div className="supplier-card__actions">
        <Link to={`/platform/suppliers/${supplier.id}`} className="btn btn--outline btn--sm">
          Подробнее
        </Link>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(supplier)}>
          Редактировать
        </button>
        {supplier.status !== 'archived' && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onArchive(supplier)}>
            Архивировать
          </button>
        )}
      </div>
    </article>
  )
}
