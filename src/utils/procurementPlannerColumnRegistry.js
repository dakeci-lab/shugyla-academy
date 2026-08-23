/**
 * Procurement planner desktop table — column registry (stable keys for persist).
 * Render wiring lands in T2; this module is the source of truth for defaults.
 */

export const PROCUREMENT_PLANNER_TABLE_NAME = 'PROCUREMENT_PLANNER'

export const DEFAULT_PLANNER_PAGE_SIZE = 25

/** @typedef {'left' | 'right' | null} PlannerStickySide */

/**
 * @typedef {Object} PlannerColumnDef
 * @property {string} columnName
 * @property {string} label
 * @property {number} defaultWidth width in px
 * @property {number} [minWidth] resize floor in px; falls back to
 *   PLANNER_COLUMN_RESIZE_MIN_WIDTH (plannerColumnSettingsMerge.js) when unset
 * @property {boolean} lockedVisible
 * @property {PlannerStickySide} stickySide
 * @property {boolean} exposedInToggle
 * @property {boolean} sort sortable axis flag (not current sort direction)
 */

/** Default desktop column order — 21 columns. */
export const PROCUREMENT_PLANNER_COLUMN_REGISTRY = Object.freeze([
  {
    columnName: 'rowNum',
    label: '№',
    defaultWidth: 44,
    // Narrower floor than the shared default: this column only ever holds a
    // page-local index (1-2 digits in practice), so it doesn't need as much
    // room as text/number columns to stay resizable down further.
    minWidth: 32,
    lockedVisible: true,
    stickySide: 'left',
    exposedInToggle: false,
    sort: false,
  },
  {
    columnName: 'product',
    label: 'Товар',
    defaultWidth: 176,
    lockedVisible: true,
    stickySide: 'left',
    exposedInToggle: false,
    sort: false,
  },
  {
    columnName: 'barcode',
    label: 'Штрихкод',
    defaultWidth: 136,
    // Not always needed, so it's hideable via the column-settings popover —
    // unlike rowNum/product it isn't essential on every screen. Still sits in
    // the fixed left block when visible (see LOCKED_LEFT_COLUMN_NAMES in
    // plannerColumnSettingsMerge.js) and getReorderablePlannerColumnNames()
    // excludes it, so toggling visibility doesn't also make it draggable.
    lockedVisible: false,
    stickySide: 'left',
    exposedInToggle: true,
    sort: false,
  },
  {
    columnName: 'abcQty',
    label: 'К',
    defaultWidth: 44,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: true,
  },
  {
    columnName: 'abcRevenue',
    label: 'В',
    defaultWidth: 44,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: true,
  },
  {
    columnName: 'abcProfit',
    label: 'П',
    defaultWidth: 44,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: true,
  },
  {
    columnName: 'week0',
    label: 'W1',
    defaultWidth: 42,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: false,
  },
  {
    columnName: 'week1',
    label: 'W2',
    defaultWidth: 42,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: false,
  },
  {
    columnName: 'week2',
    label: 'W3',
    defaultWidth: 42,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: false,
  },
  {
    columnName: 'week3',
    label: 'W4',
    defaultWidth: 42,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: false,
  },
  {
    columnName: 'week4',
    label: 'W5',
    defaultWidth: 42,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: false,
  },
  {
    columnName: 'week5',
    label: 'W6',
    defaultWidth: 42,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: false,
  },
  {
    columnName: 'week6',
    label: 'W7',
    defaultWidth: 42,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: false,
  },
  {
    columnName: 'week7',
    label: 'W8',
    defaultWidth: 42,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: false,
  },
  {
    columnName: 'stock',
    label: 'Остаток',
    defaultWidth: 72,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: false,
  },
  {
    columnName: 'reserveDays',
    label: 'Запас/дн',
    defaultWidth: 52,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: false,
  },
  {
    columnName: 'avgDaily',
    label: 'Спрос/дн',
    defaultWidth: 80,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: false,
  },
  {
    columnName: 'normDays',
    label: 'Норма',
    defaultWidth: 64,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: false,
  },
  {
    columnName: 'recommendedQty',
    label: 'Рек.',
    defaultWidth: 56,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: false,
  },
  {
    columnName: 'orderQty',
    label: 'Заказ',
    defaultWidth: 92,
    lockedVisible: true,
    stickySide: 'right',
    exposedInToggle: false,
    sort: false,
  },
  {
    columnName: 'supplier',
    label: 'Поставщик',
    defaultWidth: 120,
    lockedVisible: false,
    stickySide: null,
    exposedInToggle: true,
    sort: false,
  },
])

const REGISTRY_BY_NAME = new Map(
  PROCUREMENT_PLANNER_COLUMN_REGISTRY.map((def) => [def.columnName, def])
)

export function getPlannerColumnRegistry() {
  return PROCUREMENT_PLANNER_COLUMN_REGISTRY
}

export function getPlannerColumnDef(columnName) {
  return REGISTRY_BY_NAME.get(columnName) || null
}

export function getPlannerRegistryColumnNames() {
  return PROCUREMENT_PLANNER_COLUMN_REGISTRY.map((def) => def.columnName)
}

export function getLockedPlannerColumnNames() {
  return PROCUREMENT_PLANNER_COLUMN_REGISTRY.filter((def) => def.lockedVisible).map(
    (def) => def.columnName
  )
}

export function getTogglablePlannerColumnNames() {
  return PROCUREMENT_PLANNER_COLUMN_REGISTRY.filter((def) => def.exposedInToggle).map(
    (def) => def.columnName
  )
}

/**
 * Togglable columns that can be reordered (between the locked-left block and
 * orderQty). Excludes 'supplier' (fixed tail) and 'barcode' — barcode is
 * hideable but stays pinned in the locked-left block via
 * LOCKED_LEFT_COLUMN_NAMES (plannerColumnSettingsMerge.js) when visible, so
 * it must not also appear in the reorderable middle zone.
 */
export function getReorderablePlannerColumnNames() {
  return PROCUREMENT_PLANNER_COLUMN_REGISTRY.filter(
    (def) => def.exposedInToggle && def.columnName !== 'supplier' && def.columnName !== 'barcode'
  ).map((def) => def.columnName)
}

/**
 * Full default snapshot for persist (UMAG-style).
 * @returns {{ tableName: string, pageSize: number, columns: Array<{ columnName: string, columnOrdinalNumber: number, visible: boolean, width: number, sort: boolean }> }}
 */
export function getDefaultPlannerColumnSettings() {
  return {
    tableName: PROCUREMENT_PLANNER_TABLE_NAME,
    pageSize: DEFAULT_PLANNER_PAGE_SIZE,
    columns: PROCUREMENT_PLANNER_COLUMN_REGISTRY.map((def, index) => ({
      columnName: def.columnName,
      columnOrdinalNumber: index,
      visible: true,
      width: def.defaultWidth,
      sort: def.sort,
    })),
  }
}
