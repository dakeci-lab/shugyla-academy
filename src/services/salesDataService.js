/**
 * Продажи — monthly category revenue/margin facts (sales_category_month_facts)
 * and the sales_facts sync (umag-sales-sync Edge Function).
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { toUserErrorMessage } from '../utils/userErrorMessage'
import { extractFunctionErrorBody, resolveEdgeFunctionUserMessage } from '../utils/edgeFunctionErrors'

function assertConfigured() {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Сервер не настроен')
  }
}

/** Syncs exactly one calendar month (the next unsynced one). Call in a loop until upToDate. */
export async function syncNextSalesMonth() {
  assertConfigured()
  try {
    const { data, error } = await supabase.functions.invoke('umag-sales-sync', {
      body: { action: 'sync_next' },
    })
    if (error) {
      const body = await extractFunctionErrorBody(error)
      throw new Error(
        resolveEdgeFunctionUserMessage({
          error,
          body,
          fallback: 'Не удалось синхронизировать продажи из UMAG.',
        })
      )
    }
    if (data?.success !== true) {
      throw new Error(
        resolveEdgeFunctionUserMessage({
          body: data,
          fallback: 'Не удалось синхронизировать продажи из UMAG.',
        })
      )
    }
    return data
  } catch (err) {
    throw new Error(toUserErrorMessage(err, 'Не удалось синхронизировать продажи из UMAG.'))
  }
}

/** Latest sales_facts sync run — for "last synced" status and up-to-date checks. */
export async function fetchLatestSalesSyncRun() {
  assertConfigured()
  const { data, error } = await supabase
    .from('umag_sync_runs')
    .select('id, status, date_from, date_to, started_at, finished_at, error_message')
    .eq('entity', 'sales_facts')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(toUserErrorMessage(error, 'Не удалось получить статус синхронизации.'))
  if (!data) return null
  return {
    id: data.id,
    status: data.status,
    monthFrom: data.date_from,
    monthTo: data.date_to,
    startedAt: data.started_at,
    finishedAt: data.finished_at,
    errorMessage: data.error_message,
  }
}

const FACTS_PAGE_SIZE = 1000

/**
 * All category/subcategory month facts in [monthFrom, monthTo] (inclusive,
 * 'YYYY-MM-01' bounds). The table is a small aggregate (categories × months,
 * ~180 rows/month), but still grows past PostgREST's default 1000-row cap
 * within a year — paginate with .range() rather than trusting a bare
 * .select() to return everything.
 */
export async function fetchSalesCategoryMonthFacts({ monthFrom, monthTo } = {}) {
  assertConfigured()

  const rows = []
  let from = 0
  for (;;) {
    let query = supabase
      .from('sales_category_month_facts')
      .select('month_key, category_name, subcategory_name, revenue, cogs, profit, quantity, sku_count')
      .order('month_key', { ascending: true })
      .order('category_name', { ascending: true })
      .order('subcategory_name', { ascending: true })
      .range(from, from + FACTS_PAGE_SIZE - 1)

    if (monthFrom) query = query.gte('month_key', monthFrom)
    if (monthTo) query = query.lte('month_key', monthTo)

    const { data, error } = await query
    if (error) throw new Error(toUserErrorMessage(error, 'Не удалось загрузить данные продаж.'))

    rows.push(...(data || []))
    if (!data || data.length < FACTS_PAGE_SIZE) break
    from += FACTS_PAGE_SIZE
  }

  return rows.map((row) => ({
    monthKey: row.month_key,
    categoryName: row.category_name || '',
    subcategoryName: row.subcategory_name || '',
    revenue: Number(row.revenue) || 0,
    cogs: Number(row.cogs) || 0,
    profit: Number(row.profit) || 0,
    quantity: Number(row.quantity) || 0,
    skuCount: Number(row.sku_count) || 0,
  }))
}

export function monthKeyToDate(monthKey) {
  return monthKey ? monthKey.slice(0, 7) : ''
}

export function formatMonthLabel(monthKey) {
  if (!monthKey) return '—'
  const [y, m] = monthKey.split('-')
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, 1))
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function currentAlmatyMonthKeyFrontend() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Almaty',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  return `${y}-${m}-01`
}
