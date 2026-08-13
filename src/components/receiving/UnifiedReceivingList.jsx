import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWeekScheduleState } from '../../hooks/useWeekScheduleState'
import { isSimpleWorkflow } from '../../utils/procurementWorkflow'
import { RECEIVING_STATUS } from '../../utils/receivingData'
import {
  countReceivingDocumentsByDate,
  filterReceivingDocuments,
} from '../../utils/receivingList'
import { ReceivingStatusBadge } from './ReceivingStatsCards'
import ReceivingMonthCalendar from './ReceivingMonthCalendar'
import './UnifiedReceivingList.css'

function CalendarGlyph({ size = 19 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  )
}

function parseDateKey(value) {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function formatSelectedDate(dateKey, todayKey) {
  const label = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(parseDateKey(dateKey))
  const capitalized = label.charAt(0).toLocaleUpperCase('ru-RU') + label.slice(1)
  return dateKey === todayKey ? `Сегодня, ${capitalized.replace(/^\S+[,]?\s*/, '')}` : capitalized
}

function getDocumentActionLabel(status, canManage) {
  if (!canManage) return 'Открыть'
  if (status === RECEIVING_STATUS.AWAITING_RECEIVING || status === 'awaiting') {
    return 'Принять'
  }
  if (status === RECEIVING_STATUS.IN_PROGRESS) return 'Продолжить'
  return 'Открыть'
}

function formatSupplyCount(count) {
  const modulo100 = Math.abs(count) % 100
  const modulo10 = modulo100 % 10
  if (modulo100 >= 11 && modulo100 <= 19) return `${count} поставок`
  if (modulo10 === 1) return `${count} поставка`
  if (modulo10 >= 2 && modulo10 <= 4) return `${count} поставки`
  return `${count} поставок`
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
  })} ₸`
}

export default function UnifiedReceivingList({ documents = [], canManage = false }) {
  const { selectedDateKey, setSelectedDateKey, todayKey } = useWeekScheduleState()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const calendarButtonRef = useRef(null)

  const countsByDate = useMemo(
    () => countReceivingDocumentsByDate(documents),
    [documents]
  )
  const visibleDocuments = useMemo(
    () =>
      filterReceivingDocuments(documents, {
        dateKey: selectedDateKey,
      }),
    [documents, selectedDateKey]
  )
  const selectedDateCount = countsByDate[selectedDateKey] || 0

  return (
    <section className="unified-receiving" aria-label="Поставки">
      <div className="unified-receiving__date-bar">
        <div>
          <span className="unified-receiving__date-label">Выбранная дата</span>
          <strong className="unified-receiving__date-value">
            {formatSelectedDate(selectedDateKey, todayKey)}
          </strong>
          <span className="unified-receiving__date-count">
            {formatSupplyCount(selectedDateCount)}
          </span>
        </div>
        <button
          ref={calendarButtonRef}
          type="button"
          className="unified-receiving__calendar-button"
          onClick={() => setCalendarOpen(true)}
          aria-label="Открыть календарь поставок"
          title="Календарь поставок"
        >
          <CalendarGlyph />
          <span>Календарь</span>
        </button>
      </div>

      {visibleDocuments.length === 0 ? (
        <p className="unified-receiving__empty">Поставок нет.</p>
      ) : (
        <ul className="unified-receiving__list" role="list">
          {visibleDocuments.map((document, index) => {
            const isLegacy = isSimpleWorkflow(document)
            const itemsCount = document.itemsCount ?? document.items?.length ?? 0
            const actionLabel = getDocumentActionLabel(document.status, canManage)

            return (
              <li key={document.id}>
                <article
                  className={`unified-receiving-card${isLegacy ? ' unified-receiving-card--legacy' : ''}`}
                >
                  <div className="unified-receiving-card__number" aria-hidden="true">
                    {index + 1}
                  </div>

                  <div className="unified-receiving-card__content">
                    <strong className="unified-receiving-card__supplier">
                      {document.supplierName || 'Поставщик'}
                    </strong>
                    <div className="unified-receiving-card__meta">
                      {isLegacy ? (
                        <span title="Старый документ без товарных позиций">Без состава</span>
                      ) : (
                        <span>{itemsCount} поз.</span>
                      )}
                      {!isLegacy && Number(document.totalAmount) > 0 ? (
                        <span>{formatMoney(document.totalAmount)}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="unified-receiving-card__status">
                    <ReceivingStatusBadge status={document.status} />
                  </div>

                  <div className="unified-receiving-card__actions">
                    <Link
                      to={`/platform/receiving/${document.id}`}
                      className={`unified-receiving-card__open${actionLabel === 'Принять' ? ' is-primary' : ''}`}
                      aria-label={`${actionLabel}: ${document.supplierName || 'поставщик'}`}
                    >
                      {actionLabel}
                    </Link>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}

      {calendarOpen ? (
        <ReceivingMonthCalendar
          selectedDateKey={selectedDateKey}
          todayKey={todayKey}
          countsByDate={countsByDate}
          onSelectDate={setSelectedDateKey}
          onClose={() => setCalendarOpen(false)}
          returnFocusRef={calendarButtonRef}
        />
      ) : null}
    </section>
  )
}
