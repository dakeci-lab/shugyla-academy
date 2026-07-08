import { Link } from 'react-router-dom'
import StatCard from '../../components/admin/StatCard'
import { getOverviewStats } from '../../utils/adminStats'
import { isCloudMode, getDataModeLabel } from '../../lib/dataMode'
import '../../components/admin/admin-shared.css'
import './PlatformDashboard.css'

/** Панель управления Shugyla Platform */
export default function PlatformDashboard() {
  const stats = getOverviewStats()
  const cloudMode = isCloudMode()

  const cards = [
    {
      icon: '👥',
      value: stats.totalEmployees,
      label: 'Сотрудники',
      hint: 'Активные сотрудники магазина',
      to: '/platform/employees',
      variant: 'default',
    },
    {
      icon: '📚',
      value: stats.totalCourses,
      label: 'Курсы',
      hint: 'Курсы в модуле Academy',
      to: '/platform/academy',
      variant: 'info',
    },
    {
      icon: '▦',
      value: '—',
      label: 'Товары',
      hint: 'Каталог товаров — скоро',
      to: '/platform/products',
      variant: 'default',
    },
    {
      icon: '◫',
      value: '—',
      label: 'Поставщики',
      hint: 'База поставщиков — скоро',
      to: '/platform/suppliers',
      variant: 'default',
    },
    {
      icon: '⇄',
      value: 0,
      label: 'Активные закупы',
      hint: 'Закупки в работе',
      to: '/platform/procurement',
      variant: 'warning',
    },
    {
      icon: '↧',
      value: 0,
      label: 'Ожидаемые приёмки',
      hint: 'Поставки к приёмке',
      to: '/platform/receiving',
      variant: 'warning',
    },
    {
      icon: cloudMode ? '☁️' : '💾',
      value: cloudMode ? 'Online' : 'Local',
      label: 'Статус Supabase',
      hint: getDataModeLabel(),
      to: '/platform/settings',
      variant: cloudMode ? 'success' : 'warning',
      wide: true,
    },
  ]

  return (
    <div className="platform-dashboard">
      <p className="platform-dashboard__intro">
        Добро пожаловать в Shugyla Platform — единую внутреннюю систему для работы магазина.
      </p>

      <div className="admin-stats-grid admin-stats-grid--overview">
        {cards.map((card) => (
          <Link key={card.label} to={card.to} className="platform-dashboard__card-link">
            <StatCard
              icon={card.icon}
              value={card.value}
              label={card.label}
              hint={card.hint}
              variant={card.variant}
              wide={card.wide}
            />
          </Link>
        ))}
      </div>
    </div>
  )
}
