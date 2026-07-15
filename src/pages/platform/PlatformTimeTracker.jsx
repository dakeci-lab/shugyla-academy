import { Navigate } from 'react-router-dom'

/** Legacy route — перенаправление на главную с новым тайм-трекером */
export default function PlatformTimeTracker() {
  return <Navigate to="/platform" replace />
}
