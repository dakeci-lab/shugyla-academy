import { useEffect, useRef, useState } from 'react'
import { formatMonthLabel } from '../../services/salesDataService'
import { RotateCcwIcon } from '../icons/PlatformIcons'
import './SalesResyncMenu.css'

/**
 * Compact popover next to «Синхронизировать»: pick one already-synced month
 * and redo it from scratch — for retroactive fixes (e.g. category taxonomy
 * corrected in UMAG after the month was first synced).
 */
export default function SalesResyncMenu({ months, resyncing, onResync }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState('')
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!month && months.length > 0) setMonth(months[0])
  }, [months, month])

  useEffect(() => {
    if (!open) return undefined
    function handlePointerDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  async function handleConfirm() {
    if (!month || resyncing) return
    await onResync(month)
    setOpen(false)
  }

  if (months.length === 0) return null

  return (
    <div className="sales-resync" ref={wrapRef}>
      <button
        type="button"
        className="btn btn--outline sales-resync__trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={resyncing}
        aria-expanded={open}
        aria-haspopup="true"
        title="Пересинхронизировать месяц"
      >
        <RotateCcwIcon size={16} />
      </button>
      {open ? (
        <div className="sales-resync__panel" role="dialog" aria-label="Пересинхронизировать месяц">
          <span className="sales-resync__panel-label">Пересинхронизировать месяц</span>
          <select
            className="sales-resync__select"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={resyncing}
          >
            {months.map((monthKey) => (
              <option key={monthKey} value={monthKey}>
                {formatMonthLabel(monthKey)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn--primary btn--sm sales-resync__confirm"
            onClick={() => void handleConfirm()}
            disabled={resyncing}
          >
            {resyncing ? 'Пересинхронизация…' : 'Пересинхронизировать'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
