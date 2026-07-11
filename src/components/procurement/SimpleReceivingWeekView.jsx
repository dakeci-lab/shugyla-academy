import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../../context/SessionContext'
import { canAcceptSimpleDelivery } from '../../config/permissions'
import { isCloudMode } from '../../lib/dataMode'
import { getReceivingDocumentsSync } from '../../services/receivingDataService'
import { getPurchaseOrdersSync } from '../../services/purchaseDataService'
import { getAllSuppliersSync } from '../../utils/supplierData'
import {
  acceptSimpleDeliveryOptimistic,
  unacceptSimpleDeliveryOptimistic,
} from '../../services/purchaseOptimisticService'
import { useAdminRefresh } from '../../hooks/useAdminRefresh'
import { useWeekScheduleState } from '../../hooks/useWeekScheduleState'
import {
  buildMergedReceivingEntries,
  getReceivingChecklistToggleState,
  getReceivingEntryKey,
  isExpectedReceivingEntry,
  isSimpleReceivingEntryDone,
  sortReceivingChecklistEntries,
} from '../../utils/procurementWorkflow'
import { toDateKey } from '../../utils/shiftData'
import WeekScheduleNav from './WeekScheduleNav'
import SimpleDeliveryCard from './SimpleDeliveryCard'
import './SimpleDeliveryCard.css'

/** Недельная приёмка: выбор дня → компактный чек-лист поставок */
export default function SimpleReceivingWeekView() {
  const { user } = useSession()
  const { version, notifyChange } = useAdminRefresh()
  const {
    weekStartKey,
    selectedDateKey,
    setSelectedDateKey,
    weekDates,
    weekTitle,
    todayKey,
    changeWeek,
    goToday,
  } = useWeekScheduleState()
  const [checkedOverrides, setCheckedOverrides] = useState({})
  const [togglingId, setTogglingId] = useState(null)

  useEffect(() => {
    setCheckedOverrides({})
    setTogglingId(null)
  }, [version])

  const canAccept = canAcceptSimpleDelivery(user)

  const allEntries = useMemo(() => {
    return buildMergedReceivingEntries(
      getPurchaseOrdersSync(),
      getReceivingDocumentsSync(),
      getAllSuppliersSync(),
      weekStartKey
    )
  }, [version, weekStartKey])

  const entriesByDate = useMemo(() => {
    const map = new Map()
    for (const entry of allEntries) {
      if (!entry.dateKey) continue
      if (!map.has(entry.dateKey)) map.set(entry.dateKey, [])
      map.get(entry.dateKey).push(entry)
    }
    for (const [dateKey, entries] of map) {
      map.set(dateKey, sortReceivingChecklistEntries(entries, checkedOverrides))
    }
    return map
  }, [allEntries, checkedOverrides])

  const countsByDate = useMemo(() => {
    const counts = {}
    for (const [dateKey, entries] of entriesByDate) {
      counts[dateKey] = entries.length
    }
    return counts
  }, [entriesByDate])

  const dayEntries = selectedDateKey ? entriesByDate.get(selectedDateKey) || [] : []

  function getIsReceived(entry) {
    if (isExpectedReceivingEntry(entry)) return false
    const docId = entry.document?.id
    if (docId && checkedOverrides[docId] !== undefined) {
      return checkedOverrides[docId]
    }
    return isSimpleReceivingEntryDone(entry)
  }

  function clearOverride(docId) {
    setCheckedOverrides((prev) => {
      if (prev[docId] === undefined) return prev
      const next = { ...prev }
      delete next[docId]
      return next
    })
  }

  async function handleToggleEntry(entry) {
    if (isExpectedReceivingEntry(entry)) return

    const docId = entry.document?.id
    if (!docId || togglingId === docId) return

    const toggleState = getReceivingChecklistToggleState(
      entry.order,
      getReceivingDocumentsSync(),
      isCloudMode()
    )
    if (!toggleState.canToggle) return

    const context = { document: entry.document, order: entry.order, orderId: entry.order?.id }
    const currentlyReceived = getIsReceived(entry)
    const nextReceived = !currentlyReceived

    setCheckedOverrides((prev) => ({ ...prev, [docId]: nextReceived }))
    setTogglingId(docId)

    try {
      const result = currentlyReceived
        ? unacceptSimpleDeliveryOptimistic(docId, notifyChange, context)
        : acceptSimpleDeliveryOptimistic(docId, user, notifyChange, context)

      const ok = result && typeof result.then === 'function' ? await result : result

      if (!ok) {
        clearOverride(docId)
        console.error('[ReceivingChecklist] toggle failed', { docId, entry })
      }
    } finally {
      setTogglingId(null)
    }
  }

  const isTodaySelected = selectedDateKey === todayKey

  return (
    <>
      <WeekScheduleNav
        weekTitle={weekTitle}
        weekDates={weekDates}
        selectedDateKey={selectedDateKey}
        todayKey={todayKey}
        countsByDate={countsByDate}
        onPrevWeek={() => changeWeek(-1)}
        onNextWeek={() => changeWeek(1)}
        onToday={goToday}
        onSelectDate={setSelectedDateKey}
      />

      {!selectedDateKey ? (
        <p className="simple-receiving-week__hint">
          Выберите день недели, чтобы посмотреть поставки.
        </p>
      ) : dayEntries.length === 0 ? (
        <p className="simple-receiving-week__empty">
          {isTodaySelected
            ? 'Сегодня поставки не запланированы.'
            : 'На этот день поставок нет'}
        </p>
      ) : (
        <div className="simple-receiving-checklist" role="list">
          {dayEntries.map((entry) => {
            const isExpected = isExpectedReceivingEntry(entry)
            const toggleState = isExpected
              ? { canToggle: false, statusLabel: null, reason: 'expected' }
              : getReceivingChecklistToggleState(
                  entry.order,
                  getReceivingDocumentsSync(),
                  isCloudMode()
                )

            return (
              <SimpleDeliveryCard
                key={getReceivingEntryKey(entry)}
                order={entry.order}
                document={entry.document}
                supplier={entry.supplier}
                entrySource={entry.source}
                isReceived={getIsReceived(entry)}
                canAccept={canAccept && toggleState.canToggle}
                syncStatusLabel={toggleState.statusLabel}
                syncPending={toggleState.reason === 'syncing'}
                toggling={!isExpected && togglingId === entry.document?.id}
                onToggle={() => handleToggleEntry(entry)}
              />
            )
          })}
        </div>
      )}
    </>
  )
}
