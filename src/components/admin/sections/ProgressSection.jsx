import { useMemo, useState } from 'react'
import { getProgressRows } from '../../../utils/adminStats'
import { ROLES } from '../../../data/roles'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'

/** Раздел «Прогресс» — по курсам сотрудников */
export default function ProgressSection() {
  const [search, setSearch] = useState('')
  const rows = getProgressRows()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (row) =>
        row.employeeName.toLowerCase().includes(q) ||
        row.coursesLabel.toLowerCase().includes(q)
    )
  }, [rows, search])

  return (
    <>
      <div className="admin-toolbar">
        <span className="admin-toolbar__info">{filtered.length} сотрудников</span>
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
              <th>Роль</th>
              <th>Курсы</th>
              <th>Прогресс</th>
              <th>Статус обучения</th>
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
                <tr key={row.employeeId}>
                  <td><strong>{row.employeeName}</strong></td>
                  <td>{ROLES[row.employeeRole]?.label || row.employeeRole}</td>
                  <td>{row.coursesLabel}</td>
                  <td>
                    <div className="admin-progress-cell">
                      <div className="admin-progress-cell__bar">
                        <div
                          className="admin-progress-cell__fill"
                          style={{ width: `${row.progressPercent}%` }}
                        />
                      </div>
                      <span className="admin-progress-cell__text">
                        {row.progressPercent}%
                      </span>
                    </div>
                  </td>
                  <td>
                    <StatusBadge label={row.trainingStatus.label} type={row.trainingStatus.type} />
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
