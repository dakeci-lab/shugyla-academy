import { Link } from 'react-router-dom'
import { getUser } from '../utils/storage'
import { useLanguage } from '../context/LanguageContext'
import LangSwitch from './LangSwitch'
import './Header.css'

/**
 * Фиксированная шапка — логотип слева, действия справа
 * variant="landing" — полная навигация для главной страницы
 */
export default function Header({ variant = 'default' }) {
  const user = getUser()
  const { t } = useLanguage()

  return (
    <header className={`header ${variant === 'landing' ? 'header--landing' : ''}`}>
      <div className="header__inner container">
        <Link to="/academy" className="header__logo">
          <span className="header__logo-icon">S</span>
          <span className="header__logo-text">
            Shugyla <strong>Academy</strong>
          </span>
        </Link>

        <nav className="header__nav">
          {variant === 'landing' && (
            <>
              <a href="mailto:academy@shugyla.kz" className="header__link header__link--contact">
                {t.contact}
              </a>
              <LangSwitch />
            </>
          )}

          {user ? (
            <>
              {user.role === 'admin' && (
                <Link to="/admin" className="header__link">
                  {t.adminPanel}
                </Link>
              )}
              <Link to="/dashboard" className="header__link header__user">
                {user.name}
              </Link>
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
