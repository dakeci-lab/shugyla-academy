import { Link } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { canManageAdmin } from '../../utils/auth'
import './PlatformAcademy.css'

const ACADEMY_LINKS = [
  {
    title: 'Мой кабинет',
    description: 'Прогресс, назначенные курсы, маршруты, тесты и стандарты.',
    to: '/platform/academy/cabinet',
  },
  {
    title: 'Каталог курсов',
    description: 'Доступные обучающие материалы Shugyla Academy.',
    to: '/platform/academy/catalog',
  },
]

/** Раздел Academy — хаб внутри платформы */
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
            to: '/platform/academy/manage',
          },
        ]
      : []),
  ]

  return (
    <div className="platform-academy">
      <div className="platform-academy__grid">
        {links.map((item) => (
          <Link key={item.to} to={item.to} className="platform-academy__card">
            <h3 className="platform-academy__title">{item.title}</h3>
            <p className="platform-academy__desc">{item.description}</p>
            <span className="platform-academy__action">Открыть →</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
