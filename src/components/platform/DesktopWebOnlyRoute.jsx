import { Link, Outlet } from 'react-router-dom'
import useMediaQuery from '../../hooks/useMediaQuery'
import {
  DESKTOP_WEB_ONLY_MESSAGE,
  DESKTOP_WEB_VIEWPORT_QUERY,
  isDesktopWebOnlyBlocked,
} from '../../platform/desktopWebOnly'
import './DesktopWebOnlyRoute.css'

/**
 * Desktop-only modules on a narrow screen.
 *
 * Earlier this redirected to /platform without a word, so the module simply
 * vanished and nobody could tell why. Now the reason is on screen: the person
 * sees where they are and what to do about it.
 */
export default function DesktopWebOnlyRoute({ children, title = 'Раздел для большого экрана' }) {
  const isDesktopViewport = useMediaQuery(DESKTOP_WEB_VIEWPORT_QUERY)

  if (isDesktopWebOnlyBlocked({ isDesktopViewport })) {
    return (
      <div className="desktop-web-only" role="status">
        <h2 className="desktop-web-only__title">{title}</h2>
        <p className="desktop-web-only__text">{DESKTOP_WEB_ONLY_MESSAGE}</p>
        <Link to="/platform" className="btn btn--primary">
          На главную
        </Link>
      </div>
    )
  }

  return children ?? <Outlet />
}
