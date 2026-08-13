import { useMemo, useState } from 'react'
import AdminModal from '../admin/AdminModal'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons/PlatformIcons'
import {
  WEEKDAY_LABELS,
  buildMonthCalendar,
  isOutsideViewMonth,
  toDateKey,
} from '../../utils/shiftData'

function parseDateKey(value) {
  const date = new Date(`${value || toDateKey(new Date())}T12:00:00`)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function formatMonthTitle(year, month) {
  const label = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1))

  return label.charAt(0).toLocaleUpperCase('ru-RU') + label.slice(1)
}

function formatSupplyCount(count) {
  const modulo100 = Math.abs(count) % 100
  const modulo10 = modulo100 % 10
  if (modulo100 >= 11 && modulo100 <= 19) return `${count} поставок`
  if (modulo10 === 1) return `${count} поставка`
  if (modulo10 >= 2 && modulo10 <= 4) return `${count} поставки`
  return `${count} поставок`
}

export default function ReceivingMonthCalendar({
  selectedDateKey,
  todayKey,
  countsByDate = {},
  onSelectDate,
  onClose,
  returnFocusRef,
}) {
  const initialDate = parseDateKey(selectedDateKey)
  const [{ year, month }, setMonth] = useState({
    year: initialDate.getFullYear(),
    month: initialDate.getMonth() + 1,
  })
  const dates = useMemo(() => buildMonthCalendar(year, month), [month, year])

  function changeMonth(delta) {
    setMonth((current) => {
      const next = new Date(current.year, current.month - 1 + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() + 1 }
    })
  }

  function selectDate(dateKey) {
    onSelectDate?.(dateKey)
    onClose?.()
  }

  return (
    <AdminModal
      title="Календарь поставок"
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      wide
    >
      <div className="receiving-calendar">
        <div className="receiving-calendar__header">
          <button
            type="button"
            className="receiving-calendar__nav"
            onClick={() => changeMonth(-1)}
            aria-label="Предыдущий месяц"
          >
            <ChevronLeftIcon size={18} />
          </button>
          <strong>{formatMonthTitle(year, month)}</strong>
          <button
            type="button"
            className="receiving-calendar__nav"
            onClick={() => changeMonth(1)}
            aria-label="Следующий месяц"
          >
            <ChevronRightIcon size={18} />
          </button>
        </div>

        <div className="receiving-calendar__grid" role="group" aria-label="Поставки по дням">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="receiving-calendar__weekday" aria-hidden="true">
              {label}
            </span>
          ))}

          {dates.map((date) => {
            const dateKey = toDateKey(date)
            const count = countsByDate[dateKey] || 0
            const isSelected = selectedDateKey === dateKey
            const isToday = todayKey === dateKey
            const outsideMonth = isOutsideViewMonth(date, year, month)

            return (
              <button
                key={dateKey}
                type="button"
                className={[
                  'receiving-calendar__day',
                  outsideMonth ? 'is-outside' : '',
                  isToday ? 'is-today' : '',
                  isSelected ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={isSelected}
                aria-label={`${date.toLocaleDateString('ru-RU')}: ${formatSupplyCount(count)}`}
                onClick={() => selectDate(dateKey)}
              >
                <span className="receiving-calendar__number">{date.getDate()}</span>
                {count > 0 ? (
                  <span className="receiving-calendar__count" aria-hidden="true">
                    {count}
                  </span>
                ) : (
                  <span className="receiving-calendar__no-deliveries" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          className="btn btn--ghost receiving-calendar__today"
          onClick={() => selectDate(todayKey)}
        >
          Перейти к сегодняшнему дню
        </button>
      </div>
    </AdminModal>
  )
}
