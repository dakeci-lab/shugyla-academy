import { getOverviewStats } from '../../../utils/adminStats'
import StatCard from '../StatCard'
import MigrateToCloudPanel from '../MigrateToCloudPanel'
import '../admin-shared.css'

/** Раздел «Обзор» — сводные карточки статистики */
export default function OverviewSection() {
  const stats = getOverviewStats()

  return (
    <div className="admin-overview">
      <MigrateToCloudPanel />

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
    </div>
  )
}
