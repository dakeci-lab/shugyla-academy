import { useState } from 'react'
import {
  getLearningPaths,
  createLearningPath,
  updateLearningPath,
  deleteLearningPath,
  publishLearningPath,
  unpublishLearningPath,
  archiveLearningPath,
} from '../../../services/academyDataService'
import { PATH_STATUS_LABELS } from '../../../utils/learningPathData'
import { ROLE_IDS, ROLES, ALL_EMPLOYEE_ROLES } from '../../../data/roles'
import { useAdminRefresh } from '../../../hooks/useAdminRefresh'
import AdminModal from '../AdminModal'
import LearningPathCourseEditor from '../LearningPathCourseEditor'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'

const ROLE_OPTIONS = [ROLE_IDS.ADMIN, ...ALL_EMPLOYEE_ROLES]

const EMPTY_FORM = {
  title: '',
  description: '',
  role: ROLE_IDS.CASHIER,
  status: 'draft',
}

const STATUS_BADGE = {
  draft: 'warning',
  published: 'done',
  archived: 'idle',
}

/** Раздел «Маршруты» */
export default function LearningPathsSection() {
  const { version, refresh } = useAdminRefresh()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')

  void version

  const paths = getLearningPaths()

  function roleLabel(role) {
    return ROLES[role]?.label || role || '—'
  }

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  function openEdit(path) {
    setEditId(path.id)
    setForm({
      title: path.title,
      description: path.description || '',
      role: path.role,
      status: path.status,
    })
    setError('')
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('Укажите название маршрута')
      return
    }
    if (!form.role) {
      setError('Выберите роль')
      return
    }

    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        role: form.role,
        status: form.status,
      }
      if (editId) {
        await updateLearningPath(editId, payload)
      } else {
        const id = await createLearningPath(payload)
        setEditId(id)
      }
      await refresh()
      setError('')
    } catch (err) {
      setError(err.message || 'Не удалось сохранить маршрут')
    }
  }

  async function runAction(action, pathId) {
    setError('')
    try {
      await action(pathId)
      await refresh()
    } catch (err) {
      setError(err.message || 'Не удалось выполнить действие')
    }
  }

  async function handleDelete(path) {
    if (!window.confirm(`Удалить маршрут «${path.title}»?`)) return
    await runAction(deleteLearningPath, path.id)
    if (editId === path.id) setShowForm(false)
  }

  return (
    <>
      <div className="admin-toolbar">
        <span className="admin-toolbar__info">{paths.length} маршрутов</span>
        <button type="button" className="btn btn--primary btn--sm" onClick={openCreate}>
          + Создать маршрут
        </button>
      </div>

      {error && !showForm && <p className="admin-form__error">{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Курсов</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paths.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-empty">
                  Маршруты ещё не созданы
                </td>
              </tr>
            ) : (
              paths.map((path) => (
                <tr key={path.id}>
                  <td><strong>{path.title}</strong></td>
                  <td>{roleLabel(path.role)}</td>
                  <td>
                    <StatusBadge
                      label={PATH_STATUS_LABELS[path.status] || path.status}
                      type={STATUS_BADGE[path.status] || 'idle'}
                    />
                  </td>
                  <td>{path.courseCount ?? 0}</td>
                  <td>
                    <div className="admin-table__actions">
                      <button
                        type="button"
                        className="btn btn--outline btn--sm"
                        onClick={() => openEdit(path)}
                      >
                        Редактировать
                      </button>
                      {path.status === 'draft' && (
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          onClick={() => runAction(publishLearningPath, path.id)}
                        >
                          Опубликовать
                        </button>
                      )}
                      {path.status === 'published' && (
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          onClick={() => runAction(unpublishLearningPath, path.id)}
                        >
                          Снять с публикации
                        </button>
                      )}
                      {path.status !== 'archived' && (
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          onClick={() => runAction(archiveLearningPath, path.id)}
                        >
                          Архивировать
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn--outline btn--sm admin-table__danger"
                        onClick={() => handleDelete(path)}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <AdminModal
          title={editId ? 'Редактировать маршрут' : 'Создать маршрут'}
          onClose={() => setShowForm(false)}
          xwide
          footer={
            <>
              <button type="button" className="btn btn--outline" onClick={() => setShowForm(false)}>
                Закрыть
              </button>
              <button type="submit" className="btn btn--primary" form="learning-path-form">
                Сохранить
              </button>
            </>
          }
        >
          <form id="learning-path-form" className="admin-form" onSubmit={handleSave}>
            <label className="admin-form__label">
              Название маршрута *
              <input
                className="admin-form__input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>

            <label className="admin-form__label">
              Описание
              <textarea
                className="admin-form__input"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>

            <div className="admin-form__row">
              <label className="admin-form__label">
                Роль / должность *
                <select
                  className="admin-form__select"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  {ROLE_OPTIONS.map((roleId) => (
                    <option key={roleId} value={roleId}>
                      {ROLES[roleId]?.label || roleId}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-form__label">
                Статус
                <select
                  className="admin-form__select"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="draft">Черновик</option>
                  <option value="published">Опубликован</option>
                  <option value="archived">Архив</option>
                </select>
              </label>
            </div>

            {error && <p className="admin-form__error">{error}</p>}
          </form>

          {editId && (
            <LearningPathCourseEditor pathId={editId} pathRole={form.role} />
          )}
        </AdminModal>
      )}
    </>
  )
}
