import { Link } from 'react-router-dom'
import { getUser } from '../utils/storage'
import './Header.css'

/**
 * Шапка сайта — логотип и кнопка входа / профиль
 */
export default function Header() {
  const user = getUser()

  return (
    <header className="header">
      <div className="header__inner container">
        <Link to="/academy" className="header__logo">
          <span className="header__logo-icon">S</span>
          <span className="header__logo-text">
            Shugyla <strong>Academy</strong>
          </span>
        </Link>

        <nav className="header__nav">
          {user ? (
            <>
              {user.role === 'admin' && (
                <Link to="/admin" className="header__link">
                  Админ-панель
                </Link>
              )}
              <Link to="/dashboard" className="header__link">
                {user.name}
              </Link>
            </>
          ) : (
            <Link to="/login" className="btn btn--outline btn--sm">
              Войти
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
