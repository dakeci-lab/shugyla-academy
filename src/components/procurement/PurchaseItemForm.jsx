export const EMPTY_PURCHASE_ITEM_FORM = {
  productName: '',
  barcode: '',
  stock: '',
  salesPerDay: '',
  recommendation: '',
  orderQty: '',
  purchasePrice: '',
  comment: '',
}

export function purchaseItemToForm(item) {
  if (!item) return { ...EMPTY_PURCHASE_ITEM_FORM }
  return {
    productName: item.productName || '',
    barcode: item.barcode || '',
    stock: item.stock ?? '',
    salesPerDay: item.salesPerDay ?? '',
    recommendation: item.recommendation ?? '',
    orderQty: item.orderQty ?? '',
    purchasePrice: item.purchasePrice ?? '',
    comment: item.comment || '',
  }
}

export function formToPurchaseItem(form, extras = {}) {
  return {
    ...extras,
    productName: form.productName.trim(),
    barcode: form.barcode.trim(),
    stock: Number(form.stock) || 0,
    salesPerDay: Number(form.salesPerDay) || 0,
    recommendation: Number(form.recommendation) || 0,
    orderQty: Number(form.orderQty) || 0,
    purchasePrice: Number(form.purchasePrice) || 0,
    comment: form.comment.trim(),
  }
}

export function validatePurchaseItemForm(form) {
  if (!form.productName.trim()) return 'Укажите наименование товара'
  if (form.orderQty === '' || Number(form.orderQty) <= 0) {
    return 'Укажите количество для заказа (больше 0)'
  }
  if (form.purchasePrice === '' || Number(form.purchasePrice) < 0) {
    return 'Укажите закупочную цену'
  }
  return ''
}

/** Форма добавления / редактирования позиции закупа */
export default function PurchaseItemForm({ form, onChange, error }) {
  function numChange(field, value) {
    onChange({ ...form, [field]: value })
  }

  return (
    <div className="purchase-item-form">
      {error && <p className="admin-form__error">{error}</p>}

      <label className="admin-form__label">
        Наименование товара *
        <input
          type="text"
          className="admin-form__input"
          value={form.productName}
          onChange={(e) => onChange({ ...form, productName: e.target.value })}
          placeholder="Например: Молоко 3.2% 1л"
        />
      </label>

      <label className="admin-form__label">
        Штрихкод
        <input
          type="text"
          className="admin-form__input"
          value={form.barcode}
          onChange={(e) => onChange({ ...form, barcode: e.target.value })}
          placeholder="4870201234567"
        />
      </label>

      <div className="admin-form__row">
        <label className="admin-form__label">
          Остаток
          <input
            type="number"
            min="0"
            step="any"
            className="admin-form__input"
            value={form.stock}
            onChange={(e) => numChange('stock', e.target.value)}
          />
        </label>
        <label className="admin-form__label">
          Продажи/день
          <input
            type="number"
            min="0"
            step="any"
            className="admin-form__input"
            value={form.salesPerDay}
            onChange={(e) => numChange('salesPerDay', e.target.value)}
          />
        </label>
        <label className="admin-form__label">
          Рекомендация
          <input
            type="number"
            min="0"
            step="any"
            className="admin-form__input"
            value={form.recommendation}
            onChange={(e) => numChange('recommendation', e.target.value)}
          />
        </label>
      </div>

      <div className="admin-form__row">
        <label className="admin-form__label">
          Заказать *
          <input
            type="number"
            min="1"
            step="1"
            className="admin-form__input"
            value={form.orderQty}
            onChange={(e) => numChange('orderQty', e.target.value)}
          />
        </label>
        <label className="admin-form__label">
          Закупочная цена *
          <input
            type="number"
            min="0"
            step="any"
            className="admin-form__input"
            value={form.purchasePrice}
            onChange={(e) => numChange('purchasePrice', e.target.value)}
          />
        </label>
      </div>

      <label className="admin-form__label">
        Комментарий
        <textarea
          className="admin-form__input admin-form__textarea"
          rows={2}
          value={form.comment}
          onChange={(e) => onChange({ ...form, comment: e.target.value })}
          placeholder="Примечания к позиции…"
        />
      </label>
    </div>
  )
}
