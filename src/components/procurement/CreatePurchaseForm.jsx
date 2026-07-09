import { useMemo } from 'react'
import { getSuppliers } from '../../services/academyDataService'
import './CreatePurchaseModal.css'

export const EMPTY_PURCHASE_FORM = {
  supplierId: '',
  supplierName: '',
  date: new Date().toISOString().slice(0, 10),
  expectedDeliveryDate: '',
  comment: '',
}

/** Форма создания закупа */
export default function CreatePurchaseForm({ form, onChange, error }) {
  const suppliers = useMemo(() => getSuppliers(), [])

  function handleSupplierChange(e) {
    const supplierId = e.target.value
    const supplier = suppliers.find((s) => s.id === supplierId)
    onChange({
      ...form,
      supplierId,
      supplierName: supplier?.name || '',
    })
  }

  return (
    <div className="create-purchase-form">
      {error && <p className="admin-form__error">{error}</p>}

      <label className="admin-form__label">
        Поставщик
        <select
          className="admin-form__input"
          value={form.supplierId}
          onChange={handleSupplierChange}
        >
          <option value="">Выберите поставщика</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div className="admin-form__row">
        <label className="admin-form__label">
          Дата закупа
          <input
            type="date"
            className="admin-form__input"
            value={form.date}
            onChange={(e) => onChange({ ...form, date: e.target.value })}
          />
        </label>
        <label className="admin-form__label">
          Ожидаемая дата доставки
          <input
            type="date"
            className="admin-form__input"
            value={form.expectedDeliveryDate}
            onChange={(e) => onChange({ ...form, expectedDeliveryDate: e.target.value })}
          />
        </label>
      </div>

      <label className="admin-form__label">
        Комментарий
        <textarea
          className="admin-form__input admin-form__textarea"
          rows={3}
          value={form.comment}
          onChange={(e) => onChange({ ...form, comment: e.target.value })}
          placeholder="Примечания к заказу…"
        />
      </label>
    </div>
  )
}
