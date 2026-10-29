const NO_CATEGORY = 'Без категории'

export function catalogGroupKey(category, subcategory = '') {
  return subcategory === '' ? `c:${category}` : `s:${category}\u0001${subcategory}`
}

/**
 * Snapshot items → category → subcategory tree. `toOrder` counts items that have a recommendation above zero
 * (the «M к заказу» of the group header). Names sort in Russian order, items by name.
 */
export function groupCatalogItems(items) {
  const byCategory = new Map()
  for (const item of items) {
    const category = item.categoryName || NO_CATEGORY
    const subcategory = item.subcategoryName || NO_CATEGORY
    if (!byCategory.has(category)) byCategory.set(category, new Map())
    const subs = byCategory.get(category)
    if (!subs.has(subcategory)) subs.set(subcategory, [])
    subs.get(subcategory).push(item)
  }
  const collator = (a, b) => a.localeCompare(b, 'ru')
  return [...byCategory.entries()]
    .sort(([a], [b]) => collator(a, b))
    .map(([name, subs]) => {
      const subcategories = [...subs.entries()]
        .sort(([a], [b]) => collator(a, b))
        .map(([subName, list]) => {
          const sorted = [...list].sort((a, b) => collator(a.productName || '', b.productName || ''))
          return {
            name: subName,
            items: sorted,
            count: sorted.length,
            toOrder: sorted.filter((item) => item.recommendedQty > 0).length,
          }
        })
      return {
        name,
        subcategories,
        count: subcategories.reduce((sum, sub) => sum + sub.count, 0),
        toOrder: subcategories.reduce((sum, sub) => sum + sub.toOrder, 0),
      }
    })
}

/** Text search over name and barcode (client side, for lists already loaded). */
export function filterCatalogItems(items, text) {
  const q = String(text || '').trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (item) => (item.productName || '').toLowerCase().includes(q) || String(item.barcode || '').includes(q)
  )
}

/**
 * Tree of the whole nomenclature before any row is loaded: groups come from the snapshot's category/subcategory counts,
 * rows appear in `loaded[subKey]` once a subcategory is opened.
 */
export function buildNomenclatureTree(pairs, loaded) {
  const byCategory = new Map()
  for (const pair of pairs) {
    const category = pair.categoryName || NO_CATEGORY
    const subcategory = pair.subcategoryName || NO_CATEGORY
    if (!byCategory.has(category)) byCategory.set(category, [])
    const items = loaded[catalogGroupKey(category, subcategory)] || []
    byCategory.get(category).push({
      name: subcategory,
      count: pair.itemCount || 0,
      items: [...items].sort((a, b) => (a.productName || '').localeCompare(b.productName || '', 'ru')),
      toOrder: items.filter((item) => item.recommendedQty > 0).length,
    })
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ru'))
    .map(([name, subcategories]) => ({
      name,
      subcategories: subcategories.sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      count: subcategories.reduce((sum, sub) => sum + sub.count, 0),
      toOrder: subcategories.reduce((sum, sub) => sum + sub.toOrder, 0),
    }))
}
