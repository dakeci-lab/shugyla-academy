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
 *
 * Only the viewport decides. The previous version also blocked whenever the app
 * ran as an installed PWA, which hid «Закупки» and «Товары» on a full-size
 * screen just because the platform had been opened from an icon rather than a
 * browser tab — indistinguishable from a bug for the person using it. An
 * installed app on a computer is a desktop surface; a phone is not, whatever
 * launched it.
 *
 * @param {{ isDesktopViewport?: boolean }} flags
 */
export function isDesktopWebOnlyBlocked({ isDesktopViewport = true } = {}) {
  return !isDesktopViewport
}

/** Reason shown to the user instead of silently removing the module. */
export const DESKTOP_WEB_ONLY_MESSAGE =
  'Раздел доступен на компьютере или планшете: таблицы закупа не помещаются на узком экране.'

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
  { isDesktopViewport = true } = {},
  prefixes = []
) {
  if (!isDesktopWebOnlyBlocked({ isDesktopViewport })) return false
  return isDesktopWebOnlyPath(to, prefixes)
}
