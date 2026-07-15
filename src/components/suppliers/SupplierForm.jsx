import {
  PAYMENT_TYPE,
  PAYMENT_TYPE_LABELS,
  SUPPLIER_STATUS,
  SUPPLIER_STATUS_LABELS,
  parseSupplierWeekdays,
  serializeSupplierWeekdays,
} from '../../utils/supplierData'
import SupplierWeekdaySelector from './SupplierWeekdaySelector'
import '../../components/admin/admin-shared.css'
import './SupplierForm.css'

export const EMPTY_SUPPLIER_FORM = {
  name: '',
  legalName: '',
  managerName: '',
  managerPhone: '',
  orderWeekdays: [],
  deliveryWeekdays: [],
  paymentType: PAYMENT_TYPE.CASH,
  deferralDays: '',
  status: SUPPLIER_STATUS.ACTIVE,
}

export function supplierToForm(supplier) {
  if (!supplier) return { ...EMPTY_SUPPLIER_FORM }
  return {
    name: supplier.name || '',
    legalName: supplier.legalName || '',
    managerName: supplier.managerName || '',
    managerPhone: supplier.managerPhone || '',
    orderWeekdays: parseSupplierWeekdays(supplier.orderWeekdays ?? supplier.orderDays),
    deliveryWeekdays: parseSupplierWeekdays(supplier.deliveryWeekdays ?? supplier.deliveryDays),
    paymentType: supplier.paymentType || PAYMENT_TYPE.CASH,
    deferralDays: supplier.deferralDays != null ? String(supplier.deferralDays) : '',
    status: supplier.status || SUPPLIER_STATUS.ACTIVE,
  }
}

function buildVisibleSupplierPayload(form) {
  const orderWeekdays = parseSupplierWeekdays(form.orderWeekdays)
  const deliveryWeekdays = parseSupplierWeekdays(form.deliveryWeekdays)

  return {
    name: form.name.trim(),
    legalName: form.legalName.trim(),
    managerName: form.managerName.trim(),
    managerPhone: form.managerPhone.trim(),
    orderWeekdays,
    deliveryWeekdays,
    orderDays: serializeSupplierWeekdays(orderWeekdays),
    deliveryDays: serializeSupplierWeekdays(deliveryWeekdays),
    paymentType: form.paymentType,
    deferralDays:
      form.paymentType === PAYMENT_TYPE.DEFERRAL || form.paymentType === PAYMENT_TYPE.MIXED
        ? form.deferralDays !== ''
          ? Number(form.deferralDays)
          : null
        : null,
    status: form.status,
  }
}

/** Payload для создания — только поля, видимые в форме */
export function formToSupplierCreatePayload(form) {
  return buildVisibleSupplierPayload(form)
}

/** Patch для обновления — не затрагивает скрытые поля (категории, WhatsApp и т.д.) */
export function formToSupplierUpdatePayload(form) {
  return buildVisibleSupplierPayload(form)
}

/** @deprecated используйте formToSupplierCreatePayload / formToSupplierUpdatePayload */
export function formToSupplierPayload(form) {
  return buildVisibleSupplierPayload(form)
}

/** Форма добавления / редактирования поставщика */
export default function SupplierForm({ form, onChange, error }) {
  const showDeferral =
    form.paymentType === PAYMENT_TYPE.DEFERRAL || form.paymentType === PAYMENT_TYPE.MIXED

  function setField(field, value) {
    onChange({ ...form, [field]: value })
  }

  return (
    <div className="supplier-form admin-form">
      <div className="admin-form__row">
        <label className="admin-form__label">
          Название поставщика *
          <input
            className="admin-form__input"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            required
          />
        </label>
        <label className="admin-form__label">
          Юридическое название
          <input
            className="admin-form__input"
            value={form.legalName}
            onChange={(e) => setField('legalName', e.target.value)}
          />
        </label>
      </div>

      <div className="admin-form__row">
        <label className="admin-form__label">
          Имя менеджера
          <input
            className="admin-form__input"
            value={form.managerName}
            onChange={(e) => setField('managerName', e.target.value)}
          />
        </label>
        <label className="admin-form__label">
          Телефон менеджера
          <input
            className="admin-form__input"
            type="tel"
            value={form.managerPhone}
            onChange={(e) => setField('managerPhone', e.target.value)}
          />
        </label>
      </div>

      <div className="supplier-form__schedule">
        <SupplierWeekdaySelector
          label="Дни заказа"
          value={form.orderWeekdays}
          onChange={(value) => setField('orderWeekdays', value)}
        />
        <SupplierWeekdaySelector
          label="Дни поставки"
          value={form.deliveryWeekdays}
          onChange={(value) => setField('deliveryWeekdays', value)}
        />
      </div>

      <div className="admin-form__row">
        <label className="admin-form__label">
          Условия оплаты
          <select
            className="admin-form__input"
            value={form.paymentType}
            onChange={(e) => setField('paymentType', e.target.value)}
          >
            {Object.entries(PAYMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-form__label">
          Статус
          <select
            className="admin-form__input"
            value={form.status}
            onChange={(e) => setField('status', e.target.value)}
          >
            {Object.entries(SUPPLIER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showDeferral && (
        <label className="admin-form__label">
          Срок отсрочки (дней)
          <input
            className="admin-form__input"
            type="number"
            min="0"
            value={form.deferralDays}
            onChange={(e) => setField('deferralDays', e.target.value)}
          />
        </label>
      )}

      {error && <p className="admin-form__error">{error}</p>}
    </div>
  )
}
