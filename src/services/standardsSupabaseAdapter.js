import { supabase } from '../lib/supabaseClient'
import {
  generateUniqueSlug,
  normalizeCategory,
  normalizeArticle,
  normalizeRead,
  ARTICLE_STATUS,
  CATEGORY_STATUS,
  getAllStandardArticlesSync,
} from '../utils/standardsData'

async function throwIfError(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`)
  return result.data
}

function rowToCategory(row) {
  return normalizeCategory({
    id: row.id,
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function rowToArticle(row) {
  return normalizeArticle({
    id: row.id,
    categoryId: row.category_id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content,
    status: row.status,
    visibilityRoles: row.visibility_roles,
    priority: row.priority,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function rowToRead(row) {
  return normalizeRead({
    id: row.id,
    articleId: row.article_id,
    userId: row.user_id,
    readAt: row.read_at,
    acknowledged: row.acknowledged,
    acknowledgedAt: row.acknowledged_at,
  })
}

export async function fetchStandardsData() {
  const [catRes, artRes, readRes] = await Promise.all([
    supabase.from('academy_standard_categories').select('*').order('sort_order'),
    supabase.from('academy_standard_articles').select('*').order('updated_at', { ascending: false }),
    supabase.from('academy_standard_article_reads').select('*'),
  ])

  return {
    categories: (await throwIfError(catRes, 'Загрузка категорий')).map(rowToCategory),
    articles: (await throwIfError(artRes, 'Загрузка статей')).map(rowToArticle),
    reads: (await throwIfError(readRes, 'Загрузка ознакомлений')).map(rowToRead),
  }
}

export async function createStandardCategory(data) {
  const row = {
    id: data.id || crypto.randomUUID(),
    title: data.title,
    description: data.description || '',
    sort_order: data.sortOrder ?? 0,
    status: data.status || CATEGORY_STATUS.ACTIVE,
  }
  await throwIfError(
    await supabase.from('academy_standard_categories').insert(row),
    'Создание категории'
  )
  return row.id
}

export async function updateStandardCategory(categoryId, updates) {
  const patch = {}
  if (updates.title != null) patch.title = updates.title
  if (updates.description != null) patch.description = updates.description
  if (updates.sortOrder != null) patch.sort_order = updates.sortOrder
  if (updates.status != null) patch.status = updates.status
  if (Object.keys(patch).length) {
    await throwIfError(
      await supabase.from('academy_standard_categories').update(patch).eq('id', categoryId),
      'Обновление категории'
    )
  }
}

export async function archiveStandardCategory(categoryId) {
  await updateStandardCategory(categoryId, { status: CATEGORY_STATUS.ARCHIVED })
}

export async function deleteStandardCategory(categoryId) {
  await throwIfError(
    await supabase.from('academy_standard_categories').delete().eq('id', categoryId),
    'Удаление категории'
  )
}

export async function reorderStandardCategories(orderedCategoryIds) {
  await Promise.all(
    orderedCategoryIds.map((id, index) =>
      supabase.from('academy_standard_categories').update({ sort_order: index }).eq('id', id)
    )
  )
}

export async function createStandardArticle(data) {
  const articles = getAllStandardArticlesSync()
  const slug = data.slug || generateUniqueSlug(data.title, articles)
  const row = {
    id: data.id || crypto.randomUUID(),
    category_id: data.categoryId || null,
    title: data.title,
    slug,
    excerpt: data.excerpt || '',
    content: data.content,
    status: data.status || ARTICLE_STATUS.DRAFT,
    visibility_roles: data.visibilityRoles || [],
    priority: data.priority || 'normal',
    created_by: data.createdBy ?? null,
    updated_by: data.updatedBy ?? null,
    published_at: data.status === ARTICLE_STATUS.PUBLISHED ? new Date().toISOString() : null,
  }
  await throwIfError(
    await supabase.from('academy_standard_articles').insert(row),
    'Создание статьи'
  )
  return row.id
}

export async function updateStandardArticle(articleId, updates) {
  const patch = {}
  if (updates.categoryId !== undefined) patch.category_id = updates.categoryId
  if (updates.title != null) patch.title = updates.title
  if (updates.slug != null) patch.slug = updates.slug
  if (updates.excerpt != null) patch.excerpt = updates.excerpt
  if (updates.content != null) patch.content = updates.content
  if (updates.status != null) patch.status = updates.status
  if (updates.visibilityRoles != null) patch.visibility_roles = updates.visibilityRoles
  if (updates.priority != null) patch.priority = updates.priority
  if (updates.updatedBy != null) patch.updated_by = updates.updatedBy
  if (updates.publishedAt !== undefined) patch.published_at = updates.publishedAt

  if (updates.title && updates.slug == null) {
    const articles = getAllStandardArticlesSync()
    patch.slug = generateUniqueSlug(updates.title, articles, articleId)
  }

  if (Object.keys(patch).length) {
    await throwIfError(
      await supabase.from('academy_standard_articles').update(patch).eq('id', articleId),
      'Обновление статьи'
    )
  }
}

export async function publishStandardArticle(articleId) {
  await throwIfError(
    await supabase
      .from('academy_standard_articles')
      .update({ status: ARTICLE_STATUS.PUBLISHED, published_at: new Date().toISOString() })
      .eq('id', articleId),
    'Публикация статьи'
  )
}

export async function unpublishStandardArticle(articleId) {
  await updateStandardArticle(articleId, { status: ARTICLE_STATUS.DRAFT })
}

export async function archiveStandardArticle(articleId) {
  await updateStandardArticle(articleId, { status: ARTICLE_STATUS.ARCHIVED })
}

export async function deleteStandardArticle(articleId) {
  await throwIfError(
    await supabase.from('academy_standard_articles').delete().eq('id', articleId),
    'Удаление статьи'
  )
}

async function upsertRead(articleId, userId, patch) {
  const existing = await throwIfError(
    await supabase
      .from('academy_standard_article_reads')
      .select('*')
      .eq('article_id', articleId)
      .eq('user_id', userId)
      .maybeSingle(),
    'Поиск записи ознакомления'
  )

  if (existing) {
    const updatePatch = { ...patch }
    if (patch.acknowledged && !existing.acknowledged_at) {
      updatePatch.acknowledged_at = new Date().toISOString()
    }
    await throwIfError(
      await supabase
        .from('academy_standard_article_reads')
        .update(updatePatch)
        .eq('id', existing.id),
      'Обновление ознакомления'
    )
    return rowToRead({ ...existing, ...updatePatch })
  }

  const row = {
    article_id: articleId,
    user_id: userId,
    read_at: new Date().toISOString(),
    acknowledged: patch.acknowledged || false,
    acknowledged_at: patch.acknowledged ? new Date().toISOString() : null,
  }
  const inserted = await throwIfError(
    await supabase.from('academy_standard_article_reads').insert(row).select().single(),
    'Создание записи ознакомления'
  )
  return rowToRead(inserted)
}

export async function markStandardArticleRead(articleId, userId) {
  return upsertRead(articleId, userId, { read_at: new Date().toISOString() })
}

export async function acknowledgeStandardArticle(articleId, userId) {
  return upsertRead(articleId, userId, {
    read_at: new Date().toISOString(),
    acknowledged: true,
    acknowledged_at: new Date().toISOString(),
  })
}
