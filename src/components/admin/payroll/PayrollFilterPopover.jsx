import { useEffect, useRef } from 'react'
import AdminModal from '../AdminModal'
import useMediaQuery from '../../../hooks/useMediaQuery'
import { EMPLOYEE_FORM_ROLES, getRoleLabel } from '../../../data/roles'
import {
  changePayrollMonth,
  getPayrollCurrentMonthState,
  parsePayrollMonthInputValue,
  toPayrollMonthInputValue,
} from '../../../utils/salaryPayroll'
import '../employees/EmployeeFilterPopover.css'

const MOBILE_QUERY = '(max-width: 900px)'

function PayrollFilterFields({
  draftYear,
  draftMonth,
  onMonthChange,
  draftRoleId,
  draftShowExcluded,
  onRoleChange,
  onShowExcludedChange,
  resultCount,
}) {
  const current = getPayrollCurrentMonthState()
  const previous = changePayrollMonth(current.year, current.month, -1)
  const isCurrent =
    Number(draftYear) === current.year && Number(draftMonth) === current.month
  const isPrevious =
    Number(draftYear) === previous.year && Number(draftMonth) === previous.month

  return (
    <>
      <div className="employee-filter-popover__section">
        <span className="employee-filter-popover__label">Период</span>
        <label className="employee-filter-popover__month-field">
          <span className="employee-filter-popover__month-caption">Месяц расчёта</span>
          <input
            type="month"
            className="admin-form__input employee-filter-popover__month-input"
            value={toPayrollMonthInputValue(draftYear, draftMonth)}
            onChange={(event) => {
              const next = parsePayrollMonthInputValue(event.target.value)
              if (next) onMonthChange?.(next.year, next.month)
            }}
            aria-label="Месяц расчёта"
          />
        </label>
        <div
          className="employee-filter-popover__options"
          role="group"
          aria-label="Быстрый период"
        >
          <button
            type="button"
            className={`employee-filter-popover__option${
              isCurrent ? ' employee-filter-popover__option--active' : ''
            }`}
            onClick={() => onMonthChange?.(current.year, current.month)}
          >
            Текущий месяц
          </button>
          <button
            type="button"
            className={`employee-filter-popover__option${
              isPrevious ? ' employee-filter-popover__option--active' : ''
            }`}
            onClick={() => onMonthChange?.(previous.year, previous.month)}
          >
            Предыдущий месяц
          </button>
        </div>
      </div>

      <div className="employee-filter-popover__section">
        <span className="employee-filter-popover__label">Роль</span>
        <select
          className="admin-form__select employee-filter-popover__role-select"
          value={draftRoleId}
          onChange={(event) => onRoleChange?.(event.target.value)}
          aria-label="Роль сотрудника"
        >
          <option value="">Все роли</option>
          {EMPLOYEE_FORM_ROLES.map((roleId) => (
            <option key={roleId} value={roleId}>
              {getRoleLabel(roleId)}
            </option>
          ))}
        </select>
      </div>

      <div className="employee-filter-popover__section">
        <label className="employee-filter-popover__checkbox-row">
          <input
            type="checkbox"
            checked={draftShowExcluded}
            onChange={(e) => onShowExcludedChange?.(e.target.checked)}
          />
          <span>Показать исключённых из ведомости</span>
        </label>
      </div>

      <p className="employee-filter-popover__count">Найдено: {resultCount}</p>
    </>
  )
}

/** Фильтр списка зарплаты — период + роль / участие в ведомости */
export default function PayrollFilterPopover({
  open,
  draftYear,
  draftMonth,
  onMonthChange,
  draftRoleId,
  draftShowExcluded,
  onRoleChange,
  onShowExcludedChange,
  resultCount,
  onApply,
  onReset,
  onClose,
  anchorRef,
}) {
  const popoverRef = useRef(null)
  const isMobile = useMediaQuery(MOBILE_QUERY)

  useEffect(() => {
    if (!open) return undefined

    function handleEscape(event) {
      if (event.key === 'Escape') onClose?.()
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  useEffect(() => {
    if (!open || isMobile) return undefined

    function handlePointerDown(event) {
      const anchor = anchorRef?.current
      const popover = popoverRef.current
      if (!popover) return
      if (popover.contains(event.target)) return
      if (anchor?.contains(event.target)) return
      onClose?.()
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open, isMobile, onClose, anchorRef])

  if (!open) return null

  const actions = (
    <>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => onReset?.()}>
        Сбросить
      </button>
      <button type="button" className="btn btn--primary btn--sm" onClick={onApply}>
        Применить
      </button>
    </>
  )

  const fields = (
    <PayrollFilterFields
      draftYear={draftYear}
      draftMonth={draftMonth}
      onMonthChange={onMonthChange}
      draftRoleId={draftRoleId}
      draftShowExcluded={draftShowExcluded}
      onRoleChange={onRoleChange}
      onShowExcludedChange={onShowExcludedChange}
      resultCount={resultCount}
    />
  )

  if (isMobile) {
    return (
      <AdminModal title="Фильтр" onClose={onClose} returnFocusRef={anchorRef} footer={actions}>
        {fields}
      </AdminModal>
    )
  }

  return (
    <div
      ref={popoverRef}
      className="employee-filter-popover employee-filter-popover--payroll"
      role="dialog"
      aria-modal="false"
      aria-labelledby="payroll-filter-popover-title"
    >
      <h2 id="payroll-filter-popover-title" className="employee-filter-popover__sr-title">
        Фильтр
      </h2>
      {fields}
      <div className="employee-filter-popover__actions">{actions}</div>
    </div>
  )
}
