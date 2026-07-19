/**
 * Product feature toggles.
 *
 * Academy is temporarily off for the current product focus.
 * Re-enable without rewriting the module:
 *   - set ACADEMY_MODULE_ENABLED = true, or
 *   - set VITE_ENABLE_ACADEMY=true in the build env
 *
 * When off: no nav entry, no route access, no bootstrap/prefetch of academy data.
 * Code, DB tables, and user learning data stay intact.
 */

/** Compile-time default. Env VITE_ENABLE_ACADEMY overrides when set. */
export const ACADEMY_MODULE_ENABLED = false

/**
 * Whether the Academy product module is available in the user-facing app.
 */
export function isAcademyModuleEnabled() {
  const env = import.meta.env.VITE_ENABLE_ACADEMY
  if (env === 'true') return true
  if (env === 'false') return false
  return ACADEMY_MODULE_ENABLED
}

/** Route keys that belong exclusively to the Academy module. */
export const ACADEMY_FEATURE_ROUTE_KEYS = new Set([
  'academy',
  'academy_group',
  'academy_manage',
])

export function isAcademyFeatureRouteKey(routeKey) {
  return ACADEMY_FEATURE_ROUTE_KEYS.has(routeKey)
}
