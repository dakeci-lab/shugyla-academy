import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDownIcon } from '../icons/PlatformIcons'
import './PlatformActionsMenu.css'

/**
 * «Действие ▾» над списком (как в UMAG): счётчик выбранных строк и меню действий над ними.
 * Пункт, который сейчас недоступен, не нажимается и показывает причину («Нет прав…», «Сохранённые документы…»).
 *
 * items: [{ key, label, onSelect, disabled?, reason?, danger? }]
 */
export default function PlatformActionsMenu({ count = 0, items, label = 'Действие', className = '' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    function onPointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`pact${className ? ` ${className}` : ''}`} ref={rootRef}>
      <span className="pact__count" aria-label={`Выбрано: ${count}`}>
        {count}
      </span>
      <button
        type="button"
        className="pact__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{label}</span>
        <ChevronDownIcon size={14} />
      </button>
      {open ? (
        <div className="pact__menu" id={menuId} role="menu">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`pact__item${item.danger ? ' pact__item--danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onSelect?.()
              }}
            >
              <span>{item.label}</span>
              {item.disabled && item.reason ? <small>{item.reason}</small> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
