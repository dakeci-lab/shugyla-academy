import { formatMonthYearLabel } from '../../../utils/shiftData'
import {
  formatWorkedHoursLabel,
  summarizeEmployeePeriod,
} from '../../../utils/employeePeriodSummary'
import { SkeletonPrimitive } from '../../loading/LoadingSkeleton'
import './EmployeePeriodSummary.css'

function StatCard({ label, value, loading }) {
  return (
    <div className="employee-period-summary__card">
      <p className="employee-period-summary__label">{label}</p>
      <p className="employee-period-summary__value">
        {loading ? <SkeletonPrimitive className="employee-period-summary__skeleton" /> : value}
      </p>
    </div>
  )
}

/** Краткая статистика сотрудника за выбранный месяц графика */
export default function EmployeePeriodSummary({
  year,
  month,
  shifts = [],
  loading = false,
}) {
  const stats = summarizeEmployeePeriod(shifts, { year, month })
  const periodLabel =
    year && month ? formatMonthYearLabel(year, month) : 'выбранный период'

  return (
    <section className="employee-period-summary" aria-label={`Статистика за ${periodLabel}`}>
      <h2 className="employee-period-summary__title">За {periodLabel}</h2>
      <div className="employee-period-summary__grid">
        <StatCard
          label="Рабочие часы"
          value={formatWorkedHoursLabel(stats.workedHours)}
          loading={loading}
        />
        <StatCard
          label="Смены"
          value={String(stats.completedShifts)}
          loading={loading}
        />
        <StatCard
          label="Опоздания"
          value={String(stats.lateCount)}
          loading={loading}
        />
        <StatCard
          label="Ранние уходы"
          value={String(stats.earlyLeaveCount)}
          loading={loading}
        />
      </div>
    </section>
  )
}
