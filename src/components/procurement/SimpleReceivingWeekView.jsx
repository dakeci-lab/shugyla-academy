import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../../context/SessionContext'
import { canAcceptSimpleDelivery } from '../../config/permissions'
import { getReceivingDocumentsSync } from '../../services/receivingDataService'
import { getPurchaseOrdersSync } from '../../services/purchaseDataService'
import {
  acceptSimpleDeliveryOptimistic,
  unacceptSimpleDeliveryOptimistic,
} from '../../services/purchaseOptimisticService'
import { useAdminRefresh } from '../../hooks/useAdminRefresh'
import { useProcurementRealtime } from '../../hooks/useProcurementRealtime'
import {
  buildSimpleReceivingEntries,
  isSimpleReceivingEntryDone,
  sortReceivingChecklistEntries,
} from '../../utils/procurementWorkflow'
import {
  toDateKey,
  formatWeekRangeLabel,
  formatWeekDayHeader,
  getInitialWeekStartKey,
  addWeeks,
  buildWeekDates,
} from '../../utils/shiftData'
import SchedulePeriodBar from '../admin/SchedulePeriodBar'
import SimpleDeliveryCard from './SimpleDeliveryCard'
import './SimpleDeliveryCard.css'
import '../admin/EmployeeSchedule.css'

function isTodayInWeek(weekStartKey, todayKey = toDateKey(new Date())) {
  return buildWeekDates(weekStartKey).some((date) => toDateKey(date) === todayKey)
}

function getInitialPageSelectedDateKey(weekStartKey) {
  const todayKey = toDateKey(new Date())
  return isTodayInWeek(weekStartKey, todayKey) ? todayKey : weekStartKey
}

function getWeekNavigationSelectedDateKey(weekStartKey) {
  return weekStartKey
}

/** Недельная приёмка: выбор дня → компактный чек-лист поставок */
export default function SimpleReceivingWeekView() {
  const { user } = useSession()
  const { version, notifyChange } = useAdminRefresh()
  useProcurementRealtime(true)
  const [weekStartKey, setWeekStartKey] = useState(getInitialWeekStartKey)
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    getInitialPageSelectedDateKey(getInitialWeekStartKey())
  )
  const [checkedOverrides, setCheckedOverrides] = useState({})
  const [togglingId, setTogglingId] = useState(null)

  useEffect(() => {
    setCheckedOverrides({})
    setTogglingId(null)
  }, [version])

  const canAccept = canAcceptSimpleDelivery(user)

  const weekDates = useMemo(() => buildWeekDates(weekStartKey), [weekStartKey])
  const todayKey = toDateKey(new Date())
  const isCurrentWeek = weekDates.some((date) => toDateKey(date) === todayKey)
  const weekTitle = isCurrentWeek
    ? `Текущая неделя (${formatWeekRangeLabel(weekStartKey)})`
    : formatWeekRangeLabel(weekStartKey)

  const allEntries = useMemo(() => {
    return buildSimpleReceivingEntries(getPurchaseOrdersSync(), getReceivingDocumentsSync())
  }, [version])

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

  const dayEntries = selectedDateKey ? entriesByDate.get(selectedDateKey) || [] : []

  function getIsReceived(entry) {
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

  function handleToggleEntry(entry) {
    const docId = entry.document?.id
    if (!docId || togglingId === docId) return

    const context = { document: entry.document, order: entry.order, orderId: entry.order?.id }
    const currentlyReceived = getIsReceived(entry)
    const nextReceived = !currentlyReceived

    setCheckedOverrides((prev) => ({ ...prev, [docId]: nextReceived }))
    setTogglingId(docId)

    const ok = currentlyReceived
      ? unacceptSimpleDeliveryOptimistic(docId, notifyChange, context)
      : acceptSimpleDeliveryOptimistic(docId, user, notifyChange, context)

    setTogglingId(null)

    if (!ok) {
      clearOverride(docId)
      console.error('[ReceivingChecklist] toggle failed', { docId, entry })
    }
  }

  function changeWeek(delta) {
    setWeekStartKey((prev) => {
      const next = addWeeks(prev, delta)
      setSelectedDateKey(getWeekNavigationSelectedDateKey(next))
      return next
    })
  }

  function goToday() {
    setWeekStartKey(getInitialWeekStartKey())
    setSelectedDateKey(todayKey)
  }

  const isTodaySelected = selectedDateKey === todayKey

  return (
    <>
      <SchedulePeriodBar
        title={weekTitle}
        onPrev={() => changeWeek(-1)}
        onNext={() => changeWeek(1)}
        onToday={goToday}
        prevLabel="Предыдущая неделя"
        nextLabel="Следующая неделя"
      />

      <div className="simple-receiving-day-bar" role="tablist" aria-label="Дни недели">
        {weekDates.map((date) => {
          const dateKey = toDateKey(date)
          const { weekday, day } = formatWeekDayHeader(date)
          const isToday = dateKey === todayKey
          const isSelected = selectedDateKey === dateKey
          const count = entriesByDate.get(dateKey)?.length || 0

          return (
            <button
              key={dateKey}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`simple-receiving-day-bar__day${isSelected ? ' simple-receiving-day-bar__day--active' : ''}${isToday ? ' simple-receiving-day-bar__day--today' : ''}`}
              onClick={() => setSelectedDateKey(dateKey)}
            >
              <span className="simple-receiving-day-bar__weekday">{weekday}</span>
              <span className="simple-receiving-day-bar__number">{day}</span>
              {count > 0 && (
                <span className="simple-receiving-day-bar__count">{count}</span>
              )}
            </button>
          )
        })}
      </div>

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
          {dayEntries.map((entry) => (
            <SimpleDeliveryCard
              key={entry.order.id}
              order={entry.order}
              document={entry.document}
              isReceived={getIsReceived(entry)}
              canAccept={canAccept}
              toggling={togglingId === entry.document.id}
              onToggle={() => handleToggleEntry(entry)}
            />
          ))}
        </div>
      )}
    </>
  )
}
