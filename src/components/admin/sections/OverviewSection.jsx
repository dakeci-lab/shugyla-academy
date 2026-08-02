import { getOverviewStats } from '../../../utils/adminStats'
import StatCard from '../StatCard'
import MigrateToCloudPanel from '../MigrateToCloudPanel'
import '../admin-shared.css'

/** Раздел «Обзор» — сводные карточки (без Academy Learning). */
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
      </div>
    </div>
  )
}
