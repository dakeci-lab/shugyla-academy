/**
 * Run `fn` over `items` with at most `limit` calls in flight, results in input order.
 * Each Supabase REST call from an Edge Function costs a network round trip far larger than
 * the query itself, so chunked reads/writes that used to run one after another go through this.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}
