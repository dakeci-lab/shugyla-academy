#!/usr/bin/env node
/**
 * Verification: fetchAllRowsByIdChunks fetches id-chunks with bounded
 * concurrency, keeps chunk order, still paginates and still fails loudly.
 *
 * Measured on prod 2026-10-14: loading purchase_order_items took 16 sequential
 * requests ≈ 12 s on every procurement load.
 *
 * Usage:
 *   npm run verify:parallel-id-chunk-fetch
 */

import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const { fetchAllRowsByIdChunks } = await import(
  pathToFileURL(path.join(ROOT, 'src/utils/chunkArray.js')).href
)

let checks = 0
function assert(name, condition) {
  if (!condition) throw new Error(name)
  checks += 1
  console.log(`  ✓ ${name}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ids = Array.from({ length: 1000 }, (_, i) => `id-${i}`)

function makeFetcher({ delay = 20, rowsPerId = 1 } = {}) {
  const state = { inFlight: 0, maxInFlight: 0, calls: 0 }
  const fetchPage = async ({ idChunk, from, to }) => {
    state.calls += 1
    state.inFlight += 1
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight)
    await sleep(delay + (idChunk[0] === 'id-0' ? 30 : 0)) // first chunk finishes last
    state.inFlight -= 1
    const all = idChunk.flatMap((id) => Array.from({ length: rowsPerId }, (_, k) => `${id}:${k}`))
    return { data: all.slice(from, to + 1) }
  }
  return { state, fetchPage }
}

console.log('order and completeness')
{
  const { fetchPage } = makeFetcher()
  const rows = await fetchAllRowsByIdChunks({
    ids, idChunkSize: 100, fetchPage, onPageResult: (r) => r.data,
  })
  assert('returns every row', rows.length === 1000)
  assert('keeps chunk order even when later chunks finish first',
    rows.every((row, i) => row === `id-${i}:0`))
}

console.log('bounded concurrency')
{
  const { state, fetchPage } = makeFetcher()
  const t0 = Date.now()
  await fetchAllRowsByIdChunks({ ids, idChunkSize: 100, concurrency: 4, fetchPage, onPageResult: (r) => r.data })
  const parallelMs = Date.now() - t0
  assert('runs several chunks at once', state.maxInFlight > 1)
  assert('never exceeds the concurrency limit', state.maxInFlight <= 4)

  const seq = makeFetcher()
  const t1 = Date.now()
  await fetchAllRowsByIdChunks({ ids, idChunkSize: 100, concurrency: 1, fetchPage: seq.fetchPage, onPageResult: (r) => r.data })
  const sequentialMs = Date.now() - t1
  assert('concurrency 1 stays sequential', seq.state.maxInFlight === 1)
  assert(`parallel is faster (${parallelMs} ms vs ${sequentialMs} ms)`, parallelMs < sequentialMs * 0.6)
}

console.log('pagination and failures')
{
  const { state, fetchPage } = makeFetcher({ rowsPerId: 30 })
  const rows = await fetchAllRowsByIdChunks({
    ids: ids.slice(0, 200), idChunkSize: 100, pageSize: 1000, fetchPage, onPageResult: (r) => r.data,
  })
  assert('paginates inside a chunk (3000 rows -> 4 pages x 2 chunks)', rows.length === 6000 && state.calls === 8)

  let threw = false
  try {
    await fetchAllRowsByIdChunks({
      ids, idChunkSize: 100,
      fetchPage: async ({ idChunk }) => { if (idChunk[0] === 'id-300') throw new Error('boom'); return { data: [] } },
      onPageResult: (r) => r.data,
    })
  } catch (e) { threw = e.message === 'boom' }
  assert('a failing chunk fails the whole load', threw)

  const empty = await fetchAllRowsByIdChunks({ ids: [], fetchPage: async () => ({ data: [] }), onPageResult: (r) => r.data })
  assert('empty ids -> empty result', empty.length === 0)
}

console.log(`\nOK — ${checks} checks`)
