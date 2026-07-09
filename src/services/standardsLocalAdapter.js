import { ROLE_IDS } from '../data/roles'
import {
  slugify,
  generateUniqueSlug,
  normalizeCategory,
  normalizeArticle,
  normalizeRead,
  ARTICLE_STATUS,
  CATEGORY_STATUS,
} from '../utils/standardsData'

const STORAGE_KEYS = {
  CATEGORIES: 'shugyla_standard_categories',
  ARTICLES: 'shugyla_standard_articles',
  READS: 'shugyla_standard_article_reads',
}

function readJson(key, fallback) {
  const data = localStorage.getItem(key)
  return data ? JSON.parse(data) : fallback
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function genId() {
  return crypto.randomUUID()
}

function loadCategoriesRaw() {
  return readJson(STORAGE_KEYS.CATEGORIES, [])
}

function loadArticlesRaw() {
  return readJson(STORAGE_KEYS.ARTICLES, [])
}

function loadReadsRaw() {
  return readJson(STORAGE_KEYS.READS, [])
}

export function seedMockStandardsIfEmpty() {
  if (loadCategoriesRaw().length > 0) return

  const categories = [
    { id: genId(), title: 'Сервис', description: 'Стандарты обслуживания клиентов', sort_order: 0, status: 'active' },
    { id: genId(), title: 'Касса', description: 'Работа на кассовой линии', sort_order: 1, status: 'active' },
    { id: genId(), title: 'Выкладка', description: 'Стандарты выкладки товара', sort_order: 2, status: 'active' },
    { id: genId(), title: 'Склад и приёмка', description: 'Приём поставок и склад', sort_order: 3, status: 'active' },
    { id: genId(), title: 'Чистота и порядок', description: 'Поддержание чистоты', sort_order: 4, status: 'active' },
    { id: genId(), title: 'Безопасность', description: 'Правила безопасности', sort_order: 5, status: 'active' },
  ]

  const serviceId = categories[0].id
  const cashId = categories[1].id
  const cleanId = categories[4].id

  const articles = [
    {
      id: genId(),
      category_id: serviceId,
      title: 'Как встречать клиента',
      slug: 'kak-vstrechat-klienta',
      excerpt: 'Базовые правила приветствия и первого контакта с покупателем.',
      content: `# Как встречать клиента\n\n- Улыбайтесь и здоровайтесь первыми\n- Поддерживайте зрительный контакт\n- Предлагайте помощь, если клиент выглядит растерянным\n\n**Важно:** клиент должен чувствовать, что ему рады.`,
      status: 'published',
      visibility_roles: [],
      priority: 'important',
      published_at: new Date().toISOString(),
    },
    {
      id: genId(),
      category_id: serviceId,
      title: 'Как действовать при конфликте с клиентом',
      slug: 'konflikt-s-klientom',
      excerpt: 'Алгоритм действий при спорной ситуации.',
      content: `## Алгоритм\n\n1. Выслушайте клиента\n2. Сохраняйте спокойствие\n3. Предложите решение в рамках стандартов\n4. При необходимости позовите администратора`,
      status: 'published',
      visibility_roles: [ROLE_IDS.CASHIER, ROLE_IDS.SELLER, ROLE_IDS.FLOOR_ADMIN],
      priority: 'critical',
      published_at: new Date().toISOString(),
    },
    {
      id: genId(),
      category_id: cashId,
      title: 'Стандарт чистоты кассовой зоны',
      slug: 'chistota-kassovoy-zony',
      excerpt: 'Требования к чистоте рабочего места кассира.',
      content: `- Рабочая поверхность протирается каждые 2 часа\n- Мусор не должен накапливаться у кассы\n- Терминал и сканер должны быть чистыми`,
      status: 'published',
      visibility_roles: [ROLE_IDS.CASHIER],
      priority: 'normal',
      published_at: new Date().toISOString(),
    },
    {
      id: genId(),
      category_id: cleanId,
      title: 'Как проверять сроки годности',
      slug: 'sroki-godnosti',
      excerpt: 'Ежедневная проверка сроков на полках.',
      content: `## Порядок проверки\n\n- Проверяйте полки по зонам ответственности\n- Товары с истекающим сроком выносите в зону уценки\n- Фиксируйте списания по регламенту`,
      status: 'published',
      visibility_roles: [],
      priority: 'important',
      published_at: new Date().toISOString(),
    },
  ]

  writeJson(STORAGE_KEYS.CATEGORIES, categories)
  writeJson(STORAGE_KEYS.ARTICLES, articles)
  writeJson(STORAGE_KEYS.READS, [])
}

export function getLocalStandardsBundle() {
  seedMockStandardsIfEmpty()
  return {
    categories: loadCategoriesRaw().map(normalizeCategory),
    articles: loadArticlesRaw().map(normalizeArticle),
    reads: loadReadsRaw().map(normalizeRead),
  }
}

function saveCategories(categories) {
  writeJson(
    STORAGE_KEYS.CATEGORIES,
    categories.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description || '',
      sort_order: c.sortOrder ?? 0,
      status: c.status,
    }))
  )
}

function saveArticles(articles) {
  writeJson(
    STORAGE_KEYS.ARTICLES,
    articles.map((a) => ({
      id: a.id,
      category_id: a.categoryId,
      title: a.title,
      slug: a.slug,
      excerpt: a.excerpt || '',
      content: a.content,
      status: a.status,
      visibility_roles: a.visibilityRoles || [],
      priority: a.priority,
      created_by: a.createdBy,
      updated_by: a.updatedBy,
      published_at: a.publishedAt,
      sort_order: a.sortOrder ?? 0,
    }))
  )
}

function saveReads(reads) {
  writeJson(
    STORAGE_KEYS.READS,
    reads.map((r) => ({
      id: r.id,
      article_id: r.articleId,
      user_id: r.userId,
      read_at: r.readAt,
      acknowledged: r.acknowledged,
      acknowledged_at: r.acknowledgedAt,
    }))
  )
}

export async function createStandardCategory(data) {
  const bundle = getLocalStandardsBundle()
  const category = normalizeCategory({
    id: genId(),
    title: data.title,
    description: data.description || '',
    sortOrder: data.sortOrder ?? bundle.categories.length,
    status: data.status || CATEGORY_STATUS.ACTIVE,
  })
  bundle.categories.push(category)
  saveCategories(bundle.categories)
  return category.id
}

export async function updateStandardCategory(categoryId, updates) {
  const bundle = getLocalStandardsBundle()
  const idx = bundle.categories.findIndex((c) => c.id === categoryId)
  if (idx < 0) throw new Error('Категория не найдена')
  bundle.categories[idx] = normalizeCategory({ ...bundle.categories[idx], ...updates })
  saveCategories(bundle.categories)
}

export async function archiveStandardCategory(categoryId) {
  await updateStandardCategory(categoryId, { status: CATEGORY_STATUS.ARCHIVED })
}

export async function deleteStandardCategory(categoryId) {
  const bundle = getLocalStandardsBundle()
  saveCategories(bundle.categories.filter((c) => c.id !== categoryId))
  bundle.articles.forEach((a) => {
    if (a.categoryId === categoryId) a.categoryId = null
  })
  saveArticles(bundle.articles)
}

export async function reorderStandardCategories(orderedCategoryIds) {
  const bundle = getLocalStandardsBundle()
  orderedCategoryIds.forEach((id, index) => {
    const cat = bundle.categories.find((c) => c.id === id)
    if (cat) cat.sortOrder = index
  })
  saveCategories(bundle.categories)
}

export async function createStandardArticle(data) {
  const bundle = getLocalStandardsBundle()
  const slug = data.slug || generateUniqueSlug(data.title, bundle.articles)
  const article = normalizeArticle({
    id: genId(),
    ...data,
    slug,
    status: data.status || ARTICLE_STATUS.DRAFT,
    publishedAt: data.status === ARTICLE_STATUS.PUBLISHED ? new Date().toISOString() : null,
  })
  bundle.articles.push(article)
  saveArticles(bundle.articles)
  return article.id
}

export async function updateStandardArticle(articleId, updates) {
  const bundle = getLocalStandardsBundle()
  const idx = bundle.articles.findIndex((a) => a.id === articleId)
  if (idx < 0) throw new Error('Статья не найдена')

  const current = bundle.articles[idx]
  const next = { ...current, ...updates }

  if (updates.title && !updates.slug) {
    next.slug = generateUniqueSlug(updates.title, bundle.articles, articleId)
  }

  if (updates.status === ARTICLE_STATUS.PUBLISHED && !current.publishedAt) {
    next.publishedAt = new Date().toISOString()
  }

  bundle.articles[idx] = normalizeArticle(next)
  saveArticles(bundle.articles)
}

export async function publishStandardArticle(articleId) {
  await updateStandardArticle(articleId, {
    status: ARTICLE_STATUS.PUBLISHED,
    publishedAt: new Date().toISOString(),
  })
}

export async function unpublishStandardArticle(articleId) {
  await updateStandardArticle(articleId, { status: ARTICLE_STATUS.DRAFT })
}

export async function archiveStandardArticle(articleId) {
  await updateStandardArticle(articleId, { status: ARTICLE_STATUS.ARCHIVED })
}

export async function deleteStandardArticle(articleId) {
  const bundle = getLocalStandardsBundle()
  saveArticles(bundle.articles.filter((a) => a.id !== articleId))
  saveReads(bundle.reads.filter((r) => r.articleId !== articleId))
}

function upsertRead(articleId, userId, patch) {
  const bundle = getLocalStandardsBundle()
  let read = bundle.reads.find((r) => r.articleId === articleId && r.userId === userId)

  if (!read) {
    read = normalizeRead({
      id: genId(),
      articleId,
      userId,
      readAt: new Date().toISOString(),
      acknowledged: false,
      acknowledgedAt: null,
    })
    bundle.reads.push(read)
  }

  Object.assign(read, patch)
  if (patch.acknowledged && !read.acknowledgedAt) {
    read.acknowledgedAt = new Date().toISOString()
  }
  if (!read.readAt) read.readAt = new Date().toISOString()

  saveReads(bundle.reads)
  return read
}

export async function markStandardArticleRead(articleId, userId) {
  return upsertRead(articleId, userId, { readAt: new Date().toISOString() })
}

export async function acknowledgeStandardArticle(articleId, userId) {
  return upsertRead(articleId, userId, {
    readAt: new Date().toISOString(),
    acknowledged: true,
    acknowledgedAt: new Date().toISOString(),
  })
}

export { slugify, generateUniqueSlug }
