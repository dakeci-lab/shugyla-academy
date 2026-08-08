import { useEffect, useState } from 'react'

export const DEFAULT_LOADING_DELAY_MS = 180

/** Avoids flashing a skeleton when an initial request completes quickly. */
export default function useDelayedLoading(loading, delay = DEFAULT_LOADING_DELAY_MS) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!loading) {
      setVisible(false)
      return undefined
    }

    const timer = window.setTimeout(() => setVisible(true), Math.max(0, delay))
    return () => window.clearTimeout(timer)
  }, [loading, delay])

  return visible
}
