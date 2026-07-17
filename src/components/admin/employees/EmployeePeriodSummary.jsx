import { formatMonthYearLabel } from '../../../utils/shiftData'
import {
  formatWorkedHoursLabel,
  summarizeEmployeePeriod,
} from '../../../utils/employeePeriodSummary'
import './EmployeePeriodSummary.css'

function StatCard({ label, value, loading }) {
  return (
    <div className="employee-period-summary__card">
      <p className="employee-period-summary__label">{label}</p>
      <p className="employee-period-summary__value">
        {loading ? (
          <span className="employee-period-summary__skeleton" aria-hidden="true" />
        ) : (
          value
        )}
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
  rating = null,
  ratingLoading = false,
  showRating = false,
}) {
  const stats = summarizeEmployeePeriod(shifts)
  const periodLabel =
    year && month ? formatMonthYearLabel(year, month) : 'выбранный период'

  const ratingValue =
    !showRating || ratingLoading
      ? null
      : rating == null || Number.isNaN(Number(rating))
        ? '—'
        : String(rating)

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
        {showRating && (
          <StatCard
            label="Рейтинг"
            value={ratingValue ?? '—'}
            loading={loading || ratingLoading}
          />
        )}
      </div>
    </section>
  )
}
