import { isCloudMode } from '../lib/dataMode'
import {
  getCloudStandardCategories,
  getCloudStandardArticles,
  getCloudStandardArticleReads,
} from '../lib/cloudStore'
import { getLocalStandardsBundle } from '../services/standardsLocalAdapter'
import { getActiveEmployees } from './employeeData'
import { ROLES, ALL_EMPLOYEE_ROLES } from '../data/roles'

export const CATEGORY_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
}

export const ARTICLE_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
}

export const ARTICLE_STATUS_LABELS = {
  draft: 'Черновик',
  published: 'Активный',
  archived: 'Архив',
}

export const PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  IMPORTANT: 'important',
  CRITICAL: 'critical',
}

export const PRIORITY_LABELS = {
  low: 'Низкий',
  normal: 'Обычный',
  important: 'Важный',
  critical: 'Критический',
}

export const PRIORITY_BADGE = {
  low: 'idle',
  normal: 'idle',
  important: 'warning',
  critical: 'failed',
}

export const ROLE_OPTIONS = [
  { id: 'all', label: 'Все сотрудники' },
  ...ALL_EMPLOYEE_ROLES.map((id) => ({
    id,
    label: ROLES[id]?.label || id,
  })),
]

export function slugify(title) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  }

  const slug = (title || '')
    .trim()
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  return slug || 'article'
}

export function generateUniqueSlug(title, articles, excludeId = null) {
  const base = slugify(title)
  const existing = new Set(
    articles
      .filter((a) => a.id !== excludeId && a.slug)
      .map((a) => a.slug)
  )

  if (!existing.has(base)) return base

  let counter = 2
  while (existing.has(`${base}-${counter}`)) counter++
  return `${base}-${counter}`
}

export function normalizeCategory(raw) {
  return {
    id: raw.id,
    title: raw.title || '',
    description: raw.description || '',
    sortOrder: raw.sortOrder ?? raw.sort_order ?? 0,
    status: raw.status || CATEGORY_STATUS.ACTIVE,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  }
}

export function normalizeArticle(raw) {
  let visibilityRoles = raw.visibilityRoles ?? raw.visibility_roles ?? []
  if (typeof visibilityRoles === 'string') {
    try {
      visibilityRoles = JSON.parse(visibilityRoles)
    } catch {
      visibilityRoles = []
    }
  }
  if (!Array.isArray(visibilityRoles)) visibilityRoles = []

  return {
    id: raw.id,
    categoryId: raw.categoryId ?? raw.category_id ?? null,
    title: raw.title || '',
    slug: raw.slug || '',
    excerpt: raw.excerpt || '',
    content: raw.content || '',
    status: raw.status || ARTICLE_STATUS.DRAFT,
    visibilityRoles,
    priority: raw.priority || PRIORITY.NORMAL,
    createdBy: raw.createdBy ?? raw.created_by ?? null,
    updatedBy: raw.updatedBy ?? raw.updated_by ?? null,
    publishedAt: raw.publishedAt ?? raw.published_at ?? null,
    sortOrder: raw.sortOrder ?? raw.sort_order ?? 0,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  }
}

export function normalizeRead(raw) {
  return {
    id: raw.id,
    articleId: raw.articleId ?? raw.article_id,
    userId: raw.userId ?? raw.user_id,
    readAt: raw.readAt ?? raw.read_at,
    acknowledged: Boolean(raw.acknowledged),
    acknowledgedAt: raw.acknowledgedAt ?? raw.acknowledged_at ?? null,
  }
}

function readBundle() {
  if (isCloudMode()) {
    const categories = getCloudStandardCategories()
    const articles = getCloudStandardArticles()
    const reads = getCloudStandardArticleReads()
    if (categories) {
      return {
        categories: categories || [],
        articles: articles || [],
        reads: reads || [],
      }
    }
    return { categories: [], articles: [], reads: [] }
  }
  return getLocalStandardsBundle()
}

export function getAllStandardCategoriesSync() {
  return readBundle()
    .categories
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getAllStandardArticlesSync() {
  return readBundle().articles
}

export function getAllStandardReadsSync() {
  return readBundle().reads
}

export function getStandardCategoryByIdSync(categoryId) {
  return getAllStandardCategoriesSync().find((c) => c.id === categoryId) || null
}

export function getStandardArticleByIdSync(articleId) {
  return getAllStandardArticlesSync().find((a) => a.id === articleId) || null
}

export function getStandardArticleBySlugSync(slug) {
  return getAllStandardArticlesSync().find((a) => a.slug === slug) || null
}

export function getUserStandardReadsSync(userId) {
  return getAllStandardReadsSync().filter((r) => r.userId === userId)
}

export function getArticleReadsSync(articleId) {
  return getAllStandardReadsSync().filter((r) => r.articleId === articleId)
}

export function isArticleVisibleToRole(article, role) {
  if (!article || article.status !== ARTICLE_STATUS.PUBLISHED) return false
  if (!article.visibilityRoles?.length) return true
  return article.visibilityRoles.includes(role)
}

export function isArticleVisibleToUser(article, user) {
  if (!user) return false
  return isArticleVisibleToRole(article, user.role)
}

export function getPublishedStandardArticlesForUserSync(user) {
  return getAllStandardArticlesSync()
    .filter((article) => isArticleVisibleToUser(article, user))
    .sort((a, b) => {
      const sortA = a.sortOrder ?? 0
      const sortB = b.sortOrder ?? 0
      if (sortA !== sortB) return sortA - sortB
      const priorityOrder = { critical: 0, important: 1, normal: 2, low: 3 }
      const pa = priorityOrder[a.priority] ?? 2
      const pb = priorityOrder[b.priority] ?? 2
      if (pa !== pb) return pa - pb
      return new Date(b.updatedAt || b.publishedAt || 0) - new Date(a.updatedAt || a.publishedAt || 0)
    })
}

export function getEligibleEmployeesForArticle(article) {
  const employees = getActiveEmployees()
  if (!article.visibilityRoles?.length) return employees
  return employees.filter((emp) => article.visibilityRoles.includes(emp.role))
}

export function getStandardArticleReadStatsSync(articleId) {
  const article = getStandardArticleByIdSync(articleId)
  if (!article) {
    return {
      totalEligible: 0,
      acknowledgedCount: 0,
      readCount: 0,
      percent: 0,
      employees: [],
    }
  }

  const eligible = getEligibleEmployeesForArticle(article)
  const reads = getArticleReadsSync(articleId)
  const readMap = new Map(reads.map((r) => [r.userId, r]))

  const employees = eligible.map((emp) => {
    const read = readMap.get(emp.id)
    return {
      userId: emp.id,
      name: emp.name,
      role: emp.role,
      roleLabel: ROLES[emp.role]?.label || emp.role,
      acknowledged: Boolean(read?.acknowledged),
      readAt: read?.readAt || null,
      acknowledgedAt: read?.acknowledgedAt || null,
    }
  })

  const acknowledgedCount = employees.filter((e) => e.acknowledged).length
  const readCount = employees.filter((e) => e.readAt).length
  const totalEligible = employees.length
  const percent = totalEligible > 0 ? Math.round((acknowledgedCount / totalEligible) * 100) : 0

  return {
    totalEligible,
    acknowledgedCount,
    readCount,
    percent,
    employees,
  }
}

export function getUserStandardsSummary(userId, user) {
  const articles = getPublishedStandardArticlesForUserSync(user)
  const reads = getUserStandardReadsSync(userId)
  const ackSet = new Set(reads.filter((r) => r.acknowledged).map((r) => r.articleId))

  const unacknowledged = articles.filter((a) => !ackSet.has(a.id))
  const importantUnack = unacknowledged.filter(
    (a) => a.priority === PRIORITY.IMPORTANT || a.priority === PRIORITY.CRITICAL
  )

  return {
    total: articles.length,
    unacknowledgedCount: unacknowledged.length,
    importantUnacknowledgedCount: importantUnack.length,
  }
}

export function getVisibilityRoleLabels(article) {
  if (!article.visibilityRoles?.length) return ['Все сотрудники']
  return article.visibilityRoles.map((roleId) => ROLES[roleId]?.label || roleId)
}

export function searchArticles(articles, query) {
  const q = query.trim().toLowerCase()
  if (!q) return articles
  return articles.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      (a.excerpt || '').toLowerCase().includes(q) ||
      (a.content || '').toLowerCase().includes(q)
  )
}

export function isArticleNew(article) {
  if (!article.publishedAt) return false
  const published = new Date(article.publishedAt)
  const days = (Date.now() - published.getTime()) / (1000 * 60 * 60 * 24)
  return days <= 14
}
