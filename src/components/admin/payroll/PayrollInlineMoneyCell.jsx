import { useEffect, useRef, useState } from 'react'
import { formatMoneyCompact, toMoneyNumber } from '../../../utils/salaryPayroll'

/** Редактируемая денежная ячейка ведомости (клик → ввод → Enter/blur) */
export default function PayrollInlineMoneyCell({
  value,
  hint = '',
  disabled = false,
  saving = false,
  onCommit,
  ariaLabel = 'Редактировать сумму',
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  function startEdit() {
    if (disabled || saving) return
    setDraft(value == null || value === '' ? '' : String(toMoneyNumber(value)))
    setEditing(true)
  }

  async function commit() {
    if (!editing) return
    setEditing(false)
    const next = draft.trim() === '' ? 0 : toMoneyNumber(draft)
    const prev = value == null || value === '' ? 0 : toMoneyNumber(value)
    if (next === prev) return
    await onCommit?.(next)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      void commit()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <td className="payroll-table__money payroll-table__money--editing">
        <div className="payroll-table__money-edit">
          {hint ? <span className="payroll-table__money-hint">{hint}</span> : null}
          <input
            ref={inputRef}
            type="number"
            min="0"
            step="1"
            className="payroll-table__money-input"
            value={draft}
            disabled={saving}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void commit()}
            onKeyDown={handleKeyDown}
            aria-label={ariaLabel}
          />
        </div>
      </td>
    )
  }

  return (
    <td className="payroll-table__money">
      <button
        type="button"
        className={`payroll-table__money-btn${hint ? ' payroll-table__money-btn--hinted' : ''}`}
        onClick={startEdit}
        disabled={disabled || saving}
        aria-label={ariaLabel}
      >
        {hint ? <span className="payroll-table__money-hint">{hint}</span> : null}
        <span className="payroll-table__money-value">
          {saving ? '…' : formatMoneyCompact(value)}
        </span>
      </button>
    </td>
  )
}
