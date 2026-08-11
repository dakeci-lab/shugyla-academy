/**
 * Shared helpers for desktop-browser-only platform modules (PWA / narrow viewports).
 */

export const DESKTOP_WEB_VIEWPORT_QUERY = '(min-width: 901px)'

/**
 * True when the surface must not expose desktop-web-only modules.
 * @param {{ isDesktopViewport?: boolean, pwaStandalone?: boolean }} flags
 */
export function isDesktopWebOnlyBlocked({
  isDesktopViewport = true,
  pwaStandalone = false,
} = {}) {
  return Boolean(pwaStandalone) || !isDesktopViewport
}
