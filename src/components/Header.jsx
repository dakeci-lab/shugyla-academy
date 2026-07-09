import { Link, useNavigate } from 'react-router-dom'
import { canManageAdmin } from '../utils/auth'
import { useSession } from '../context/SessionContext'
import { useLanguage } from '../context/LanguageContext'
import LangSwitch from './LangSwitch'
import './Header.css'

/**
 * Фиксированная шапка — логотип слева, действия справа
 * variant="landing" — полная навигация для главной страницы
 */
export default function Header({ variant = 'default' }) {
  const { user, logout } = useSession()
  const navigate = useNavigate()
  const { t } = useLanguage()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const logoTo = user ? '/platform' : variant === 'landing' ? '/vacancies' : '/platform'

  return (
    <header className={`header ${variant === 'landing' ? 'header--landing' : ''}`}>
      <div className="header__inner container">
        <Link to={logoTo} className="header__logo">
          <span className="header__logo-icon">S</span>
          <span className="header__logo-text">
            Shugyla <strong>Platform</strong>
          </span>
        </Link>

        <nav className="header__nav">
          {variant === 'landing' && (
            <>
              <Link to="/vacancies" className="header__link">
                Вакансии
              </Link>
              <a href="mailto:academy@shugyla.kz" className="header__link header__link--contact">
                {t.contact}
              </a>
              <LangSwitch />
            </>
          )}

          {user ? (
            <>
              <Link to="/platform" className="header__link">
                Платформа
              </Link>
              {canManageAdmin(user.role) && (
                <Link to="/admin" className="header__link">
                  {t.adminPanel}
                </Link>
              )}
              <Link to="/standards" className="header__link">
                Стандарты
              </Link>
              <Link to="/profile" className="header__link">
                Профиль
              </Link>
              <Link to="/dashboard" className="header__link header__user">
                {user.name}
              </Link>
              <button
                type="button"
                className="btn btn--outline btn--sm header__logout"
                onClick={handleLogout}
              >
                Выйти
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn--primary btn--sm">
              {t.login}
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
