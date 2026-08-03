import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import {
  getPublishedVacanciesSync,
  VACANCY_STATUS,
} from '../utils/recruitmentData'

/**
 * Lightweight public list for /apply hub.
 * Uses SECURITY DEFINER RPC — does not load candidates or positions catalog.
 */
export async function fetchPublishedVacanciesForApply() {
  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) {
    return getPublishedVacanciesSync()
      .filter(
        (v) =>
          v.status === VACANCY_STATUS.PUBLISHED &&
          v.slug &&
          v.positionId &&
          v.positionIsActive !== false &&
          v.positionArchived !== true
      )
      .map((v) => ({
        id: v.id,
        title: v.title,
        slug: v.slug,
        description: v.description || null,
        positionName: v.positionName || v.positionNameSnapshot || v.title,
        createdAt: v.createdAt || null,
      }))
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
        if (tb !== ta) return tb - ta
        return String(a.title || '').localeCompare(String(b.title || ''), 'ru')
      })
  }

  const { data, error } = await supabase.rpc('list_published_vacancies_for_apply')
  if (error) {
    throw new Error(error.message || 'Не удалось загрузить вакансии')
  }

  return (data || []).map((row) => ({
    id: row.id,
    title: row.title || '',
    slug: row.slug || '',
    description: row.description || null,
    positionName: row.position_name || row.title || '',
    createdAt: row.created_at || null,
  }))
}
