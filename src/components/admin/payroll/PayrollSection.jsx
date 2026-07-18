import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isCloudMode } from '../../../lib/dataMode'
import { getRoleLabel } from '../../../data/roles'
import { getCurrentMonthState } from '../../../utils/attendanceData'
import { formatMonthYearLabel } from '../../../utils/shiftData'
import {
  changePayrollMonth,
  formatMoneyCompact,
  formatMoneyKzt,
  getPayrollLedgerAmounts,
  getPayrollRecordPath,
  sumPayrollLedgerRows,
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
import { CommentIcon } from '../../icons/PlatformIcons'
import PlatformSearchToolbar, {
  PlatformFilterButton,
  PlatformToolbarActionWrap,
} from '../../platform/PlatformSearchToolbar'
import PayrollFilterPopover from './PayrollFilterPopover'
import PayrollCommentModal from './PayrollCommentModal'
import '../admin-shared.css'
import '../EmployeeSchedule.css'
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

function MoneyCell({ value }) {
  return <td className="payroll-table__money">{formatMoneyCompact(value)}</td>
}

/** Список расчётов зарплаты за месяц — рабочая ведомость */
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

  const totals = useMemo(() => sumPayrollLedgerRows(rows), [rows])

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

      <PlatformSearchToolbar
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск по ФИО"
        ariaLabel="Поиск по ФИО"
        flush
        actions={
          <PlatformToolbarActionWrap>
            <PlatformFilterButton
              buttonRef={filterButtonRef}
              active={filtersActive}
              onClick={toggleFilter}
              ariaExpanded={filterOpen}
            />
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
          </PlatformToolbarActionWrap>
        }
      />

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
        <>
          <div className="payroll-summary" aria-label="Итоги ведомости">
            <div className="payroll-summary__item">
              <span className="payroll-summary__label">Фонд оплаты</span>
              <span className="payroll-summary__value">{formatMoneyKzt(totals.baseSalary)}</span>
            </div>
            <div className="payroll-summary__item">
              <span className="payroll-summary__label">Начисления</span>
              <span className="payroll-summary__value">{formatMoneyKzt(totals.allowances)}</span>
            </div>
            <div className="payroll-summary__item">
              <span className="payroll-summary__label">Удержания</span>
              <span className="payroll-summary__value">{formatMoneyKzt(totals.deductions)}</span>
            </div>
            <div className="payroll-summary__item">
              <span className="payroll-summary__label">К выдаче</span>
              <span className="payroll-summary__value">{formatMoneyKzt(totals.payable)}</span>
            </div>
            <div className="payroll-summary__item">
              <span className="payroll-summary__label">Остаток</span>
              <span className="payroll-summary__value">{formatMoneyKzt(totals.remainder)}</span>
            </div>
            <div className="payroll-summary__item">
              <span className="payroll-summary__label">Выплачено</span>
              <span className="payroll-summary__value">{formatMoneyKzt(totals.paid)}</span>
            </div>
          </div>

          <div className="payroll-table-wrap">
            <table className="payroll-table">
              <thead>
                <tr>
                  <th className="payroll-table__num">№</th>
                  <th className="payroll-table__employee">Сотрудник</th>
                  <th className="payroll-table__money">Оклад</th>
                  <th className="payroll-table__money">Начисления</th>
                  <th className="payroll-table__money">Удержания</th>
                  <th className="payroll-table__money">К выдаче</th>
                  <th className="payroll-table__money">Аванс</th>
                  <th className="payroll-table__money">Остаток</th>
                  <th className="payroll-table__money">Выплачено</th>
                  <th className="payroll-table__comment">Ком.</th>
                  <th className="payroll-table__actions">Открыть</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ employee, record }, index) => {
                  const roleLabel = employee.position || getRoleLabel(employee.role)
                  const amounts = getPayrollLedgerAmounts(record)
                  const notesPresent = hasRecordNotes(record)
                  return (
                    <tr key={employee.id}>
                      <td className="payroll-table__num">{index + 1}</td>
                      <td className="payroll-table__employee">
                        <div className="payroll-table__person">
                          <span className="payroll-table__name">{employee.name}</span>
                          <span className="payroll-table__role">{roleLabel}</span>
                        </div>
                      </td>
                      <MoneyCell value={amounts.baseSalary} />
                      <MoneyCell value={amounts.allowances} />
                      <MoneyCell value={amounts.deductions} />
                      <MoneyCell value={amounts.payable} />
                      <MoneyCell value={amounts.advance} />
                      <MoneyCell value={amounts.remainder} />
                      <MoneyCell value={amounts.paid} />
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
                          <CommentIcon size={15} />
                        </button>
                      </td>
                      <td className="payroll-table__actions">
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          disabled={openingId === employee.id}
                          onClick={() => void handleOpen(employee)}
                        >
                          {openingId === employee.id ? '…' : 'Открыть'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="payroll-table__totals">
                  <td className="payroll-table__num" />
                  <td className="payroll-table__totals-label">Итого</td>
                  <td className="payroll-table__money">{formatMoneyCompact(totals.baseSalary)}</td>
                  <td className="payroll-table__money">{formatMoneyCompact(totals.allowances)}</td>
                  <td className="payroll-table__money">{formatMoneyCompact(totals.deductions)}</td>
                  <td className="payroll-table__money">{formatMoneyCompact(totals.payable)}</td>
                  <td className="payroll-table__money">—</td>
                  <td className="payroll-table__money">{formatMoneyCompact(totals.remainder)}</td>
                  <td className="payroll-table__money">{formatMoneyCompact(totals.paid)}</td>
                  <td className="payroll-table__comment" />
                  <td className="payroll-table__actions" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
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
