import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Tracks the saves a page sends (like the green bar of UMAG): `state` is 'saving' while any save is in flight, then
 * 'saved' (or 'error' if one failed) for a moment, then 'idle'. `track(promise)` wraps a save and returns its result.
 */
export default function useSaveTracker({ savedMs = 700, errorMs = 2200 } = {}) {
  const [state, setState] = useState('idle')
  const pending = useRef(0)
  const failed = useRef(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const track = useCallback(
    async (promise) => {
      pending.current += 1
      clearTimeout(timer.current)
      setState('saving')
      try {
        return await promise
      } catch (error) {
        failed.current = true
        throw error
      } finally {
        pending.current -= 1
        if (pending.current === 0) {
          const hadError = failed.current
          failed.current = false
          setState(hadError ? 'error' : 'saved')
          timer.current = setTimeout(() => setState('idle'), hadError ? errorMs : savedMs)
        }
      }
    },
    [savedMs, errorMs]
  )

  return [state, track]
}
