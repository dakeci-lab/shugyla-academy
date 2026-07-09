import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import AdminSectionContent from '../../../components/admin/AdminSectionContent'
import {
  ACADEMY_MANAGE_NAV,
  ACADEMY_MANAGE_SECTIONS,
} from '../../../platform/academyNav'
import './PlatformAcademyManage.css'

/** Хаб управления Academy — карточки разделов */
export function PlatformAcademyManageHub() {
  return (
    <div className="academy-manage">
      <Link to="/platform/academy" className="academy-manage__back btn btn--ghost btn--sm">
        ← Academy
      </Link>

      <div className="academy-manage__hub-grid">
        {ACADEMY_MANAGE_NAV.map((item) => {
          const meta = ACADEMY_MANAGE_SECTIONS[item.id]
          return (
            <Link
              key={item.id}
              to={`/platform/academy/manage/${item.id}`}
              className="academy-manage__hub-card"
            >
              <h3 className="academy-manage__hub-title">{item.label}</h3>
              <p className="academy-manage__hub-desc">{meta?.description}</p>
              <span className="academy-manage__hub-action">Открыть →</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/** Layout с вкладками для подразделов управления */
export function PlatformAcademyManageLayout() {
  return (
    <div className="academy-manage">
      <Outlet />
    </div>
  )
}

/** Страница конкретного раздела управления */
export function PlatformAcademyManageSection() {
  const { section } = useParams()
  const isValid = ACADEMY_MANAGE_NAV.some((item) => item.id === section)

  if (!isValid) {
    return (
      <div className="academy-manage__invalid">
        <p>Раздел не найден</p>
        <Link to="/platform/academy/manage" className="btn btn--outline">
          К управлению Academy
        </Link>
      </div>
    )
  }

  return (
    <>
      <nav className="academy-manage__tabs" aria-label="Разделы управления Academy">
        <Link to="/platform/academy/manage" className="academy-manage__tabs-back">
          ← Все разделы
        </Link>
        {ACADEMY_MANAGE_NAV.map((item) => (
          <NavLink
            key={item.id}
            to={`/platform/academy/manage/${item.id}`}
            className={({ isActive }) =>
              `academy-manage__tab ${isActive ? 'academy-manage__tab--active' : ''}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="academy-manage__content">
        <AdminSectionContent section={section} />
      </div>
    </>
  )
}
