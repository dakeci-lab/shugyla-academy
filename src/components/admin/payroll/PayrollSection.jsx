import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isCloudMode } from '../../../lib/dataMode'
import { getRoleLabel } from '../../../data/roles'
import { getCurrentMonthState } from '../../../utils/attendanceData'
import { formatMonthYearLabel } from '../../../utils/shiftData'
import {
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
  updateSalaryRecordFields,
} from '../../../services/salaryPayrollService'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import { useToast } from '../../../context/ToastContext'
import SchedulePeriodBar from '../SchedulePeriodBar'
import StatusBadge from '../StatusBadge'
import { CommentIcon, FilterIcon, SearchIcon } from '../../icons/PlatformIcons'
import PayrollFilterPopover from './PayrollFilterPopover'
import PayrollCommentModal from './PayrollCommentModal'
import '../admin-shared.css'
import '../EmployeeSchedule.css'
import '../sections/EmployeesSection.css'
import './PayrollSection.css'

/** admin-list-employees отклоняет page_size > 100 (invalid_pagination). */
const EMPLOYEE_PAGE_SIZE = 100

async function listAllActiveEmployeesForPayroll() {
  const employees = []
  let page = 1
  let totalPages = 1

  do {
    const result = await listEmployeesForAdmin({
      page,
      pageSize: EMPLOYEE_PAGE_SIZE,
      status: 'active',
      sortBy: 'full_name',
      sortDirection: 'asc',
    })
    employees.push(...(result.employees || []))
    totalPages = Number(result.pagination?.total_pages) || 1
    page += 1
  } while (page <= totalPages)

  return employees
}

function hasRecordNotes(record) {
  return Boolean(String(record?.notes || '').trim())
}

/** Список расчётов зарплаты за месяц */
export default function PayrollSection() {
  const navigate = useNavigate()
  const { warning: showWarning, success: showSuccess } = useToast()
  const filterButtonRef = useRef(null)

  const [{ year, month }, setMonthState] = useState(getCurrentMonthState)
  const [search, setSearch] = useState('')
  const [appliedRoleId, setAppliedRoleId] = useState('')
  const [appliedStatus, setAppliedStatus] = useState('all')
  const [draftRoleId, setDraftRoleId] = useState('')
  const [draftStatus, setDraftStatus] = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)

  const [loading, setLoading] = useState(true)
  const [openingId, setOpeningId] = useState(null)
  const [error, setError] = useState('')
  const [employees, setEmployees] = useState([])
  const [recordsByEmployee, setRecordsByEmployee] = useState(new Map())
  const [period, setPeriod] = useState(null)

  const [commentTarget, setCommentTarget] = useState(null)
  const [commentSaving, setCommentSaving] = useState(false)

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

        const [employeeRows, records] = await Promise.all([
          listAllActiveEmployeesForPayroll(),
          listSalaryRecordsForPeriod(nextPeriod.id),
        ])

        setEmployees(employeeRows)
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
        if (appliedRoleId && emp.role !== appliedRoleId) return false
        const record = recordsByEmployee.get(Number(emp.id))
        if (appliedStatus === 'none') {
          if (record) return false
        } else if (appliedStatus !== 'all') {
          if (!record || record.status !== appliedStatus) return false
        }
        if (!q) return true
        return String(emp.name || '').toLowerCase().includes(q)
      })
      .map((emp) => {
        const record = recordsByEmployee.get(Number(emp.id)) || null
        return { employee: emp, record }
      })
  }, [employees, recordsByEmployee, search, appliedRoleId, appliedStatus])

  const draftPreviewCount = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((emp) => {
      if (draftRoleId && emp.role !== draftRoleId) return false
      const record = recordsByEmployee.get(Number(emp.id))
      if (draftStatus === 'none') {
        if (record) return false
      } else if (draftStatus !== 'all') {
        if (!record || record.status !== draftStatus) return false
      }
      if (!q) return true
      return String(emp.name || '').toLowerCase().includes(q)
    }).length
  }, [employees, recordsByEmployee, search, draftRoleId, draftStatus])

  const filtersActive = Boolean(appliedRoleId) || appliedStatus !== 'all'

  function toggleFilter() {
    if (filterOpen) {
      setFilterOpen(false)
      return
    }
    setDraftRoleId(appliedRoleId)
    setDraftStatus(appliedStatus)
    setFilterOpen(true)
  }

  function applyFilter() {
    setAppliedRoleId(draftRoleId)
    setAppliedStatus(draftStatus)
    setFilterOpen(false)
  }

  function resetFilter() {
    setDraftRoleId('')
    setDraftStatus('all')
    setAppliedRoleId('')
    setAppliedStatus('all')
    setFilterOpen(false)
  }

  function closeFilter() {
    setFilterOpen(false)
  }

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

  async function handleOpenComment(employee, record) {
    if (!period || commentSaving) return
    try {
      let nextRecord = record
      if (!nextRecord) {
        nextRecord = await ensureSalaryRecord(period.id, employee.id)
        setRecordsByEmployee((prev) => {
          const map = new Map(prev)
          map.set(Number(employee.id), nextRecord)
          return map
        })
      }
      setCommentTarget({ employee, record: nextRecord })
    } catch (err) {
      showWarning(err?.message || 'Не удалось открыть комментарий')
    }
  }

  async function handleSaveComment(notes) {
    if (!commentTarget?.record) return
    setCommentSaving(true)
    try {
      const updated = await updateSalaryRecordFields(commentTarget.record.id, {
        notes: notes.trim() || '',
      })
      setRecordsByEmployee((prev) => {
        const map = new Map(prev)
        map.set(Number(commentTarget.employee.id), updated)
        return map
      })
      setCommentTarget(null)
      showSuccess('Комментарий сохранён')
    } catch (err) {
      showWarning(err?.message || 'Не удалось сохранить комментарий')
    } finally {
      setCommentSaving(false)
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

      <div className="employees-section__toolbar payroll-section__toolbar">
        <label className="employees-section__search-wrap">
          <span className="employees-section__search-icon" aria-hidden="true">
            <SearchIcon size={18} />
          </span>
          <input
            type="search"
            className="employees-section__search"
            placeholder="Поиск по ФИО"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Поиск по ФИО"
            autoComplete="off"
          />
        </label>

        <div className="employees-section__filter-wrap">
          <button
            ref={filterButtonRef}
            type="button"
            className={`employees-section__icon-btn${
              filtersActive ? ' employees-section__icon-btn--active' : ''
            }`}
            onClick={toggleFilter}
            aria-expanded={filterOpen}
            aria-label="Фильтр"
            title="Фильтр"
          >
            <FilterIcon size={20} />
            {filtersActive && (
              <span className="employees-section__filter-indicator" aria-hidden="true" />
            )}
          </button>
          <PayrollFilterPopover
            open={filterOpen}
            draftRoleId={draftRoleId}
            draftStatus={draftStatus}
            onRoleChange={setDraftRoleId}
            onStatusChange={setDraftStatus}
            resultCount={draftPreviewCount}
            onApply={applyFilter}
            onReset={resetFilter}
            onClose={closeFilter}
            anchorRef={filterButtonRef}
          />
        </div>
      </div>

      {error && <p className="payroll-section__error">{error}</p>}

      {loading ? (
        <p className="payroll-section__empty">Загрузка…</p>
      ) : error ? null : rows.length === 0 ? (
        <p className="payroll-section__empty">
          {search || filtersActive
            ? 'Сотрудники не найдены по текущим фильтрам'
            : 'Нет активных сотрудников для расчёта'}
        </p>
      ) : (
        <div className="payroll-table-wrap">
          <table className="payroll-table">
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Роль</th>
                <th>Статус расчёта</th>
                <th>К выдаче</th>
                <th className="payroll-table__th-comment">Комментарий</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ employee, record }) => {
                const statusMeta = record
                  ? getSalaryStatusMeta(record.status)
                  : { label: 'Нет расчёта', badge: 'idle' }
                const roleLabel = employee.position || getRoleLabel(employee.role)
                const notesPresent = hasRecordNotes(record)
                return (
                  <tr key={employee.id}>
                    <td>
                      <div className="payroll-table__name">{employee.name}</div>
                    </td>
                    <td>
                      <span className="payroll-table__role">{roleLabel}</span>
                    </td>
                    <td>
                      <StatusBadge label={statusMeta.label} type={statusMeta.badge} />
                    </td>
                    <td className="payroll-table__payable">
                      {record ? formatMoneyKzt(record.totalPayable) : '—'}
                    </td>
                    <td className="payroll-table__comment">
                      <button
                        type="button"
                        className={`payroll-table__comment-btn${
                          notesPresent ? ' payroll-table__comment-btn--filled' : ''
                        }`}
                        onClick={() => void handleOpenComment(employee, record)}
                        aria-label={
                          notesPresent ? 'Открыть комментарий' : 'Добавить комментарий'
                        }
                        title={notesPresent ? 'Есть комментарий' : 'Комментарий'}
                      >
                        <CommentIcon size={16} />
                      </button>
                    </td>
                    <td className="payroll-table__actions">
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

      {commentTarget && (
        <PayrollCommentModal
          employeeName={commentTarget.employee.name}
          initialNotes={commentTarget.record?.notes || ''}
          saving={commentSaving}
          onClose={() => {
            if (!commentSaving) setCommentTarget(null)
          }}
          onSave={(notes) => void handleSaveComment(notes)}
        />
      )}
    </div>
  )
}
