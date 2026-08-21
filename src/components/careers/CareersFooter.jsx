import logoOnGreen from '../../assets/brand/logo/logo-on-green.png'
import { CAREERS_CONTACT } from './careersContact'
import './CareersFooter.css'

/** Public careers footer — brand bar only; no platform links. */
export default function CareersFooter() {
  const { phoneDisplay, phoneHref, email, address, copyright } = CAREERS_CONTACT

  return (
    <footer className="careers-footer">
      <div className="careers-footer__top">
        <img
          className="careers-footer__logo"
          src={logoOnGreen}
          alt="Shugyla Market"
          width={180}
          height={48}
        />
        <div className="careers-footer__contacts">
          <a className="careers-footer__contact" href={phoneHref}>
            <span className="careers-footer__contact-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.5 21 3 12.5 3 3c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
              </svg>
            </span>
            {phoneDisplay}
          </a>
          <a className="careers-footer__contact" href={`mailto:${email}`}>
            <span className="careers-footer__contact-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="5" width="18" height="14" rx="2.5" />
                <path d="M3.5 6.5l8.5 6 8.5-6" />
              </svg>
            </span>
            {email}
          </a>
          <span className="careers-footer__contact">
            <span className="careers-footer__contact-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 21s7-6.3 7-11.5A7 7 0 0 0 5 9.5C5 14.7 12 21 12 21z" />
                <circle cx="12" cy="9.5" r="2.3" />
              </svg>
            </span>
            {address}
          </span>
        </div>
      </div>
      <div className="careers-footer__bottom">
        <span>{copyright}</span>
      </div>
    </footer>
  )
}
