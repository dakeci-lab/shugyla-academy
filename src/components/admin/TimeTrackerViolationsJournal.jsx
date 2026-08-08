import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../context/ToastContext'
import { isCloudMode } from '../../lib/dataMode'
import { listTimeTrackerViolations } from '../../services/notificationSettingsAdminService'
import { DelayedLoadingSkeleton } from '../loading/LoadingSkeleton'
import '../admin/admin-shared.css'

const FILTERS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'active', label: 'Активные' },
  { id: 'clock_in', label: 'Не начал смену' },
  { id: 'clock_out', label: 'Не завершил смену' },
  { id: 'resolved', label: 'Resolved' },
]

const TYPE_LABELS = {
  clock_in: 'Не начал смену',
  clock_out: 'Не завершил смену',
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export default function TimeTrackerViolationsJournal() {
  const { error: showError } = useToast()
  const cloudMode = isCloudMode()
  const [filter, setFilter] = useState('today')
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [violations, setViolations] = useState([])

  const load = useCallback(async () => {
    if (!cloudMode) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await listTimeTrackerViolations(filter)
      setViolations(rows)
    } catch (error) {
      showError(error.message || 'Не удалось загрузить журнал нарушений')
    } finally {
      setLoading(false)
    }
  }, [cloudMode, filter, showError])

  const visible = employeeQuery.trim()
    ? violations.filter((row) =>
        String(row.employee_name || '')
          .toLowerCase()
          .includes(employeeQuery.trim().toLowerCase())
      )
    : violations

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="admin-panel-card">
      <div className="admin-panel-card__header">
        <h2 className="admin-panel-card__title">Журнал нарушений тайм-трекера</h2>
        <p className="admin-panel-card__desc">
          Факты опозданий и незакрытых смен. Штрафы и дисциплинарные меры здесь не применяются.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`btn btn--small ${filter === item.id ? 'btn--primary' : 'btn--outline'}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
        <button type="button" className="btn btn--outline btn--small" onClick={() => void load()}>
          Обновить
        </button>
        <input
          type="search"
          placeholder="Сотрудник"
          value={employeeQuery}
          onChange={(e) => setEmployeeQuery(e.target.value)}
          style={{ minWidth: 160 }}
        />
      </div>

      {loading && violations.length === 0 ? (
        <DelayedLoadingSkeleton variant="table" count={4} />
      ) : null}

      {!loading && visible.length === 0 && <p>Записей нет.</p>}

      {visible.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="notification-readiness-panel__table">
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Тип</th>
                <th>Смена</th>
                <th>План</th>
                <th>Факт</th>
                <th>Задержка</th>
                <th>Статус</th>
                <th>Админы</th>
                <th>Push</th>
                <th>Создано</th>
                <th>Resolved</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.employee_name}</strong>
                    <div className="notification-readiness-panel__muted">{row.position_name || '—'}</div>
                  </td>
                  <td>{TYPE_LABELS[row.violation_type] || row.violation_type}</td>
                  <td>{row.shift_date}</td>
                  <td>{formatDate(row.planned_at)}</td>
                  <td>{formatDate(row.actual_at)}</td>
                  <td>{row.delay_minutes} мин</td>
                  <td>{row.status}</td>
                  <td>{(row.notified_admin_ids || []).join(', ') || '—'}</td>
                  <td>{row.web_push_outcome || '—'}</td>
                  <td>{formatDate(row.created_at)}</td>
                  <td>{formatDate(row.resolved_at)}</td>
                  <td>
                    <Link
                      to={`/platform?employee=${row.employee_id}&shift=${row.shift_id}&violation=${row.violation_type}`}
                    >
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
