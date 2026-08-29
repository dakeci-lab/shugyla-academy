import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import {
  fetchLatestReadyProcurementSnapshot,
  persistNormDaysForScope,
} from './procurementPlanningService'
import { buildProcurementNormHierarchy } from '../components/procurement/procurementNormsModel'
import {
  getCachedProcurementNormsModel,
  getLatestCachedProcurementNormsModel,
  loadProcurementNormsModelCached,
} from './procurementNormsCache'

function ensureClient() {
  if (!isSupabaseConfigured() || !supabase) throw new Error('Сервер не настроен')
}

function normalizeRule(row) {
  return {
    id: row.id,
    categoryName: row.category_name || '',
    subcategoryName: row.subcategory_name || '',
    normDays: Number(row.norm_days),
    updatedAt: row.updated_at,
  }
}

export async function fetchProcurementNormTaxonomy(snapshotId) {
  ensureClient()
  if (!snapshotId) return []

  const { data, error } = await supabase.rpc('get_procurement_norm_taxonomy', {
    p_snapshot_id: snapshotId,
  })
  if (error) throw new Error(error.message || 'Не удалось загрузить категории')
  return (data || []).map((row) => ({
    categoryName: row.category_name || '',
    subcategoryName: row.subcategory_name || '',
  }))
}

export async function fetchProcurementNormRules({ categoryName } = {}) {
  ensureClient()
  let query = supabase
    .from('procurement_norm_rules')
    .select('id, category_name, subcategory_name, norm_days, updated_at')
    .order('category_name', { ascending: true })
    .order('subcategory_name', { ascending: true })

  if (categoryName != null) query = query.eq('category_name', categoryName || '')

  const { data, error } = await query
  if (error) throw new Error(error.message || 'Не удалось загрузить нормы')
  return (data || []).map(normalizeRule)
}

async function fetchFreshProcurementNormsModel(snapshot) {
  const [taxonomy, rules] = await Promise.all([
    fetchProcurementNormTaxonomy(snapshot.id),
    fetchProcurementNormRules(),
  ])
  return {
    snapshot,
    hierarchy: buildProcurementNormHierarchy({ taxonomy, rules }),
  }
}

export async function loadProcurementNormsModel({
  snapshot: suppliedSnapshot = null,
  forceRefresh = false,
  onCached = null,
  onFresh = null,
} = {}) {
  const seed = suppliedSnapshot?.id
    ? getCachedProcurementNormsModel(suppliedSnapshot.id)
    : getLatestCachedProcurementNormsModel()
  if (seed?.model) onCached?.(seed.model)

  // fetchLatestReadyProcurementSnapshot skips a snapshot that is still mid-sync,
  // so a background UMAG sync (started from the Планирование tab, or by someone
  // else) doesn't bounce this tab from its last usable snapshot to an empty one
  // that has no norms taxonomy loaded yet — see the function's doc comment.
  const snapshot = suppliedSnapshot || (await fetchLatestReadyProcurementSnapshot())
  if (!snapshot?.id || snapshot.status === 'syncing' || snapshot.status === 'failed') {
    const empty = { snapshot, hierarchy: [] }
    onFresh?.(empty)
    return empty
  }

  const result = await loadProcurementNormsModelCached(
    snapshot.id,
    () => fetchFreshProcurementNormsModel(snapshot),
    { forceRefresh, onCached }
  )

  if (result.refreshPromise) {
    void result.refreshPromise.then((fresh) => onFresh?.(fresh)).catch(() => {})
  } else if (!result.fromCache) {
    onFresh?.(result.model)
  }
  return result.model
}

export async function saveProcurementSubcategoryNorm({
  snapshotId,
  categoryName,
  subcategoryName,
  normDays,
}) {
  return persistNormDaysForScope({
    snapshotId,
    categoryName,
    subcategoryName,
    normDays,
  })
}

/**
 * The current category RPC updates every item in the category. Reapply stored
 * subcategory overrides immediately so the hierarchy remains effective in the draft.
 */
export async function saveProcurementCategoryNorm({ snapshotId, categoryName, normDays }) {
  const categoryResult = await persistNormDaysForScope({
    snapshotId,
    categoryName,
    subcategoryName: '',
    normDays,
  })

  const rules = await fetchProcurementNormRules({ categoryName })
  const overrides = rules.filter((rule) => Boolean(rule.subcategoryName))
  for (const override of overrides) {
    await persistNormDaysForScope({
      snapshotId,
      categoryName,
      subcategoryName: override.subcategoryName,
      normDays: override.normDays,
    })
  }

  return { ...categoryResult, overridesApplied: overrides.length }
}
