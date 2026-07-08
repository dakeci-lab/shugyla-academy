import {
  PAYMENT_TYPE,
  PAYMENT_TYPE_LABELS,
  RETURN_POLICY,
  RETURN_POLICY_LABELS,
  SUPPLIER_STATUS,
  SUPPLIER_STATUS_LABELS,
  categoriesToInputValue,
  inputValueToCategories,
} from '../../utils/supplierData'
import { getActiveEmployees } from '../../utils/employeeData'
import '../../components/admin/admin-shared.css'
import './SupplierForm.css'

export const EMPTY_SUPPLIER_FORM = {
  name: '',
  legalName: '',
  productCategoriesInput: '',
  managerName: '',
  managerPhone: '',
  whatsapp: '',
  orderDays: '',
  deliveryDays: '',
  minOrderAmount: '',
  paymentType: PAYMENT_TYPE.CASH,
  deferralDays: '',
  returnPolicy: RETURN_POLICY.NO,
  returnComment: '',
  responsibleEmployeeId: '',
  responsibleEmployeeName: '',
  status: SUPPLIER_STATUS.ACTIVE,
  comment: '',
}

export function supplierToForm(supplier) {
  if (!supplier) return { ...EMPTY_SUPPLIER_FORM }
  return {
    name: supplier.name || '',
    legalName: supplier.legalName || '',
    productCategoriesInput: categoriesToInputValue(supplier.productCategories),
    managerName: supplier.managerName || '',
    managerPhone: supplier.managerPhone || '',
    whatsapp: supplier.whatsapp || '',
    orderDays: supplier.orderDays || '',
    deliveryDays: supplier.deliveryDays || '',
    minOrderAmount: supplier.minOrderAmount != null ? String(supplier.minOrderAmount) : '',
    paymentType: supplier.paymentType || PAYMENT_TYPE.CASH,
    deferralDays: supplier.deferralDays != null ? String(supplier.deferralDays) : '',
    returnPolicy: supplier.returnPolicy || RETURN_POLICY.NO,
    returnComment: supplier.returnComment || '',
    responsibleEmployeeId: supplier.responsibleEmployeeId
      ? String(supplier.responsibleEmployeeId)
      : '',
    responsibleEmployeeName: supplier.responsibleEmployeeName || '',
    status: supplier.status || SUPPLIER_STATUS.ACTIVE,
    comment: supplier.comment || '',
  }
}

export function formToSupplierPayload(form) {
  const employeeId = form.responsibleEmployeeId ? Number(form.responsibleEmployeeId) : null
  const employees = getActiveEmployees()
  const employee = employees.find((e) => e.id === employeeId)

  return {
    name: form.name.trim(),
    legalName: form.legalName.trim(),
    productCategories: inputValueToCategories(form.productCategoriesInput),
    managerName: form.managerName.trim(),
    managerPhone: form.managerPhone.trim(),
    whatsapp: form.whatsapp.trim(),
    orderDays: form.orderDays.trim(),
    deliveryDays: form.deliveryDays.trim(),
    minOrderAmount: form.minOrderAmount !== '' ? Number(form.minOrderAmount) : null,
    paymentType: form.paymentType,
    deferralDays:
      form.paymentType === PAYMENT_TYPE.DEFERRAL || form.paymentType === PAYMENT_TYPE.MIXED
        ? form.deferralDays !== ''
          ? Number(form.deferralDays)
          : null
        : null,
    returnPolicy: form.returnPolicy,
    returnComment: form.returnComment.trim(),
    responsibleEmployeeId: employeeId,
    responsibleEmployeeName: employee?.name || form.responsibleEmployeeName.trim(),
    status: form.status,
    comment: form.comment.trim(),
  }
}

/** Форма добавления / редактирования поставщика */
export default function SupplierForm({ form, onChange, error }) {
  const employees = getActiveEmployees()
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

      <label className="admin-form__label">
        Категории товаров
        <input
          className="admin-form__input"
          value={form.productCategoriesInput}
          onChange={(e) => setField('productCategoriesInput', e.target.value)}
          placeholder="Молочная продукция, Бакалея, Овощи"
        />
        <span className="admin-form__hint">Через запятую</span>
      </label>

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

      <label className="admin-form__label">
        WhatsApp
        <input
          className="admin-form__input"
          type="tel"
          value={form.whatsapp}
          onChange={(e) => setField('whatsapp', e.target.value)}
          placeholder="Если отличается от телефона"
        />
      </label>

      <div className="admin-form__row">
        <label className="admin-form__label">
          Дни приёма заказа
          <input
            className="admin-form__input"
            value={form.orderDays}
            onChange={(e) => setField('orderDays', e.target.value)}
            placeholder="Пн, Ср, Пт"
          />
        </label>
        <label className="admin-form__label">
          Дни доставки
          <input
            className="admin-form__input"
            value={form.deliveryDays}
            onChange={(e) => setField('deliveryDays', e.target.value)}
            placeholder="Вт, Чт, Сб"
          />
        </label>
      </div>

      <div className="admin-form__row">
        <label className="admin-form__label">
          Минимальная сумма заказа (₸)
          <input
            className="admin-form__input"
            type="number"
            min="0"
            value={form.minOrderAmount}
            onChange={(e) => setField('minOrderAmount', e.target.value)}
          />
        </label>
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

      <div className="admin-form__row">
        <label className="admin-form__label">
          Возврат / обмен товара
          <select
            className="admin-form__input"
            value={form.returnPolicy}
            onChange={(e) => setField('returnPolicy', e.target.value)}
          >
            {Object.entries(RETURN_POLICY_LABELS).map(([value, label]) => (
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

      <label className="admin-form__label">
        Комментарий по возврату / обмену
        <textarea
          className="admin-form__input"
          rows={2}
          value={form.returnComment}
          onChange={(e) => setField('returnComment', e.target.value)}
        />
      </label>

      <div className="admin-form__row">
        <label className="admin-form__label">
          Ответственный сотрудник
          <select
            className="admin-form__input"
            value={form.responsibleEmployeeId}
            onChange={(e) => setField('responsibleEmployeeId', e.target.value)}
          >
            <option value="">— Не выбран —</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-form__label">
          Или укажите вручную
          <input
            className="admin-form__input"
            value={form.responsibleEmployeeName}
            onChange={(e) => setField('responsibleEmployeeName', e.target.value)}
            placeholder="ФИО ответственного"
          />
        </label>
      </div>

      <label className="admin-form__label">
        Общий комментарий
        <textarea
          className="admin-form__input"
          rows={3}
          value={form.comment}
          onChange={(e) => setField('comment', e.target.value)}
        />
      </label>

      {error && <p className="admin-form__error">{error}</p>}
    </div>
  )
}
