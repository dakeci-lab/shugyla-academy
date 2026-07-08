import { useState } from 'react'
import { getTrainingEmployees } from '../../../utils/employeeData'
import { getEmployeeProgressPercent } from '../../../utils/adminStats'
import { getAdminFinalAttestationStatus, ATTESTATION_ADMIN_LABELS } from '../../../utils/testProgress'
import { getRole } from '../../../data/roles'
import { getEmployeeTrainingStatus } from '../../../utils/adminStats'
import AdminModal from '../AdminModal'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'

const FILTER_OPTIONS = [
  { id: 'all', label: 'Все' },
  { id: 'not_available', label: 'Не доступна' },
  { id: 'available', label: 'Доступна' },
  { id: 'not_started', label: 'Не начата' },
  { id: 'in_progress', label: 'В процессе' },
  { id: 'passed', label: 'Сдана' },
  { id: 'failed', label: 'Не сдана' },
]

/** Раздел «Аттестация» */
export default function CertificationSection() {
  const [filter, setFilter] = useState('all')
  const [detail, setDetail] = useState(null)
  const employees = getTrainingEmployees()

  const rows = employees.map((emp) => {
    const att = getAdminFinalAttestationStatus(emp.id, emp.role)
    const training = getEmployeeTrainingStatus(emp.id)
    return { emp, att, training, percent: getEmployeeProgressPercent(emp.id) }
  })

  const filtered = rows.filter(({ att }) => filter === 'all' || att.status === filter)

  return (
    <>
      <div className="admin-toolbar admin-toolbar--stack">
        <span className="admin-toolbar__info">
          Аттестация · {filtered.length} из {employees.length}
        </span>
        <div className="admin-filter-tabs">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`admin-filter-tab ${filter === opt.id ? 'admin-filter-tab--active' : ''}`}
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
              <th>Обучение</th>
              <th>Аттестация</th>
              <th>Лучший результат</th>
              <th>Последняя попытка</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-empty">Нет сотрудников с выбранным статусом</td>
              </tr>
            ) : (
              filtered.map(({ emp, att, training, percent }) => {
                const role = getRole(emp.role)
                return (
                  <tr key={emp.id}>
                    <td><strong>{emp.name}</strong></td>
                    <td>{emp.position}</td>
                    <td>{role?.label || emp.role}</td>
                    <td>
                      <StatusBadge label={training.label} type={training.type} />
                      <span className="admin-table__hint"> · {percent}%</span>
                    </td>
                    <td>
                      <StatusBadge label={att.label} type={att.type} />
                    </td>
                    <td>{att.best ? `${att.best.scorePercent}%` : '—'}</td>
                    <td>{att.lastAttemptAt ? new Date(att.lastAttemptAt).toLocaleDateString('ru-RU') : '—'}</td>
                    <td>
                      <button type="button" className="btn btn--outline btn--sm" onClick={() => setDetail({ emp, att })}>
                        Подробнее
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <AdminModal title={`Аттестация: ${detail.emp.name}`} onClose={() => setDetail(null)}>
          <div className="admin-detail-list-wrap">
            <p><strong>Статус:</strong> {detail.att.label}</p>
            {detail.att.reason && <p><strong>Причина:</strong> {detail.att.reason}</p>}
            {detail.att.test && (
              <>
                <p><strong>Тест:</strong> {detail.att.test.title}</p>
                <p><strong>Проходной балл:</strong> {detail.att.test.passingScore}%</p>
              </>
            )}
            {detail.att.best && (
              <p>
                <strong>Лучший результат:</strong> {detail.att.best.scorePercent}% ({detail.att.best.correctCount} из {detail.att.best.totalQuestions})
              </p>
            )}
            <p className="admin-form__hint">
              Статусы: {Object.values(ATTESTATION_ADMIN_LABELS).join(' · ')}
            </p>
          </div>
        </AdminModal>
      )}
    </>
  )
}
