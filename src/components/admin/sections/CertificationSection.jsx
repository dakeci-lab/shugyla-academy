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

/** Раздел «Аттестация» */
export default function CertificationSection() {
  const employees = getTrainingEmployees()

  return (
    <>
      <div className="admin-toolbar">
        <span className="admin-toolbar__info">
          Статус аттестации по сотрудникам
        </span>
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
            {employees.map((emp) => {
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
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
