import { calcReserveDays, shelfToneFromItem } from '../../../utils/procurementPlanningMath'
import { useEffect, useRef, useState } from 'react'
import { catalogGroupKey } from '../../../utils/purchaseCatalog'
import './CatalogTable.css'

const num = (value, digits = 0) =>
  Number.isFinite(Number(value))
    ? Number(value).toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
    : '—'

/**
 * Planning-style table of products grouped by category / subcategory (shared by «Товары поставщика» and
 * «Добавить из номенклатуры»). Groups are collapsed unless `expandAll` (search) or opened with +/−.
 * No norm colours and no stock bar: only the numbers the buyer needs to decide a quantity.
 */
export default function CatalogTable({
  groups,
  loadingKeys = null,
  weekLabels,
  expanded,
  expandAll = false,
  onToggleGroup,
  selected,
  onToggleItem,
  onToggleMany,
  quantityOf,
  onQuantity,
  inDocument,
  disabledReason,
}) {
  // Group headers must be exactly as wide as the visible part of the table: a sticky element wider than that
  // is pushed out of view again once the table is scrolled far to the right.
  const wrapRef = useRef(null)
  const [viewWidth, setViewWidth] = useState(0)
  useEffect(() => {
    const node = wrapRef.current
    if (!node) return undefined
    const update = () => setViewWidth(node.clientWidth)
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const items = groups.flatMap((category) => category.subcategories.flatMap((sub) => sub.items))
  const selectable = items.filter((item) => !inDocument.has(item.barcode) && !disabledReason?.(item))
  const allSelected = selectable.length > 0 && selectable.every((item) => selected.has(item.barcode))
  let rowNumber = 0

  function renderRow(item) {
    rowNumber += 1
    const inDoc = inDocument.has(item.barcode)
    const reason = inDoc ? 'Уже в заказе' : disabledReason?.(item) || ''
    const disabled = Boolean(reason)
    const reserve = calcReserveDays(item.calculationStock, item.avgDaily)
    const reserveTone = shelfToneFromItem(item)
    const weekMax = Math.max(0, ...(item.weeklySales || []).map((v) => Number(v) || 0))
    return (
      <tr key={item.barcode || item.id} className={disabled ? 'is-disabled' : ''} title={reason || undefined}>
        <td>
          <input
            type="checkbox"
            aria-label={`Выбрать «${item.productName}»`}
            checked={disabled ? inDoc : selected.has(item.barcode)}
            disabled={disabled}
            onChange={() => onToggleItem(item)}
          />
        </td>
        <td className="num">{rowNumber}</td>
        <td className="ctbl__name">{item.productName}</td>
        {weekLabels.map((label, index) => {
          const value = Number(item.weeklySales?.[index]) || 0
          // Heat shade per row: the eight weeks read as one block (a trend), not as eight separate numbers.
          const shade = weekMax > 0 && value > 0 ? 0.08 + (value / weekMax) * 0.22 : 0
          return (
            <td
              key={label + index}
              className={`r num ctbl__week${index === 0 ? ' ctbl__week--first' : ''}${index === weekLabels.length - 1 ? ' ctbl__week--last' : ''}`}
              style={shade ? { backgroundColor: `rgba(5, 150, 105, ${shade.toFixed(3)})` } : undefined}
            >
              {value ? num(value) : ''}
            </td>
          )
        })}
        <td className={`r num${item.negativeStock ? ' ctbl__neg' : ''}`}>{num(item.rawStock)}</td>
        <td
          className={`r num${reserveTone ? ` ctbl__reserve--${reserveTone}` : ''}`}
          title={
            reserveTone === 'below-norm'
              ? 'На полке меньше цели — пора заказывать (поставка в пути не учитывается)'
              : reserveTone === 'above-norm'
                ? 'На полке больше цели'
                : undefined
          }
        >
          {reserve == null ? '—' : reserve}
        </td>
        <td className="r num">{num(item.avgDaily, 2)}</td>
        <td className="r num">{num(item.recommendedQty)}</td>
        <td className="r num">{item.targetDays == null ? '—' : num(item.targetDays)}</td>
        <td className="r num">{item.inTransitQty ? num(item.inTransitQty) : ''}</td>
        <td className="r">
          <input
            type="number"
            min="0"
            className="ctbl__qty num"
            aria-label="Заказать"
            value={disabled ? '' : quantityOf(item)}
            placeholder={disabled || item.recommendedQty <= 0 ? '' : String(item.recommendedQty)}
            disabled={disabled}
            onChange={(event) => onQuantity(item, event.target.value)}
          />
        </td>
      </tr>
    )
  }

  const colSpan = 11 + weekLabels.length

  return (
    <>
    <p className="ctbl__legend">
      <span className="ctbl__legend-item">
        <i className="ctbl__legend-box ctbl__legend-box--below" aria-hidden="true" />
        На полке меньше цели — пора заказывать
      </span>
      <span className="ctbl__legend-item">
        <i className="ctbl__legend-box ctbl__legend-box--above" aria-hidden="true" />
        На полке больше цели
      </span>
    </p>
    <div className="ctbl__wrap" ref={wrapRef} style={viewWidth ? { '--ctbl-view': `${viewWidth}px` } : undefined}>
      <table className="ctbl">
        <thead>
          <tr className="ctbl__h1">
            <th colSpan={3} />
            <th colSpan={weekLabels.length} className="ctbl__weeks-title">
              <span className="ctbl__weeks-label">Продажи по неделям, шт.</span>
            </th>
            <th colSpan={7} />
          </tr>
          <tr className="ctbl__h2">
            <th>
              <input
                type="checkbox"
                aria-label="Выбрать все"
                checked={allSelected}
                disabled={selectable.length === 0}
                onChange={() => onToggleMany(selectable, !allSelected)}
              />
            </th>
            <th>№</th>
            <th>Товар</th>
            {weekLabels.map((label, index) => (
              <th
                key={label + index}
                className={`r ctbl__week${index === 0 ? ' ctbl__week--first' : ''}${index === weekLabels.length - 1 ? ' ctbl__week--last' : ''}`}
              >
                {label}
              </th>
            ))}
            <th className="r">Остаток</th>
            <th className="r">Запас/дн</th>
            <th className="r">Спрос/дн</th>
            <th className="r">Рек.</th>
            <th className="r">Цель дн</th>
            <th className="r">В пути</th>
            <th className="r">Заказ</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="ctbl__empty">
                Ничего не найдено.
              </td>
            </tr>
          ) : null}
          {groups.map((category) => {
            const catKey = catalogGroupKey(category.name)
            const catOpen = expandAll || expanded.has(catKey)
            return (
              <FragmentRows key={catKey}>
                <tr className="ctbl__group">
                  <td colSpan={colSpan}>
                    <button type="button" onClick={() => onToggleGroup(catKey)} aria-expanded={catOpen}>
                      <span className="ctbl__sign">{catOpen ? '−' : '+'}</span>
                      <b>{category.name}</b>
                      <span className="ctbl__count">
                        {category.count} поз{category.toOrder ? ` · ${category.toOrder} к заказу` : ''}
                      </span>
                    </button>
                  </td>
                </tr>
                {catOpen
                  ? category.subcategories.map((sub) => {
                      const subKey = catalogGroupKey(category.name, sub.name)
                      const subOpen = expandAll || expanded.has(subKey)
                      return (
                        <FragmentRows key={subKey}>
                          <tr className="ctbl__group ctbl__group--sub">
                            <td colSpan={colSpan}>
                              <button type="button" onClick={() => onToggleGroup(subKey)} aria-expanded={subOpen}>
                                <span className="ctbl__sign">{subOpen ? '−' : '+'}</span>
                                <b>{sub.name}</b>
                                <span className="ctbl__count">
                                  {sub.count} поз{sub.toOrder ? ` · ${sub.toOrder} к заказу` : ''}
                                </span>
                              </button>
                            </td>
                          </tr>
                          {subOpen && loadingKeys?.has(subKey) ? (
                            <tr>
                              <td colSpan={colSpan} className="ctbl__empty">
                                Загрузка…
                              </td>
                            </tr>
                          ) : null}
                          {subOpen ? sub.items.map(renderRow) : null}
                        </FragmentRows>
                      )
                    })
                  : null}
              </FragmentRows>
            )
          })}
        </tbody>
      </table>
    </div>
    </>
  )
}

function FragmentRows({ children }) {
  return <>{children}</>
}
