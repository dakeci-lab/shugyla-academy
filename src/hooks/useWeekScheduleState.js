import { useMemo, useState } from 'react'
import {
  addWeeks,
  buildWeekDates,
  formatWeekRangeLabel,
  getInitialWeekStartKey,
  toDateKey,
} from '../utils/shiftData'

function getInitialSelectedDateKey(weekStartKey) {
  const todayKey = toDateKey(new Date())
  const inWeek = buildWeekDates(weekStartKey).some((date) => toDateKey(date) === todayKey)
  return inWeek ? todayKey : weekStartKey
}

/** Общее состояние навигации по неделе / дню (Закуп, Приёмка) */
export function useWeekScheduleState(initialWeekStartKey = getInitialWeekStartKey()) {
  const [weekStartKey, setWeekStartKey] = useState(initialWeekStartKey)
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    getInitialSelectedDateKey(initialWeekStartKey)
  )

  const todayKey = toDateKey(new Date())
  const weekDates = useMemo(() => buildWeekDates(weekStartKey), [weekStartKey])
  const isCurrentWeek = weekDates.some((date) => toDateKey(date) === todayKey)
  const weekTitle = isCurrentWeek
    ? `Текущая неделя (${formatWeekRangeLabel(weekStartKey)})`
    : formatWeekRangeLabel(weekStartKey)

  function changeWeek(delta) {
    setWeekStartKey((prev) => {
      const next = addWeeks(prev, delta)
      setSelectedDateKey(next)
      return next
    })
  }

  function goToday() {
    const currentWeekStart = getInitialWeekStartKey()
    setWeekStartKey(currentWeekStart)
    setSelectedDateKey(todayKey)
  }

  function selectWeekContaining(dateKey) {
    if (!dateKey) return
    const date = new Date(`${dateKey}T12:00:00`)
    const weekday = date.getDay()
    const diff = weekday === 0 ? -6 : 1 - weekday
    date.setDate(date.getDate() + diff)
    const weekStart = toDateKey(date)
    setWeekStartKey(weekStart)
    setSelectedDateKey(dateKey)
  }

  return {
    weekStartKey,
    selectedDateKey,
    setSelectedDateKey,
    weekDates,
    weekTitle,
    todayKey,
    changeWeek,
    goToday,
    selectWeekContaining,
  }
}
