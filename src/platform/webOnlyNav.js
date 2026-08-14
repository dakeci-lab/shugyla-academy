/**
 * Nav items/groups marked webOnly (or listed below) are desktop browser only —
 * hidden from mobile drawer and PWA standalone shells.
 */

export const WEB_ONLY_NAV_IDS = new Set([
  'employees-payroll',
  'price-tags',
  /**
   * «Закупки» по пунктам, а не группой целиком: «Закуп» (`procurement`)
   * работает на телефоне, соседи по группе — нет.
   */
  'receiving',
  'suppliers',
  'settlements',
  'supplier-payments',
])

export function isWebOnlyNavEntry(item) {
  return Boolean(item?.webOnly) || WEB_ONLY_NAV_IDS.has(item?.id)
}

function collectPathsFromNavNode(node, out = []) {
  if (node?.path) out.push(node.path)
  for (const child of node?.children || []) {
    collectPathsFromNavNode(child, out)
  }
  return out
}

/**
 * Path prefixes for every web-only leaf or group in the nav tree.
 * Nested routes under these prefixes are treated as desktop-web-only too.
 */
export function collectWebOnlyPathPrefixes(navItems) {
  const prefixes = []
  for (const item of navItems || []) {
    if (isWebOnlyNavEntry(item)) {
      collectPathsFromNavNode(item, prefixes)
      continue
    }
    for (const child of item.children || []) {
      if (isWebOnlyNavEntry(child)) collectPathsFromNavNode(child, prefixes)
    }
  }
  return [...new Set(prefixes)].sort((a, b) => b.length - a.length)
}

/** True when pathname is a web-only module or a nested route under one. */
export function isWebOnlyPlatformPath(pathname, prefixes = []) {
  const path = String(pathname || '')
  if (!path) return false
  return prefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  )
}

/** Strip web-only entries (including whole groups) from a filtered platform nav tree. */
export function excludeWebOnlyNavItems(navItems) {
  return (navItems || [])
    .map((item) => {
      if (isWebOnlyNavEntry(item)) return null
      if (!item.children?.length) return item
      const children = item.children.filter((child) => !isWebOnlyNavEntry(child))
      if (children.length === 0) return null
      return { ...item, children }
    })
    .filter(Boolean)
}
