/** Inclusive PostgREST range for exact count + page slices (UI default is 25). */
export function snapshotItemsPageRange(page = 1, pageSize = 25) {
  const size = Math.max(1, Number(pageSize) || 25)
  const current = Math.max(1, Number(page) || 1)
  const from = (current - 1) * size
  return { from, to: from + size - 1, page: current, pageSize: size }
}
