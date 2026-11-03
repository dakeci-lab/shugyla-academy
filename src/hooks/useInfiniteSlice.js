import { useEffect, useState } from 'react'

/**
 * Infinite scroll for a list that is already in memory (phones): shows the first `step` rows and adds `step` more
 * each time the end marker (`sentinelRef`) comes near the screen, up to the whole list — like UMAG's mobile app.
 * `resetKey` (filter, period…) starts again from the first rows. Without IntersectionObserver everything is shown.
 */
export default function useInfiniteSlice(items, { step = 25, resetKey = '', enabled = true } = {}) {
  const [count, setCount] = useState(step)
  const [node, setNode] = useState(null)
  const total = items.length
  const hasMore = enabled && count < total

  useEffect(() => {
    setCount(step)
  }, [resetKey, step])

  useEffect(() => {
    if (!node || !hasMore) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setCount(total)
      return undefined
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setCount((current) => current + step)
      },
      { rootMargin: '400px 0px' }
    )
    observer.observe(node)
    // A new observer fires once for what is already visible, so a short batch keeps loading until the marker leaves the screen.
    return () => observer.disconnect()
  }, [node, hasMore, count, step, total])

  return {
    visible: enabled ? items.slice(0, count) : items,
    hasMore,
    shown: Math.min(count, total),
    sentinelRef: setNode,
  }
}
