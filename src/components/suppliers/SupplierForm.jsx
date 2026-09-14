import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  SUPPLIER_STATUS,
  SUPPLIER_STATUS_LABELS,
  formatDeferralDaysTerm,
  parseSupplierWeekdays,
  serializeSupplierWeekdays,
} from '../../utils/supplierData'
import {
  getPaymentAccountName,
  getPaymentAccountsForAssignment,
} from '../../services/paymentAccountsService'
import {
  buildSupplierPaymentSummary,
  formatUmagMoney,
  listPaymentObligationsForSupplier,
} from '../../services/supplierPaymentObligationsService'
import SupplierWeekdaySelector from './SupplierWeekdaySelector'
import '../../components/admin/admin-shared.css'
import './SupplierForm.css'

/**
 * Способ оплаты (счёт из справочника «Счета оплаты») и срок оплаты — две
 * независимые оси: любой счёт можно скомбинировать с любым сроком, включая
 * 0 (сразу). См. docs/suppliers/payment-accounts-module.md.
 */
export function validateSupplierDeferralDays(form) {
  // Empty is allowed → obligation stays in «Требует настройки».
  if (form.deferralDays === '' || form.deferralDays == null) return null
  const days = Number(form.deferralDays)
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    return 'Срок оплаты должен быть целым числом от 0 до 365'
  }
  return null
}

function SupplierPaymentsSummary({ supplierId, form }) {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    if (!supplierId) {
      setSummary(null)
      return
    }
    let cancelled = false
    void listPaymentObligationsForSupplier(supplierId)
      .then((rows) => {
        if (!cancelled) setSummary(buildSupplierPaymentSummary(rows))
      })
      .catch(() => {
        if (!cancelled) setSummary(null)
      })
    return () => {
      cancelled = true
    }
  }, [supplierId])

  if (!supplierId) return null

  return (
    <section className="supplier-form__payments" aria-label="Оплаты">
      <h3 className="supplier-form__payments-title">Оплаты</h3>
      <div className="supplier-form__payments-grid">
        <span>Способ</span>
        <strong>{getPaymentAccountName(form.paymentAccountId) || 'Не настроено'}</strong>
        <span>Срок</span>
        <strong>{formatDeferralDaysTerm(form.deferralDays)}</strong>
        <span>Текущая задолженность</span>
        <strong>{summary ? formatUmagMoney(summary.totalDebt) : '…'}</strong>
        <span>Сегодня к оплате</span>
        <strong>{summary ? formatUmagMoney(summary.dueToday) : '…'}</strong>
        <span>Ближайшие 7 дней</span>
        <strong>{summary ? formatUmagMoney(summary.next7Days) : '…'}</strong>
        <span>Просрочено</span>
        <strong>{summary ? formatUmagMoney(summary.overdue) : '…'}</strong>
      </div>
      <Link className="supplier-form__payments-link" to="/platform/supplier-payments">
        Открыть календарь оплат
      </Link>
    </section>
  )
}

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
  paymentAccountId: '',
  // '0' — same default a brand-new supplier got before this field existed
  // (способ по умолчанию «Наличные», срок настроен — 0 дней), not '' (unconfigured).
  deferralDays: '0',
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
    paymentAccountId: supplier.paymentAccountId || '',
    deferralDays: supplier.deferralDays == null ? '' : String(supplier.deferralDays),
    status: supplier.status || SUPPLIER_STATUS.ACTIVE,
  }
}

function buildVisibleSupplierPayload(form) {
  const orderWeekdays = parseSupplierWeekdays(form.orderWeekdays)
  const deliveryWeekdays = parseSupplierWeekdays(form.deliveryWeekdays)
  const hasDays = form.deferralDays !== '' && form.deferralDays != null
  const days = hasDays ? Number(form.deferralDays) : null
  const validDays = hasDays && Number.isInteger(days) && days >= 0 && days <= 365

  return {
    name: form.name.trim(),
    legalName: form.legalName.trim(),
    managerName: form.managerName.trim(),
    managerPhone: form.managerPhone.trim(),
    orderWeekdays,
    deliveryWeekdays,
    orderDays: serializeSupplierWeekdays(orderWeekdays),
    deliveryDays: serializeSupplierWeekdays(deliveryWeekdays),
    paymentAccountId: form.paymentAccountId || null,
    deferralDays: validDays ? days : null,
    status: form.status,
  }
}

/** Patch для обновления — не затрагивает скрытые поля (категории, WhatsApp и т.д.) */
export function formToSupplierUpdatePayload(form) {
  return buildVisibleSupplierPayload(form)
}

/** @deprecated используйте formToSupplierUpdatePayload */
export function formToSupplierPayload(form) {
  return buildVisibleSupplierPayload(form)
}

/** Форма редактирования поставщика (создание — только через синхронизацию с UMAG) */
function displayOrUnset(value) {
  const text = String(value ?? '').trim()
  return text || 'Не настроено'
}

export default function SupplierForm({
  form,
  onChange,
  error,
  supplierId = null,
  focusSection = null,
}) {
  const umagLocked = Boolean(form.linkedToUmag)
  const paymentTermsRef = useRef(null)
  const [paymentAccounts, setPaymentAccounts] = useState([])

  useEffect(() => {
    let cancelled = false
    void getPaymentAccountsForAssignment(form.paymentAccountId || null)
      .then((accounts) => {
        if (!cancelled) setPaymentAccounts(accounts)
      })
      .catch(() => {
        if (!cancelled) setPaymentAccounts([])
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per opened supplier, not on every keystroke
  }, [supplierId])

  useEffect(() => {
    if (focusSection !== 'payment-terms') return
    const el = paymentTermsRef.current
    if (!el) return
    const scrollTimer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('supplier-form__focus-target')
    }, 80)
    const clearTimer = window.setTimeout(() => {
      el.classList.remove('supplier-form__focus-target')
    }, 2600)
    return () => {
      window.clearTimeout(scrollTimer)
      window.clearTimeout(clearTimer)
      el.classList.remove('supplier-form__focus-target')
    }
  }, [focusSection])

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
          Не связан с UMAG. Для участия в синхронизации поставщик должен быть создан или связан в
          UMAG.
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

      <div
        ref={paymentTermsRef}
        id="supplier-payment-terms"
        className="supplier-form__payment-terms"
      >
        <div className="admin-form__row">
          <label className="admin-form__label">
            Способ оплаты
            <select
              className="admin-form__input"
              value={form.paymentAccountId || ''}
              onChange={(e) => setField('paymentAccountId', e.target.value)}
            >
              <option value="">Не выбрано</option>
              {paymentAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-form__label">
            Срок оплаты (дней)
            <input
              className="admin-form__input"
              type="number"
              min="0"
              max="365"
              step="1"
              placeholder="Не настроено"
              value={form.deferralDays}
              onChange={(e) => setField('deferralDays', e.target.value)}
            />
          </label>
        </div>
        <p className="admin-form__hint">
          Способ и срок настраиваются независимо друг от друга. 0 — оплата сразу при поступлении
          товара.
        </p>
        <div className="admin-form__row">
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
      </div>

      <SupplierPaymentsSummary supplierId={supplierId} form={form} />

      {error && <p className="admin-form__error">{error}</p>}
    </div>
  )
}
