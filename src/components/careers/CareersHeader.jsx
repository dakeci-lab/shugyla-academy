import { Link } from 'react-router-dom'
import LangSwitch from '../LangSwitch'
import logoPrimary from '../../assets/brand/logo/logo-primary.png'
import {
  getCareersHomePath,
  getCareersUrl,
  getHostSurface,
  HOST_SURFACE,
} from '../../router/hostSurface'
import './CareersHeader.css'

/**
 * Minimal public careers header — no session chrome, no Platform links.
 */
export default function CareersHeader() {
  const homePath = getCareersHomePath()
  const surface = getHostSurface()
  const brand = (
    <img
      className="careers-header__logo"
      src={logoPrimary}
      alt="Shugyla Market"
      width={160}
      height={40}
    />
  )

  return (
    <header className="careers-header">
      <div className="careers-header__inner">
        {surface === HOST_SURFACE.CAREERS || surface === HOST_SURFACE.COMBINED ? (
          <Link to={homePath} className="careers-header__brand" aria-label="Shugyla Market">
            {brand}
          </Link>
        ) : (
          <a
            href={getCareersUrl()}
            className="careers-header__brand"
            aria-label="Shugyla Market"
          >
            {brand}
          </a>
        )}
        <div className="careers-header__actions">
          <LangSwitch />
        </div>
      </div>
    </header>
  )
}
