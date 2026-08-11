import { Link } from 'react-router-dom'
import LangSwitch from '../LangSwitch'
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
    <>
      <span className="careers-header__mark" aria-hidden="true">
        S
      </span>
      <span className="careers-header__name">Shugyla Market</span>
    </>
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
