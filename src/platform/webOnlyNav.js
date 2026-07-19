/**
 * Nav items marked webOnly (or listed below) are desktop browser only —
 * hidden from mobile drawer and PWA standalone shells.
 */

export const WEB_ONLY_NAV_IDS = new Set(['employees-payroll', 'price-tags'])

/** Strip web-only entries from a filtered platform nav tree. */
export function excludeWebOnlyNavItems(navItems) {
  return (navItems || [])
    .map((item) => {
      if (item.webOnly || WEB_ONLY_NAV_IDS.has(item.id)) return null
      if (!item.children?.length) return item
      const children = item.children.filter(
        (child) => !child.webOnly && !WEB_ONLY_NAV_IDS.has(child.id)
      )
      if (children.length === 0) return null
      return { ...item, children }
    })
    .filter(Boolean)
}
