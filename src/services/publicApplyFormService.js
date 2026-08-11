import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import {
  getPublishedVacancyBySlugSync,
  getCandidateQuestionsSync,
  getVacancyPositionLabel,
} from '../utils/recruitmentData'
import { mapApplicationFormRpcError } from '../utils/applicationForm'

/**
 * Lightweight public form load for /apply/:slug (no HR bootstrap).
 */
export async function fetchPublicVacancyApplicationForm(slug) {
  if (!isCloudMode() || !isSupabaseConfigured()) {
    const vacancy = getPublishedVacancyBySlugSync(slug)
    if (!vacancy) {
      const err = new Error('vacancy_not_found')
      err.code = 'vacancy_not_found'
      throw err
    }
    const questions = getCandidateQuestionsSync(vacancy.id)
      .filter((q) => q.isActive !== false)
      .map((q) => ({
        id: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        required: q.required !== false,
        sortOrder: q.sortOrder ?? 0,
        helpText: q.helpText || '',
        placeholder: q.placeholder || '',
        options: q.options || [],
      }))
    return {
      vacancy: {
        id: vacancy.id,
        title: vacancy.title,
        slug: vacancy.slug,
        description: vacancy.description || '',
        positionName: getVacancyPositionLabel(vacancy),
        city: vacancy.city || '',
        storeName: vacancy.storeName || '',
        storeAddress: vacancy.storeAddress || '',
        salaryFrom: vacancy.salaryFrom ?? null,
        salaryTo: vacancy.salaryTo ?? null,
        salaryNote: vacancy.salaryNote || '',
        schedule: vacancy.schedule || '',
        employmentType: vacancy.employmentType || null,
        experienceRequirement: vacancy.experienceRequirement || null,
      },
      formVersion: vacancy.applicationFormVersion || 1,
      questions,
    }
  }

  const { data, error } = await supabase.rpc('get_public_vacancy_application_form', {
    p_slug: String(slug || '').trim(),
  })

  if (error) {
    const mapped = mapApplicationFormRpcError(error)
    if (mapped) throw new Error(mapped)
    if (
      String(error.message || '').includes('vacancy_not_found') ||
      error.code === 'P0001'
    ) {
      const err = new Error('vacancy_not_found')
      err.code = 'vacancy_not_found'
      throw err
    }
    throw new Error('Не удалось загрузить анкету')
  }

  if (!data?.vacancy?.id) {
    const err = new Error('vacancy_not_found')
    err.code = 'vacancy_not_found'
    throw err
  }

  return {
    vacancy: {
      id: data.vacancy.id,
      title: data.vacancy.title || '',
      slug: data.vacancy.slug || '',
      description: data.vacancy.description || '',
      positionName: data.vacancy.position_name || '',
      city: data.vacancy.city || '',
      storeName: data.vacancy.store_name || '',
      storeAddress: data.vacancy.store_address || '',
      salaryFrom: data.vacancy.salary_from ?? null,
      salaryTo: data.vacancy.salary_to ?? null,
      salaryNote: data.vacancy.salary_note || '',
      schedule: data.vacancy.schedule || '',
      employmentType: data.vacancy.employment_type || null,
      experienceRequirement: data.vacancy.experience_requirement || null,
    },
    formVersion: Number(data.form_version) || 1,
    questions: (data.questions || []).map((q) => ({
      id: q.id,
      questionText: q.label || '',
      questionType: q.question_type,
      required: q.required !== false,
      sortOrder: q.sort_order ?? 0,
      helpText: q.help_text || '',
      placeholder: q.placeholder || '',
      options: Array.isArray(q.options) ? q.options : [],
    })),
  }
}
