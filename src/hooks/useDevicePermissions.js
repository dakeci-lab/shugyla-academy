import { useCallback, useEffect, useRef, useState } from 'react'
import { isCloudMode } from '../lib/dataMode'
import { useSession } from '../context/SessionContext'
import {
  clearDeviceSetupSessionDismissed,
  dismissDeviceSetupForSession,
  getDevicePermissionState,
  shouldShowDeviceSetupBanner,
  shouldShowDeviceSetupOnboarding,
  readDeviceSetupSessionDismissed,
} from '../services/devicePermissionsService'

/**
 * Shared device permission state for onboarding, banner, and settings UI.
 */
export default function useDevicePermissions({ enabled = true } = {}) {
  const { supabaseAuthenticated, user } = useSession()
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionDismissed, setSessionDismissed] = useState(() => readDeviceSetupSessionDismissed())
  const previousUserIdRef = useRef(undefined)

  const refresh = useCallback(async () => {
    if (!enabled || !isCloudMode() || !supabaseAuthenticated) {
      setState(null)
      setLoading(false)
      return null
    }

    setLoading(true)
    try {
      const next = await getDevicePermissionState()
      setState(next)
      return next
    } catch {
      setState(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [enabled, supabaseAuthenticated])

  useEffect(() => {
    void refresh()
  }, [refresh, user?.id])

  useEffect(() => {
    const previous = previousUserIdRef.current
    previousUserIdRef.current = user?.id
    if (previous !== undefined && previous !== user?.id) {
      clearDeviceSetupSessionDismissed()
      setSessionDismissed(false)
    }
  }, [user?.id])

  const dismissForSession = useCallback(() => {
    dismissDeviceSetupForSession()
    setSessionDismissed(true)
  }, [])

  const showOnboarding = shouldShowDeviceSetupOnboarding(state, { sessionDismissed })
  const showBanner = shouldShowDeviceSetupBanner(state, { sessionDismissed })

  return {
    state,
    loading,
    refresh,
    sessionDismissed,
    dismissForSession,
    showOnboarding,
    showBanner,
  }
}
