import { Fragment } from 'react'
import './PlatformGridTable.css'

/**
 * One table design for the whole «Расчёты» area («К оплате», «Поставщики»):
 * a CSS-grid table — header, rows, optional subtotal rows and a pinned grand
 * total — so pages that show a list of money rows look and behave the same.
 *
 * Column def: { key, label, width, flex?, align?, mobile? }
 *   width  — px (for a flex column: its minimum)
 *   flex   — takes the remaining space (one per table)
 *   align  — 'end' right-aligns header and cell (amounts)
 *   mobile — 'title' (top-left, wraps) | 'end' (top-right) | 'hide' (dropped
 *            on phones; the row's `mobileMeta` line can carry it instead)
 * Fixed layout, no user-configurable columns (the gear was removed on purpose).
 */
export function gridTemplate(columns) {
  return columns
    .map((col) => (col.flex ? `minmax(${col.width}px, 1fr)` : `${col.width}px`))
    .join(' ')
}

function cellClass(col) {
  return [
    'pgt__cell',
    col.align === 'end' ? 'pgt__cell--end' : '',
    col.mobile ? `pgt__cell--m-${col.mobile}` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function PgtTable({ columns, className = '', children }) {
  return (
    <div
      className={`pgt${className ? ` ${className}` : ''}`}
      style={{ '--pgt-cols': gridTemplate(columns) }}
    >
      {children}
    </div>
  )
}

export function PgtHead({ columns }) {
  return (
    <div className="pgt__head" role="row">
      {columns.map((col) => (
        <span
          key={col.key}
          role="columnheader"
          className={`pgt__head-cell${col.align === 'end' ? ' pgt__cell--end' : ''}${
            col.mobile ? ` pgt__cell--m-${col.mobile}` : ''
          }`}
        >
          {col.label}
        </span>
      ))}
    </div>
  )
}

/**
 * @param cells       { [columnKey]: ReactNode }
 * @param onClick     when set the whole row is one button (payments); when
 *                    absent the row is a plain container and cells carry their
 *                    own controls (suppliers: name link + edit pencil).
 * @param mobileMeta  extra line shown under the title on phones only.
 * @param extra       rendered under the row (e.g. «Настроить отсрочку»).
 */
export function PgtRow({ columns, cells, onClick, className = '', mobileMeta = null, extra = null }) {
  const inner = (
    <>
      {columns.map((col) => (
        <span key={col.key} className={cellClass(col)}>
          {cells[col.key] ?? null}
        </span>
      ))}
      {mobileMeta ? <span className="pgt__mobile-meta">{mobileMeta}</span> : null}
    </>
  )
  return (
    <div className={`pgt__row${className ? ` ${className}` : ''}`}>
      {onClick ? (
        <button type="button" className="pgt__row-main pgt__row-main--button" onClick={onClick}>
          {inner}
        </button>
      ) : (
        <div className="pgt__row-main">{inner}</div>
      )}
      {extra}
    </div>
  )
}

/** Subtotal row inside the body (e.g. «Итого 18 сентября»). */
export function PgtSubtotal({ columns, cells }) {
  return (
    <div className="pgt__subtotal" role="row">
      {columns.map((col) => (
        <Fragment key={col.key}>
          <span className={cellClass(col)}>{cells[col.key] ?? null}</span>
        </Fragment>
      ))}
    </div>
  )
}

/** Grand-total row, pinned to the bottom of the viewport while scrolling. */
export function PgtFoot({ columns, cells }) {
  return (
    <div className="pgt__foot" role="row">
      {columns.map((col) => (
        <span key={col.key} className={cellClass(col)}>
          {cells[col.key] ?? null}
        </span>
      ))}
    </div>
  )
}
