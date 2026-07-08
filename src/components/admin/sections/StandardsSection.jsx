import { useMemo, useState } from 'react'
import {
  getStandardCategories,
  getStandardArticles,
  createStandardArticle,
  updateStandardArticle,
  deleteStandardArticle,
  publishStandardArticle,
  unpublishStandardArticle,
  archiveStandardArticle,
  createStandardCategory,
  updateStandardCategory,
  archiveStandardCategory,
  deleteStandardCategory,
  reorderStandardCategories,
  getStandardArticleReadStats,
} from '../../../services/academyDataService'
import {
  ARTICLE_STATUS_LABELS,
  PRIORITY_LABELS,
  PRIORITY,
  ARTICLE_STATUS,
  ROLE_OPTIONS,
  getVisibilityRoleLabels,
} from '../../../utils/standardsData'
import { ALL_EMPLOYEE_ROLES, ROLES } from '../../../data/roles'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../AdminModal'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'
import '../../../pages/Standards.css'

const STATUS_BADGE = {
  draft: 'warning',
  published: 'done',
  archived: 'idle',
}

const PRIORITY_BADGE = {
  low: 'idle',
  normal: 'idle',
  important: 'warning',
  critical: 'failed',
}

const EMPTY_ARTICLE_FORM = {
  title: '',
  categoryId: '',
  excerpt: '',
  content: '',
  status: ARTICLE_STATUS.DRAFT,
  priority: PRIORITY.NORMAL,
  allRoles: true,
  visibilityRoles: [],
}

const EMPTY_CATEGORY_FORM = {
  title: '',
  description: '',
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

/** Раздел «Стандарты» в админ-панели */
export default function StandardsSection() {
  const { version, refresh } = useAdminRefresh()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')

  const [showArticleForm, setShowArticleForm] = useState(false)
  const [editArticleId, setEditArticleId] = useState(null)
  const [articleForm, setArticleForm] = useState(EMPTY_ARTICLE_FORM)
  const [articleError, setArticleError] = useState('')

  const [showCategories, setShowCategories] = useState(false)
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY_FORM)
  const [editCategoryId, setEditCategoryId] = useState(null)
  const [categoryError, setCategoryError] = useState('')

  const [statsArticleId, setStatsArticleId] = useState(null)
  const [actionError, setActionError] = useState('')

  void version

  const categories = getStandardCategories()
  const articles = getStandardArticles()

  function categoryTitle(id) {
    return categories.find((c) => c.id === id)?.title || '—'
  }

  const filteredArticles = useMemo(() => {
    const q = search.trim().toLowerCase()
    return articles.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      if (priorityFilter !== 'all' && a.priority !== priorityFilter) return false
      if (roleFilter !== 'all') {
        if (!a.visibilityRoles?.length) return roleFilter === 'all_staff'
        if (roleFilter === 'all_staff') return false
        if (!a.visibilityRoles.includes(roleFilter)) return false
      }
      if (!q) return true
      return (
        a.title.toLowerCase().includes(q) ||
        (a.excerpt || '').toLowerCase().includes(q) ||
        (a.content || '').toLowerCase().includes(q)
      )
    })
  }, [articles, search, statusFilter, priorityFilter, roleFilter])

  function openCreateArticle() {
    setEditArticleId(null)
    setArticleForm(EMPTY_ARTICLE_FORM)
    setArticleError('')
    setShowArticleForm(true)
  }

  function openEditArticle(article) {
    setEditArticleId(article.id)
    setArticleForm({
      title: article.title,
      categoryId: article.categoryId || '',
      excerpt: article.excerpt || '',
      content: article.content,
      status: article.status,
      priority: article.priority,
      allRoles: !article.visibilityRoles?.length,
      visibilityRoles: [...(article.visibilityRoles || [])],
    })
    setArticleError('')
    setShowArticleForm(true)
  }

  function toggleVisibilityRole(roleId) {
    if (articleForm.allRoles) return
    const roles = articleForm.visibilityRoles.includes(roleId)
      ? articleForm.visibilityRoles.filter((r) => r !== roleId)
      : [...articleForm.visibilityRoles, roleId]
    setArticleForm({ ...articleForm, visibilityRoles: roles })
  }

  async function handleArticleSave(e) {
    e.preventDefault()
    const payload = {
      title: articleForm.title.trim(),
      categoryId: articleForm.categoryId || null,
      excerpt: articleForm.excerpt.trim(),
      content: articleForm.content.trim(),
      status: articleForm.status,
      priority: articleForm.priority,
      visibilityRoles: articleForm.allRoles ? [] : articleForm.visibilityRoles,
    }

    try {
      if (editArticleId) {
        await updateStandardArticle(editArticleId, payload)
      } else {
        await createStandardArticle(payload)
      }
      setShowArticleForm(false)
      await refresh()
    } catch (err) {
      setArticleError(err.message || 'Не удалось сохранить статью')
    }
  }

  async function runArticleAction(action, articleId) {
    setActionError('')
    try {
      await action(articleId)
      await refresh()
    } catch (err) {
      setActionError(err.message || 'Не удалось выполнить действие')
    }
  }

  async function handleDeleteArticle(article) {
    if (!window.confirm(`Удалить статью «${article.title}»?`)) return
    await runArticleAction(deleteStandardArticle, article.id)
  }

  async function handleCategorySave(e) {
    e.preventDefault()
    try {
      if (editCategoryId) {
        await updateStandardCategory(editCategoryId, {
          title: categoryForm.title.trim(),
          description: categoryForm.description.trim(),
        })
      } else {
        await createStandardCategory({
          title: categoryForm.title.trim(),
          description: categoryForm.description.trim(),
          sortOrder: categories.length,
        })
      }
      setCategoryForm(EMPTY_CATEGORY_FORM)
      setEditCategoryId(null)
      await refresh()
    } catch (err) {
      setCategoryError(err.message || 'Не удалось сохранить категорию')
    }
  }

  async function moveCategory(catId, direction) {
    const active = categories.filter((c) => c.status === 'active')
    const ids = active.map((c) => c.id)
    const index = ids.indexOf(catId)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await reorderStandardCategories(ids)
    await refresh()
  }

  const stats = statsArticleId ? getStandardArticleReadStats(statsArticleId) : null
  const statsArticle = statsArticleId
    ? articles.find((a) => a.id === statsArticleId)
    : null

  return (
    <>
      <div className="admin-toolbar admin-toolbar--stack">
        <span className="admin-toolbar__info">{filteredArticles.length} статей</span>
        <div className="admin-table__actions">
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setShowCategories(true)}>
            Категории
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={openCreateArticle}>
            + Создать статью
          </button>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          type="search"
          className="admin-search"
          placeholder="Поиск по статьям…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="admin-form__select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Все статусы</option>
          <option value="draft">Черновик</option>
          <option value="published">Опубликовано</option>
          <option value="archived">Архив</option>
        </select>
        <select
          className="admin-form__select"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
        >
          <option value="all">Все приоритеты</option>
          <option value="low">Низкий</option>
          <option value="normal">Обычный</option>
          <option value="important">Важный</option>
          <option value="critical">Критический</option>
        </select>
        <select
          className="admin-form__select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">Все роли</option>
          <option value="all_staff">Все сотрудники</option>
          {ALL_EMPLOYEE_ROLES.map((roleId) => (
            <option key={roleId} value={roleId}>
              {ROLES[roleId]?.label || roleId}
            </option>
          ))}
        </select>
      </div>

      {actionError && <p className="admin-form__error">{actionError}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Категория</th>
              <th>Статус</th>
              <th>Приоритет</th>
              <th>Доступ</th>
              <th>Обновлено</th>
              <th>Ознакомились</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredArticles.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-empty">
                  Статьи не найдены
                </td>
              </tr>
            ) : (
              filteredArticles.map((article) => {
                const readStats = getStandardArticleReadStats(article.id)
                return (
                  <tr key={article.id}>
                    <td><strong>{article.title}</strong></td>
                    <td>{categoryTitle(article.categoryId)}</td>
                    <td>
                      <StatusBadge
                        label={ARTICLE_STATUS_LABELS[article.status]}
                        type={STATUS_BADGE[article.status]}
                      />
                    </td>
                    <td>
                      <StatusBadge
                        label={PRIORITY_LABELS[article.priority]}
                        type={PRIORITY_BADGE[article.priority]}
                      />
                    </td>
                    <td>{getVisibilityRoleLabels(article).join(', ')}</td>
                    <td>{formatDate(article.updatedAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--outline btn--sm"
                        onClick={() => setStatsArticleId(article.id)}
                      >
                        {readStats.acknowledgedCount}/{readStats.totalEligible} ({readStats.percent}%)
                      </button>
                    </td>
                    <td>
                      <div className="admin-table__actions">
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          onClick={() => openEditArticle(article)}
                        >
                          Редактировать
                        </button>
                        {article.status === 'draft' && (
                          <button
                            type="button"
                            className="btn btn--outline btn--sm"
                            onClick={() => runArticleAction(publishStandardArticle, article.id)}
                          >
                            Опубликовать
                          </button>
                        )}
                        {article.status === 'published' && (
                          <button
                            type="button"
                            className="btn btn--outline btn--sm"
                            onClick={() => runArticleAction(unpublishStandardArticle, article.id)}
                          >
                            Снять с публикации
                          </button>
                        )}
                        {article.status !== 'archived' && (
                          <button
                            type="button"
                            className="btn btn--outline btn--sm"
                            onClick={() => runArticleAction(archiveStandardArticle, article.id)}
                          >
                            Архивировать
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--outline btn--sm admin-table__danger"
                          onClick={() => handleDeleteArticle(article)}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {showArticleForm && (
        <AdminModal
          title={editArticleId ? 'Редактировать статью' : 'Создать статью'}
          onClose={() => setShowArticleForm(false)}
          xwide
          footer={
            <>
              <button type="button" className="btn btn--outline" onClick={() => setShowArticleForm(false)}>
                Отмена
              </button>
              <button type="submit" className="btn btn--primary" form="standard-article-form">
                Сохранить
              </button>
            </>
          }
        >
          <form id="standard-article-form" className="admin-form" onSubmit={handleArticleSave}>
            <label className="admin-form__label">
              Название статьи *
              <input
                className="admin-form__input"
                value={articleForm.title}
                onChange={(e) => setArticleForm({ ...articleForm, title: e.target.value })}
                required
              />
            </label>

            <div className="admin-form__row">
              <label className="admin-form__label">
                Категория
                <select
                  className="admin-form__select"
                  value={articleForm.categoryId}
                  onChange={(e) => setArticleForm({ ...articleForm, categoryId: e.target.value })}
                >
                  <option value="">Без категории</option>
                  {categories
                    .filter((c) => c.status === 'active')
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.title}
                      </option>
                    ))}
                </select>
              </label>
              <label className="admin-form__label">
                Статус
                <select
                  className="admin-form__select"
                  value={articleForm.status}
                  onChange={(e) => setArticleForm({ ...articleForm, status: e.target.value })}
                >
                  <option value="draft">Черновик</option>
                  <option value="published">Опубликовано</option>
                  <option value="archived">Архив</option>
                </select>
              </label>
              <label className="admin-form__label">
                Приоритет
                <select
                  className="admin-form__select"
                  value={articleForm.priority}
                  onChange={(e) => setArticleForm({ ...articleForm, priority: e.target.value })}
                >
                  <option value="low">Низкий</option>
                  <option value="normal">Обычный</option>
                  <option value="important">Важный</option>
                  <option value="critical">Критический</option>
                </select>
              </label>
            </div>

            <label className="admin-form__label">
              Краткое описание
              <textarea
                className="admin-form__input"
                rows={2}
                value={articleForm.excerpt}
                onChange={(e) => setArticleForm({ ...articleForm, excerpt: e.target.value })}
              />
            </label>

            <label className="admin-form__label">
              Содержание статьи *
              <textarea
                className="admin-form__input"
                rows={12}
                value={articleForm.content}
                onChange={(e) => setArticleForm({ ...articleForm, content: e.target.value })}
                required
                placeholder="Поддерживается простой Markdown: # заголовок, **жирный**, - список, ---"
              />
            </label>

            <div className="admin-form__label">
              <span>Доступно для ролей</span>
              <label className="standards-role-chip standards-role-chip--active">
                <input
                  type="checkbox"
                  checked={articleForm.allRoles}
                  onChange={(e) =>
                    setArticleForm({
                      ...articleForm,
                      allRoles: e.target.checked,
                      visibilityRoles: [],
                    })
                  }
                />
                Все сотрудники
              </label>
              {!articleForm.allRoles && (
                <div className="standards-role-chips" style={{ marginTop: '0.5rem' }}>
                  {ROLE_OPTIONS.filter((r) => r.id !== 'all').map((role) => (
                    <label
                      key={role.id}
                      className={`standards-role-chip ${
                        articleForm.visibilityRoles.includes(role.id)
                          ? 'standards-role-chip--active'
                          : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={articleForm.visibilityRoles.includes(role.id)}
                        onChange={() => toggleVisibilityRole(role.id)}
                      />
                      {role.label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {articleError && <p className="admin-form__error">{articleError}</p>}
          </form>
        </AdminModal>
      )}

      {showCategories && (
        <AdminModal
          title="Категории стандартов"
          onClose={() => {
            setShowCategories(false)
            setEditCategoryId(null)
            setCategoryForm(EMPTY_CATEGORY_FORM)
          }}
          xwide
        >
          <form className="admin-form" onSubmit={handleCategorySave}>
            <div className="admin-form__row">
              <label className="admin-form__label">
                Название *
                <input
                  className="admin-form__input"
                  value={categoryForm.title}
                  onChange={(e) => setCategoryForm({ ...categoryForm, title: e.target.value })}
                  required
                />
              </label>
              <label className="admin-form__label">
                Описание
                <input
                  className="admin-form__input"
                  value={categoryForm.description}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, description: e.target.value })
                  }
                />
              </label>
            </div>
            <button type="submit" className="btn btn--primary btn--sm">
              {editCategoryId ? 'Сохранить категорию' : '+ Создать категорию'}
            </button>
            {categoryError && <p className="admin-form__error">{categoryError}</p>}
          </form>

          <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
            <table className="admin-table admin-table--compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Название</th>
                  <th>Статус</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat, index) => (
                  <tr key={cat.id}>
                    <td>{index + 1}</td>
                    <td>{cat.title}</td>
                    <td>
                      <StatusBadge
                        label={cat.status === 'active' ? 'Активна' : 'Архив'}
                        type={cat.status === 'active' ? 'done' : 'idle'}
                      />
                    </td>
                    <td>
                      <div className="admin-table__actions">
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          onClick={() => {
                            setEditCategoryId(cat.id)
                            setCategoryForm({
                              title: cat.title,
                              description: cat.description || '',
                            })
                          }}
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          disabled={index === 0}
                          onClick={() => moveCategory(cat.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          disabled={index === categories.length - 1}
                          onClick={() => moveCategory(cat.id, 1)}
                        >
                          ↓
                        </button>
                        {cat.status === 'active' && (
                          <button
                            type="button"
                            className="btn btn--outline btn--sm"
                            onClick={async () => {
                              await archiveStandardCategory(cat.id)
                              await refresh()
                            }}
                          >
                            Архивировать
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--outline btn--sm admin-table__danger"
                          onClick={async () => {
                            if (!window.confirm(`Удалить категорию «${cat.title}»?`)) return
                            await deleteStandardCategory(cat.id)
                            await refresh()
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminModal>
      )}

      {statsArticleId && stats && (
        <AdminModal
          title={`Ознакомление: ${statsArticle?.title || ''}`}
          onClose={() => setStatsArticleId(null)}
          xwide
        >
          <p className="admin-form__hint">
            Должны ознакомиться: {stats.totalEligible} · Ознакомились: {stats.acknowledgedCount} ·{' '}
            {stats.percent}%
          </p>
          <div className="admin-table-wrap">
            <table className="standards-stats-table">
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {stats.employees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-empty">
                      Нет сотрудников для этой статьи
                    </td>
                  </tr>
                ) : (
                  stats.employees.map((row) => (
                    <tr key={row.userId}>
                      <td>{row.name}</td>
                      <td>{row.roleLabel}</td>
                      <td>
                        <StatusBadge
                          label={row.acknowledged ? 'Ознакомлен' : 'Не ознакомлен'}
                          type={row.acknowledged ? 'done' : 'idle'}
                        />
                      </td>
                      <td>{formatDate(row.acknowledgedAt || row.readAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </AdminModal>
      )}
    </>
  )
}
