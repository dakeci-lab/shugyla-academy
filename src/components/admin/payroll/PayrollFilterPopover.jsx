import { useEffect, useRef } from 'react'
import AdminModal from '../AdminModal'
import useMediaQuery from '../../../hooks/useMediaQuery'
import { EMPLOYEE_FORM_ROLES, getRoleLabel } from '../../../data/roles'
import { SALARY_RECORD_STATUSES } from '../../../utils/salaryPayroll'
import '../employees/EmployeeFilterPopover.css'

const MOBILE_QUERY = '(max-width: 900px)'

function PayrollFilterFields({ draftRoleId, draftStatus, onRoleChange, onStatusChange, resultCount }) {
  return (
    <>
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
        <span className="employee-filter-popover__label">Статус расчёта</span>
        <div
          className="employee-filter-popover__options"
          role="radiogroup"
          aria-label="Статус расчёта"
        >
          <button
            type="button"
            role="radio"
            aria-checked={draftStatus === 'all'}
            className={`employee-filter-popover__option${
              draftStatus === 'all' ? ' employee-filter-popover__option--active' : ''
            }`}
            onClick={() => onStatusChange?.('all')}
          >
            Все
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={draftStatus === 'none'}
            className={`employee-filter-popover__option${
              draftStatus === 'none' ? ' employee-filter-popover__option--active' : ''
            }`}
            onClick={() => onStatusChange?.('none')}
          >
            Без расчёта
          </button>
          {SALARY_RECORD_STATUSES.map((status) => (
            <button
              key={status.id}
              type="button"
              role="radio"
              aria-checked={draftStatus === status.id}
              className={`employee-filter-popover__option${
                draftStatus === status.id ? ' employee-filter-popover__option--active' : ''
              }`}
              onClick={() => onStatusChange?.(status.id)}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      <p className="employee-filter-popover__count">Найдено: {resultCount}</p>
    </>
  )
}

/** Фильтр списка зарплаты — тот же UI-паттерн, что у сотрудников */
export default function PayrollFilterPopover({
  open,
  draftRoleId,
  draftStatus,
  onRoleChange,
  onStatusChange,
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

  function handleReset() {
    onRoleChange?.('')
    onStatusChange?.('all')
    onReset?.()
  }

  const actions = (
    <>
      <button type="button" className="btn btn--ghost btn--sm" onClick={handleReset}>
        Сбросить
      </button>
      <button type="button" className="btn btn--primary btn--sm" onClick={onApply}>
        Применить
      </button>
    </>
  )

  const fields = (
    <PayrollFilterFields
      draftRoleId={draftRoleId}
      draftStatus={draftStatus}
      onRoleChange={onRoleChange}
      onStatusChange={onStatusChange}
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
      className="employee-filter-popover"
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
