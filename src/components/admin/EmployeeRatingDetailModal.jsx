import { useEffect, useState } from 'react'
import AdminModal from './AdminModal'
import { SCORE_EVENT_LABELS } from '../../utils/attendanceData'
import {
  getEmployeeScoreEvents,
  addManualScoreEvent,
} from '../../services/academyDataService'
import { canManageEmployees } from '../../config/permissions'
import { useSession } from '../../context/SessionContext'
import { toDateKey } from '../../utils/shiftData'
import './admin-shared.css'

/** Детализация рейтинга сотрудника */
export default function EmployeeRatingDetailModal({ employee, year, month, onClose }) {
  const { user } = useSession()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [manualPoints, setManualPoints] = useState('')
  const [manualComment, setManualComment] = useState('')
  const [saving, setSaving] = useState(false)
  const canEdit = canManageEmployees(user)

  async function loadEvents() {
    setLoading(true)
    setError('')
    try {
      const rows = await getEmployeeScoreEvents(employee.id, year, month)
      setEvents(rows)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить историю')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEvents()
  }, [employee.id, year, month])

  async function handleManualSubmit(event) {
    event.preventDefault()
    const points = Number(manualPoints)
    if (!points || Number.isNaN(points)) {
      setError('Укажите количество баллов')
      return
    }
    if (!manualComment.trim()) {
      setError('Укажите комментарий')
      return
    }
    setSaving(true)
    setError('')
    try {
      await addManualScoreEvent({
        employeeId: employee.id,
        eventDate: toDateKey(new Date()),
        points,
        description: manualComment.trim(),
        createdBy: user?.id || null,
      })
      setManualPoints('')
      setManualComment('')
      await loadEvents()
    } catch (err) {
      setError(err.message || 'Не удалось сохранить корректировку')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminModal
      title={`Рейтинг: ${employee.name}`}
      onClose={onClose}
      wide
      footer={
        <button type="button" className="btn btn--outline" onClick={onClose}>
          Закрыть
        </button>
      }
    >
      {loading ? (
        <p className="admin-form__hint">Загрузка…</p>
      ) : events.length === 0 ? (
        <p className="admin-form__hint">У сотрудника нет событий за выбранный период</p>
      ) : (
        <ul className="admin-detail-list">
          {events.map((event) => (
            <li key={event.id}>
              <strong>{event.eventDate}</strong>
              <span>
                {SCORE_EVENT_LABELS[event.eventType] || event.eventType}: {event.points > 0 ? '+' : ''}{event.points}
                {event.description ? ` — ${event.description}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form className="admin-form" onSubmit={handleManualSubmit} style={{ marginTop: '1rem' }}>
          <h3 className="admin-detail-heading">Ручная корректировка</h3>
          <div className="admin-form__row">
            <label className="admin-form__label">
              Баллы (+ или -)
              <input className="admin-form__input" type="number" value={manualPoints} onChange={(e) => setManualPoints(e.target.value)} />
            </label>
            <label className="admin-form__label">
              Комментарий
              <input className="admin-form__input" value={manualComment} onChange={(e) => setManualComment(e.target.value)} />
            </label>
          </div>
          <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>
            {saving ? 'Сохранение…' : 'Добавить корректировку'}
          </button>
        </form>
      )}

      {error && <p className="admin-form__error">{error}</p>}
    </AdminModal>
  )
}
