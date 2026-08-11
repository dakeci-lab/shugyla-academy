import { Navigate } from 'react-router-dom'
import useMediaQuery from '../../hooks/useMediaQuery'
import {
  DESKTOP_WEB_VIEWPORT_QUERY,
  isDesktopWebOnlyBlocked,
} from '../../platform/desktopWebOnly'
import { isPwaStandalone } from '../../utils/pwaStandalone'

/**
 * Blocks PWA / narrow viewports and redirects to a safe platform route.
 * Desktop browser continues to render children unchanged.
 */
export default function DesktopWebOnlyRoute({
  children,
  redirectTo = '/platform',
}) {
  const isDesktopViewport = useMediaQuery(DESKTOP_WEB_VIEWPORT_QUERY)
  const blocked = isDesktopWebOnlyBlocked({
    isDesktopViewport,
    pwaStandalone: isPwaStandalone(),
  })

  if (blocked) {
    return <Navigate to={redirectTo} replace />
  }

  return children
}
