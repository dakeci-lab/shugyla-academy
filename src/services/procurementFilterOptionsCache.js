/**
 * Versioned stale-while-revalidate cache for procurement snapshot filter options.
 * Stores only aggregated options (not item rows).
 */

export const FILTER_OPTIONS_CACHE_VERSION = 2
export const FILTER_OPTIONS_CACHE_TTL_MS = 24 * 60 * 60 * 1000
/** Serve cache without background scan while younger than this. */
export const FILTER_OPTIONS_REVALIDATE_AFTER_MS = 5 * 60 * 1000
export const FILTER_OPTIONS_STORAGE_KEY = 'shugyla.procurement.filterOptions.v2'
export const FILTER_OPTIONS_MAX_PERSISTED_ENTRIES = 3

const memoryCache = new Map()
const inFlightScans = new Map()
let latestSnapshotId = null

export function createEmptyFilterOptions() {
  return {
    categories: [],
    categorySubcategories: [],
    categoryCounts: {},
    pairCounts: {},
    suppliers: [],
    generatedSupplierCount: 0,
    pendingSupplierCount: 0,
    inconsistentSupplierCount: 0,
    unassignedOrderableCount: 0,
  }
}

export function isValidFilterOptions(options) {
  if (!options || typeof options !== 'object') return false
  if (!Array.isArray(options.categories)) return false
  if (!Array.isArray(options.categorySubcategories)) return false
  if (!Array.isArray(options.suppliers)) return false
  return true
}

export function isCacheEntryFresh(entry, now = Date.now(), ttlMs = FILTER_OPTIONS_CACHE_TTL_MS) {
  if (!entry || typeof entry.cachedAt !== 'number') return false
  if (!isValidFilterOptions(entry.options)) return false
  return now - entry.cachedAt <= ttlMs
}

/**
 * @returns {'miss'|'fresh'|'stale'}
 * - fresh: usable and younger than revalidateAfter → no scan
 * - stale: usable but older than revalidateAfter (still within TTL) → SWR
 * - miss: missing/invalid/expired → full scan
 */
export function getCacheFreshness(
  entry,
  now = Date.now(),
  {
    revalidateAfterMs = FILTER_OPTIONS_REVALIDATE_AFTER_MS,
    ttlMs = FILTER_OPTIONS_CACHE_TTL_MS,
  } = {}
) {
  if (!entry || typeof entry.cachedAt !== 'number') return 'miss'
  if (!isValidFilterOptions(entry.options)) return 'miss'
  const age = now - entry.cachedAt
  if (age > ttlMs) return 'miss'
  if (age <= revalidateAfterMs) return 'fresh'
  return 'stale'
}

function cloneOptions(options) {
  return {
    categories: [...(options.categories || [])],
    categorySubcategories: (options.categorySubcategories || []).map((row) => ({ ...row })),
    categoryCounts: { ...(options.categoryCounts || {}) },
    pairCounts: { ...(options.pairCounts || {}) },
    suppliers: (options.suppliers || []).map((row) => ({ ...row })),
    generatedSupplierCount: options.generatedSupplierCount || 0,
    pendingSupplierCount: options.pendingSupplierCount || 0,
    inconsistentSupplierCount: options.inconsistentSupplierCount || 0,
    unassignedOrderableCount: options.unassignedOrderableCount || 0,
  }
}

export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(key, String(value))
    },
    removeItem(key) {
      map.delete(key)
    },
  }
}

function getBrowserStorage() {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function readPersistedBundle(storage) {
  if (!storage) return null
  try {
    const raw = storage.getItem(FILTER_OPTIONS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== FILTER_OPTIONS_CACHE_VERSION) return null
    if (!parsed.entries || typeof parsed.entries !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function writePersistedBundle(storage, bundle) {
  if (!storage) return
  try {
    storage.setItem(FILTER_OPTIONS_STORAGE_KEY, JSON.stringify(bundle))
  } catch {
    // Quota / private mode — ignore persistence failures.
  }
}

function pruneEntries(entries, keepSnapshotId) {
  const ids = Object.keys(entries)
  if (ids.length <= FILTER_OPTIONS_MAX_PERSISTED_ENTRIES) return entries
  const ranked = ids
    .map((id) => ({ id, cachedAt: entries[id]?.cachedAt || 0 }))
    .sort((a, b) => b.cachedAt - a.cachedAt)
  const keep = new Set(
    ranked.slice(0, FILTER_OPTIONS_MAX_PERSISTED_ENTRIES).map((row) => row.id)
  )
  if (keepSnapshotId) keep.add(keepSnapshotId)
  const next = {}
  for (const id of keep) {
    if (entries[id]) next[id] = entries[id]
  }
  return next
}

/** Reset module caches (tests). */
export function resetFilterOptionsCacheForTests() {
  memoryCache.clear()
  inFlightScans.clear()
  latestSnapshotId = null
}

export function getLatestCachedSnapshotId() {
  return latestSnapshotId
}

export function getInFlightScanCountForTests() {
  return inFlightScans.size
}

/**
 * Read exact-snapshot cached options if present and valid/fresh.
 * @returns {{ options: object, cachedAt: number, source: 'memory'|'storage' }|null}
 */
export function getCachedFilterOptions(
  snapshotId,
  { storage = getBrowserStorage(), now = Date.now(), ttlMs = FILTER_OPTIONS_CACHE_TTL_MS } = {}
) {
  if (!snapshotId) return null

  const memoryEntry = memoryCache.get(snapshotId)
  if (isCacheEntryFresh(memoryEntry, now, ttlMs)) {
    return {
      options: cloneOptions(memoryEntry.options),
      cachedAt: memoryEntry.cachedAt,
      source: 'memory',
    }
  }

  const bundle = readPersistedBundle(storage)
  const stored = bundle?.entries?.[snapshotId]
  if (!isCacheEntryFresh(stored, now, ttlMs)) return null

  memoryCache.set(snapshotId, {
    options: cloneOptions(stored.options),
    cachedAt: stored.cachedAt,
  })
  if (bundle.latestSnapshotId) latestSnapshotId = bundle.latestSnapshotId

  return {
    options: cloneOptions(stored.options),
    cachedAt: stored.cachedAt,
    source: 'storage',
  }
}

export function setCachedFilterOptions(
  snapshotId,
  options,
  { storage = getBrowserStorage(), now = Date.now() } = {}
) {
  if (!snapshotId || !isValidFilterOptions(options)) return null
  const entry = {
    options: cloneOptions(options),
    cachedAt: now,
  }
  memoryCache.set(snapshotId, entry)
  latestSnapshotId = snapshotId

  const bundle = readPersistedBundle(storage) || {
    version: FILTER_OPTIONS_CACHE_VERSION,
    latestSnapshotId: snapshotId,
    entries: {},
  }
  bundle.version = FILTER_OPTIONS_CACHE_VERSION
  bundle.latestSnapshotId = snapshotId
  bundle.entries = pruneEntries(
    {
      ...(bundle.entries || {}),
      [snapshotId]: entry,
    },
    snapshotId
  )
  writePersistedBundle(storage, bundle)
  return entry
}

/**
 * Deduped fresh scan + cache write.
 * @param {string} snapshotId
 * @param {(snapshotId: string) => Promise<object>} scan
 */
export function revalidateSnapshotFilterOptions(
  snapshotId,
  scan,
  { storage = getBrowserStorage(), now = Date.now() } = {}
) {
  if (!snapshotId) {
    return Promise.resolve(createEmptyFilterOptions())
  }
  if (typeof scan !== 'function') {
    return Promise.reject(new Error('scan function is required'))
  }

  if (inFlightScans.has(snapshotId)) {
    return inFlightScans.get(snapshotId)
  }

  // Start scan immediately so parallel callers share one in-flight work unit.
  const promise = Promise.resolve(scan(snapshotId))
    .then((options) => {
      const safe = isValidFilterOptions(options) ? options : createEmptyFilterOptions()
      setCachedFilterOptions(snapshotId, safe, { storage, now: Date.now() })
      return cloneOptions(safe)
    })
    .finally(() => {
      inFlightScans.delete(snapshotId)
    })

  inFlightScans.set(snapshotId, promise)
  return promise
}

/**
 * Load filter options with freshness tiers:
 * - fresh (< REVALIDATE_AFTER): return cache, no scan
 * - stale (REVALIDATE_AFTER..TTL): return cache + background scan
 * - forceRefresh / miss: await scan
 */
export async function loadSnapshotFilterOptionsCached(
  snapshotId,
  scan,
  {
    forceRefresh = false,
    storage = getBrowserStorage(),
    now = Date.now(),
    onCached = null,
    revalidateAfterMs = FILTER_OPTIONS_REVALIDATE_AFTER_MS,
    ttlMs = FILTER_OPTIONS_CACHE_TTL_MS,
  } = {}
) {
  if (!snapshotId) {
    return {
      options: createEmptyFilterOptions(),
      fromCache: false,
      refreshPromise: null,
      freshness: 'miss',
    }
  }

  const cached = getCachedFilterOptions(snapshotId, { storage, now, ttlMs })
  const freshness = cached
    ? getCacheFreshness(
        { options: cached.options, cachedAt: cached.cachedAt },
        now,
        { revalidateAfterMs, ttlMs }
      )
    : 'miss'

  if (cached && !forceRefresh && freshness === 'fresh') {
    onCached?.(cached.options)
    return {
      options: cached.options,
      fromCache: true,
      refreshPromise: null,
      freshness,
    }
  }

  if (cached && !forceRefresh && freshness === 'stale') {
    onCached?.(cached.options)
    const refreshPromise = revalidateSnapshotFilterOptions(snapshotId, scan, { storage })
    return {
      options: cached.options,
      fromCache: true,
      refreshPromise,
      freshness,
    }
  }

  if (cached && forceRefresh) {
    onCached?.(cached.options)
  }

  const options = await revalidateSnapshotFilterOptions(snapshotId, scan, { storage })
  return {
    options,
    fromCache: false,
    refreshPromise: null,
    freshness: forceRefresh ? 'forced' : 'miss',
  }
}
