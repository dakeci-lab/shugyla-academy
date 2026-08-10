import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import {
  fetchLatestProcurementSnapshot,
  persistNormDaysForScope,
} from './procurementPlanningService'
import { buildProcurementNormHierarchy } from '../components/procurement/procurementNormsModel'

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

  const pageSize = 1000
  const pairs = new Map()

  for (let from = 0; from < 100_000; from += pageSize) {
    const { data, error } = await supabase
      .from('procurement_snapshot_items')
      .select('category_name, subcategory_name')
      .eq('snapshot_id', snapshotId)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message || 'Не удалось загрузить категории')
    for (const row of data || []) {
      const categoryName = row.category_name || ''
      const subcategoryName = row.subcategory_name || ''
      pairs.set(`${categoryName}\u0000${subcategoryName}`, { categoryName, subcategoryName })
    }
    if (!data || data.length < pageSize) break
  }

  return [...pairs.values()]
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

export async function loadProcurementNormsModel({ snapshot: suppliedSnapshot = null } = {}) {
  const snapshot = suppliedSnapshot || (await fetchLatestProcurementSnapshot())
  if (!snapshot?.id || snapshot.status === 'syncing' || snapshot.status === 'failed') {
    return { snapshot, hierarchy: [] }
  }

  const [taxonomy, rules] = await Promise.all([
    fetchProcurementNormTaxonomy(snapshot.id),
    fetchProcurementNormRules(),
  ])

  return {
    snapshot,
    hierarchy: buildProcurementNormHierarchy({ taxonomy, rules }),
  }
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
