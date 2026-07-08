import { useMemo, useState } from 'react'
import { getProgressRows } from '../../../utils/adminStats'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'

/** Раздел «Прогресс» */
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
        <span className="admin-toolbar__info">{filtered.length} записей прогресса</span>
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
              <th>Тест курса</th>
              <th>Общий статус</th>
              <th>Финальная аттестация</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-empty">
                  {search ? 'Ничего не найдено' : 'Пока нет данных о прогрессе'}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={`${row.employeeId}-${row.courseId ?? 'none'}`}>
                  <td><strong>{row.employeeName}</strong></td>
                  <td>{row.courseTitle}</td>
                  <td>
                    {row.noCourses ? '—' : `${row.completedLessons} / ${row.totalLessons}`}
                  </td>
                  <td>
                    {row.noCourses ? '—' : (
                      <StatusBadge label={row.courseTestStatus.label} type={row.courseTestStatus.type} />
                    )}
                  </td>
                  <td>
                    {row.noCourses ? (
                      <StatusBadge label={row.status.label} type={row.status.type} />
                    ) : (
                      <StatusBadge label={row.courseOverallStatus.label} type={row.courseOverallStatus.type} />
                    )}
                  </td>
                  <td>
                    <StatusBadge label={row.attestationStatus.label} type={row.attestationStatus.type} />
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
