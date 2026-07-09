import { Link } from 'react-router-dom'
import { getDefaultPlatformPath } from '../../platform/platformAccess'
import { useSession } from '../../context/SessionContext'
import './PlatformAccessDenied.css'

/** Сообщение «Нет доступа» внутри PlatformLayout */
export default function PlatformAccessDenied({ title = 'Нет доступа' }) {
  const { user } = useSession()

  return (
    <div className="platform-access-denied">
      <h2 className="platform-access-denied__title">{title}</h2>
      <p className="platform-access-denied__text">
        У вашей роли нет прав для просмотра этого раздела.
      </p>
      <Link to={getDefaultPlatformPath(user?.role)} className="btn btn--primary">
        На главную
      </Link>
    </div>
  )
}
