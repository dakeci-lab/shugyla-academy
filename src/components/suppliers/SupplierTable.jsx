import { useNavigate } from 'react-router-dom'
import StatusBadge from '../admin/StatusBadge'
import {
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_STATUS_BADGE,
} from '../../utils/supplierData'
import './SupplierTable.css'

function displayValue(value) {
  if (value == null || value === '') return '—'
  return value
}

/** Компактная таблица поставщиков */
export default function SupplierTable({
  suppliers,
  canEdit = false,
  onEdit,
}) {
  const navigate = useNavigate()

  function openDetails(id) {
    navigate(`/platform/suppliers/${id}`)
  }

  return (
    <div className="supplier-table-wrap">
      <table className="supplier-table admin-table">
        <thead>
          <tr>
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
          {suppliers.map((supplier) => {
            const statusType = SUPPLIER_STATUS_BADGE[supplier.status] || 'idle'
            return (
              <tr
                key={supplier.id}
                className="supplier-table__row"
                onClick={() => openDetails(supplier.id)}
              >
                <td className="supplier-table__name">{supplier.name}</td>
                <td>{displayValue(supplier.managerName)}</td>
                <td>{displayValue(supplier.managerPhone)}</td>
                <td>{displayValue(supplier.orderDays)}</td>
                <td>{displayValue(supplier.deliveryDays)}</td>
                <td>
                  <StatusBadge
                    label={SUPPLIER_STATUS_LABELS[supplier.status]}
                    type={statusType}
                  />
                </td>
                <td className="supplier-table__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      openDetails(supplier.id)
                    }}
                  >
                    Подробнее
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit(supplier)
                      }}
                    >
                      Редактировать
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
