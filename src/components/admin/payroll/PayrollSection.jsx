import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isCloudMode } from '../../../lib/dataMode'
import { EMPLOYEE_FORM_ROLES, getRoleLabel } from '../../../data/roles'
import { getCurrentMonthState } from '../../../utils/attendanceData'
import { formatMonthYearLabel } from '../../../utils/shiftData'
import {
  SALARY_RECORD_STATUSES,
  changePayrollMonth,
  formatMoneyKzt,
  getPayrollRecordPath,
  getSalaryStatusMeta,
} from '../../../utils/salaryPayroll'
import { listEmployeesForAdmin } from '../../../services/employeeAdminService'
import {
  ensureSalaryPeriod,
  ensureSalaryRecord,
  listSalaryRecordsForPeriod,
} from '../../../services/salaryPayrollService'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import { useToast } from '../../../context/ToastContext'
import SchedulePeriodBar from '../SchedulePeriodBar'
import EmployeeSearchToolbar from '../EmployeeSearchToolbar'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'
import '../EmployeeSchedule.css'
import './PayrollSection.css'

/** Список расчётов зарплаты за месяц */
export default function PayrollSection() {
  const navigate = useNavigate()
  const { warning: showWarning } = useToast()
  const [{ year, month }, setMonthState] = useState(getCurrentMonthState)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [openingId, setOpeningId] = useState(null)
  const [error, setError] = useState('')
  const [employees, setEmployees] = useState([])
  const [recordsByEmployee, setRecordsByEmployee] = useState(new Map())
  const [period, setPeriod] = useState(null)

  const load = useCallback(
    async (options = {}) => {
      const quiet = options?.quiet === true
      if (!quiet) setLoading(true)
      setError('')
      try {
        if (!isCloudMode()) {
          setEmployees([])
          setRecordsByEmployee(new Map())
          setPeriod(null)
          setError('Подсчёт зарплаты доступен только в облачном режиме')
          return
        }

        const nextPeriod = await ensureSalaryPeriod(year, month)
        setPeriod(nextPeriod)

        const [empResult, records] = await Promise.all([
          listEmployeesForAdmin({
            page: 1,
            pageSize: 200,
            status: 'active',
            sortBy: 'full_name',
            sortDirection: 'asc',
          }),
          listSalaryRecordsForPeriod(nextPeriod.id),
        ])

        setEmployees(empResult.employees || [])
        const map = new Map()
        for (const record of records) {
          map.set(Number(record.employeeId), record)
        }
        setRecordsByEmployee(map)
      } catch (err) {
        setError(err?.message || 'Не удалось загрузить расчёты')
        setEmployees([])
        setRecordsByEmployee(new Map())
      } finally {
        if (!quiet) setLoading(false)
      }
    },
    [year, month]
  )

  useEffect(() => {
    void load()
  }, [load])

  usePlatformPageRefresh(
    useCallback(async () => {
      await load({ quiet: true })
    }, [load])
  )

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees
      .filter((emp) => {
        if (roleFilter !== 'all' && emp.role !== roleFilter) return false
        const record = recordsByEmployee.get(Number(emp.id))
        if (statusFilter === 'none') {
          if (record) return false
        } else if (statusFilter !== 'all') {
          if (!record || record.status !== statusFilter) return false
        }
        if (!q) return true
        return String(emp.name || '').toLowerCase().includes(q)
      })
      .map((emp) => {
        const record = recordsByEmployee.get(Number(emp.id)) || null
        return { employee: emp, record }
      })
  }, [employees, recordsByEmployee, search, roleFilter, statusFilter])

  async function handleOpen(employee) {
    if (!period || openingId) return
    setOpeningId(employee.id)
    try {
      const record = await ensureSalaryRecord(period.id, employee.id)
      navigate(getPayrollRecordPath(record.id))
    } catch (err) {
      showWarning(err?.message || 'Не удалось открыть расчёт')
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <div className="payroll-section">
      <SchedulePeriodBar
        title={formatMonthYearLabel(year, month)}
        onPrev={() => setMonthState((prev) => changePayrollMonth(prev.year, prev.month, -1))}
        onNext={() => setMonthState((prev) => changePayrollMonth(prev.year, prev.month, 1))}
        onToday={() => setMonthState(getCurrentMonthState())}
        prevLabel="Предыдущий месяц"
        nextLabel="Следующий месяц"
      />

      <div className="payroll-section__filters">
        <EmployeeSearchToolbar
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по ФИО"
        />
        <select
          className="payroll-section__select"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          aria-label="Фильтр по роли"
        >
          <option value="all">Все роли</option>
          {EMPLOYEE_FORM_ROLES.map((roleId) => (
            <option key={roleId} value={roleId}>
              {getRoleLabel(roleId)}
            </option>
          ))}
        </select>
        <select
          className="payroll-section__select"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Фильтр по статусу"
        >
          <option value="all">Все статусы</option>
          <option value="none">Без расчёта</option>
          {SALARY_RECORD_STATUSES.map((status) => (
            <option key={status.id} value={status.id}>
              {status.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="payroll-section__error">{error}</p>}

      {loading ? (
        <p className="payroll-section__empty">Загрузка…</p>
      ) : rows.length === 0 ? (
        <p className="payroll-section__empty">Сотрудники не найдены</p>
      ) : (
        <div className="payroll-table-wrap">
          <table className="payroll-table">
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Роль</th>
                <th>Статус расчёта</th>
                <th>К выдаче</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ employee, record }) => {
                const statusMeta = record
                  ? getSalaryStatusMeta(record.status)
                  : { label: 'Нет расчёта', badge: 'idle' }
                const roleLabel = employee.position || getRoleLabel(employee.role)
                return (
                  <tr key={employee.id}>
                    <td data-label="ФИО">
                      <div className="payroll-table__name">{employee.name}</div>
                    </td>
                    <td data-label="Роль">
                      <span className="payroll-table__role">{roleLabel}</span>
                    </td>
                    <td data-label="Статус">
                      <StatusBadge label={statusMeta.label} type={statusMeta.badge} />
                    </td>
                    <td data-label="К выдаче" className="payroll-table__payable">
                      {record ? formatMoneyKzt(record.totalPayable) : '—'}
                    </td>
                    <td data-label="Действия" className="payroll-table__actions">
                      <button
                        type="button"
                        className="btn btn--outline btn--sm"
                        disabled={openingId === employee.id}
                        onClick={() => void handleOpen(employee)}
                      >
                        {openingId === employee.id ? 'Открытие…' : 'Открыть'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
