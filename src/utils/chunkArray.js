/** Default PostgREST `.in(...)` chunk size — keeps URL length under gateway limits. */
export const DEFAULT_IN_FILTER_CHUNK_SIZE = 100

/** PostgREST default max rows per response. */
export const DEFAULT_POSTGREST_PAGE_SIZE = 1000

/** How many id-chunks are fetched at once — bounded so we do not flood the API. */
export const DEFAULT_CHUNK_CONCURRENCY = 4

/** Hard cap of pages per id-chunk — prevents infinite loops on stuck full pages. */
export const MAX_POSTGREST_PAGES_PER_CHUNK = 50

/**
 * Split an array into contiguous chunks of at most `chunkSize`.
 * Empty input → []; invalid size falls back to 1.
 *
 * @template T
 * @param {T[]} items
 * @param {number} [chunkSize]
 * @returns {T[][]}
 */
export function chunkArray(items, chunkSize = DEFAULT_IN_FILTER_CHUNK_SIZE) {
  const list = Array.isArray(items) ? items : []
  const size = Math.max(1, Math.floor(Number(chunkSize)) || 1)
  if (list.length === 0) return []
  const chunks = []
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size))
  }
  return chunks
}

/**
 * Fetch child rows for many parent IDs: chunk `.in(...)` for URL safety, then
 * range-paginate each chunk so PostgREST's 1000-row cap cannot silently truncate.
 *
 * `fetchPage({ idChunk, from, to })` must return a Supabase-like `{ data, error }`.
 * `onPageResult(result)` must throw on error and return the rows array (or throw).
 *
 * Id-chunks are fetched with bounded concurrency (`concurrency`, default 4); pages
 * within one chunk stay sequential. The result is always concatenated in chunk
 * order, so output is identical to a fully sequential run.
 *
 * Stable order is the caller's responsibility (typically `.order('created_at').order('id')`).
 *
 * @template T
 * @param {{
 *   ids: string[],
 *   idChunkSize?: number,
 *   pageSize?: number,
 *   maxPagesPerChunk?: number,
 *   concurrency?: number,
 *   fetchPage: (args: { idChunk: string[], from: number, to: number }) => Promise<{ data?: T[]|null, error?: unknown }>,
 *   onPageResult: (result: { data?: T[]|null, error?: unknown }) => T[]|Promise<T[]>,
 *   overflowMessage?: string,
 * }} options
 * @returns {Promise<T[]>}
 */
export async function fetchAllRowsByIdChunks({
  ids,
  idChunkSize = DEFAULT_IN_FILTER_CHUNK_SIZE,
  pageSize = DEFAULT_POSTGREST_PAGE_SIZE,
  maxPagesPerChunk = MAX_POSTGREST_PAGES_PER_CHUNK,
  concurrency = DEFAULT_CHUNK_CONCURRENCY,
  fetchPage,
  onPageResult,
  overflowMessage = 'Не удалось загрузить все связанные позиции.',
}) {
  const safePageSize = Math.max(1, Math.floor(Number(pageSize)) || DEFAULT_POSTGREST_PAGE_SIZE)
  const safeMaxPages = Math.max(1, Math.floor(Number(maxPagesPerChunk)) || MAX_POSTGREST_PAGES_PER_CHUNK)
  const workers = Math.max(1, Math.floor(Number(concurrency)) || 1)

  async function fetchChunk(idChunk) {
    const rowsOfChunk = []
    for (let page = 0; page < safeMaxPages; page += 1) {
      const from = page * safePageSize
      const to = from + safePageSize - 1
      const result = await fetchPage({ idChunk, from, to })
      const part = await onPageResult(result)
      const rows = Array.isArray(part) ? part : []
      rowsOfChunk.push(...rows)
      if (rows.length < safePageSize) break
      if (page === safeMaxPages - 1) {
        throw new Error(overflowMessage)
      }
    }
    return rowsOfChunk
  }

  const chunks = chunkArray(ids, idChunkSize)
  const results = new Array(chunks.length)
  let next = 0
  let failure = null

  async function worker() {
    while (failure === null && next < chunks.length) {
      const index = next
      next += 1
      try {
        results[index] = await fetchChunk(chunks[index])
      } catch (error) {
        failure = { error }
        return
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(workers, chunks.length) }, worker))
  if (failure) throw failure.error

  return results.flat()
}
