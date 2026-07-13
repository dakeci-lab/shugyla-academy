import { Navigate } from 'react-router-dom'

/** Редирект со старого маршрута /platform/settings */
export default function PlatformSettings() {
  return <Navigate to="/platform/settings/general" replace />
}
