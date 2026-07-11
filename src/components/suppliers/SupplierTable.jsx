import { useNavigate } from 'react-router-dom'
import StatusBadge from '../admin/StatusBadge'
import IconActionButton from '../admin/IconActionButton'
import { EyeIcon, PencilIcon, TrashIcon } from '../icons/PlatformIcons'
import {
  SUPPLIER_STATUS,
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_STATUS_BADGE,
} from '../../utils/supplierData'
import '../admin/IconActionButton.css'
import './SupplierTable.css'

function displayValue(value) {
  if (value == null || value === '') return '—'
  return value
}

function SupplierActions({ supplier, canEdit, onEdit, onDeactivate, stopPropagation = false }) {
  const navigate = useNavigate()

  function wrap(handler) {
    return (event) => {
      if (stopPropagation) event.stopPropagation()
      handler(event)
    }
  }

  function openDetails(event) {
    if (stopPropagation) event.stopPropagation()
    navigate(`/platform/suppliers/${supplier.id}`)
  }

  return (
    <div className="supplier-table__actions">
      <IconActionButton label="Просмотр" onClick={openDetails}>
        <EyeIcon />
      </IconActionButton>
      {canEdit && (
        <>
          <IconActionButton
            label="Редактировать"
            variant="primary"
            onClick={wrap(() => onEdit(supplier))}
          >
            <PencilIcon />
          </IconActionButton>
          {supplier.status === SUPPLIER_STATUS.ACTIVE && onDeactivate && (
            <IconActionButton
              label="Деактивировать"
              variant="danger"
              onClick={wrap(() => onDeactivate(supplier))}
            >
              <TrashIcon />
            </IconActionButton>
          )}
        </>
      )}
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

/** Таблица (desktop) и карточки (mobile) поставщиков */
export default function SupplierTable({
  suppliers,
  canEdit = false,
  onEdit,
  onDeactivate,
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
                      onDeactivate={onDeactivate}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="supplier-cards">
        {suppliers.map((supplier) => (
          <li key={supplier.id} className="supplier-card-item">
            <div className="supplier-card-item__head">
              {canEdit && onEdit ? (
                <button
                  type="button"
                  className="supplier-name-link supplier-name-link--title"
                  onClick={(event) => openEdit(supplier, event)}
                >
                  {supplier.name}
                </button>
              ) : (
                <h3 className="supplier-card-item__title">{supplier.name}</h3>
              )}
              <SupplierStatusBadge status={supplier.status} />
            </div>

            <dl className="supplier-card-item__facts">
              <div className="supplier-card-item__fact">
                <dt>Менеджер</dt>
                <dd>{displayValue(supplier.managerName)}</dd>
              </div>
              <div className="supplier-card-item__fact">
                <dt>Телефон</dt>
                <dd>{displayValue(supplier.managerPhone)}</dd>
              </div>
              <div className="supplier-card-item__fact">
                <dt>Дни заказа</dt>
                <dd>{displayValue(supplier.orderDays)}</dd>
              </div>
              <div className="supplier-card-item__fact">
                <dt>Дни доставки</dt>
                <dd>{displayValue(supplier.deliveryDays)}</dd>
              </div>
            </dl>

            <div className="supplier-card-item__actions">
              <SupplierActions
                supplier={supplier}
                canEdit={canEdit}
                onEdit={onEdit}
                onDeactivate={onDeactivate}
                stopPropagation
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
