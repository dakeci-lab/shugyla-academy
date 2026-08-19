/**
 * Paginate PostgREST selects past the default max_rows cap (1000).
 *
 * buildQuery must return a fresh Supabase query builder on each call, with a
 * stable deterministic .order() already applied. This helper only adds
 * .range(from, to) per page.
 *
 * @template T
 * @param {() => import('@supabase/supabase-js').PostgrestFilterBuilder<any, any, T[]>} buildQuery
 * @param {number} [pageSize=1000]
 * @returns {Promise<{ data: T[]|null, error: object|null }>}
 */
export async function fetchAllSupabaseRows(buildQuery, pageSize = 1000) {
  const rows = []
  for (let from = 0; from < 100_000; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return { data: rows, error: null }
}
