import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminModal from './AdminModal'
import {
  SCORE_EVENT_LABELS,
  RATING_UPDATED_EVENT,
  calculateEmployeeRatingFromShifts,
} from '../../utils/attendanceData'
import {
  getEmployeeShiftsForMonth,
  getAttendanceSettings,
} from '../../services/academyDataService'
import './admin-shared.css'

/** Детализация рейтинга сотрудника (расчёт на лету) */
export default function EmployeeRatingDetailModal({ employee, year, month, onClose }) {
  const [entries, setEntries] = useState([])
  const [totalScore, setTotalScore] = useState(null)
  const [ratingStatus, setRatingStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadDetails = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [settings, shifts] = await Promise.all([
        getAttendanceSettings(),
        getEmployeeShiftsForMonth(employee.id, year, month),
      ])
      const { entries: computedEntries, stats, ratingStatus: status } = calculateEmployeeRatingFromShifts(
        shifts,
        settings
      )
      setEntries(computedEntries)
      setTotalScore(stats.totalPoints)
      setRatingStatus(status)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить историю')
    } finally {
      setLoading(false)
    }
  }, [employee.id, year, month])

  useEffect(() => {
    loadDetails()
  }, [loadDetails])

  useEffect(() => {
    function handleRatingUpdated(event) {
      const { year: eventYear, month: eventMonth } = event.detail || {}
      if (Number(eventYear) === year && Number(eventMonth) === month) {
        loadDetails()
      }
    }
    window.addEventListener(RATING_UPDATED_EVENT, handleRatingUpdated)
    return () => window.removeEventListener(RATING_UPDATED_EVENT, handleRatingUpdated)
  }, [year, month, loadDetails])

  const groupedByDate = useMemo(() => {
    const map = new Map()
    entries.forEach((entry) => {
      if (!map.has(entry.eventDate)) map.set(entry.eventDate, [])
      map.get(entry.eventDate).push(entry)
    })
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [entries])

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
      ) : (
        <>
          <p className="admin-form__hint">
            {totalScore == null
              ? ratingStatus === 'no_schedule'
                ? 'За выбранный период график не установлен'
                : ratingStatus === 'insufficient_data'
                  ? 'Недостаточно завершённых смен для полноценного рейтинга'
                  : 'За выбранный период нет завершённых смен'
              : `Итог за период: ${totalScore} баллов`}
          </p>
          {groupedByDate.length === 0 ? (
            <p className="admin-form__hint">За выбранный период нет начислений или штрафов</p>
          ) : (
            <ul className="admin-detail-list">
              {groupedByDate.map(([date, dayEntries]) => {
                const dayTotal = dayEntries.reduce(
                  (sum, entry) => sum + (Number(entry.points) || 0),
                  0
                )
                return (
                  <li key={date}>
                    <strong>{date}</strong>
                    <span>
                      {dayEntries
                        .map((entry) => {
                          const label = SCORE_EVENT_LABELS[entry.eventType] || entry.eventType
                          const sign = entry.points > 0 ? '+' : ''
                          return `${label}: ${sign}${entry.points}`
                        })
                        .join(' · ')}
                      {' — '}
                      Итого за день: {dayTotal > 0 ? '+' : ''}
                      {dayTotal}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {error && <p className="admin-form__error">{error}</p>}
    </AdminModal>
  )
}
