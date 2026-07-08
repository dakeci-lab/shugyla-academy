import { Link } from 'react-router-dom'
import StatusBadge from '../admin/StatusBadge'
import {
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_STATUS_BADGE,
  PAYMENT_TYPE_LABELS,
  RETURN_POLICY_LABELS,
  formatSupplierCategories,
  formatMinOrderAmount,
} from '../../utils/supplierData'
import './SupplierDetails.css'

function DetailRow({ label, value }) {
  return (
    <div className="supplier-details__row">
      <span className="supplier-details__label">{label}</span>
      <span className="supplier-details__value">{value || '—'}</span>
    </div>
  )
}

/** Детальная карточка поставщика */
export default function SupplierDetails({ supplier, onEdit, onArchive, onDelete }) {
  if (!supplier) {
    return (
      <div className="supplier-details supplier-details--empty">
        <p>Поставщик не найден</p>
        <Link to="/platform/suppliers" className="btn btn--outline">
          ← К списку
        </Link>
      </div>
    )
  }

  const statusType = SUPPLIER_STATUS_BADGE[supplier.status] || 'idle'
  const whatsapp = supplier.whatsapp || supplier.managerPhone

  return (
    <div className="supplier-details">
      <div className="supplier-details__header">
        <div>
          <Link to="/platform/suppliers" className="supplier-details__back">
            ← К списку поставщиков
          </Link>
          <h2 className="supplier-details__title">{supplier.name}</h2>
          {supplier.legalName && (
            <p className="supplier-details__legal">{supplier.legalName}</p>
          )}
        </div>
        <StatusBadge label={SUPPLIER_STATUS_LABELS[supplier.status]} type={statusType} />
      </div>

      <div className="supplier-details__grid">
        <section className="supplier-details__section">
          <h3>Контакты</h3>
          <DetailRow label="Менеджер" value={supplier.managerName} />
          <DetailRow label="Телефон" value={supplier.managerPhone} />
          <DetailRow label="WhatsApp" value={whatsapp} />
          <DetailRow label="Ответственный" value={supplier.responsibleEmployeeName} />
        </section>

        <section className="supplier-details__section">
          <h3>Товары и логистика</h3>
          <DetailRow label="Категории" value={formatSupplierCategories(supplier.productCategories)} />
          <DetailRow label="Дни заказа" value={supplier.orderDays} />
          <DetailRow label="Дни доставки" value={supplier.deliveryDays} />
          <DetailRow label="Мин. сумма заказа" value={formatMinOrderAmount(supplier.minOrderAmount)} />
        </section>

        <section className="supplier-details__section">
          <h3>Условия</h3>
          <DetailRow label="Оплата" value={PAYMENT_TYPE_LABELS[supplier.paymentType]} />
          {supplier.deferralDays != null && (
            <DetailRow label="Отсрочка" value={`${supplier.deferralDays} дн.`} />
          )}
          <DetailRow label="Возврат / обмен" value={RETURN_POLICY_LABELS[supplier.returnPolicy]} />
          {supplier.returnComment && (
            <DetailRow label="Комментарий по возврату" value={supplier.returnComment} />
          )}
        </section>

        {supplier.comment && (
          <section className="supplier-details__section supplier-details__section--wide">
            <h3>Общий комментарий</h3>
            <p className="supplier-details__comment">{supplier.comment}</p>
          </section>
        )}
      </div>

      <div className="supplier-details__actions">
        <button type="button" className="btn btn--primary" onClick={() => onEdit(supplier)}>
          Редактировать
        </button>
        {supplier.status !== 'archived' && (
          <button type="button" className="btn btn--outline" onClick={() => onArchive(supplier)}>
            Архивировать
          </button>
        )}
        <button type="button" className="btn btn--ghost supplier-details__delete" onClick={() => onDelete(supplier)}>
          Удалить
        </button>
      </div>
    </div>
  )
}
