import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isCloudMode } from '../../../lib/dataMode'
import { getRoleLabel } from '../../../data/roles'
import { getCurrentMonthState } from '../../../utils/attendanceData'
import { formatMonthYearLabel } from '../../../utils/shiftData'
import {
  SALARY_ALLOWANCE_PRESETS,
  SALARY_DEDUCTION_PRESETS,
  changePayrollMonth,
  formatMoneyCompact,
  formatMoneyKzt,
  getPayrollLedgerAmounts,
  selectEmployeesForPayrollMonth,
  sumPayrollLedgerRows,
  toMoneyNumber,
} from '../../../utils/salaryPayroll'
import {
  getEmployeeForAdmin,
  listEmployeesForAdmin,
} from '../../../services/employeeAdminService'
import {
  addSalaryAllowance,
  addSalaryDeduction,
  deleteSalaryAllowance,
  deleteSalaryDeduction,
  ensureSalaryPeriod,
  ensureSalaryRecord,
  getSalaryRecordBundle,
  listAdvanceLinesForRecords,
  listSalaryRecordsForPeriod,
  updateSalaryAllowance,
  updateSalaryDeduction,
  updateSalaryRecordFields,
  upsertSalaryAdvance,
} from '../../../services/salaryPayrollService'
import { usePlatformPageRefresh } from '../../../context/PullToRefreshContext'
import { useToast } from '../../../context/ToastContext'
import PlatformPeriodHeader from '../../platform/PlatformPeriodHeader'
import { CommentIcon } from '../../icons/PlatformIcons'
import PlatformSearchToolbar, {
  PlatformFilterButton,
  PlatformToolbarActionWrap,
} from '../../platform/PlatformSearchToolbar'
import PayrollFilterPopover from './PayrollFilterPopover'
import PayrollCommentModal from './PayrollCommentModal'
import PayrollInlineMoneyCell from './PayrollInlineMoneyCell'
import PayrollLinesModal from './PayrollLinesModal'
import '../admin-shared.css'
import '../EmployeeSchedule.css'
import './PayrollSection.css'

const EMPLOYEE_PAGE_SIZE = 100
const DEDUCTION_PRESETS = SALARY_DEDUCTION_PRESETS.filter((item) => item.kind !== 'advance')

/** Все сотрудники (без фильтра по статусу) — состав ведомости режется по датам. */
async function listAllStaffEmployeesForPayroll() {
  const employees = []
  let page = 1
  let totalPages = 1

  do {
    const result = await listEmployeesForAdmin({
      page,
      pageSize: EMPLOYEE_PAGE_SIZE,
      status: 'all',
      sortBy: 'full_name',
      sortDirection: 'asc',
    })
    employees.push(...(result.employees || []))
    totalPages = Number(result.pagination?.total_pages) || 1
    page += 1
  } while (page <= totalPages)

  return employees
}

/**
 * Сотрудники ведомости за месяц:
 * пересечение периода работы + сотрудники с уже существующими записями (история).
 */
async function listEmployeesForPayrollMonth(year, month, records) {
  const staff = await listAllStaffEmployeesForPayroll()
  const recordEmployeeIds = (records || []).map((row) => Number(row.employeeId))
  let selected = selectEmployeesForPayrollMonth(staff, year, month, {
    includeEmployeeIds: recordEmployeeIds,
  })

  const selectedIds = new Set(selected.map((employee) => Number(employee.id)))
  const missingIds = recordEmployeeIds.filter(
    (id) => Number.isFinite(id) && !selectedIds.has(id)
  )

  if (missingIds.length > 0) {
    const extras = await Promise.all(
      missingIds.map(async (employeeId) => {
        try {
          return await getEmployeeForAdmin(employeeId, { allowSearchFallback: false })
        } catch {
          return null
        }
      })
    )
    selected = selectEmployeesForPayrollMonth([...staff, ...extras.filter(Boolean)], year, month, {
      includeEmployeeIds: recordEmployeeIds,
    })
  }

  return selected
}

function hasRecordNotes(record) {
  return Boolean(String(record?.notes || '').trim())
}

function TotalsMoney({ value }) {
  return <td className="payroll-table__money">{formatMoneyCompact(value)}</td>
}

/** Зарплатная ведомость с редактированием прямо в таблице */
export default function PayrollSection() {
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
  const [error, setError] = useState('')
  const [employees, setEmployees] = useState([])
  const [recordsByEmployee, setRecordsByEmployee] = useState(new Map())
  const [advancesByRecordId, setAdvancesByRecordId] = useState(new Map())
  const [period, setPeriod] = useState(null)
  const [savingEmployeeId, setSavingEmployeeId] = useState(null)

  const [commentTarget, setCommentTarget] = useState(null)
  const [commentSaving, setCommentSaving] = useState(false)
  const [linesTarget, setLinesTarget] = useState(null)

  const load = useCallback(
    async (options = {}) => {
      const quiet = options?.quiet === true
      if (!quiet) setLoading(true)
      setError('')
      try {
        if (!isCloudMode()) {
          setEmployees([])
          setRecordsByEmployee(new Map())
          setAdvancesByRecordId(new Map())
          setPeriod(null)
          setError('Подсчёт зарплаты доступен только в облачном режиме')
          return
        }

        const nextPeriod = await ensureSalaryPeriod(year, month)
        setPeriod(nextPeriod)

        const records = await listSalaryRecordsForPeriod(nextPeriod.id)
        const employeeRows = await listEmployeesForPayrollMonth(year, month, records)
        const advances = await listAdvanceLinesForRecords(records.map((row) => row.id))

        setEmployees(employeeRows)
        const map = new Map()
        for (const record of records) {
          map.set(Number(record.employeeId), record)
        }
        setRecordsByEmployee(map)
        setAdvancesByRecordId(advances)
      } catch (err) {
        setError(err?.message || 'Не удалось загрузить расчёты')
        setEmployees([])
        setRecordsByEmployee(new Map())
        setAdvancesByRecordId(new Map())
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

  const patchEmployeeRecord = useCallback((employeeId, record, advanceMeta = undefined) => {
    setRecordsByEmployee((prev) => {
      const map = new Map(prev)
      map.set(Number(employeeId), record)
      return map
    })
    if (advanceMeta !== undefined) {
      setAdvancesByRecordId((prev) => {
        const map = new Map(prev)
        if (!advanceMeta || toMoneyNumber(advanceMeta.amount) <= 0) {
          map.delete(record.id)
        } else {
          map.set(record.id, advanceMeta)
        }
        return map
      })
    }
  }, [])

  const ensureRowRecord = useCallback(
    async (employee) => {
      if (!period) throw new Error('Период не загружен')
      const existing = recordsByEmployee.get(Number(employee.id))
      if (existing) return existing
      const record = await ensureSalaryRecord(period.id, employee.id)
      patchEmployeeRecord(employee.id, record)
      return record
    },
    [period, recordsByEmployee, patchEmployeeRecord]
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
        const advanceAmount = record
          ? advancesByRecordId.get(record.id)?.amount || 0
          : 0
        return { employee: emp, record, advanceAmount }
      })
  }, [employees, recordsByEmployee, advancesByRecordId, search, appliedRoleId, appliedStatus])

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

  async function handleSaveBaseSalary(employee, amount) {
    setSavingEmployeeId(employee.id)
    try {
      const record = await ensureRowRecord(employee)
      const updated = await updateSalaryRecordFields(record.id, { baseSalary: amount })
      patchEmployeeRecord(employee.id, updated)
    } catch (err) {
      showWarning(err?.message || 'Не удалось сохранить оклад')
    } finally {
      setSavingEmployeeId(null)
    }
  }

  async function handleSaveAdvance(employee, amount) {
    setSavingEmployeeId(employee.id)
    try {
      const record = await ensureRowRecord(employee)
      const updated = await upsertSalaryAdvance(record.id, amount)
      patchEmployeeRecord(employee.id, updated)
      const advances = await listAdvanceLinesForRecords([updated.id])
      setAdvancesByRecordId((prev) => {
        const map = new Map(prev)
        map.delete(updated.id)
        const next = advances.get(updated.id)
        if (next) map.set(updated.id, next)
        return map
      })
    } catch (err) {
      showWarning(err?.message || 'Не удалось сохранить аванс')
    } finally {
      setSavingEmployeeId(null)
    }
  }

  async function handleOpenLines(employee, mode) {
    try {
      const record = await ensureRowRecord(employee)
      const bundle = await getSalaryRecordBundle(record.id)
      patchEmployeeRecord(employee.id, bundle.record)
      const lines =
        mode === 'allowances'
          ? bundle.allowances
          : bundle.deductions.filter((line) => line.kind !== 'advance')
      setLinesTarget({
        mode,
        employee,
        record: bundle.record,
        lines,
      })
    } catch (err) {
      showWarning(err?.message || 'Не удалось открыть строки')
    }
  }

  async function refreshLinesTarget(recordId, employee, mode) {
    const bundle = await getSalaryRecordBundle(recordId)
    patchEmployeeRecord(employee.id, bundle.record)
    if (mode === 'deductions' && period) {
      const advances = await listAdvanceLinesForRecords([recordId])
      setAdvancesByRecordId((prev) => {
        const map = new Map(prev)
        map.delete(recordId)
        const next = advances.get(recordId)
        if (next) map.set(recordId, next)
        return map
      })
    }
    const lines =
      mode === 'allowances'
        ? bundle.allowances
        : bundle.deductions.filter((line) => line.kind !== 'advance')
    setLinesTarget((prev) =>
      prev && prev.record.id === recordId
        ? { ...prev, record: bundle.record, lines }
        : prev
    )
    return { bundle, lines }
  }

  async function handleOpenComment(employee, record) {
    if (commentSaving) return
    try {
      let nextRecord = record
      if (!nextRecord) nextRecord = await ensureRowRecord(employee)
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
      patchEmployeeRecord(commentTarget.employee.id, updated)
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
      <PlatformPeriodHeader
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
              onApply={() => {
                setAppliedRoleId(draftRoleId)
                setAppliedStatus(draftStatus)
                setFilterOpen(false)
              }}
              onReset={() => {
                setDraftRoleId('')
                setDraftStatus('all')
                setAppliedRoleId('')
                setAppliedStatus('all')
                setFilterOpen(false)
              }}
              onClose={() => setFilterOpen(false)}
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
              <span className="payroll-summary__label">Авансы</span>
              <span className="payroll-summary__value">{formatMoneyKzt(totals.advance)}</span>
            </div>
            <div className="payroll-summary__item">
              <span className="payroll-summary__label">К выдаче</span>
              <span className="payroll-summary__value">{formatMoneyKzt(totals.payable)}</span>
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
                </tr>
              </thead>
              <tbody>
                {rows.map(({ employee, record, advanceAmount }, index) => {
                  const roleLabel = employee.position || getRoleLabel(employee.role)
                  const amounts = getPayrollLedgerAmounts(record, advanceAmount)
                  const notesPresent = hasRecordNotes(record)
                  const rowSaving = savingEmployeeId === employee.id
                  return (
                    <tr key={employee.id}>
                      <td className="payroll-table__num">{index + 1}</td>
                      <td className="payroll-table__employee">
                        <div className="payroll-table__person">
                          <span className="payroll-table__name">{employee.name}</span>
                          <span className="payroll-table__role">{roleLabel}</span>
                        </div>
                      </td>
                      <PayrollInlineMoneyCell
                        value={amounts.baseSalary}
                        saving={rowSaving}
                        onCommit={(next) => handleSaveBaseSalary(employee, next)}
                      />
                      <td className="payroll-table__money">
                        <button
                          type="button"
                          className="payroll-table__money-btn payroll-table__money-btn--link"
                          onClick={() => void handleOpenLines(employee, 'allowances')}
                        >
                          {formatMoneyCompact(amounts.allowances)}
                        </button>
                      </td>
                      <td className="payroll-table__money">
                        <button
                          type="button"
                          className="payroll-table__money-btn payroll-table__money-btn--link"
                          onClick={() => void handleOpenLines(employee, 'deductions')}
                        >
                          {formatMoneyCompact(amounts.deductions)}
                        </button>
                      </td>
                      <td className="payroll-table__money payroll-table__money--readonly">
                        {formatMoneyCompact(amounts.payable)}
                      </td>
                      <PayrollInlineMoneyCell
                        value={amounts.advance}
                        saving={rowSaving}
                        onCommit={(next) => handleSaveAdvance(employee, next)}
                      />
                      <td className="payroll-table__money payroll-table__money--readonly">
                        {formatMoneyCompact(amounts.remainder)}
                      </td>
                      <td className="payroll-table__money payroll-table__money--readonly">
                        {formatMoneyCompact(amounts.paid)}
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
                          <CommentIcon size={15} />
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
                  <TotalsMoney value={totals.baseSalary} />
                  <TotalsMoney value={totals.allowances} />
                  <TotalsMoney value={totals.deductions} />
                  <TotalsMoney value={totals.payable} />
                  <TotalsMoney value={totals.advance} />
                  <TotalsMoney value={totals.remainder} />
                  <TotalsMoney value={totals.paid} />
                  <td className="payroll-table__comment" />
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

      {linesTarget && (
        <PayrollLinesModal
          title={linesTarget.mode === 'allowances' ? 'Начисления' : 'Удержания'}
          employeeName={linesTarget.employee.name}
          presets={
            linesTarget.mode === 'allowances' ? SALARY_ALLOWANCE_PRESETS : DEDUCTION_PRESETS
          }
          lines={linesTarget.lines}
          onClose={() => setLinesTarget(null)}
          onAdd={async (payload) => {
            const recordId = linesTarget.record.id
            const created =
              linesTarget.mode === 'allowances'
                ? await addSalaryAllowance(recordId, payload)
                : await addSalaryDeduction(recordId, payload)
            await refreshLinesTarget(recordId, linesTarget.employee, linesTarget.mode)
            return created
          }}
          onUpdate={async (lineId, patch) => {
            const recordId = linesTarget.record.id
            const updated =
              linesTarget.mode === 'allowances'
                ? await updateSalaryAllowance(lineId, recordId, patch)
                : await updateSalaryDeduction(lineId, recordId, patch)
            await refreshLinesTarget(recordId, linesTarget.employee, linesTarget.mode)
            return updated
          }}
          onRemove={async (lineId) => {
            const recordId = linesTarget.record.id
            if (linesTarget.mode === 'allowances') {
              await deleteSalaryAllowance(lineId, recordId)
            } else {
              await deleteSalaryDeduction(lineId, recordId)
            }
            await refreshLinesTarget(recordId, linesTarget.employee, linesTarget.mode)
          }}
        />
      )}
    </div>
  )
}
