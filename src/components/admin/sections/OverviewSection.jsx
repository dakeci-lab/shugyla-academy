import { getOverviewStats } from '../../../utils/adminStats'
import StatCard from '../StatCard'
import '../admin-shared.css'

/** Раздел «Обзор» — сводные карточки статистики */
export default function OverviewSection() {
  const stats = getOverviewStats()

  return (
    <div className="admin-stats-grid">
      <StatCard
        icon="👥"
        value={stats.totalEmployees}
        label="Всего сотрудников"
      />
      <StatCard
        icon="📚"
        value={stats.totalCourses}
        label="Всего курсов"
      />
      <StatCard
        icon="✅"
        value={stats.completedTraining}
        label="Прошли обучение"
        variant="success"
      />
      <StatCard
        icon="⏳"
        value={stats.notCompletedTraining}
        label="Не завершили обучение"
        variant="warning"
      />
      <StatCard
        icon="📈"
        value={`${stats.averageProgress}%`}
        label="Средний прогресс"
        variant="info"
      />
    </div>
  )
}
