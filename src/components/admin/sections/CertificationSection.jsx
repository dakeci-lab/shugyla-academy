import { useState } from 'react'
import { getTrainingEmployees } from '../../../utils/adminData'
import {
  getCertificationStatus,
  CERTIFICATION_LABELS,
  getEmployeeProgressPercent,
} from '../../../utils/adminStats'
import { getRole } from '../../../data/roles'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'

const CERT_TYPES = {
  not_started: 'idle',
  in_progress: 'progress',
  passed: 'passed',
  failed: 'failed',
}

const FILTER_OPTIONS = [
  { id: 'all', label: 'Все' },
  { id: 'not_started', label: 'Не начал' },
  { id: 'in_progress', label: 'В процессе' },
  { id: 'passed', label: 'Сдал' },
  { id: 'failed', label: 'Не сдал' },
]

/** Раздел «Аттестация» */
export default function CertificationSection() {
  const [filter, setFilter] = useState('all')
  const employees = getTrainingEmployees()

  const filtered = employees.filter((emp) => {
    if (filter === 'all') return true
    return getCertificationStatus(emp.id, emp.role) === filter
  })

  return (
    <>
      <div className="admin-toolbar">
        <span className="admin-toolbar__info">
          Статус аттестации · {filtered.length} из {employees.length}
        </span>
        <div className="admin-filter-tabs">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`admin-filter-tabs__btn ${filter === opt.id ? 'admin-filter-tabs__btn--active' : ''}`}
              onClick={() => setFilter(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Должность</th>
              <th>Роль</th>
              <th>Прогресс</th>
              <th>Статус аттестации</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-empty">
                  Нет сотрудников с выбранным статусом
                </td>
              </tr>
            ) : (
              filtered.map((emp) => {
                const cert = getCertificationStatus(emp.id, emp.role)
                const percent = getEmployeeProgressPercent(emp.id, emp.role)
                const role = getRole(emp.role)

                return (
                  <tr key={emp.id}>
                    <td><strong>{emp.name}</strong></td>
                    <td>{emp.position}</td>
                    <td>{role?.label || emp.role}</td>
                    <td>
                      <div className="admin-progress-cell">
                        <div className="admin-progress-cell__bar">
                          <div
                            className="admin-progress-cell__fill"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="admin-progress-cell__text">{percent}%</span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge
                        label={CERTIFICATION_LABELS[cert]}
                        type={CERT_TYPES[cert]}
                      />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
