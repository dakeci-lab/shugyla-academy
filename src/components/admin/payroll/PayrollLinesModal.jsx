import { useEffect, useState } from 'react'
import AdminModal from '../AdminModal'
import { formatMoneyCompact, toMoneyNumber } from '../../../utils/salaryPayroll'
import './PayrollLinesModal.css'

/** Компактный редактор строк начислений / удержаний */
export default function PayrollLinesModal({
  title,
  employeeName,
  presets = [],
  lines = [],
  saving = false,
  onClose,
  onAdd,
  onUpdate,
  onRemove,
}) {
  const [localLines, setLocalLines] = useState(lines)
  const [draftAmount, setDraftAmount] = useState('')
  const [draftKind, setDraftKind] = useState(presets[0]?.kind || 'custom')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLocalLines(lines)
  }, [lines])

  useEffect(() => {
    if (presets[0]?.kind) setDraftKind(presets[0].kind)
  }, [presets])

  const total = localLines.reduce((sum, line) => sum + toMoneyNumber(line.amount), 0)

  async function handleAdd(event) {
    event.preventDefault()
    if (busy || saving) return
    const amount = toMoneyNumber(draftAmount)
    if (amount <= 0) return
    const preset = presets.find((item) => item.kind === draftKind) || presets[0]
    setBusy(true)
    try {
      await onAdd?.({
        kind: preset?.kind || 'custom',
        title: preset?.title || 'Строка',
        amount,
        comment: '',
      })
      setDraftAmount('')
    } finally {
      setBusy(false)
    }
  }

  async function handleAmountBlur(lineId) {
    if (busy || saving) return
    const current = localLines.find((row) => row.id === lineId)
    if (!current) return
    setBusy(true)
    try {
      await onUpdate?.(lineId, { amount: current.amount })
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(lineId) {
    if (busy || saving) return
    setBusy(true)
    try {
      await onRemove?.(lineId)
      setLocalLines((prev) => prev.filter((row) => row.id !== lineId))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminModal
      title={title}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn--primary" onClick={onClose} disabled={busy}>
          Готово
        </button>
      }
    >
      <p className="admin-form__hint payroll-lines-modal__hint">{employeeName}</p>
      <p className="payroll-lines-modal__total">
        Итого: <strong>{formatMoneyCompact(total)}</strong>
      </p>

      <div className="payroll-lines-modal__list">
        {localLines.length === 0 ? (
          <p className="payroll-lines-modal__empty">Пока нет строк</p>
        ) : (
          localLines.map((line) => (
            <div key={line.id} className="payroll-lines-modal__row">
              <span className="payroll-lines-modal__title">{line.title}</span>
              <input
                type="number"
                min="0"
                step="1"
                className="payroll-lines-modal__amount"
                value={line.amount}
                disabled={busy || saving}
                onChange={(event) => {
                  const amount = event.target.value
                  setLocalLines((prev) =>
                    prev.map((row) =>
                      row.id === line.id ? { ...row, amount } : row
                    )
                  )
                }}
                onBlur={() => void handleAmountBlur(line.id)}
              />
              <button
                type="button"
                className="btn btn--outline btn--sm"
                disabled={busy || saving}
                onClick={() => void handleRemove(line.id)}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <form className="payroll-lines-modal__add" onSubmit={handleAdd}>
        <select
          className="admin-form__select"
          value={draftKind}
          disabled={busy || saving}
          onChange={(event) => setDraftKind(event.target.value)}
          aria-label="Тип"
        >
          {presets.map((preset) => (
            <option key={preset.kind} value={preset.kind}>
              {preset.title}
            </option>
          ))}
        </select>
        <input
          type="number"
          min="0"
          step="1"
          className="admin-form__input"
          placeholder="Сумма"
          value={draftAmount}
          disabled={busy || saving}
          onChange={(event) => setDraftAmount(event.target.value)}
          aria-label="Сумма"
        />
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy || saving}>
          Добавить
        </button>
      </form>
    </AdminModal>
  )
}
