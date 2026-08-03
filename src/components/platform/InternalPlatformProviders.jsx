import { PlatformDataProvider } from '../../context/PlatformDataContext'
import { PermissionProvider } from '../../context/PermissionContext'
import { NotificationInboxProvider } from '../../context/NotificationInboxContext'

/**
 * Internal-only providers for /platform/*.
 * Must not wrap public routes (/apply, /vacancies, /login).
 * Mounted once under the /platform route element so navigation within
 * /platform/* does not remount PlatformDataProvider.
 */
export default function InternalPlatformProviders({ children }) {
  return (
    <PlatformDataProvider>
      <PermissionProvider>
        <NotificationInboxProvider>{children}</NotificationInboxProvider>
      </PermissionProvider>
    </PlatformDataProvider>
  )
}
