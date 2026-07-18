/**
 * In-flight request coalescing: concurrent callers with the same key share one Promise.
 * Session-scoped maps should be cleared on logout.
 */

const inFlight = new Map()

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} factory
 * @returns {Promise<T>}
 */
export function coalesceInFlight(key, factory) {
  const existing = inFlight.get(key)
  if (existing) return existing

  const promise = Promise.resolve()
    .then(factory)
    .finally(() => {
      if (inFlight.get(key) === promise) {
        inFlight.delete(key)
      }
    })

  inFlight.set(key, promise)
  return promise
}

/** Clear all in-flight entries (e.g. logout). */
export function clearInFlightRequests() {
  inFlight.clear()
}

/** @returns {number} */
export function getInFlightRequestCount() {
  return inFlight.size
}
