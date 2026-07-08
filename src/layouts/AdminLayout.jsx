import Sidebar from '../components/Sidebar'
import DataModeBadge from '../components/admin/DataModeBadge'
import './AdminLayout.css'

/** Метаданные разделов админ-панели */
export const ADMIN_SECTIONS = {
  overview: {
    title: 'Обзор',
    description: 'Сводная информация по обучению сотрудников.',
  },
  employees: {
    title: 'Сотрудники',
    description: 'Управление сотрудниками, назначение ролей и курсов.',
  },
  courses: {
    title: 'Курсы',
    description: 'Создание и редактирование учебных курсов.',
  },
  tests: {
    title: 'Тесты',
    description: 'Управление тестами и вопросами для аттестации.',
  },
  certification: {
    title: 'Аттестация',
    description: 'Результаты аттестации и выдача сертификатов.',
  },
  progress: {
    title: 'Прогресс',
    description: 'Отслеживание прогресса обучения по сотрудникам.',
  },
}

/**
 * Layout админ-панели:
 * - левое боковое меню
 * - верхняя панель с названием раздела
 * - основной контент
 */
export default function AdminLayout({
  activeTab,
  onTabChange,
  userName,
  onLogout,
  children,
}) {
  const section = ADMIN_SECTIONS[activeTab]

  return (
    <div className="admin-layout">
      <Sidebar activeTab={activeTab} onTabChange={onTabChange} />

      <div className="admin-layout__main">
        <header className="admin-layout__topbar">
          <div className="admin-layout__topbar-info">
            <div className="admin-layout__title-row">
              <h1 className="admin-layout__title">{section.title}</h1>
              <DataModeBadge />
            </div>
            <p className="admin-layout__desc">{section.description}</p>
          </div>
          <div className="admin-layout__topbar-user">
            <span className="admin-layout__user-name">{userName}</span>
            <button type="button" className="btn btn--outline btn--sm" onClick={onLogout}>
              Выйти
            </button>
          </div>
        </header>

        <div className="admin-layout__content">
          {children}
        </div>
      </div>
    </div>
  )
}
