import { getPlannerColumnDef } from './procurementPlannerColumnRegistry'

/**
 * @param {{ columns?: Array<{ columnName: string, columnOrdinalNumber: number, visible?: boolean, width: number }> }|null|undefined} settings
 */
export function getVisibleColumns(settings) {
  return (settings?.columns || [])
    .filter((col) => col?.columnName && col.visible !== false)
    .sort((a, b) => a.columnOrdinalNumber - b.columnOrdinalNumber)
}

/**
 * @param {ReturnType<typeof getVisibleColumns>} visibleColumns
 */
export function getVisibleLockedLeftColumns(visibleColumns) {
  return visibleColumns.filter((col) => {
    const def = getPlannerColumnDef(col.columnName)
    return def?.stickySide === 'left'
  })
}

/**
 * @param {ReturnType<typeof getVisibleColumns>} visibleColumns
 */
export function plannerTreeTailColSpan(visibleColumns) {
  const lockedLeftCount = getVisibleLockedLeftColumns(visibleColumns).length
  return Math.max(1, visibleColumns.length - lockedLeftCount)
}

/**
 * Sum widths (px) of visible sticky-left columns before `columnName`.
 * @param {string} columnName
 * @param {ReturnType<typeof getVisibleColumns>} visibleColumns
 */
export function computeStickyLeft(columnName, visibleColumns) {
  let left = 0
  for (const col of visibleColumns) {
    if (col.columnName === columnName) break
    const def = getPlannerColumnDef(col.columnName)
    if (def?.stickySide === 'left') {
      const width = Number(col.width)
      left += Number.isFinite(width) && width > 0 ? width : def.defaultWidth
    }
  }
  return left
}

/**
 * @param {{ columnName: string, width: number }} col
 * @param {ReturnType<typeof getVisibleColumns>} visibleColumns
 */
export function buildPlannerColumnInlineStyle(col, visibleColumns) {
  const style = { width: `${col.width}px` }
  const def = getPlannerColumnDef(col.columnName)
  if (def?.stickySide === 'left') {
    style.left = `${computeStickyLeft(col.columnName, visibleColumns)}px`
  } else if (def?.stickySide === 'right') {
    style.right = 0
  }
  return style
}

/**
 * CSS class names for a planner column (semantic, not positional).
 * @param {string} columnName
 */
export function getPlannerColumnClassName(columnName) {
  switch (columnName) {
    case 'rowNum':
      return 'proc-planner__col-num proc-planner__sticky-num'
    case 'product':
      return 'proc-planner__col-product proc-planner__sticky-product'
    case 'barcode':
      return 'proc-planner__col-barcode proc-planner__sticky-barcode'
    case 'abcQty':
    case 'abcRevenue':
    case 'abcProfit':
      return 'proc-planner__col-abc-axis'
    case 'week0':
    case 'week1':
    case 'week2':
    case 'week3':
    case 'week4':
    case 'week5':
    case 'week6':
    case 'week7':
      return 'proc-planner__col-week'
    case 'reserveDays':
      return 'proc-planner__col-reserve'
    case 'recommendedQty':
      return 'proc-planner__col-rec'
    case 'orderQty':
      return 'proc-planner__col-order proc-planner__col-order--accent proc-planner__sticky-order'
    default:
      return ''
  }
}

export function parseWeekColumnIndex(columnName) {
  if (!columnName || !columnName.startsWith('week')) return -1
  const index = Number.parseInt(columnName.slice(4), 10)
  return Number.isFinite(index) ? index : -1
}

export function isPlannerAbcColumnName(columnName) {
  return columnName === 'abcQty' || columnName === 'abcRevenue' || columnName === 'abcProfit'
}
