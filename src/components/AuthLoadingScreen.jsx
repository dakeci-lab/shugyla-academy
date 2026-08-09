import './AuthLoadingScreen.css'

const LOGO_SRC = `${import.meta.env.BASE_URL}icons/icon-192.png`

/**
 * Logo-only fullscreen loading surface.
 * Used for pre-auth waits, RBAC gate, Suspense, and the top-level launch overlay.
 */
export default function AuthLoadingScreen({ exiting = false, className = '' }) {
  const classes = ['app-launch', exiting ? 'app-launch--exit' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} role="status" aria-live="polite" aria-label="Загрузка">
      <img
        className="app-launch__logo"
        src={LOGO_SRC}
        alt=""
        width={88}
        height={88}
        decoding="async"
        draggable={false}
      />
    </div>
  )
}
