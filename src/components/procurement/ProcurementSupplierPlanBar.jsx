import { formatPurchaseAmount } from '../../utils/purchaseData'
import { ORDER_LABELS } from '../../config/documentLabels'
import DocumentDateBox from './document/DocumentDateBox'
import './ProcurementSupplierPlanBar.css'

const BASIS_NOTE = {
  default_cycle: 'Дни заказа и доставки не заполнены — цикл 7 дней. Заполните их в карточке поставщика («Расчёты»).',
  order_days_only: 'Дни доставки не заполнены — срок доставки 1 день. Заполните их в карточке поставщика («Расчёты»).',
}

/**
 * Plan of the selected supplier: when the goods must arrive, how many days a delivery has to last, safety days,
 * «skip a visit». Every change is recomputed on the server (procurement_plan_supplier) and the table reloads.
 */
export default function ProcurementSupplierPlanBar({
  plan,
  supplierName,
  disabled = false,
  saving = false,
  showMinimum = true,
  onChange,
}) {
  if (!plan) return null
  const note = BASIS_NOTE[plan.basis] || ''
  const baseCycle = plan.skipCycles > 0 ? Math.round(plan.cycleDays / (1 + plan.skipCycles)) : plan.cycleDays
  const min = plan.minOrderAmount
  const short = min > 0 && plan.orderTotal < min ? min - plan.orderTotal : 0
  const busy = disabled || saving

  return (
    <section className="proc-plan-bar" aria-label={`План поставки: ${supplierName || ''}`}>
      <div className="proc-plan-bar__row">
        <div className="proc-plan-bar__field">
          <span>{ORDER_LABELS.delivery}</span>
          <DocumentDateBox
            value={plan.deliveryDate || ''}
            disabled={busy}
            label={ORDER_LABELS.delivery}
            onChange={(value) => value && onChange({ deliveryDate: value })}
          />
        </div>
        {plan.deliveryDateIsCustom ? (
          <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => onChange({ deliveryDate: null })}>
            По графику
          </button>
        ) : null}
        <div className="proc-plan-bar__field">
          <span>Запас, дн.</span>
          <div className="proc-plan-bar__stepper">
            <button type="button" aria-label="Меньше" disabled={busy || plan.safetyDays <= 0} onClick={() => onChange({ safetyDays: plan.safetyDays - 1 })}>
              −
            </button>
            <b>{plan.safetyDays}</b>
            <button type="button" aria-label="Больше" disabled={busy || plan.safetyDays >= 30} onClick={() => onChange({ safetyDays: plan.safetyDays + 1 })}>
              +
            </button>
          </div>
        </div>
        <label className="proc-plan-bar__check">
          <input
            type="checkbox"
            checked={plan.skipCycles > 0}
            disabled={busy}
            onChange={(event) => onChange({ skipCycles: event.target.checked ? 1 : 0 })}
          />
          <span>Пропускаем визит (+{baseCycle} дн.)</span>
        </label>
        <span className="proc-plan-bar__spacer" />
        <p
          className="proc-plan-bar__target"
          title={`${plan.leadDays} до поставки + ${plan.cycleDays} цикл + ${plan.safetyDays} запас`}
        >
          Цель запаса <b>{plan.targetDays} дн.</b>
        </p>
      </div>
      {note ? <p className="proc-plan-bar__note proc-plan-bar__note--warn">{note}</p> : null}
      {showMinimum && min > 0 ? (
        <p className={`proc-plan-bar__note${short > 0 ? ' proc-plan-bar__note--warn' : ''}`}>
          Минимальная сумма заказа {formatPurchaseAmount(min)}
          {short > 0 ? ` · до минимума не хватает ${formatPurchaseAmount(short)}` : ' · набрана'}
        </p>
      ) : null}
      <span className="proc-plan-bar__sr" aria-live="polite">{saving ? 'Пересчёт…' : `Цель запаса ${plan.targetDays} дн.`}</span>
    </section>
  )
}
