import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDownIcon } from '../../icons/PlatformIcons'
import { dateToSupplierWeekdayId } from '../../../utils/supplierData'
import { suppliersOrderedToday } from '../../../utils/purchaseDocument'
import './DocumentSupplierPicker.css'

/**
 * Supplier combobox of the document: tabs «Сегодня · N» (order day is today) and «Все», search, check mark on
 * the current one. Disabled once the document has items (the supplier is then fixed).
 */
export default function DocumentSupplierPicker({ suppliers, valueId, valueName, onSelect, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('today')
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)

  const today = useMemo(
    () => suppliersOrderedToday(suppliers, dateToSupplierWeekdayId(new Date())),
    [suppliers]
  )

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

  if (disabled) {
    return (
      <span className="docsup__fixed" title="Поставщика нельзя сменить, пока в заказе есть товары">
        {valueName || '—'}
      </span>
    )
  }

  const source = tab === 'today' ? today : suppliers
  const q = query.trim().toLowerCase()
  const list = source.filter((supplier) => !q || supplier.name.toLowerCase().includes(q))

  return (
    <div className="docsup" ref={rootRef}>
      <button
        type="button"
        className="docsup__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={valueName ? '' : 'docsup__placeholder'}>{valueName || 'Выберите поставщика'}</span>
        <ChevronDownIcon size={16} />
      </button>
      {open ? (
        <div className="docsup__box">
          <div className="docsup__tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'today'} onClick={() => setTab('today')}>
              Сегодня · {today.length}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>
              Все
            </button>
          </div>
          <input
            type="text"
            className="docsup__search"
            placeholder="Поиск поставщика…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            autoFocus
          />
          <div className="docsup__list" role="listbox">
            {list.length === 0 ? <div className="docsup__empty">Поставщики не найдены</div> : null}
            {list.map((supplier) => (
              <button
                key={supplier.id}
                type="button"
                role="option"
                aria-selected={supplier.id === valueId}
                className={`docsup__option${supplier.id === valueId ? ' is-on' : ''}`}
                onClick={() => {
                  setOpen(false)
                  setQuery('')
                  onSelect(supplier)
                }}
              >
                <span>{supplier.name}</span>
                {supplier.id === valueId ? <span aria-hidden="true">✓</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
