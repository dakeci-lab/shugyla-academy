import { useMemo } from 'react'
import { getAllSuppliersSync } from '../../utils/supplierData'
import {
  buildExpectedDeliveryEntries,
  getReceivingEntryKey,
  getReceivingEntrySupplierName,
  PROCUREMENT_PLAN_ITEM_STATUS,
  PROCUREMENT_PLAN_LABEL,
} from '../../utils/procurementWorkflow'
import './ProcurementPlanSection.css'

/** План закупок выбранного дня (раздел «Закуп») */
export default function ProcurementPlanDayList({
  weekStartKey,
  selectedDateKey,
  version,
  dataVersion,
  orders = [],
  canCreate,
  onCreatePurchase,
}) {
  void version
  void dataVersion

  const dayEntries = useMemo(() => {
    if (!selectedDateKey) return []
    return buildExpectedDeliveryEntries(
      getAllSuppliersSync(),
      weekStartKey,
      orders
    ).filter((entry) => entry.dateKey === selectedDateKey)
  }, [weekStartKey, selectedDateKey, orders, version, dataVersion])

  if (!selectedDateKey || dayEntries.length === 0) {
    return null
  }

  return (
    <section className="procurement-plan procurement-plan--day">
      <h2 className="procurement-plan__title">{PROCUREMENT_PLAN_LABEL}</h2>

      <ul className="procurement-plan__list">
        {dayEntries.map((entry, index) => {
          const supplierName = getReceivingEntrySupplierName(entry)

          return (
            <li key={getReceivingEntryKey(entry)} className="procurement-plan__item">
              <span className="procurement-plan__index" aria-hidden="true">
                {index + 1}
              </span>
              <div className="procurement-plan__info">
                <span className="procurement-plan__supplier">{supplierName}</span>
                <span className="procurement-plan__status">{PROCUREMENT_PLAN_ITEM_STATUS}</span>
              </div>
              {canCreate && (
                <button
                  type="button"
                  className="procurement-plan__add-btn"
                  aria-label={`Создать заказ: ${supplierName}`}
                  onClick={() =>
                    onCreatePurchase({
                      supplierId: entry.supplier?.id || '',
                      supplierName,
                      expectedDeliveryDate: entry.dateKey,
                    })
                  }
                >
                  <span aria-hidden="true">+</span>
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
