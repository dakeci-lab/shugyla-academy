import { Link } from 'react-router-dom'
import { getDefaultPlatformPath } from '../../platform/platformAccess'
import { useSession } from '../../context/SessionContext'
import './PlatformAccessDenied.css'

/** Неизвестный маршрут внутри /platform/* */
export default function PlatformNotFound() {
  const { user } = useSession()

  return (
    <div className="platform-access-denied">
      <h2 className="platform-access-denied__title">Страница не найдена</h2>
      <p className="platform-access-denied__text">
        Запрошенный раздел платформы не существует.
      </p>
      <Link to={getDefaultPlatformPath(user)} className="btn btn--primary">
        На главную
      </Link>
    </div>
  )
}
