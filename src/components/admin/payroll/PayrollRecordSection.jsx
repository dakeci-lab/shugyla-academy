import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { isCloudMode } from '../../../lib/dataMode'
import { getRoleLabel } from '../../../data/roles'
import { formatMonthYearLabel } from '../../../utils/shiftData'
import {
  SALARY_ALLOWANCE_PRESETS,
  SALARY_DEDUCTION_PRESETS,
  SALARY_RECORD_STATUSES,
  computeSalaryTotals,
  formatMoneyKzt,
  getPayrollListPath,
  getSalaryStatusMeta,
  toMoneyNumber,
} from '../../../utils/salaryPayroll'
import { getEmployeeForAdmin } from '../../../services/employeeAdminService'
import {
  addSalaryAllowance,
  addSalaryDeduction,
  deleteSalaryAllowance,
  deleteSalaryDeduction,
  getSalaryRecordBundle,
  saveSalaryRecordFull,
  updateSalaryAllowance,
  updateSalaryDeduction,
} from '../../../services/salaryPayrollService'
import { usePlatformPageTitle } from '../../../context/PlatformPageTitleContext'
import { useToast } from '../../../context/ToastContext'
import StatusBadge from '../StatusBadge'
import '../admin-shared.css'
import './PayrollRecordSection.css'

function LineEditor({
  lines,
  onChangeLine,
  onRemoveLine,
  emptyText,
}) {
  if (!lines.length) {
    return <p className="payroll-record__hint">{emptyText}</p>
  }

  return (
    <div className="payroll-record__lines">
      {lines.map((line) => (
        <div key={line.id} className="payroll-record__line">
          <div className="payroll-record__field">
            <label>Название</label>
            <input
              type="text"
              value={line.title}
              onChange={(event) =>
                onChangeLine(line.id, { title: event.target.value })
              }
              onBlur={() => onChangeLine(line.id, { title: line.title }, true)}
            />
          </div>
          <div className="payroll-record__field">
            <label>Сумма</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={line.amount}
              onChange={(event) =>
                onChangeLine(line.id, { amount: event.target.value })
              }
              onBlur={() => onChangeLine(line.id, { amount: line.amount }, true)}
            />
          </div>
          <div className="payroll-record__field">
            <label>Комментарий</label>
            <input
              type="text"
              value={line.comment || ''}
              onChange={(event) =>
                onChangeLine(line.id, { comment: event.target.value })
              }
              onBlur={() => onChangeLine(line.id, { comment: line.comment }, true)}
            />
          </div>
          <div className="payroll-record__line-actions">
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={() => onRemoveLine(line.id)}
            >
              Удалить
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Карточка расчёта зарплаты сотрудника */
export default function PayrollRecordSection() {
  const { recordId } = useParams()
  const navigate = useNavigate()
  const { success: showSuccess, warning: showWarning } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [employee, setEmployee] = useState(null)
  const [period, setPeriod] = useState(null)
  const [status, setStatus] = useState('draft')
  const [baseSalary, setBaseSalary] = useState(0)
  const [workHours, setWorkHours] = useState(0)
  const [workShifts, setWorkShifts] = useState(0)
  const [notes, setNotes] = useState('')
  const [allowances, setAllowances] = useState([])
  const [deductions, setDeductions] = useState([])
  const [persistedTotals, setPersistedTotals] = useState({
    totalAllowances: 0,
    totalDeductions: 0,
    totalPayable: 0,
  })

  usePlatformPageTitle('Расчёт зарплаты', '', {
    showBack: true,
    backFallback: getPayrollListPath(),
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (!isCloudMode()) {
        throw new Error('Подсчёт зарплаты доступен только в облачном режиме')
      }
      const bundle = await getSalaryRecordBundle(recordId)
      setPeriod(bundle.period)
      setStatus(bundle.record.status)
      setBaseSalary(bundle.record.baseSalary)
      setWorkHours(bundle.record.workHours)
      setWorkShifts(bundle.record.workShifts)
      setNotes(bundle.record.notes || '')
      setAllowances(bundle.allowances)
      setDeductions(bundle.deductions)
      setPersistedTotals({
        totalAllowances: bundle.record.totalAllowances,
        totalDeductions: bundle.record.totalDeductions,
        totalPayable: bundle.record.totalPayable,
      })

      const emp = await getEmployeeForAdmin(bundle.record.employeeId)
      setEmployee(emp)
    } catch (err) {
      setError(err?.message || 'Не удалось загрузить расчёт')
    } finally {
      setLoading(false)
    }
  }, [recordId])

  useEffect(() => {
    void load()
  }, [load])

  const liveTotals = useMemo(
    () =>
      computeSalaryTotals({
        baseSalary,
        allowances,
        deductions,
      }),
    [baseSalary, allowances, deductions]
  )

  const statusMeta = getSalaryStatusMeta(status)
  const periodLabel =
    period?.year && period?.month
      ? formatMonthYearLabel(period.year, period.month)
      : '—'
  const roleLabel = employee?.position || getRoleLabel(employee?.role) || '—'

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await saveSalaryRecordFull(recordId, {
        status,
        baseSalary,
        workHours,
        workShifts,
        notes,
      })
      setPersistedTotals({
        totalAllowances: updated.totalAllowances,
        totalDeductions: updated.totalDeductions,
        totalPayable: updated.totalPayable,
      })
      showSuccess('Расчёт сохранён')
    } catch (err) {
      showWarning(err?.message || 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddAllowance(preset) {
    try {
      const line = await addSalaryAllowance(recordId, {
        kind: preset.kind,
        title: preset.title,
        amount: 0,
        comment: '',
      })
      setAllowances((prev) => [...prev, line])
      const totals = computeSalaryTotals({
        baseSalary,
        allowances: [...allowances, line],
        deductions,
      })
      setPersistedTotals(totals)
    } catch (err) {
      showWarning(err?.message || 'Не удалось добавить начисление')
    }
  }

  async function handleAddDeduction(preset) {
    try {
      const line = await addSalaryDeduction(recordId, {
        kind: preset.kind,
        title: preset.title,
        amount: 0,
        comment: '',
      })
      setDeductions((prev) => [...prev, line])
      const totals = computeSalaryTotals({
        baseSalary,
        allowances,
        deductions: [...deductions, line],
      })
      setPersistedTotals(totals)
    } catch (err) {
      showWarning(err?.message || 'Не удалось добавить удержание')
    }
  }

  async function handleChangeAllowance(lineId, patch, persist = false) {
    setAllowances((prev) =>
      prev.map((line) =>
        line.id === lineId
          ? {
              ...line,
              ...patch,
              amount:
                patch.amount != null ? toMoneyNumber(patch.amount) : line.amount,
            }
          : line
      )
    )
    if (!persist) return
    try {
      const updated = await updateSalaryAllowance(lineId, recordId, patch)
      setAllowances((prev) => prev.map((line) => (line.id === lineId ? updated : line)))
      const next = await getSalaryRecordBundle(recordId)
      setPersistedTotals({
        totalAllowances: next.record.totalAllowances,
        totalDeductions: next.record.totalDeductions,
        totalPayable: next.record.totalPayable,
      })
    } catch (err) {
      showWarning(err?.message || 'Не удалось обновить начисление')
      void load()
    }
  }

  async function handleChangeDeduction(lineId, patch, persist = false) {
    setDeductions((prev) =>
      prev.map((line) =>
        line.id === lineId
          ? {
              ...line,
              ...patch,
              amount:
                patch.amount != null ? toMoneyNumber(patch.amount) : line.amount,
            }
          : line
      )
    )
    if (!persist) return
    try {
      const updated = await updateSalaryDeduction(lineId, recordId, patch)
      setDeductions((prev) => prev.map((line) => (line.id === lineId ? updated : line)))
      const next = await getSalaryRecordBundle(recordId)
      setPersistedTotals({
        totalAllowances: next.record.totalAllowances,
        totalDeductions: next.record.totalDeductions,
        totalPayable: next.record.totalPayable,
      })
    } catch (err) {
      showWarning(err?.message || 'Не удалось обновить удержание')
      void load()
    }
  }

  async function handleRemoveAllowance(lineId) {
    try {
      const updatedRecord = await deleteSalaryAllowance(lineId, recordId)
      setAllowances((prev) => prev.filter((line) => line.id !== lineId))
      setPersistedTotals({
        totalAllowances: updatedRecord.totalAllowances,
        totalDeductions: updatedRecord.totalDeductions,
        totalPayable: updatedRecord.totalPayable,
      })
    } catch (err) {
      showWarning(err?.message || 'Не удалось удалить начисление')
    }
  }

  async function handleRemoveDeduction(lineId) {
    try {
      const updatedRecord = await deleteSalaryDeduction(lineId, recordId)
      setDeductions((prev) => prev.filter((line) => line.id !== lineId))
      setPersistedTotals({
        totalAllowances: updatedRecord.totalAllowances,
        totalDeductions: updatedRecord.totalDeductions,
        totalPayable: updatedRecord.totalPayable,
      })
    } catch (err) {
      showWarning(err?.message || 'Не удалось удалить удержание')
    }
  }

  if (loading) {
    return <div className="payroll-record"><p>Загрузка…</p></div>
  }

  if (error) {
    return (
      <div className="payroll-record">
        <p className="payroll-record__error">{error}</p>
        <button type="button" className="btn btn--outline" onClick={() => navigate(getPayrollListPath())}>
          К списку
        </button>
      </div>
    )
  }

  return (
    <div className="payroll-record">
      <header className="payroll-record__hero">
        <div>
          <h1 className="payroll-record__name">{employee?.name || 'Сотрудник'}</h1>
          <p className="payroll-record__meta">
            {roleLabel} · {periodLabel}
          </p>
        </div>
        <div className="payroll-record__hero-side">
          <StatusBadge label={statusMeta.label} type={statusMeta.badge} />
          <div className="payroll-record__field">
            <label htmlFor="payroll-status">Статус</label>
            <select
              id="payroll-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {SALARY_RECORD_STATUSES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <section className="payroll-record__block">
        <h2 className="payroll-record__block-title">Основной оклад</h2>
        <div className="payroll-record__fields">
          <div className="payroll-record__field">
            <label htmlFor="payroll-base">Сумма</label>
            <input
              id="payroll-base"
              type="number"
              min="0"
              step="0.01"
              value={baseSalary}
              onChange={(event) => setBaseSalary(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="payroll-record__block">
        <h2 className="payroll-record__block-title">Рабочее время</h2>
        <p className="payroll-record__hint">
          Пока вводится вручную. Тайм-трекер будет подключён позже.
        </p>
        <div className="payroll-record__fields">
          <div className="payroll-record__field">
            <label htmlFor="payroll-hours">Рабочие часы</label>
            <input
              id="payroll-hours"
              type="number"
              min="0"
              step="0.01"
              value={workHours}
              onChange={(event) => setWorkHours(event.target.value)}
            />
          </div>
          <div className="payroll-record__field">
            <label htmlFor="payroll-shifts">Рабочие смены</label>
            <input
              id="payroll-shifts"
              type="number"
              min="0"
              step="0.01"
              value={workShifts}
              onChange={(event) => setWorkShifts(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="payroll-record__block">
        <h2 className="payroll-record__block-title">Начисления</h2>
        <div className="payroll-record__presets">
          {SALARY_ALLOWANCE_PRESETS.map((preset) => (
            <button
              key={preset.kind}
              type="button"
              className="btn btn--outline btn--sm"
              onClick={() => void handleAddAllowance(preset)}
            >
              + {preset.title}
            </button>
          ))}
        </div>
        <LineEditor
          lines={allowances}
          emptyText="Начислений пока нет"
          onChangeLine={(id, patch, persist) => void handleChangeAllowance(id, patch, persist)}
          onRemoveLine={(id) => void handleRemoveAllowance(id)}
        />
      </section>

      <section className="payroll-record__block">
        <h2 className="payroll-record__block-title">Удержания</h2>
        <div className="payroll-record__presets">
          {SALARY_DEDUCTION_PRESETS.map((preset) => (
            <button
              key={preset.kind}
              type="button"
              className="btn btn--outline btn--sm"
              onClick={() => void handleAddDeduction(preset)}
            >
              + {preset.title}
            </button>
          ))}
        </div>
        <LineEditor
          lines={deductions}
          emptyText="Удержаний пока нет"
          onChangeLine={(id, patch, persist) => void handleChangeDeduction(id, patch, persist)}
          onRemoveLine={(id) => void handleRemoveDeduction(id)}
        />
      </section>

      <section className="payroll-record__block">
        <h2 className="payroll-record__block-title">Итог</h2>
        <div className="payroll-record__totals">
          <div className="payroll-record__total">
            <span className="payroll-record__total-label">Начислено</span>
            <span className="payroll-record__total-value">
              {formatMoneyKzt(toMoneyNumber(baseSalary) + liveTotals.totalAllowances)}
            </span>
          </div>
          <div className="payroll-record__total">
            <span className="payroll-record__total-label">Удержано</span>
            <span className="payroll-record__total-value">
              {formatMoneyKzt(liveTotals.totalDeductions)}
            </span>
          </div>
          <div className="payroll-record__total payroll-record__total--payable">
            <span className="payroll-record__total-label">К выдаче</span>
            <span className="payroll-record__total-value">
              {formatMoneyKzt(liveTotals.totalPayable)}
            </span>
          </div>
        </div>
        <p className="payroll-record__hint">
          Сохранено в базе: {formatMoneyKzt(persistedTotals.totalPayable)}
        </p>
      </section>

      <section className="payroll-record__block">
        <h2 className="payroll-record__block-title">Комментарий</h2>
        <div className="payroll-record__field">
          <label htmlFor="payroll-notes">Заметка к расчёту</label>
          <textarea
            id="payroll-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
          />
        </div>
      </section>

      <div className="payroll-record__footer">
        <button
          type="button"
          className="btn btn--outline"
          onClick={() => navigate(getPayrollListPath())}
        >
          К списку
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
