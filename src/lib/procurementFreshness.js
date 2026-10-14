/**
 * How long procurement / receiving data counts as fresh for passive refresh
 * triggers (page mount, window focus, tab visibility, realtime re-subscribe).
 *
 * Each full reload pages through every order item, so passive triggers must not
 * re-fetch data that was loaded moments ago. Mutations and realtime change
 * events are NOT gated by this — they always fetch.
 */
export const PROCUREMENT_FRESH_MS = 60_000

/** Quiet period before a burst of realtime change events becomes one reload. */
export const PROCUREMENT_REALTIME_DEBOUNCE_MS = 2_500

/** Upper bound a continuous event stream can postpone the coalesced reload. */
export const PROCUREMENT_REALTIME_MAX_WAIT_MS = 8_000
