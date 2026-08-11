/**
 * Shared helpers for desktop-browser-only platform modules (PWA / narrow viewports).
 */

import {
  collectWebOnlyPathPrefixes,
  isWebOnlyPlatformPath,
} from './webOnlyNav.js'

export const DESKTOP_WEB_VIEWPORT_QUERY = '(min-width: 901px)'

/** Path prefixes derived from a PLATFORM_NAV-like tree with webOnly markers. */
export function getDesktopWebOnlyPathPrefixes(navItems = []) {
  return collectWebOnlyPathPrefixes(navItems)
}

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

/** True when a path belongs to a web-only nav leaf/group (incl. nested routes). */
export function isDesktopWebOnlyPath(pathname, prefixes = []) {
  return isWebOnlyPlatformPath(pathname, prefixes)
}

/**
 * Hide dashboard/quick links that point into desktop-web-only modules
 * when the current surface is PWA or narrow viewport.
 */
export function shouldHideDesktopWebOnlyLink(
  to,
  { isDesktopViewport = true, pwaStandalone = false } = {},
  prefixes = []
) {
  if (!isDesktopWebOnlyBlocked({ isDesktopViewport, pwaStandalone })) return false
  return isDesktopWebOnlyPath(to, prefixes)
}
