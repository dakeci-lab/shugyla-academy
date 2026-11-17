import { useEffect, useRef } from 'react'
import { getAppUrl } from '../router/basename'

/* eslint-disable no-undef */
const BUILD_COMMIT = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'local'
/* eslint-enable no-undef */

const CHECK_EVERY_MS = 5 * 60 * 1000
const FIRST_CHECK_MS = 15 * 1000
const RETRY_WHEN_BUSY_MS = 20 * 1000
const RELOAD_GUARD_KEY = 'shugyla-update-reload-at'
const RELOAD_GUARD_MS = 2 * 60 * 1000

/** The commit of the version that is deployed now (version.json is written by every build); null when it cannot be read. */
export async function fetchDeployedCommit(fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${getAppUrl('version.json')}?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return null
    const data = await response.json()
    return typeof data?.commit === 'string' && data.commit ? data.commit : null
  } catch {
    return null
  }
}

/** Is a newer version deployed than the one this tab runs? Dev builds (`local`) never update. */
export function isNewerVersionDeployed(deployed, current = BUILD_COMMIT) {
  return Boolean(deployed) && deployed !== 'local' && current !== 'local' && deployed !== current
}

/** The user is in the middle of something (typing, a dialog open): do not reload under their hands. */
export function isUserBusy(doc = document) {
  const active = doc.activeElement
  if (active && active !== doc.body && active.matches?.('input, textarea, select, [contenteditable="true"]')) return true
  return Boolean(doc.querySelector('[role="dialog"], [aria-modal="true"]'))
}

/** Not twice in a row: if the server (a cache in front of it) still serves the old build, do not loop. */
function reloadedRecently() {
  try {
    const at = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) || 0)
    return Date.now() - at < RELOAD_GUARD_MS
  } catch {
    return false
  }
}

function reloadToNewVersion() {
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  } catch {
    /* storage blocked: the reload below still happens once per check */
  }
  void (navigator.serviceWorker?.getRegistration?.().then((registration) => registration?.update?.()).catch(() => {}))
  window.location.reload()
}

/**
 * A tab that stays open for days keeps the old code (the app is a single page): it kept sending the old requests
 * (the whole order list on every refresh) long after a release. This hook checks version.json now and then — when the
 * tab is opened, on return to it, every few minutes — and when a newer build is deployed the tab reloads itself.
 * It never reloads while the user types or a dialog is open (it waits), and never twice within two minutes.
 */
export default function useAppUpdateGuard() {
  const timerRef = useRef(null)
  const checkingRef = useRef(false)

  useEffect(() => {
    if (BUILD_COMMIT === 'local') return undefined
    let disposed = false

    function schedule(ms) {
      clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(check, ms)
    }

    async function check() {
      if (disposed || checkingRef.current) return
      if (document.visibilityState !== 'visible') {
        schedule(CHECK_EVERY_MS)
        return
      }
      checkingRef.current = true
      try {
        const deployed = await fetchDeployedCommit()
        if (disposed) return
        if (!isNewerVersionDeployed(deployed)) {
          schedule(CHECK_EVERY_MS)
          return
        }
        if (isUserBusy()) {
          schedule(RETRY_WHEN_BUSY_MS)
          return
        }
        if (reloadedRecently()) {
          schedule(CHECK_EVERY_MS)
          return
        }
        reloadToNewVersion()
      } finally {
        checkingRef.current = false
      }
    }

    function onVisible() {
      if (document.visibilityState === 'visible') schedule(1500)
    }

    schedule(FIRST_CHECK_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      disposed = true
      clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])
}
