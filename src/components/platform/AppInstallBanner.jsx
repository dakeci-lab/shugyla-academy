import { useEffect, useState } from 'react'
import './AppInstallBanner.css'

function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

/** Баннер установки PWA — только mobile */
export default function AppInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [hint, setHint] = useState('')

  useEffect(() => {
    if (isStandalone()) return

    if (localStorage.getItem('shugyla_app_banner_dismissed') === '1') {
      setDismissed(true)
      return
    }

    function onBeforeInstall(e) {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  if (dismissed || isStandalone()) return null

  async function handleOpen() {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      try {
        await deferredPrompt.userChoice
      } catch {
        /* ignore */
      }
      setDeferredPrompt(null)
      return
    }
    setHint('Добавьте сайт на главный экран через меню браузера.')
    window.setTimeout(() => setHint(''), 4000)
  }

  function handleDismiss(e) {
    e.stopPropagation()
    localStorage.setItem('shugyla_app_banner_dismissed', '1')
    setDismissed(true)
  }

  return (
    <div className="app-install-banner" role="region" aria-label="Установка приложения">
      <button type="button" className="app-install-banner__dismiss" onClick={handleDismiss} aria-label="Закрыть">
        ×
      </button>
      <span className="app-install-banner__logo">S</span>
      <div className="app-install-banner__text">
        <strong>Shugyla Platform</strong>
        <span>Открыть в приложении «Shugyla Platform»</span>
        {hint && <span className="app-install-banner__hint">{hint}</span>}
      </div>
      <button type="button" className="app-install-banner__action" onClick={handleOpen}>
        ОТКРЫТЬ
      </button>
    </div>
  )
}
