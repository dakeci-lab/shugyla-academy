/** Статусы курса */
export const COURSE_STATUS = {
  ACTIVE: 'active',
  DRAFT: 'draft',
  ARCHIVE: 'archive',
}

export const COURSE_STATUS_LABELS = {
  active: 'Активный',
  published: 'Активный',
  draft: 'Черновик',
  archive: 'Архив',
}

export const COURSE_STATUS_BADGE = {
  active: 'published',
  published: 'published',
  draft: 'draft',
  archive: 'idle',
}

const LEGACY_ACTIVE = new Set(['published', 'active'])

export function normalizeCourseStatus(status) {
  if (!status) return COURSE_STATUS.DRAFT
  if (status === 'published') return COURSE_STATUS.ACTIVE
  return status
}

export function isActiveCourseStatus(status) {
  return LEGACY_ACTIVE.has(status) || status === COURSE_STATUS.ACTIVE
}

export function normalizeCourse(raw) {
  if (!raw) return null
  const status = normalizeCourseStatus(raw.status)
  const now = new Date().toISOString()

  return {
    id: raw.id,
    title: raw.title || '',
    description: raw.description || '',
    category: raw.category || 'for_all',
    allowedRoles: Array.isArray(raw.allowedRoles)
      ? [...raw.allowedRoles]
      : raw.allowed_roles
        ? [...raw.allowed_roles]
        : [],
    status,
    duration: raw.duration || raw.duration_label || '—',
    lessonsCount: raw.lessonsCount ?? raw.lessons_count ?? 0,
    testsCount: raw.testsCount ?? raw.tests_count ?? 0,
    blocksCount: raw.blocksCount ?? raw.blocks_count ?? 1,
    imageColor: raw.imageColor ?? raw.image_color ?? '#2d8f4e',
    coverImage: raw.coverImage ?? raw.cover_image ?? '',
    difficulty: raw.difficulty ?? '',
    author: raw.author ?? '',
    sortOrder: raw.sortOrder ?? raw.sort_order ?? 0,
    createdAt: raw.createdAt ?? raw.created_at ?? now,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? now,
  }
}

export function courseStatusToStorage(status) {
  if (status === COURSE_STATUS.ACTIVE) return 'published'
  return status
}

export function countCourseTests(tests, courseId) {
  return (tests || []).filter(
    (test) => Number(test.courseId) === Number(courseId)
  ).length
}
