import { useEffect, useState } from 'react'
import { isPwaStandalone } from '../utils/pwaStandalone'
import './PWAInstallPrompt.css'

function isIosDevice() {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** Ненавязчивый баннер установки PWA */
export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    if (isPwaStandalone()) return

    const dismissedKey = 'shugyla_pwa_install_dismissed'
    if (localStorage.getItem(dismissedKey) === '1') {
      setDismissed(true)
      return
    }

    if (isIosDevice()) {
      setShowIosHint(true)
    }

    function onBeforeInstall(e) {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowIosHint(false)
    }

    function onInstalled() {
      setDeferredPrompt(null)
      setShowIosHint(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (dismissed || isPwaStandalone()) return null
  if (!deferredPrompt && !showIosHint) return null

  async function handleInstall() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    try {
      await deferredPrompt.userChoice
    } catch {
      /* ignore */
    }
    setDeferredPrompt(null)
  }

  function handleDismiss() {
    localStorage.setItem('shugyla_pwa_install_dismissed', '1')
    setDismissed(true)
    setDeferredPrompt(null)
    setShowIosHint(false)
  }

  return (
    <aside className="pwa-install" role="region" aria-label="Установка приложения">
      <div className="pwa-install__content">
        <p className="pwa-install__title">Shugyla Platform на телефоне</p>
        {deferredPrompt ? (
          <p className="pwa-install__text">Установите приложение для быстрого доступа с главного экрана.</p>
        ) : (
          <p className="pwa-install__text">
            На iPhone: нажмите <strong>Поделиться</strong> → <strong>На экран «Домой»</strong>
          </p>
        )}
      </div>
      <div className="pwa-install__actions">
        {deferredPrompt && (
          <button type="button" className="btn btn--primary btn--sm" onClick={handleInstall}>
            Установить приложение
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={handleDismiss}>
          Закрыть
        </button>
      </div>
    </aside>
  )
}
