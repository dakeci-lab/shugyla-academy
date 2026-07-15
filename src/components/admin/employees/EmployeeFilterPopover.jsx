import { useEffect, useRef } from 'react'
import AdminModal from '../AdminModal'
import useMediaQuery from '../../../hooks/useMediaQuery'
import { formatRoleDisplayLabel } from '../../../utils/roleDisplay'
import {
  EMPLOYEE_LIST_DEFAULT_STATUS,
  EMPLOYEE_LIST_STATUS_FILTER_OPTIONS,
  formatEmployeeFilterCount,
} from '../../../utils/employeeData'
import './EmployeeFilterPopover.css'

const MOBILE_QUERY = '(max-width: 900px)'

function EmployeeFilterFields({
  draftStatus,
  draftRoleId,
  roles,
  onStatusChange,
  onRoleChange,
  resultCount,
}) {
  return (
    <>
      <div className="employee-filter-popover__section">
        <span className="employee-filter-popover__label">Статус</span>
        <div
          className="employee-filter-popover__options"
          role="radiogroup"
          aria-label="Статус сотрудника"
        >
          {EMPLOYEE_LIST_STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={draftStatus === option.id}
              className={`employee-filter-popover__option${
                draftStatus === option.id ? ' employee-filter-popover__option--active' : ''
              }`}
              onClick={() => onStatusChange?.(option.id)}
            >
              {option.label}
            </button>
          ))}
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
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {formatRoleDisplayLabel(role, roles)}
            </option>
          ))}
        </select>
      </div>

      <p className="employee-filter-popover__count">
        {formatEmployeeFilterCount(draftStatus, resultCount)}
      </p>
    </>
  )
}

export default function EmployeeFilterPopover({
  open,
  draftStatus,
  draftRoleId,
  roles,
  onStatusChange,
  onRoleChange,
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
    onStatusChange?.(EMPLOYEE_LIST_DEFAULT_STATUS)
    onRoleChange?.('')
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
    <EmployeeFilterFields
      draftStatus={draftStatus}
      draftRoleId={draftRoleId}
      roles={roles}
      onStatusChange={onStatusChange}
      onRoleChange={onRoleChange}
      resultCount={resultCount}
    />
  )

  if (isMobile) {
    return (
      <AdminModal
        title="Фильтр сотрудников"
        onClose={onClose}
        returnFocusRef={anchorRef}
        footer={actions}
      >
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
      aria-labelledby="employee-filter-popover-title"
    >
      <h2 id="employee-filter-popover-title" className="employee-filter-popover__sr-title">
        Фильтр сотрудников
      </h2>
      {fields}
      <div className="employee-filter-popover__actions">{actions}</div>
    </div>
  )
}
