import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import StatusBadge from '../components/admin/StatusBadge'
import { useSession } from '../context/SessionContext'
import { useAcademyData } from '../context/AcademyDataContext'
import {
  getPublishedStandardArticlesForUser,
  getStandardArticleBySlug,
  getStandardCategories,
  markStandardArticleRead,
  acknowledgeStandardArticle,
} from '../services/academyDataService'
import {
  PRIORITY_BADGE,
  searchArticles,
  isArticleNew,
  getUserStandardReadsSync,
  getVisibilityRoleLabels,
  ARTICLE_STATUS_LABELS,
} from '../utils/standardsData'
import { renderSimpleMarkdown } from '../utils/simpleMarkdown'
import './Standards.css'

const READ_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'unread', label: 'Не ознакомлен' },
  { id: 'important', label: 'Важные' },
]

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

function ArticleDetail({ article, userId, onAcknowledged, basePath }) {
  const [submitting, setSubmitting] = useState(false)
  const categories = getStandardCategories()
  const category = categories.find((c) => c.id === article.categoryId)
  const reads = getUserStandardReadsSync(userId)
  const read = reads.find((r) => r.articleId === article.id)
  const acknowledged = Boolean(read?.acknowledged)

  useEffect(() => {
    markStandardArticleRead(article.id, userId).catch(() => {})
  }, [article.id, userId])

  async function handleAcknowledge() {
    setSubmitting(true)
    try {
      await acknowledgeStandardArticle(article.id, userId)
      onAcknowledged()
    } finally {
      setSubmitting(false)
    }
  }

  const priorityType = PRIORITY_BADGE[article.priority] || 'idle'
  const cardClass =
    article.priority === 'critical'
      ? 'standards-article standards-article--critical'
      : article.priority === 'important'
        ? 'standards-article standards-article--important'
        : 'standards-article'

  return (
    <article className={cardClass}>
      <Link to={basePath} className="standards-article__back">
        ← К списку стандартов
      </Link>

      <h1 className="standards-article__title">{article.title}</h1>

      <div className="standards-article__meta">
        {category && <span>Категория: {category.title}</span>}
        <span>Роли: {getVisibilityRoleLabels(article).join(', ')}</span>
        {(article.priority === 'important' || article.priority === 'critical') && (
          <StatusBadge
            label={article.priority === 'critical' ? 'Критично' : 'Важно'}
            type={priorityType}
          />
        )}
        <span>Обновлено: {formatDate(article.updatedAt)}</span>
        {article.createdBy && <span>Автор: {article.createdBy}</span>}
        {acknowledged && <StatusBadge label="Ознакомлен" type="done" />}
      </div>

      {article.excerpt && <p className="standards-card__excerpt">{article.excerpt}</p>}

      <div
        className="standards-article__content simple-md"
        dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(article.content) }}
      />

      <div className="standards-article__actions">
        {acknowledged ? (
          <p className="standards-card__excerpt">
            Вы подтвердили ознакомление
            {read.acknowledgedAt ? ` (${formatDate(read.acknowledgedAt)})` : ''}.
          </p>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            disabled={submitting}
            onClick={handleAcknowledge}
          >
            Я ознакомился
          </button>
        )}
      </div>
    </article>
  )
}

function ArticleList({ articles, reads, categoryId, onSelectCategory, categories, basePath }) {
  return (
    <div className="standards-layout">
      <aside className="standards-categories">
        <button
          type="button"
          className={`standards-categories__item ${
            !categoryId ? 'standards-categories__item--active' : ''
          }`}
          onClick={() => onSelectCategory('')}
        >
          Все категории
        </button>
        {categories
          .filter((c) => c.status === 'active')
          .map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`standards-categories__item ${
                categoryId === cat.id ? 'standards-categories__item--active' : ''
              }`}
              onClick={() => onSelectCategory(cat.id)}
            >
              {cat.title}
            </button>
          ))}
      </aside>

      <div className="standards-grid">
        {articles.length === 0 ? (
          <div className="standards-empty">Статьи не найдены</div>
        ) : (
          articles.map((article) => {
            const read = reads.find((r) => r.articleId === article.id)
            const acknowledged = Boolean(read?.acknowledged)
            const cat = categories.find((c) => c.id === article.categoryId)
            const cardClass = [
              'standards-card',
              article.priority === 'critical' ? 'standards-card--critical' : '',
              article.priority === 'important' ? 'standards-card--important' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <article key={article.id} className={cardClass}>
                <div className="standards-card__head">
                  <h2 className="standards-card__title">{article.title}</h2>
                  <div className="standards-card__badges">
                    {article.priority === 'important' && (
                      <StatusBadge label="Важно" type="warning" />
                    )}
                    {article.priority === 'critical' && (
                      <StatusBadge label="Критично" type="failed" />
                    )}
                    {acknowledged && <StatusBadge label="Ознакомлен" type="done" />}
                    {!acknowledged && isArticleNew(article) && (
                      <StatusBadge label="Новое" type="progress" />
                    )}
                  </div>
                </div>
                {article.excerpt && (
                  <p className="standards-card__excerpt">{article.excerpt}</p>
                )}
                <p className="standards-card__meta">
                  {cat?.title || 'Без категории'} · {getVisibilityRoleLabels(article).join(', ')}
                </p>
                <Link to={`${basePath}/${article.slug}`} className="standards-card__read btn btn--outline btn--sm">
                  Читать
                </Link>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}

/** Страница базы стандартов — /standards или /platform/standards */
export default function StandardsPage({ embedded = false, basePath = '/standards' }) {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { user } = useSession()
  const { version, reload, ensureModules } = useAcademyData()
  const [search, setSearch] = useState('')
  const [readFilter, setReadFilter] = useState('all')
  const [categoryId, setCategoryId] = useState('')

  useEffect(() => {
    void ensureModules(['standards'])
  }, [ensureModules])

  void version

  const categories = getStandardCategories()
  const reads = getUserStandardReadsSync(user?.id)
  const ackSet = useMemo(
    () => new Set(reads.filter((r) => r.acknowledged).map((r) => r.articleId)),
    [reads]
  )

  const allArticles = useMemo(
    () => (user ? getPublishedStandardArticlesForUser(user) : []),
    [user, version]
  )

  const articleBySlug = slug ? getStandardArticleBySlug(slug) : null

  useEffect(() => {
    if (!slug || !user) return
    const article = getStandardArticleBySlug(slug)
    if (!article || !getPublishedStandardArticlesForUser(user).some((a) => a.id === article.id)) {
      navigate(basePath, { replace: true })
    }
  }, [slug, user, navigate, version, basePath])

  const filtered = useMemo(() => {
    let list = allArticles
    if (categoryId) list = list.filter((a) => a.categoryId === categoryId)
    list = searchArticles(list, search)
    if (readFilter === 'unread') list = list.filter((a) => !ackSet.has(a.id))
    if (readFilter === 'important') {
      list = list.filter((a) => a.priority === 'important' || a.priority === 'critical')
    }
    return list
  }, [allArticles, categoryId, search, readFilter, ackSet])

  if (!user) return null

  return (
    <div className={`standards-page ${embedded ? 'standards-page--embedded' : ''}`}>
      {!embedded && <Header />}

      <main className={`standards-page__main ${embedded ? '' : 'container'}`}>
        {!slug ? (
          <>
            <div className="standards-page__header">
              <h1 className="standards-page__title">Стандарты компании</h1>
              <p className="standards-page__subtitle">
                База стандартов Shugyla Market — правила и регламенты работы
              </p>
              <p className="standards-page__hint">
                Отображаются только активные стандарты ({ARTICLE_STATUS_LABELS.published.toLowerCase()}).
              </p>
            </div>

            <div className="standards-toolbar">
              <input
                type="search"
                className="standards-search"
                placeholder="Поиск по названию, описанию, содержанию…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="standards-filters">
                {READ_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`standards-filter-btn ${
                      readFilter === f.id ? 'standards-filter-btn--active' : ''
                    }`}
                    onClick={() => setReadFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <ArticleList
              articles={filtered}
              reads={reads}
              categoryId={categoryId}
              onSelectCategory={setCategoryId}
              categories={categories}
              basePath={basePath}
            />
          </>
        ) : articleBySlug ? (
          <ArticleDetail
            article={articleBySlug}
            userId={user.id}
            onAcknowledged={reload}
            basePath={basePath}
          />
        ) : (
          <div className="standards-empty">Статья не найдена</div>
        )}
      </main>
    </div>
  )
}
