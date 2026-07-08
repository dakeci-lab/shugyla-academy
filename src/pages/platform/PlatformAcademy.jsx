import { Link } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { canManageAdmin } from '../../utils/auth'
import './PlatformAcademy.css'

const ACADEMY_LINKS = [
  {
    title: 'Мой кабинет',
    description: 'Назначенные курсы, прогресс обучения и аттестация.',
    to: '/dashboard',
    icon: '👤',
  },
  {
    title: 'Каталог курсов',
    description: 'Публичный каталог обучающих материалов Shugyla Academy.',
    to: '/academy',
    icon: '📖',
  },
]

/** Раздел Academy внутри платформы */
export default function PlatformAcademy() {
  const { user } = useSession()
  const isAdmin = canManageAdmin(user?.role)

  const links = [
    ...ACADEMY_LINKS,
    ...(isAdmin
      ? [
          {
            title: 'Управление Academy',
            description: 'Курсы, тесты, маршруты, найм и прогресс сотрудников.',
            to: '/admin',
            icon: '⚙',
          },
        ]
      : []),
  ]

  return (
    <div className="platform-academy">
      <p className="platform-academy__intro">
        Модуль обучения Shugyla Academy — курсы, тесты, аттестация и обучающие маршруты.
        Вся текущая логика обучения сохранена.
      </p>

      <div className="platform-academy__grid">
        {links.map((item) => (
          <Link key={item.to} to={item.to} className="platform-academy__card">
            <span className="platform-academy__icon" aria-hidden="true">
              {item.icon}
            </span>
            <h3 className="platform-academy__title">{item.title}</h3>
            <p className="platform-academy__desc">{item.description}</p>
            <span className="platform-academy__action">Открыть →</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
