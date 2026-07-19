import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import StatCard from '../../components/admin/StatCard'
import { getOverviewStats } from '../../utils/adminStats'
import { getActiveSuppliersCount } from '../../utils/supplierData'
import { isCloudMode, getDataModeLabel } from '../../lib/dataMode'
import { isModuleReady } from '../../lib/cloudStore'
import { useAcademyData } from '../../context/AcademyDataContext'
import { isAcademyModuleEnabled } from '../../config/featureFlags'
import '../../components/admin/admin-shared.css'
import './PlatformDashboard.css'

function formatStatValue(ready, value) {
  if (!ready) return '…'
  return value
}

/** Панель управления Shugyla Platform */
export default function PlatformDashboard() {
  const { ensureModules, version } = useAcademyData()
  const cloudMode = isCloudMode()

  const academyOn = isAcademyModuleEnabled()

  useEffect(() => {
    if (!cloudMode) return
    const modules = academyOn
      ? ['employees', 'courses', 'suppliers']
      : ['suppliers']
    void ensureModules(modules)
  }, [cloudMode, ensureModules, academyOn])

  void version

  const employeesReady = !cloudMode || isModuleReady('employees')
  const coursesReady = !cloudMode || isModuleReady('courses')
  const suppliersReady = !cloudMode || isModuleReady('suppliers')

  const stats =
    employeesReady && (!academyOn || coursesReady)
      ? getOverviewStats()
      : {
          totalEmployees: 0,
          totalCourses: 0,
        }
  const activeSuppliers = suppliersReady ? getActiveSuppliersCount() : 0

  const cards = [
    {
      icon: '👥',
      value: formatStatValue(employeesReady, stats.totalEmployees),
      label: 'Сотрудники',
      hint: employeesReady ? 'Работающие сотрудники магазина' : 'Загрузка…',
      to: '/platform/employees',
      variant: 'default',
    },
    ...(academyOn
      ? [
          {
            icon: '📚',
            value: formatStatValue(coursesReady, stats.totalCourses),
            label: 'Курсы',
            hint: coursesReady ? 'Курсы в модуле Academy' : 'Загрузка…',
            to: '/platform/academy',
            variant: 'info',
          },
        ]
      : []),
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
      value: formatStatValue(suppliersReady, activeSuppliers),
      label: 'Поставщики',
      hint: suppliersReady ? 'Активные поставщики' : 'Загрузка…',
      to: '/platform/suppliers',
      variant: 'default',
    },
    {
      icon: '⇄',
      value: '—',
      label: 'Активные закупы',
      hint: 'Откройте раздел закупа',
      to: '/platform/procurement',
      variant: 'warning',
    },
    {
      icon: '↧',
      value: '—',
      label: 'Ожидаемые приёмки',
      hint: 'Откройте раздел приёмки',
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
