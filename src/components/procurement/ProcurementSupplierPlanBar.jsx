import { formatPurchaseAmount } from '../../utils/purchaseData'
import { ORDER_LABELS } from '../../config/documentLabels'
import './ProcurementSupplierPlanBar.css'

const BASIS_NOTE = {
  default_cycle: 'Дни заказа и доставки не заполнены — цикл 7 дней. Заполните их в карточке поставщика («Расчёты»).',
  order_days_only: 'Дни доставки не заполнены — срок доставки 1 день. Заполните их в карточке поставщика («Расчёты»).',
}

const WEEKDAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

/** «вс, 25.10.2026» — the native date picker follows the device language, so the date is also spelled out in Russian. */
function formatDay(dateKey) {
  if (!dateKey) return ''
  const [y, m, d] = String(dateKey).split('-')
  if (!(d && m && y)) return String(dateKey)
  const weekday = WEEKDAYS_RU[new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay()]
  return `${weekday}, ${d}.${m}.${y}`
}

/**
 * Plan of the selected supplier: when the goods must arrive, how many days a delivery has to last, safety days,
 * «skip a visit». Every change is recomputed on the server (procurement_plan_supplier) and the table reloads.
 */
export default function ProcurementSupplierPlanBar({ plan, supplierName, disabled = false, saving = false, onChange }) {
  if (!plan) return null
  const note = BASIS_NOTE[plan.basis] || ''
  const baseCycle = plan.skipCycles > 0 ? Math.round(plan.cycleDays / (1 + plan.skipCycles)) : plan.cycleDays
  const min = plan.minOrderAmount
  const short = min > 0 && plan.orderTotal < min ? min - plan.orderTotal : 0
  const busy = disabled || saving

  return (
    <section className="proc-plan-bar" aria-label={`План поставки: ${supplierName || ''}`}>
      <div className="proc-plan-bar__row">
        <label className="proc-plan-bar__field">
          <span>{ORDER_LABELS.delivery}</span>
          <input
            type="date"
            lang="ru"
            value={plan.deliveryDate || ''}
            min={plan.today || undefined}
            disabled={busy}
            onChange={(event) => event.target.value && onChange({ deliveryDate: event.target.value })}
          />
          <b className="proc-plan-bar__date-ru">{formatDay(plan.deliveryDate)}</b>
        </label>
        {plan.deliveryDateIsCustom ? (
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onChange({ deliveryDate: null })}>
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
      </div>
      <p className="proc-plan-bar__target">
        Цель запаса <b>{plan.targetDays} дн.</b> = {plan.leadDays} до поставки + {plan.cycleDays} цикл + {plan.safetyDays} запас
      </p>
      {note ? <p className="proc-plan-bar__note proc-plan-bar__note--warn">{note}</p> : null}
      {min > 0 ? (
        <p className={`proc-plan-bar__note${short > 0 ? ' proc-plan-bar__note--warn' : ''}`}>
          Минимальная сумма заказа {formatPurchaseAmount(min)}
          {short > 0 ? ` · до минимума не хватает ${formatPurchaseAmount(short)}` : ' · набрана'}
        </p>
      ) : null}
      <span className="proc-plan-bar__sr" aria-live="polite">{saving ? 'Пересчёт…' : `Поставка ${formatDay(plan.deliveryDate)}`}</span>
    </section>
  )
}
