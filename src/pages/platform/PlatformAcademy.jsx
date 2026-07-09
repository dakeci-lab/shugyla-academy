import { Link } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { canManageAcademy } from '../../config/permissions'
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
  const isAdmin = canManageAcademy(user)

  const adminLinks = isAdmin
    ? [
        {
          title: 'Назначение обучения',
          description:
            'Здесь администратор сможет назначать сотрудникам курсы, маршруты и тесты.',
          soon: true,
        },
        {
          title: 'Управление Academy',
          description: 'Курсы, тесты, маршруты, найм и прогресс сотрудников.',
          to: '/platform/academy/manage',
        },
      ]
    : []

  const links = [...ACADEMY_LINKS, ...adminLinks]

  return (
    <div className="platform-academy">
      <div className="platform-academy__grid">
        {links.map((item) =>
          item.soon ? (
            <article
              key={item.title}
              className="platform-academy__card platform-academy__card--soon"
            >
              <h3 className="platform-academy__title">{item.title}</h3>
              <p className="platform-academy__desc">{item.description}</p>
              <span className="platform-academy__badge">Скоро</span>
            </article>
          ) : (
            <Link key={item.to} to={item.to} className="platform-academy__card">
              <h3 className="platform-academy__title">{item.title}</h3>
              <p className="platform-academy__desc">{item.description}</p>
              <span className="platform-academy__action">Открыть →</span>
            </Link>
          )
        )}
      </div>
    </div>
  )
}
