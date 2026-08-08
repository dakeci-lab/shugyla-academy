import { useRef } from 'react'

/**
 * Keep the last ready value while a module/gate is temporarily not ready.
 * Prevents UI wipe when sync getters return [] during refresh (markModuleLoading).
 */
export default function useStableWhenReady(liveValue, ready) {
  const snapshotRef = useRef(liveValue)
  if (ready) {
    snapshotRef.current = liveValue
  }
  return ready ? liveValue : snapshotRef.current
}
