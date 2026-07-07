import { getProgressRows } from '../../../utils/adminStats'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'

/** Раздел «Прогресс» — детальная таблица по сотрудникам и курсам */
export default function ProgressSection() {
  const rows = getProgressRows()

  return (
    <>
      <div className="admin-toolbar">
        <span className="admin-toolbar__info">
          {rows.length} записей прогресса
        </span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Курс</th>
              <th>Уроки</th>
              <th>Прогресс</th>
              <th>Тест</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-empty">
                  Пока нет данных о прогрессе
                </td>
              </tr>
            ) : (
              rows.map((row) => (
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
                    {row.testPassed ? (
                      <StatusBadge label="Сдал" type="passed" />
                    ) : row.percent === 100 ? (
                      <StatusBadge label="Не сдал" type="failed" />
                    ) : (
                      <StatusBadge label="—" type="idle" />
                    )}
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
