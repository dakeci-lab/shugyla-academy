import {
  DEFAULT_PLANNER_PAGE_SIZE,
  PROCUREMENT_PLANNER_TABLE_NAME,
  getDefaultPlannerColumnSettings,
  getPlannerColumnDef,
  getPlannerRegistryColumnNames,
  getReorderablePlannerColumnNames,
} from './procurementPlannerColumnRegistry'

export const PLANNER_COLUMN_RESIZE_MIN_WIDTH = 50

const LOCKED_LEFT_COLUMN_NAMES = Object.freeze(['rowNum', 'product', 'barcode'])
const LOCKED_RIGHT_COLUMN_NAME = 'orderQty'
const FIXED_TAIL_COLUMN_NAME = 'supplier'

function positiveInt(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.round(n)
}

function normalizeColumnWidth(value, fallback) {
  const width = positiveInt(value, fallback)
  return Math.max(1, width)
}

/**
 * @param {object} col
 * @param {import('./procurementPlannerColumnRegistry.js').PlannerColumnDef} def
 */
function normalizeColumn(col, def) {
  return {
    columnName: def.columnName,
    columnOrdinalNumber: 0,
    visible: def.lockedVisible ? true : col.visible !== false,
    width: normalizeColumnWidth(col.width, def.defaultWidth),
    sort: def.sort,
  }
}

/**
 * Merge saved settings with registry defaults.
 * Unknown keys drop; new registry keys append; locked forced visible; ordinals 0…N-1.
 *
 * @param {object|null|undefined} saved
 * @param {object|null|undefined} [defaults]
 * @returns {ReturnType<typeof getDefaultPlannerColumnSettings>}
 */
export function mergePlannerColumnSettings(saved, defaults) {
  const base = defaults || getDefaultPlannerColumnSettings()
  const defaultColumns = base.columns || []
  const defaultByName = new Map(defaultColumns.map((col) => [col.columnName, col]))
  const registryOrder = getPlannerRegistryColumnNames()

  const savedColumns = Array.isArray(saved?.columns) ? saved.columns : []
  const knownSaved = savedColumns
    .filter((col) => col?.columnName && getPlannerColumnDef(col.columnName))
    .sort(
      (a, b) =>
        (a.columnOrdinalNumber ?? Number.MAX_SAFE_INTEGER) -
        (b.columnOrdinalNumber ?? Number.MAX_SAFE_INTEGER)
    )

  const seen = new Set()
  const merged = []

  for (const col of knownSaved) {
    if (seen.has(col.columnName)) continue
    const def = getPlannerColumnDef(col.columnName)
    merged.push(normalizeColumn(col, def))
    seen.add(col.columnName)
  }

  for (const columnName of registryOrder) {
    if (seen.has(columnName)) continue
    const def = getPlannerColumnDef(columnName)
    const fallback = defaultByName.get(columnName)
    merged.push(
      normalizeColumn(
        fallback || {
          columnName,
          visible: true,
          width: def.defaultWidth,
        },
        def
      )
    )
    seen.add(columnName)
  }

  const columns = merged.map((col, index) => {
    const def = getPlannerColumnDef(col.columnName)
    return {
      columnName: col.columnName,
      columnOrdinalNumber: index,
      visible: def.lockedVisible ? true : col.visible !== false,
      width: normalizeColumnWidth(col.width, def.defaultWidth),
      sort: def.sort,
    }
  })

  return enforceLockedPlannerColumnOrdinals({
    tableName: saved?.tableName || base.tableName || PROCUREMENT_PLANNER_TABLE_NAME,
    pageSize: positiveInt(saved?.pageSize, base.pageSize || DEFAULT_PLANNER_PAGE_SIZE),
    columns,
  })
}

/**
 * Pin locked-left block, reorderable middle, locked-right orderQty, fixed supplier tail.
 * @param {ReturnType<typeof getDefaultPlannerColumnSettings>} settings
 */
export function enforceLockedPlannerColumnOrdinals(settings) {
  const reorderable = getReorderablePlannerColumnNames()
  const sorted = [...(settings?.columns || [])].sort(
    (a, b) => a.columnOrdinalNumber - b.columnOrdinalNumber
  )
  const byName = new Map(sorted.map((col) => [col.columnName, col]))

  const lockedLeft = LOCKED_LEFT_COLUMN_NAMES.map((name) => byName.get(name)).filter(Boolean)
  const middle = sorted.filter((col) => reorderable.includes(col.columnName))
  const orderQty = byName.get(LOCKED_RIGHT_COLUMN_NAME)
  const supplier = byName.get(FIXED_TAIL_COLUMN_NAME)

  const combined = [...lockedLeft, ...middle]
  if (orderQty) combined.push(orderQty)
  if (supplier) combined.push(supplier)

  const seen = new Set(combined.map((col) => col.columnName))
  for (const columnName of getPlannerRegistryColumnNames()) {
    if (seen.has(columnName)) continue
    const def = getPlannerColumnDef(columnName)
    combined.push(
      normalizeColumn(
        {
          columnName,
          visible: true,
          width: def.defaultWidth,
        },
        def
      )
    )
    seen.add(columnName)
  }

  return {
    tableName: settings?.tableName || PROCUREMENT_PLANNER_TABLE_NAME,
    pageSize: positiveInt(settings?.pageSize, DEFAULT_PLANNER_PAGE_SIZE),
    columns: combined.map((col, index) => {
      const def = getPlannerColumnDef(col.columnName)
      return {
        columnName: col.columnName,
        columnOrdinalNumber: index,
        visible: def.lockedVisible ? true : col.visible !== false,
        width: normalizeColumnWidth(col.width, def.defaultWidth),
        sort: def.sort,
      }
    }),
  }
}

/**
 * @param {ReturnType<typeof getDefaultPlannerColumnSettings>} settings
 * @param {string} draggedName
 * @param {string} targetName
 */
export function reorderTogglablePlannerColumns(settings, draggedName, targetName) {
  const reorderable = getReorderablePlannerColumnNames()
  if (!reorderable.includes(draggedName) || !reorderable.includes(targetName)) {
    return mergePlannerColumnSettings(settings)
  }

  const base = mergePlannerColumnSettings(settings)
  const sorted = [...base.columns].sort(
    (a, b) => a.columnOrdinalNumber - b.columnOrdinalNumber
  )
  const middle = sorted.filter((col) => reorderable.includes(col.columnName))
  const fromIdx = middle.findIndex((col) => col.columnName === draggedName)
  const toIdx = middle.findIndex((col) => col.columnName === targetName)
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return base

  const nextMiddle = [...middle]
  const [removed] = nextMiddle.splice(fromIdx, 1)
  nextMiddle.splice(toIdx, 0, removed)

  const byName = new Map(base.columns.map((col) => [col.columnName, col]))
  const lockedLeft = LOCKED_LEFT_COLUMN_NAMES.map((name) => byName.get(name)).filter(Boolean)
  const orderQty = byName.get(LOCKED_RIGHT_COLUMN_NAME)
  const supplier = byName.get(FIXED_TAIL_COLUMN_NAME)

  const combined = [...lockedLeft, ...nextMiddle]
  if (orderQty) combined.push(orderQty)
  if (supplier) combined.push(supplier)

  return mergePlannerColumnSettings({
    ...base,
    columns: combined.map((col, index) => ({ ...col, columnOrdinalNumber: index })),
  })
}

/** Full snapshot normalizer before persist (merge + locked ordinal enforcement). */
export function normalizePlannerColumnSettingsForSave(settings) {
  return enforceLockedPlannerColumnOrdinals(mergePlannerColumnSettings(settings))
}

/** @returns {string[]} visible column names after merge (for tests). */
export function getVisiblePlannerColumnNames(settings) {
  return (settings?.columns || [])
    .filter((col) => col.visible !== false)
    .sort((a, b) => a.columnOrdinalNumber - b.columnOrdinalNumber)
    .map((col) => col.columnName)
}

/** @returns {boolean} */
export function arePlannerOrdinalsContiguous(settings) {
  const cols = settings?.columns || []
  if (cols.length === 0) return false
  for (let i = 0; i < cols.length; i += 1) {
    if (cols[i].columnOrdinalNumber !== i) return false
  }
  return true
}
