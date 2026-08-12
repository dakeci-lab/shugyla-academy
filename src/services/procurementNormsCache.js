export const PROCUREMENT_NORMS_CACHE_VERSION = 1
export const PROCUREMENT_NORMS_REVALIDATE_AFTER_MS = 24 * 60 * 60 * 1000
export const PROCUREMENT_NORMS_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000
export const PROCUREMENT_NORMS_STORAGE_KEY = 'shugyla.procurement.norms.v1'
export const PROCUREMENT_NORMS_MAX_PERSISTED_ENTRIES = 3

const memoryCache = new Map()
const inFlightRefreshes = new Map()
let latestSnapshotId = null

function getBrowserStorage() {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function validSnapshot(snapshot) {
  return Boolean(snapshot && typeof snapshot.id === 'string' && snapshot.id)
}

export function isValidProcurementNormHierarchy(hierarchy) {
  if (!Array.isArray(hierarchy)) return false
  return hierarchy.every(
    (category) =>
      category &&
      typeof category.categoryName === 'string' &&
      Number.isFinite(Number(category.normDays)) &&
      Array.isArray(category.subcategories) &&
      category.subcategories.every(
        (subcategory) =>
          subcategory &&
          typeof subcategory.subcategoryName === 'string' &&
          Number.isFinite(Number(subcategory.normDays))
      )
  )
}

export function isValidProcurementNormsModel(model) {
  return Boolean(
    model && validSnapshot(model.snapshot) && isValidProcurementNormHierarchy(model.hierarchy)
  )
}

function cloneModel(model) {
  return {
    snapshot: { ...model.snapshot },
    hierarchy: model.hierarchy.map((category) => ({
      ...category,
      subcategories: category.subcategories.map((subcategory) => ({ ...subcategory })),
    })),
  }
}

function readBundle(storage) {
  if (!storage) return null
  try {
    const raw = storage.getItem(PROCUREMENT_NORMS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.version !== PROCUREMENT_NORMS_CACHE_VERSION) return null
    if (!parsed.entries || typeof parsed.entries !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function writeBundle(storage, bundle) {
  if (!storage) return
  try {
    storage.setItem(PROCUREMENT_NORMS_STORAGE_KEY, JSON.stringify(bundle))
  } catch {
    // Private browsing / quota errors must not break the norms screen.
  }
}

function isUsableEntry(entry, now, ttlMs) {
  return Boolean(
    entry &&
      Number.isFinite(entry.cachedAt) &&
      now - entry.cachedAt <= ttlMs &&
      isValidProcurementNormsModel(entry.model)
  )
}

export function getProcurementNormsCacheFreshness(
  entry,
  now = Date.now(),
  {
    revalidateAfterMs = PROCUREMENT_NORMS_REVALIDATE_AFTER_MS,
    ttlMs = PROCUREMENT_NORMS_CACHE_TTL_MS,
  } = {}
) {
  if (!isUsableEntry(entry, now, ttlMs)) return 'miss'
  return now - entry.cachedAt <= revalidateAfterMs ? 'fresh' : 'stale'
}

export function createProcurementNormsMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
    removeItem(key) {
      values.delete(key)
    },
  }
}

export function getCachedProcurementNormsModel(
  snapshotId,
  {
    storage = getBrowserStorage(),
    now = Date.now(),
    ttlMs = PROCUREMENT_NORMS_CACHE_TTL_MS,
  } = {}
) {
  if (!snapshotId) return null
  const memoryEntry = memoryCache.get(snapshotId)
  if (isUsableEntry(memoryEntry, now, ttlMs)) {
    return { model: cloneModel(memoryEntry.model), cachedAt: memoryEntry.cachedAt, source: 'memory' }
  }

  const bundle = readBundle(storage)
  const stored = bundle?.entries?.[snapshotId]
  if (!isUsableEntry(stored, now, ttlMs)) return null
  memoryCache.set(snapshotId, { model: cloneModel(stored.model), cachedAt: stored.cachedAt })
  latestSnapshotId = bundle.latestSnapshotId || snapshotId
  return { model: cloneModel(stored.model), cachedAt: stored.cachedAt, source: 'storage' }
}

export function getLatestCachedProcurementNormsModel(options = {}) {
  const storage = options.storage ?? getBrowserStorage()
  const bundle = readBundle(storage)
  const snapshotId = latestSnapshotId || bundle?.latestSnapshotId
  return snapshotId ? getCachedProcurementNormsModel(snapshotId, { ...options, storage }) : null
}

export function setCachedProcurementNormsModel(
  model,
  { storage = getBrowserStorage(), now = Date.now() } = {}
) {
  if (!isValidProcurementNormsModel(model)) return null
  const snapshotId = model.snapshot.id
  const entry = { model: cloneModel(model), cachedAt: now }
  memoryCache.set(snapshotId, entry)
  latestSnapshotId = snapshotId

  const bundle = readBundle(storage) || {
    version: PROCUREMENT_NORMS_CACHE_VERSION,
    latestSnapshotId: snapshotId,
    entries: {},
  }
  const entries = { ...(bundle.entries || {}), [snapshotId]: entry }
  const keepIds = Object.keys(entries)
    .sort((a, b) => (entries[b]?.cachedAt || 0) - (entries[a]?.cachedAt || 0))
    .slice(0, PROCUREMENT_NORMS_MAX_PERSISTED_ENTRIES)
  bundle.version = PROCUREMENT_NORMS_CACHE_VERSION
  bundle.latestSnapshotId = snapshotId
  bundle.entries = Object.fromEntries(keepIds.map((id) => [id, entries[id]]))
  writeBundle(storage, bundle)
  return { model: cloneModel(entry.model), cachedAt: entry.cachedAt }
}

export function invalidateProcurementNormsCache(
  snapshotId = null,
  { storage = getBrowserStorage() } = {}
) {
  const bundle = readBundle(storage)
  if (!snapshotId) {
    memoryCache.clear()
    inFlightRefreshes.clear()
    latestSnapshotId = null
    try {
      storage?.removeItem(PROCUREMENT_NORMS_STORAGE_KEY)
    } catch {
      // Ignore unavailable storage.
    }
    return
  }

  memoryCache.delete(snapshotId)
  inFlightRefreshes.delete(snapshotId)
  if (!bundle) return
  delete bundle.entries[snapshotId]
  if (bundle.latestSnapshotId === snapshotId) {
    bundle.latestSnapshotId = Object.keys(bundle.entries)
      .sort((a, b) => (bundle.entries[b]?.cachedAt || 0) - (bundle.entries[a]?.cachedAt || 0))[0] || null
  }
  latestSnapshotId = bundle.latestSnapshotId
  writeBundle(storage, bundle)
}

export function revalidateProcurementNormsModel(snapshotId, fetcher, options = {}) {
  if (inFlightRefreshes.has(snapshotId)) return inFlightRefreshes.get(snapshotId)
  const promise = Promise.resolve(fetcher())
    .then((model) => {
      setCachedProcurementNormsModel(model, options)
      return cloneModel(model)
    })
    .finally(() => inFlightRefreshes.delete(snapshotId))
  inFlightRefreshes.set(snapshotId, promise)
  return promise
}

export async function loadProcurementNormsModelCached(
  snapshotId,
  fetcher,
  {
    forceRefresh = false,
    storage = getBrowserStorage(),
    now = Date.now(),
    onCached = null,
    revalidateAfterMs = PROCUREMENT_NORMS_REVALIDATE_AFTER_MS,
    ttlMs = PROCUREMENT_NORMS_CACHE_TTL_MS,
  } = {}
) {
  const cached = getCachedProcurementNormsModel(snapshotId, { storage, now, ttlMs })
  const freshness = cached
    ? getProcurementNormsCacheFreshness(
        { model: cached.model, cachedAt: cached.cachedAt },
        now,
        { revalidateAfterMs, ttlMs }
      )
    : 'miss'

  if (cached) onCached?.(cached.model)
  if (cached && !forceRefresh && freshness === 'fresh') {
    return { model: cached.model, fromCache: true, freshness, refreshPromise: null }
  }
  if (cached && !forceRefresh && freshness === 'stale') {
    const refreshPromise = revalidateProcurementNormsModel(snapshotId, fetcher, { storage })
    return { model: cached.model, fromCache: true, freshness, refreshPromise }
  }

  const model = await revalidateProcurementNormsModel(snapshotId, fetcher, { storage })
  return { model, fromCache: false, freshness: forceRefresh ? 'forced' : 'miss', refreshPromise: null }
}

export function resetProcurementNormsCacheForTests() {
  memoryCache.clear()
  inFlightRefreshes.clear()
  latestSnapshotId = null
}

export function getProcurementNormsInFlightCountForTests() {
  return inFlightRefreshes.size
}
