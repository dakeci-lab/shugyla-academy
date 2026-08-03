import { Link } from 'react-router-dom'
import LangSwitch from '../LangSwitch'
import './CareersHeader.css'

/**
 * Minimal public careers header — no session chrome, no Platform links.
 */
export default function CareersHeader() {
  return (
    <header className="careers-header">
      <div className="careers-header__inner">
        <Link to="/apply" className="careers-header__brand" aria-label="Shugyla Market">
          <span className="careers-header__mark" aria-hidden="true">
            S
          </span>
          <span className="careers-header__name">Shugyla Market</span>
        </Link>
        <div className="careers-header__actions">
          <LangSwitch />
        </div>
      </div>
    </header>
  )
}
