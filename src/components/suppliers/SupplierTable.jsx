import StatusBadge from '../admin/StatusBadge'
import IconActionButton from '../admin/IconActionButton'
import { PencilIcon } from '../icons/PlatformIcons'
import {
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_STATUS_BADGE,
} from '../../utils/supplierData'
import '../admin/IconActionButton.css'
import './SupplierTable.css'

function displayValue(value) {
  if (value == null || value === '') return '—'
  return value
}

function SupplierActions({ supplier, canEdit, onEdit }) {
  if (!canEdit || !onEdit) return null

  return (
    <div className="supplier-table__actions">
      <IconActionButton
        label="Редактировать"
        variant="primary"
        onClick={() => onEdit(supplier)}
      >
        <PencilIcon />
      </IconActionButton>
    </div>
  )
}

function SupplierStatusBadge({ status }) {
  return (
    <StatusBadge
      label={SUPPLIER_STATUS_LABELS[status] || status}
      type={SUPPLIER_STATUS_BADGE[status] || 'idle'}
    />
  )
}

function handleCardKeyDown(event, onEdit, supplier) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onEdit(supplier)
  }
}

/** Таблица (desktop) и карточки (mobile) поставщиков */
export default function SupplierTable({
  suppliers,
  canEdit = false,
  onEdit,
}) {
  function openEdit(supplier, event) {
    event?.stopPropagation?.()
    onEdit?.(supplier)
  }

  return (
    <>
      <div className="supplier-table-desktop">
        <div className="supplier-table-wrap">
          <table className="supplier-table">
            <thead>
              <tr>
                <th className="supplier-table__num-col">№</th>
                <th>Название</th>
                <th>Менеджер</th>
                <th>Телефон</th>
                <th>Дни заказа</th>
                <th>Дни доставки</th>
                <th>Статус</th>
                <th className="supplier-table__actions-col">Действия</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier, index) => (
                <tr key={supplier.id} className="supplier-table__row">
                  <td className="supplier-table__num">{index + 1}</td>
                  <td className="supplier-table__name">
                    {canEdit && onEdit ? (
                      <button
                        type="button"
                        className="supplier-name-link"
                        onClick={(event) => openEdit(supplier, event)}
                      >
                        {supplier.name}
                      </button>
                    ) : (
                      supplier.name
                    )}
                  </td>
                  <td>{displayValue(supplier.managerName)}</td>
                  <td>{displayValue(supplier.managerPhone)}</td>
                  <td>{displayValue(supplier.orderDays)}</td>
                  <td>{displayValue(supplier.deliveryDays)}</td>
                  <td>
                    <SupplierStatusBadge status={supplier.status} />
                  </td>
                  <td>
                    <SupplierActions
                      supplier={supplier}
                      canEdit={canEdit}
                      onEdit={onEdit}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="supplier-cards">
        {suppliers.map((supplier) => {
          const isInteractive = canEdit && onEdit

          return (
            <li
              key={supplier.id}
              className={`supplier-card-item${isInteractive ? ' supplier-card-item--clickable' : ''}`}
              {...(isInteractive
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `Редактировать поставщика ${supplier.name}`,
                    onClick: () => onEdit(supplier),
                    onKeyDown: (event) => handleCardKeyDown(event, onEdit, supplier),
                  }
                : {})}
            >
              <div className="supplier-card-item__head">
                <h3 className="supplier-card-item__title">{supplier.name}</h3>
                <SupplierStatusBadge status={supplier.status} />
              </div>

              <div className="supplier-card-item__meta">
                <p className="supplier-card-item__meta-line">
                  <span className="supplier-card-item__meta-label">Менеджер:</span>{' '}
                  <span className="supplier-card-item__meta-value">
                    {displayValue(supplier.managerName)}
                  </span>
                </p>
                <p className="supplier-card-item__meta-line supplier-card-item__meta-line--phone">
                  <span className="supplier-card-item__meta-label">Телефон:</span>{' '}
                  <span className="supplier-card-item__meta-value">
                    {displayValue(supplier.managerPhone)}
                  </span>
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
