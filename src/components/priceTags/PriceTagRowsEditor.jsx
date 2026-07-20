import { useRef, useState } from 'react'
import { PRICE_TAG_UNITS } from '../../utils/priceTags/priceTagModel'

/**
 * Mass-entry grid for price-tag rows: add/remove/reorder + optional description.
 */
export default function PriceTagRowsEditor({
  rows,
  errorsByRowId = {},
  selectedRowId,
  onSelectRow,
  onChangeRow,
  onRemoveRow,
  onAddRow,
  onAddRows,
  onInsertAfter,
  onMoveRow,
}) {
  const dragIndexRef = useRef(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [draggingIndex, setDraggingIndex] = useState(null)

  function handleDragStart(index, event) {
    dragIndexRef.current = index
    setDraggingIndex(index)
    event.dataTransfer.effectAllowed = 'move'
    try {
      event.dataTransfer.setData('text/plain', String(index))
    } catch {
      // ignore
    }
  }

  function handleDragEnd() {
    dragIndexRef.current = null
    setDraggingIndex(null)
    setDragOverIndex(null)
  }

  function handleDragOver(index, event) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dragOverIndex !== index) setDragOverIndex(index)
  }

  function handleDrop(index, event) {
    event.preventDefault()
    const from = dragIndexRef.current
    handleDragEnd()
    if (from == null || from === index) return
    onMoveRow?.(from, index)
  }

  return (
    <div className="pt-rows">
      <div className="pt-rows__head" aria-hidden="true">
        <span className="pt-rows__col pt-rows__col--name">Наименование</span>
        <span className="pt-rows__col pt-rows__col--unit">Ед.</span>
        <span className="pt-rows__col pt-rows__col--barcode">Штрихкод</span>
        <span className="pt-rows__col pt-rows__col--price">Цена</span>
        <span className="pt-rows__col pt-rows__col--old">Старая</span>
        <span className="pt-rows__col pt-rows__col--qty">Кол-во</span>
        <span className="pt-rows__col pt-rows__col--desc">Описание</span>
        <span className="pt-rows__col pt-rows__col--actions" />
      </div>

      <ul className="pt-rows__list">
        {rows.map((row, index) => {
          const errors = errorsByRowId[row.id] || {}
          const selected = selectedRowId === row.id
          const isDragOver = dragOverIndex === index && draggingIndex !== index

          return (
            <li
              key={row.id}
              className={[
                'pt-rows__item',
                selected ? 'pt-rows__item--selected' : '',
                isDragOver ? 'pt-rows__item--drag-over' : '',
                draggingIndex === index ? 'pt-rows__item--dragging' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onDragOver={(e) => handleDragOver(index, e)}
              onDrop={(e) => handleDrop(index, e)}
              onClick={() => onSelectRow?.(row.id)}
            >
              <div className="pt-rows__line">
                <label className="pt-rows__field pt-rows__col--name">
                  <span className="pt-rows__mobile-label">Наименование</span>
                  <input
                    className={`pt-rows__input${errors.name ? ' pt-rows__input--error' : ''}`}
                    value={row.name}
                    onChange={(e) => onChangeRow(row.id, { name: e.target.value })}
                    placeholder="Кока-Кола 1 л"
                    autoComplete="off"
                  />
                </label>

                <label className="pt-rows__field pt-rows__col--unit">
                  <span className="pt-rows__mobile-label">Ед.</span>
                  <select
                    className="pt-rows__select"
                    value={row.unit}
                    onChange={(e) => onChangeRow(row.id, { unit: e.target.value })}
                    aria-label="Единица измерения"
                  >
                    {PRICE_TAG_UNITS.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="pt-rows__field pt-rows__col--barcode">
                  <span className="pt-rows__mobile-label">Штрихкод</span>
                  <input
                    className="pt-rows__input"
                    value={row.barcode}
                    onChange={(e) => onChangeRow(row.id, { barcode: e.target.value })}
                    placeholder="Штрихкод"
                    autoComplete="off"
                    inputMode="numeric"
                  />
                </label>

                <label className="pt-rows__field pt-rows__col--price">
                  <span className="pt-rows__mobile-label">Цена</span>
                  <input
                    className={`pt-rows__input${errors.price ? ' pt-rows__input--error' : ''}`}
                    value={row.price}
                    onChange={(e) => onChangeRow(row.id, { price: e.target.value })}
                    placeholder="0"
                    autoComplete="off"
                    inputMode="decimal"
                  />
                </label>

                <label className="pt-rows__field pt-rows__col--old">
                  <span className="pt-rows__mobile-label">Старая цена</span>
                  <input
                    className={`pt-rows__input${errors.oldPrice ? ' pt-rows__input--error' : ''}`}
                    value={row.oldPrice}
                    onChange={(e) => onChangeRow(row.id, { oldPrice: e.target.value })}
                    placeholder="—"
                    autoComplete="off"
                    inputMode="decimal"
                  />
                </label>

                <label className="pt-rows__field pt-rows__col--qty">
                  <span className="pt-rows__mobile-label">Кол-во</span>
                  <input
                    className="pt-rows__input pt-rows__input--qty"
                    type="number"
                    min={1}
                    max={999}
                    value={row.quantity}
                    onChange={(e) => onChangeRow(row.id, { quantity: e.target.value })}
                    aria-label="Количество ценников"
                  />
                </label>

                <label className="pt-rows__field pt-rows__col--desc pt-rows__check">
                  <span className="pt-rows__mobile-label">Описание</span>
                  <input
                    type="checkbox"
                    checked={Boolean(row.showDescription)}
                    onChange={(e) =>
                      onChangeRow(row.id, { showDescription: e.target.checked })
                    }
                    aria-label="Добавить описание"
                  />
                  <span className="pt-rows__check-text">Добавить описание</span>
                </label>

                <div className="pt-rows__col--actions">
                  <button
                    type="button"
                    className="pt-rows__icon-btn pt-rows__icon-btn--danger"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveRow?.(row.id)
                    }}
                    aria-label="Удалить строку"
                    title="Удалить"
                  >
                    ✕
                  </button>

                  <div className="pt-rows__drag-group">
                    <button
                      type="button"
                      className="pt-rows__icon-btn pt-rows__insert-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onInsertAfter?.(index)
                      }}
                      aria-label="Вставить строку ниже"
                      title="Вставить строку ниже"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="pt-rows__drag-handle"
                      draggable
                      onDragStart={(e) => handleDragStart(index, e)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Перетащить строку"
                      title="Перетащить"
                    >
                      <span aria-hidden="true">⋮⋮</span>
                    </button>
                  </div>
                </div>
              </div>

              {row.showDescription ? (
                <div className="pt-rows__description">
                  <label className="pt-rows__field pt-rows__field--grow">
                    <span className="pt-rows__mobile-label">Описание</span>
                    <input
                      className="pt-rows__input"
                      value={row.description}
                      onChange={(e) => onChangeRow(row.id, { description: e.target.value })}
                      placeholder="Описание"
                      autoComplete="off"
                    />
                  </label>
                </div>
              ) : null}

              {(errors.name || errors.price || errors.oldPrice) && (
                <p className="pt-rows__error">
                  {[errors.name, errors.price, errors.oldPrice].filter(Boolean).join(' · ')}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <div className="pt-rows__toolbar">
        <button type="button" className="btn btn--outline pt-rows__toolbar-btn" onClick={onAddRow}>
          ➕ Добавить строку
        </button>
        <button
          type="button"
          className="btn btn--outline pt-rows__toolbar-btn"
          onClick={() => onAddRows?.(5)}
        >
          +5 строк
        </button>
      </div>
    </div>
  )
}
