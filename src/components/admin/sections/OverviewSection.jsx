import { getOverviewStats, CERTIFICATION_LABELS } from '../../../utils/adminStats'
import StatCard from '../StatCard'
import '../admin-shared.css'

const CERT_VARIANTS = {
  not_started: 'idle',
  in_progress: 'progress',
  passed: 'success',
  failed: 'warning',
}

/** Раздел «Обзор» — сводные карточки статистики */
export default function OverviewSection() {
  const stats = getOverviewStats()

  return (
    <div className="admin-overview">
      <div className="admin-stats-grid admin-stats-grid--overview">
        <StatCard
          icon="👥"
          value={stats.totalEmployees}
          label="Всего сотрудников"
          hint="Без учёта admin"
        />
        <StatCard
          icon="📚"
          value={stats.totalCourses}
          label="Всего курсов"
          hint="Опубликованные и черновики"
        />
        <StatCard
          icon="✅"
          value={stats.completedTraining}
          label="Прошли обучение"
          variant="success"
          hint="100% уроков по всем курсам"
        />
        <StatCard
          icon="⏳"
          value={stats.notCompletedTraining}
          label="Не завершили обучение"
          variant="warning"
          hint="Ещё не прошли все уроки"
        />
        <StatCard
          icon="📈"
          value={`${stats.averageProgress}%`}
          label="Средний прогресс"
          variant="info"
          hint={`${stats.activeLearners} сотрудников начали обучение`}
          wide
        />
      </div>

      <section className="admin-panel-card">
        <div className="admin-panel-card__header">
          <h2 className="admin-panel-card__title">Аттестация — сводка</h2>
          <p className="admin-panel-card__desc">
            Статусы по итоговым тестам сотрудников
          </p>
        </div>
        <div className="admin-cert-grid">
          {Object.entries(stats.certification).map(([key, count]) => (
            <div key={key} className={`admin-cert-item admin-cert-item--${CERT_VARIANTS[key]}`}>
              <span className="admin-cert-item__value">{count}</span>
              <span className="admin-cert-item__label">{CERTIFICATION_LABELS[key]}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
