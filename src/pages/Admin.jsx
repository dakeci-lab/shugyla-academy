import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUser, clearUser, getProgress } from '../utils/storage'
import { USERS } from '../data/users'
import { COURSES } from '../data/courses'
import { TESTS } from '../data/tests'
import Sidebar from '../components/Sidebar'
import './Admin.css'

/** Заглушки для каждой вкладки админ-панели */
const TAB_CONTENT = {
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
 * Админ-панель — /admin
 * Доступна только пользователям с ролью admin
 */
export default function Admin() {
  const navigate = useNavigate()
  const user = getUser()
  const [activeTab, setActiveTab] = useState('overview')

  const progress = getProgress()
  const tab = TAB_CONTENT[activeTab]

  function handleLogout() {
    clearUser()
    navigate('/academy')
  }

  return (
    <div className="admin-page">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="admin-page__content">
        <header className="admin-page__header">
          <div>
            <h1 className="admin-page__title">{tab.title}</h1>
            <p className="admin-page__desc">{tab.description}</p>
          </div>
          <div className="admin-page__user">
            <span>{user?.name}</span>
            <button className="btn btn--outline btn--sm" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        </header>

        <div className="admin-page__body">
          {/* Вкладка «Обзор» — показываем реальную статистику из mock data */}
          {activeTab === 'overview' && (
            <div className="admin-page__stats">
              <div className="admin-page__stat-card">
                <span className="admin-page__stat-value">{USERS.length}</span>
                <span className="admin-page__stat-label">Сотрудников</span>
              </div>
              <div className="admin-page__stat-card">
                <span className="admin-page__stat-value">{COURSES.length}</span>
                <span className="admin-page__stat-label">Курсов</span>
              </div>
              <div className="admin-page__stat-card">
                <span className="admin-page__stat-value">{TESTS.length}</span>
                <span className="admin-page__stat-label">Тестов</span>
              </div>
              <div className="admin-page__stat-card">
                <span className="admin-page__stat-value">
                  {Object.keys(progress).length}
                </span>
                <span className="admin-page__stat-label">Активных учеников</span>
              </div>
            </div>
          )}

          {/* Вкладка «Сотрудники» — список из mock data */}
          {activeTab === 'employees' && (
            <table className="admin-page__table">
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Логин</th>
                  <th>Роль</th>
                </tr>
              </thead>
              <tbody>
                {USERS.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.login}</td>
                    <td>
                      <span className="admin-page__badge">{u.role}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Вкладка «Курсы» — список курсов */}
          {activeTab === 'courses' && (
            <div className="admin-page__list">
              {COURSES.map((course) => (
                <div key={course.id} className="admin-page__list-item">
                  <div>
                    <strong>{course.title}</strong>
                    <span className="admin-page__list-meta">
                      {course.lessonsCount} уроков · {course.duration}
                    </span>
                  </div>
                  <span className="admin-page__badge">{course.category}</span>
                </div>
              ))}
            </div>
          )}

          {/* Остальные вкладки — заглушки */}
          {!['overview', 'employees', 'courses'].includes(activeTab) && (
            <div className="admin-page__placeholder">
              <span className="admin-page__placeholder-icon">🚧</span>
              <p>Раздел «{tab.title}» будет доступен в следующей версии.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
