/**
 * Column registry for the embedded «К оплате» compact schedule.
 * Deliberately separate from procurementPlannerColumnRegistry — same
 * gear-icon/resize/reorder UX, but a much smaller column set with its own
 * two locked ends (supplier first, amount last), not the planner's
 * locked-left-block/locked-right/fixed-tail generalization.
 */

export const SUPPLIER_PAYMENTS_TABLE_NAME = 'supplier_payments_list'
export const PAYMENTS_COLUMN_RESIZE_MIN_WIDTH = 60

export const PAYMENTS_LOCKED_FIRST_COLUMN = 'supplier'
export const PAYMENTS_LOCKED_LAST_COLUMN = 'amount'

const REGISTRY = [
  { columnName: 'supplier', label: 'Поставщик', defaultWidth: 260, minWidth: 140, locked: true },
  { columnName: 'receivedAt', label: 'Дата приёмки', defaultWidth: 130, minWidth: 96 },
  { columnName: 'status', label: 'Статус', defaultWidth: 120, minWidth: 92 },
  { columnName: 'dueDate', label: 'Срок', defaultWidth: 96, minWidth: 80 },
  { columnName: 'amount', label: 'Сумма', defaultWidth: 130, minWidth: 96, locked: true },
]

const BY_NAME = new Map(REGISTRY.map((def) => [def.columnName, def]))

export function getPaymentsColumnDef(columnName) {
  return BY_NAME.get(columnName) || null
}

export function getPaymentsRegistryColumnNames() {
  return REGISTRY.map((def) => def.columnName)
}

export function getReorderablePaymentsColumnNames() {
  return REGISTRY.filter((def) => !def.locked).map((def) => def.columnName)
}

export function getTogglablePaymentsColumnNames() {
  return getReorderablePaymentsColumnNames()
}

export function isPaymentsColumnReorderable(columnName) {
  return getReorderablePaymentsColumnNames().includes(columnName)
}

export function getPaymentsColumnLabel(columnName) {
  return getPaymentsColumnDef(columnName)?.label || columnName
}

export function getDefaultPaymentsColumnSettings() {
  return {
    tableName: SUPPLIER_PAYMENTS_TABLE_NAME,
    columns: REGISTRY.map((def, index) => ({
      columnName: def.columnName,
      columnOrdinalNumber: index,
      visible: true,
      width: def.defaultWidth,
    })),
  }
}
