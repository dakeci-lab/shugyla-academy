import {
  PAYMENTS_LOCKED_FIRST_COLUMN,
  PAYMENTS_LOCKED_LAST_COLUMN,
  SUPPLIER_PAYMENTS_TABLE_NAME,
  getDefaultPaymentsColumnSettings,
  getPaymentsColumnDef,
  getPaymentsRegistryColumnNames,
  getReorderablePaymentsColumnNames,
} from './paymentsColumnRegistry'

function positiveInt(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.round(n)
}

function normalizeColumnWidth(value, def) {
  const width = positiveInt(value, def.defaultWidth)
  return Math.max(def.minWidth || 1, width)
}

function normalizeColumn(col, def) {
  return {
    columnName: def.columnName,
    columnOrdinalNumber: 0,
    visible: def.locked ? true : col.visible !== false,
    width: normalizeColumnWidth(col.width, def),
  }
}

/**
 * Merge saved settings with registry defaults. Unknown keys drop; new
 * registry keys append; locked columns forced visible; ordinals 0…N-1.
 */
export function mergePaymentsColumnSettings(saved, defaults) {
  const base = defaults || getDefaultPaymentsColumnSettings()
  const defaultByName = new Map((base.columns || []).map((col) => [col.columnName, col]))
  const registryOrder = getPaymentsRegistryColumnNames()

  const savedColumns = Array.isArray(saved?.columns) ? saved.columns : []
  const knownSaved = savedColumns
    .filter((col) => col?.columnName && getPaymentsColumnDef(col.columnName))
    .sort(
      (a, b) =>
        (a.columnOrdinalNumber ?? Number.MAX_SAFE_INTEGER) -
        (b.columnOrdinalNumber ?? Number.MAX_SAFE_INTEGER)
    )

  const seen = new Set()
  const merged = []

  for (const col of knownSaved) {
    if (seen.has(col.columnName)) continue
    merged.push(normalizeColumn(col, getPaymentsColumnDef(col.columnName)))
    seen.add(col.columnName)
  }

  for (const columnName of registryOrder) {
    if (seen.has(columnName)) continue
    const def = getPaymentsColumnDef(columnName)
    const fallback = defaultByName.get(columnName) || { columnName, visible: true, width: def.defaultWidth }
    merged.push(normalizeColumn(fallback, def))
    seen.add(columnName)
  }

  return enforceLockedPaymentsColumnOrdinals({
    tableName: saved?.tableName || base.tableName || SUPPLIER_PAYMENTS_TABLE_NAME,
    columns: merged,
  })
}

/** Pin supplier first, amount last; reorderable middle keeps its saved order. */
export function enforceLockedPaymentsColumnOrdinals(settings) {
  const reorderable = getReorderablePaymentsColumnNames()
  const sorted = [...(settings?.columns || [])].sort(
    (a, b) => a.columnOrdinalNumber - b.columnOrdinalNumber
  )
  const byName = new Map(sorted.map((col) => [col.columnName, col]))

  const first = byName.get(PAYMENTS_LOCKED_FIRST_COLUMN)
  const middle = sorted.filter((col) => reorderable.includes(col.columnName))
  const last = byName.get(PAYMENTS_LOCKED_LAST_COLUMN)

  const combined = []
  if (first) combined.push(first)
  combined.push(...middle)
  if (last) combined.push(last)

  const seen = new Set(combined.map((col) => col.columnName))
  for (const columnName of getPaymentsRegistryColumnNames()) {
    if (seen.has(columnName)) continue
    const def = getPaymentsColumnDef(columnName)
    combined.push({ columnName, visible: true, width: def.defaultWidth })
    seen.add(columnName)
  }

  return {
    tableName: settings?.tableName || SUPPLIER_PAYMENTS_TABLE_NAME,
    columns: combined.map((col, index) => {
      const def = getPaymentsColumnDef(col.columnName)
      return {
        columnName: col.columnName,
        columnOrdinalNumber: index,
        visible: def.locked ? true : col.visible !== false,
        width: normalizeColumnWidth(col.width, def),
      }
    }),
  }
}

export function reorderTogglablePaymentsColumns(settings, draggedName, targetName) {
  const reorderable = getReorderablePaymentsColumnNames()
  if (!reorderable.includes(draggedName) || !reorderable.includes(targetName)) {
    return mergePaymentsColumnSettings(settings)
  }

  const base = mergePaymentsColumnSettings(settings)
  const sorted = [...base.columns].sort((a, b) => a.columnOrdinalNumber - b.columnOrdinalNumber)
  const middle = sorted.filter((col) => reorderable.includes(col.columnName))
  const fromIdx = middle.findIndex((col) => col.columnName === draggedName)
  const toIdx = middle.findIndex((col) => col.columnName === targetName)
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return base

  const nextMiddle = [...middle]
  const [removed] = nextMiddle.splice(fromIdx, 1)
  nextMiddle.splice(toIdx, 0, removed)

  const byName = new Map(base.columns.map((col) => [col.columnName, col]))
  const first = byName.get(PAYMENTS_LOCKED_FIRST_COLUMN)
  const last = byName.get(PAYMENTS_LOCKED_LAST_COLUMN)

  const combined = []
  if (first) combined.push(first)
  combined.push(...nextMiddle)
  if (last) combined.push(last)

  return mergePaymentsColumnSettings({
    ...base,
    columns: combined.map((col, index) => ({ ...col, columnOrdinalNumber: index })),
  })
}

/** Full snapshot normalizer before persist (merge + locked ordinal enforcement). */
export function normalizePaymentsColumnSettingsForSave(settings) {
  return enforceLockedPaymentsColumnOrdinals(mergePaymentsColumnSettings(settings))
}

export function getVisiblePaymentsColumns(settings) {
  return (settings?.columns || [])
    .filter((col) => col?.columnName && col.visible !== false)
    .sort((a, b) => a.columnOrdinalNumber - b.columnOrdinalNumber)
}
