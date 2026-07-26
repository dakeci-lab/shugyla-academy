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
  bin: '',
  umagPhone: '',
  actualAddress: '',
  legalAddress: '',
  linkedToUmag: false,
  isUmagActive: null,
  umagSupplierId: null,
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
    bin: supplier.bin || '',
    umagPhone: supplier.umagPhone || '',
    actualAddress: supplier.actualAddress || '',
    legalAddress: supplier.legalAddress || '',
    linkedToUmag: Boolean(supplier.linkedToUmag),
    isUmagActive: supplier.isUmagActive,
    umagSupplierId: supplier.umagSupplierId ?? null,
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
function displayOrUnset(value) {
  const text = String(value ?? '').trim()
  return text || 'Не настроено'
}

export default function SupplierForm({ form, onChange, error, isCreate = false }) {
  const showDeferral =
    form.paymentType === PAYMENT_TYPE.DEFERRAL || form.paymentType === PAYMENT_TYPE.MIXED
  const umagLocked = Boolean(form.linkedToUmag)

  function setField(field, value) {
    onChange({ ...form, [field]: value })
  }

  return (
    <div className="supplier-form admin-form">
      {umagLocked ? (
        <div className="supplier-form__umag-badge" role="status">
          Синхронизировано с UMAG
          {form.isUmagActive === false ? ' · неактивен в UMAG' : ''}
          {form.umagSupplierId != null ? ` · ID ${form.umagSupplierId}` : ''}
        </div>
      ) : (
        <div className="supplier-form__local-hint" role="note">
          {isCreate ? (
            <>
              Рекомендуемый процесс: создайте контрагента в UMAG и синхронизируйте — он появится в
              основном списке. Ручное создание будет без связи с UMAG.
            </>
          ) : (
            <>
              Не связан с UMAG. Для участия в синхронизации поставщик должен быть создан или связан в
              UMAG.
            </>
          )}
        </div>
      )}

      {umagLocked ? <h3 className="supplier-form__section-title">Данные UMAG</h3> : null}

      <div className="admin-form__row">
        <label className="admin-form__label">
          Название поставщика *
          <input
            className="admin-form__input"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            required
            readOnly={umagLocked}
          />
        </label>
        <label className="admin-form__label">
          Юридическое название
          <input
            className="admin-form__input"
            value={form.legalName}
            onChange={(e) => setField('legalName', e.target.value)}
            readOnly={umagLocked}
          />
        </label>
      </div>

      {umagLocked ? (
        <>
          <div className="admin-form__row">
            <label className="admin-form__label">
              БИН
              <input className="admin-form__input" value={displayOrUnset(form.bin)} readOnly />
            </label>
            <label className="admin-form__label">
              Телефон (UMAG)
              <input className="admin-form__input" value={displayOrUnset(form.umagPhone)} readOnly />
            </label>
          </div>
          <div className="admin-form__row">
            <label className="admin-form__label">
              Фактический адрес
              <input
                className="admin-form__input"
                value={displayOrUnset(form.actualAddress)}
                readOnly
              />
            </label>
            <label className="admin-form__label">
              Юридический адрес
              <input
                className="admin-form__input"
                value={displayOrUnset(form.legalAddress)}
                readOnly
              />
            </label>
          </div>
        </>
      ) : null}

      <h3 className="supplier-form__section-title">Наши настройки</h3>

      <div className="admin-form__row">
        <label className="admin-form__label">
          Имя менеджера
          <input
            className="admin-form__input"
            value={form.managerName}
            onChange={(e) => setField('managerName', e.target.value)}
            placeholder={umagLocked ? 'Не настроено' : undefined}
          />
        </label>
        <label className="admin-form__label">
          Телефон менеджера
          <input
            className="admin-form__input"
            type="tel"
            value={form.managerPhone}
            onChange={(e) => setField('managerPhone', e.target.value)}
            placeholder={umagLocked ? 'Не настроено' : undefined}
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
