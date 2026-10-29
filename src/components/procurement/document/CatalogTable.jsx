import { calcReserveDays } from '../../../utils/procurementPlanningMath'
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
        {weekLabels.map((label, index) => (
          <td key={label + index} className="r num ctbl__week">
            {item.weeklySales?.[index] ? num(item.weeklySales[index]) : ''}
          </td>
        ))}
        <td className={`r num${item.negativeStock ? ' ctbl__neg' : ''}`}>{num(item.rawStock)}</td>
        <td className="r num">{reserve == null ? '—' : reserve}</td>
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
    <div className="ctbl__wrap">
      <table className="ctbl">
        <thead>
          <tr>
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
              <th key={label + index} className="r">
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
  )
}

function FragmentRows({ children }) {
  return <>{children}</>
}
