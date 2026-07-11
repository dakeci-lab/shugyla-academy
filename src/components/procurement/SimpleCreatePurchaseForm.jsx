import { useMemo } from 'react'
import { getSuppliers } from '../../services/academyDataService'
import SearchableSupplierSelect from '../suppliers/SearchableSupplierSelect'
import './CreatePurchaseModal.css'

export const EMPTY_SIMPLE_PURCHASE_FORM = {
  supplierId: '',
  supplierName: '',
  expectedDeliveryDate: new Date().toISOString().slice(0, 10),
  totalAmount: '',
  comment: '',
}

/** Упрощённая форма создания закупа */
export default function SimpleCreatePurchaseForm({ form, onChange, error }) {
  const suppliers = useMemo(() => getSuppliers(), [])

  function handleSupplierChange(supplierId, supplier) {
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
        <SearchableSupplierSelect
          suppliers={suppliers}
          value={form.supplierId}
          onChange={handleSupplierChange}
          required
        />
      </label>

      <label className="admin-form__label">
        Дата поставки
        <input
          type="date"
          className="admin-form__input"
          value={form.expectedDeliveryDate}
          onChange={(e) => onChange({ ...form, expectedDeliveryDate: e.target.value })}
          required
        />
      </label>

      <label className="admin-form__label">
        Общая сумма закупа (₸)
        <input
          type="number"
          className="admin-form__input"
          min="0"
          step="1"
          value={form.totalAmount}
          onChange={(e) => onChange({ ...form, totalAmount: e.target.value })}
          placeholder="250000"
          required
        />
      </label>

      <label className="admin-form__label">
        Комментарий
        <textarea
          className="admin-form__input admin-form__textarea"
          rows={3}
          value={form.comment}
          onChange={(e) => onChange({ ...form, comment: e.target.value })}
          placeholder="Необязательно…"
        />
      </label>
    </div>
  )
}
