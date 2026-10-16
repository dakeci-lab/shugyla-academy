import { PlatformDataProvider } from '../../context/PlatformDataContext'
import { PermissionProvider } from '../../context/PermissionContext'

/**
 * Internal-only providers for /platform/*.
 * Must not wrap public routes (/apply, /vacancies, /login).
 * Mounted once under the /platform route element so navigation within
 * /platform/* does not remount PlatformDataProvider.
 *
 * NotificationInboxProvider is intentionally not mounted: the only notifications
 * were time-tracker ones, and that module is hidden (see
 * docs/platform/stage-12-hide-personnel-modules.md).
 */
export default function InternalPlatformProviders({ children }) {
  return (
    <PlatformDataProvider>
      <PermissionProvider>{children}</PermissionProvider>
    </PlatformDataProvider>
  )
}
