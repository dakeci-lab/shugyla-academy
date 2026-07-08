import { useState } from 'react'
import { getAllCourses } from '../../utils/adminData'
import {
  getLearningPathCourses,
  addCourseToLearningPath,
  removeCourseFromLearningPath,
  reorderLearningPathCourses,
  updateLearningPathCourse,
} from '../../services/academyDataService'
import { useAdminRefresh } from '../../hooks/useAdminRefresh'
import StatusBadge from './StatusBadge'
import './admin-shared.css'

const COURSE_STATUS_LABELS = {
  published: 'Опубликован',
  draft: 'Черновик',
  hidden: 'Скрыт',
  missing: 'Удалён',
}

/** Редактор курсов внутри маршрута */
export default function LearningPathCourseEditor({ pathId, pathRole }) {
  const { version, refresh } = useAdminRefresh()
  const [addCourseId, setAddCourseId] = useState('')
  const [error, setError] = useState('')

  void version

  const pathCourses = getLearningPathCourses(pathId)
  const allCourses = getAllCourses()

  const availableCourses = allCourses.filter((course) => {
    if (pathCourses.some((pc) => pc.courseId === course.id)) return false
    if (pathRole && course.allowedRoles?.length) {
      return course.allowedRoles.includes(pathRole)
    }
    return true
  })

  function courseMeta(courseId) {
    const course = allCourses.find((c) => c.id === courseId)
    return course || { title: 'Курс удалён', status: 'missing' }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!addCourseId) return
    setError('')
    try {
      await addCourseToLearningPath(pathId, Number(addCourseId))
      setAddCourseId('')
      await refresh()
    } catch (err) {
      setError(err.message || 'Не удалось добавить курс')
    }
  }

  async function handleRemove(courseId) {
    setError('')
    try {
      await removeCourseFromLearningPath(pathId, courseId)
      await refresh()
    } catch (err) {
      setError(err.message || 'Не удалось удалить курс')
    }
  }

  async function moveCourse(courseId, direction) {
    const ids = pathCourses.map((pc) => pc.courseId)
    const index = ids.indexOf(courseId)
    if (index < 0) return
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    const next = [...ids]
    ;[next[index], next[target]] = [next[target], next[index]]
    try {
      await reorderLearningPathCourses(pathId, next)
      await refresh()
    } catch (err) {
      setError(err.message || 'Не удалось изменить порядок')
    }
  }

  async function toggleRequired(pathCourse) {
    try {
      await updateLearningPathCourse(pathCourse.id, { required: !pathCourse.required })
      await refresh()
    } catch (err) {
      setError(err.message || 'Не удалось обновить курс')
    }
  }

  return (
    <div className="learning-path-courses">
      <h3 className="admin-detail-heading">Курсы маршрута</h3>

      {pathCourses.length === 0 ? (
        <p className="admin-form__hint">В маршруте пока нет курсов. Добавьте первый курс ниже.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Курс</th>
                <th>Статус</th>
                <th>Обязательный</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pathCourses.map((pc, index) => {
                const course = courseMeta(pc.courseId)
                return (
                  <tr key={pc.id}>
                    <td>{index + 1}</td>
                    <td>{course.title}</td>
                    <td>
                      <StatusBadge
                        label={COURSE_STATUS_LABELS[course.status] || course.status}
                        type={course.status === 'published' ? 'done' : 'warning'}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`btn btn--outline btn--sm ${
                          pc.required ? 'btn--primary' : ''
                        }`}
                        onClick={() => toggleRequired(pc)}
                      >
                        {pc.required ? 'Да' : 'Нет'}
                      </button>
                    </td>
                    <td>
                      <div className="admin-table__actions">
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          disabled={index === 0}
                          onClick={() => moveCourse(pc.courseId, -1)}
                          aria-label="Вверх"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          disabled={index === pathCourses.length - 1}
                          onClick={() => moveCourse(pc.courseId, 1)}
                          aria-label="Вниз"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="btn btn--outline btn--sm admin-table__danger"
                          onClick={() => handleRemove(pc.courseId)}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <form className="admin-form admin-form--inline" onSubmit={handleAdd}>
        <label className="admin-form__label">
          Добавить курс
          <select
            className="admin-form__select"
            value={addCourseId}
            onChange={(e) => setAddCourseId(e.target.value)}
          >
            <option value="">Выберите курс…</option>
            {availableCourses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title} ({COURSE_STATUS_LABELS[course.status] || course.status})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn--primary btn--sm" disabled={!addCourseId}>
          Добавить
        </button>
      </form>

      {error && <p className="admin-form__error">{error}</p>}
    </div>
  )
}
