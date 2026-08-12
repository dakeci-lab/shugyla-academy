#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
let count = 0

function assert(name, condition) {
  count += 1
  if (!condition) throw new Error(`FAIL: ${name}`)
  console.log(`  ✓ ${name}`)
}

const model = await import(
  pathToFileURL(path.join(ROOT, 'src/components/procurement/procurementNormsModel.js')).href
)
const cache = await import(
  pathToFileURL(path.join(ROOT, 'src/services/procurementNormsCache.js')).href
)

const hierarchy = model.buildProcurementNormHierarchy({
  taxonomy: [
    { categoryName: 'Food', subcategoryName: 'Milk' },
    { categoryName: 'Food', subcategoryName: 'Bread' },
    { categoryName: 'Home', subcategoryName: 'Clean' },
  ],
  rules: [
    { categoryName: 'Food', subcategoryName: '', normDays: 12 },
    { categoryName: 'Food', subcategoryName: 'Milk', normDays: 5 },
  ],
})

assert('builds two category groups', hierarchy.length === 2)
const food = hierarchy.find((item) => item.categoryName === 'Food')
assert('category rule is applied', food.normDays === 12)
assert('subcategory override wins', food.subcategories.find((item) => item.subcategoryName === 'Milk').normDays === 5)
assert('subcategory override is marked', food.subcategories.find((item) => item.subcategoryName === 'Milk').hasOverride)
assert('missing override inherits category', food.subcategories.find((item) => item.subcategoryName === 'Bread').normDays === 12)

const changed = model.applyCategoryNormToHierarchy(hierarchy, 'Food', 20)
const changedFood = changed.find((item) => item.categoryName === 'Food')
assert('category update changes inherited subcategory', changedFood.subcategories.find((item) => item.subcategoryName === 'Bread').normDays === 20)
assert('category update preserves explicit override', changedFood.subcategories.find((item) => item.subcategoryName === 'Milk').normDays === 5)

const overridden = model.applySubcategoryNormToHierarchy(changed, 'Food', 'Bread', 9)
assert('subcategory edit creates override', overridden.find((item) => item.categoryName === 'Food').subcategories.find((item) => item.subcategoryName === 'Bread').hasOverride)
assert('subcategory edit stores exact value', overridden.find((item) => item.categoryName === 'Food').subcategories.find((item) => item.subcategoryName === 'Bread').normDays === 9)

assert('category search keeps full category', model.filterProcurementNormHierarchy(hierarchy, 'food')[0].subcategories.length === 2)
assert('subcategory search keeps matching child only', model.filterProcurementNormHierarchy(hierarchy, 'milk')[0].subcategories.length === 1)

const component = fs.readFileSync(path.join(ROOT, 'src/components/procurement/ProcurementNormsView.jsx'), 'utf8')
const service = fs.readFileSync(path.join(ROOT, 'src/services/procurementNormsService.js'), 'utf8')
const cacheSource = fs.readFileSync(path.join(ROOT, 'src/services/procurementNormsCache.js'), 'utf8')
const migration = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260812171700_procurement_norm_taxonomy_rpc.sql'),
  'utf8'
)
assert('component has accessible accordion', component.includes('aria-expanded={open}') && component.includes('aria-controls={panelId}'))
assert('component autosaves input', component.includes('AUTO_SAVE_DELAY_MS') && component.includes('onBlur'))
assert('page loading uses shared skeleton', component.includes('<DelayedLoadingSkeleton variant="list" count={7} />'))
assert('page loading spinner removed', !component.includes('className="proc-norms__loading"'))
assert('generated snapshot is read-only', component.includes("snapshot?.status === 'generated'") && component.includes("snapshot?.status === 'ready'"))
assert('partially generated snapshot stays editable', component.includes("snapshot?.status === 'partially_generated'"))
assert('norm writes use existing set_norm service path', service.includes('persistNormDaysForScope'))
assert('category save reapplies subcategory overrides', service.includes('overridesApplied') && service.includes('for (const override of overrides)'))
assert('taxonomy uses one compact RPC', service.includes("rpc('get_procurement_norm_taxonomy'") && service.includes('p_snapshot_id'))
assert('taxonomy no longer pages through every SKU', !service.includes('.range(') && !service.includes('100_000'))
assert('component renders cached model before network refresh', component.includes('getLatestCachedProcurementNormsModel') && component.includes('onCached: applyModel'))
assert('successful norm edits update cached hierarchy', component.includes('setCachedProcurementNormsModel({ snapshot, hierarchy: next })'))
assert('cache is versioned and bounded', cacheSource.includes('PROCUREMENT_NORMS_CACHE_VERSION') && cacheSource.includes('PROCUREMENT_NORMS_MAX_PERSISTED_ENTRIES'))
assert('cache uses 24h revalidate and 90d TTL', cache.PROCUREMENT_NORMS_REVALIDATE_AFTER_MS === 24 * 60 * 60 * 1000 && cache.PROCUREMENT_NORMS_CACHE_TTL_MS === 90 * 24 * 60 * 60 * 1000)
assert('RPC is stable security invoker', migration.includes('stable') && migration.includes('security invoker') && migration.includes("set search_path = ''"))
assert('RPC execute is least privilege', migration.includes('revoke all on function public.get_procurement_norm_taxonomy(uuid) from public') && migration.includes('from anon') && migration.includes('to authenticated'))
assert('taxonomy has a snapshot-first composite index', migration.includes('(snapshot_id, category_name, subcategory_name)'))

const cachedModel = {
  snapshot: { id: 'snapshot-1', status: 'ready', syncedAt: '2026-08-12T00:00:00Z' },
  hierarchy,
}
const storage = cache.createProcurementNormsMemoryStorage()
cache.resetProcurementNormsCacheForTests()
cache.setCachedProcurementNormsModel(cachedModel, { storage, now: 1_000 })
let fetchCalls = 0
const freshResult = await cache.loadProcurementNormsModelCached(
  'snapshot-1',
  async () => {
    fetchCalls += 1
    return cachedModel
  },
  { storage, now: 2_000 }
)
assert('fresh cache avoids a database refresh', freshResult.fromCache && fetchCalls === 0)

const staleResult = await cache.loadProcurementNormsModelCached(
  'snapshot-1',
  async () => {
    fetchCalls += 1
    return cachedModel
  },
  {
    storage,
    now: 1_000 + cache.PROCUREMENT_NORMS_REVALIDATE_AFTER_MS + 1,
  }
)
assert('stale cache is returned immediately with background refresh', staleResult.fromCache && Boolean(staleResult.refreshPromise))
await staleResult.refreshPromise
assert('stale cache refresh runs once', fetchCalls === 1)

cache.resetProcurementNormsCacheForTests()
let coalescedCalls = 0
let releaseRefresh
const delayed = () => {
  coalescedCalls += 1
  return new Promise((resolve) => {
    releaseRefresh = () => resolve(cachedModel)
  })
}
const firstRefresh = cache.revalidateProcurementNormsModel('snapshot-1', delayed, { storage })
const secondRefresh = cache.revalidateProcurementNormsModel('snapshot-1', delayed, { storage })
assert('parallel refreshes are coalesced', firstRefresh === secondRefresh && coalescedCalls === 1)
releaseRefresh()
await firstRefresh

cache.invalidateProcurementNormsCache('snapshot-1', { storage })
assert('sync invalidation removes the exact snapshot cache', cache.getCachedProcurementNormsModel('snapshot-1', { storage }) == null)

console.log(`\n${count}/${count} checks passed`)
