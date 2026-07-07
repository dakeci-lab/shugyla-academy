import { useMemo, useState } from 'react'
import { getProgressRows } from '../../../utils/adminStats'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'

/** Раздел «Прогресс» — таблица по сотрудникам и курсам */
export default function ProgressSection() {
  const [search, setSearch] = useState('')
  const rows = getProgressRows()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (row) =>
        row.employeeName.toLowerCase().includes(q) ||
        row.courseTitle.toLowerCase().includes(q)
    )
  }, [rows, search])

  return (
    <>
      <div className="admin-toolbar">
        <span className="admin-toolbar__info">
          {filtered.length} записей прогресса
        </span>
        <input
          type="search"
          className="admin-search"
          placeholder="Поиск по сотруднику или курсу…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Курс</th>
              <th>Уроки</th>
              <th>Прогресс</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-empty">
                  {search ? 'Ничего не найдено' : 'Пока нет данных о прогрессе'}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={`${row.employeeId}-${row.courseId}`}>
                  <td><strong>{row.employeeName}</strong></td>
                  <td>{row.courseTitle}</td>
                  <td>
                    {row.completedLessons} / {row.totalLessons}
                  </td>
                  <td>
                    <div className="admin-progress-cell">
                      <div className="admin-progress-cell__bar">
                        <div
                          className="admin-progress-cell__fill"
                          style={{ width: `${row.percent}%` }}
                        />
                      </div>
                      <span className="admin-progress-cell__text">
                        {row.percent}%
                      </span>
                    </div>
                  </td>
                  <td>
                    <StatusBadge label={row.status.label} type={row.status.type} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
